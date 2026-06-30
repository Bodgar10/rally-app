-- 021_registrations_rls_validation.sql
-- RLS + validación de servidor de registrations (Sprint 4 · Connect).
-- Reglas: paid_online solo service_role (webhook); paid_offline/comp solo el OWNER;
-- consentimiento parental obligatorio si algún jugador de la pareja es menor.

-- 0) Unicidad del PaymentIntent → idempotencia del webhook (no duplicar registrations).
create unique index if not exists registrations_stripe_payment_intent_id_key
  on public.registrations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- 1) RLS encendida.
alter table public.registrations enable row level security;

-- 1.b) Quitar las políticas SELECT preexistentes (nombres viejos) para no duplicar SELECT.
drop policy if exists "registrations: jugador ve las suyas" on public.registrations;
drop policy if exists "registrations: owner ve las de sus torneos" on public.registrations;

-- 2) SELECT: jugadores de la pareja, owner del organizador del torneo, admin.
drop policy if exists registrations_select on public.registrations;
create policy registrations_select on public.registrations
for select to authenticated
using (
  public.is_admin()
  or public.is_org_owner(public.tournament_org(tournament_id))
  or exists (
    select 1 from public.pairs pr
    where pr.id = registrations.pair_id
      and (pr.player1_id = auth.uid() or pr.player2_id = auth.uid())
  )
);

-- 3) INSERT desde cliente: SOLO el owner y SOLO paid_offline | comp.
--    (paid_online lo inserta el webhook con service_role, que BYPASSEA RLS.)
drop policy if exists registrations_insert_owner_offline on public.registrations;
create policy registrations_insert_owner_offline on public.registrations
for insert to authenticated
with check (
  payment_status in ('paid_offline','comp')
  and public.is_org_owner(public.tournament_org(tournament_id))
);

-- 4) UPDATE/DELETE desde cliente: solo owner/admin (correcciones manuales acotadas).
drop policy if exists registrations_update_owner on public.registrations;
create policy registrations_update_owner on public.registrations
for update to authenticated
using (public.is_admin() or public.is_org_owner(public.tournament_org(tournament_id)))
with check (public.is_admin() or public.is_org_owner(public.tournament_org(tournament_id)));

drop policy if exists registrations_delete_owner on public.registrations;
create policy registrations_delete_owner on public.registrations
for delete to authenticated
using (public.is_admin() or public.is_org_owner(public.tournament_org(tournament_id)));

-- 5) Consentimiento parental como PRECONDICIÓN DE SERVIDOR (aplica a TODO insert,
--    incluido el del webhook con service_role: la regla deportiva no depende del canal).
create or replace function public.enforce_parental_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocking int;
begin
  select count(*)
    into v_blocking
  from public.pairs pr
  join public.users u
    on u.id in (pr.player1_id, pr.player2_id)
  where pr.id = new.pair_id
    and u.birthdate is not null
    and u.birthdate > (current_date - interval '18 years')  -- menor de 18
    and u.parental_consent_at is null;                       -- sin consentimiento registrado

  if v_blocking > 0 then
    raise exception 'parental_consent_required'
      using errcode = 'check_violation',
            hint = 'Un jugador menor de la pareja no tiene parental_consent_at registrado.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_parental_consent on public.registrations;
create trigger trg_enforce_parental_consent
before insert on public.registrations
for each row execute function public.enforce_parental_consent();

-- 6) Endurecer el enum a nivel columna por si acaso (defensa en profundidad):
--    el enum payment_status ya restringe a {paid_online,paid_offline,comp}.
