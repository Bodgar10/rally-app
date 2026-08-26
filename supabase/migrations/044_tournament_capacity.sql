-- ============================================================================
-- 044_tournament_capacity.sql  ·  RALLY
--
-- La capacidad real del torneo: cuántas canchas, en qué horas y cuánto dura un
-- partido. Sin estos tres datos el planificador (src/lib/engine/planner) no
-- puede decidir nada y cae al motor viejo, que mira solo el número de parejas.
--
-- POR QUÉ VA EN EL TORNEO Y NO EN LA SEDE
--   Un club con 6 canchas puede cederle 3 al organizador, o 8 un fin de semana
--   y 4 el siguiente. La capacidad es del EVENTO, no del lugar. Ponerlo en
--   `venues` obligaría a duplicar sedes para representar el mismo club con
--   distinta disponibilidad.
--
-- Aplicar DESPUÉS de 001.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Canchas y duración de partido
--
--    Ambas nullable a propósito: los torneos que ya existen no las tienen, y
--    un default inventado le haría creer al planificador que sabe algo que no
--    sabe. Sin canchas, cae al motor viejo y lo dice en `avisos`.
-- ----------------------------------------------------------------------------

alter table public.tournaments
  add column if not exists courts int,
  add column if not exists match_minutes int;

alter table public.tournaments
  drop constraint if exists tournaments_courts_range;
alter table public.tournaments
  add constraint tournaments_courts_range
  check (courts is null or (courts between 1 and 30));

-- 30 minutos es un partido de exhibición; 180 ya no es padel de torneo.
alter table public.tournaments
  drop constraint if exists tournaments_match_minutes_range;
alter table public.tournaments
  add constraint tournaments_match_minutes_range
  check (match_minutes is null or (match_minutes between 30 and 180));

comment on column public.tournaments.courts is
  'Canchas disponibles para ESTE torneo, no las que tiene el club. Un club de 6 '
  'puede ceder 3. NULL = sin capturar: el planificador cae al motor viejo.';

comment on column public.tournaments.match_minutes is
  'Minutos que se planifican por partido. 60 en la practica, aunque duren de 60 '
  'a 90 — esa diferencia es la que cubre el margen del 15% del planificador.';


-- ----------------------------------------------------------------------------
-- 2. Ventanas horarias, una por día
--
--    Tabla aparte y no dos columnas en `tournaments` porque son una por día y
--    el rango del torneo ya vive en start_date/end_date. Un torneo de viernes
--    a domingo tiene tres ventanas distintas: 14-22, 8-22 y 8-20.
--
--    EL ORDEN CRONOLÓGICO IMPORTA: el planificador usa todos los días menos el
--    último para la fase de grupos y el último para las eliminatorias (R2). No
--    es un detalle de presentación.
-- ----------------------------------------------------------------------------

create table if not exists public.tournament_windows (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  dia           date not null,
  desde         time not null,
  hasta         time not null,

  -- Una ventana por día. Dos franjas el mismo día (mañana y tarde con corte
  -- para comer) no se modelan todavía: el planificador cuenta horas, no huecos.
  unique (tournament_id, dia),

  -- Sin esto, una ventana invertida daría un presupuesto negativo silencioso.
  constraint tournament_windows_horas check (hasta > desde)
);

create index if not exists tournament_windows_torneo_idx
  on public.tournament_windows(tournament_id, dia);

comment on table public.tournament_windows is
  'Franja horaria disponible por dia de torneo. El planificador reserva todos '
  'los dias menos el ultimo para la fase de grupos y el ultimo para las '
  'eliminatorias, asi que el orden cronologico es semantico.';

alter table public.tournament_windows enable row level security;

-- Visibilidad espejo del torneo, igual que categories_select (008): el horario
-- de un torneo publicado no es secreto — el jugador quiere saber si juega el
-- viernes por la tarde.
drop policy if exists tournament_windows_select on public.tournament_windows;
create policy tournament_windows_select on public.tournament_windows
for select to anon, authenticated
using (
  public.tournament_status(tournament_id) <> 'draft'
  or public.is_org_member(public.tournament_org(tournament_id))
  or public.is_admin()
);

drop policy if exists tournament_windows_write_owner on public.tournament_windows;
create policy tournament_windows_write_owner on public.tournament_windows
for all to authenticated
using (public.is_org_owner(public.tournament_org(tournament_id)))
with check (public.is_org_owner(public.tournament_org(tournament_id)));


-- ── Verificación ────────────────────────────────────────────────────────────
-- select courts, match_minutes from public.tournaments;
-- insert into public.tournament_windows (tournament_id, dia, desde, hasta)
--   values ('<id>', '2026-08-29', '14:00', '22:00');
-- -- debe fallar: hasta <= desde
-- insert into public.tournament_windows (tournament_id, dia, desde, hasta)
--   values ('<id>', '2026-08-30', '22:00', '14:00');
