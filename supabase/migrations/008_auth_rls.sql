-- ============================================================================
-- 008_auth_rls.sql  ·  RALLY
-- Provisión de perfil (trigger) + RLS multi-tenant + base de Realtime.
-- Modelo de roles "Airbnb": todos nacen player; organizador/juez son
-- membresías aditivas en organizer_members. users.role ∈ {player, admin}.
-- Aplicar DESPUÉS de 001_initial_schema.sql y 002_ratings.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TRIGGER DE PROVISIÓN DE PERFIL
--    Al crearse una fila en auth.users, crea su fila en public.users.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    -- users.full_name es NOT NULL en la BD: garantizamos un valor no nulo.
    -- En el registro de hoy (correo+contraseña+nombre) el nombre viene en
    -- metadata; el resto es fallback defensivo (OAuth/magic-link sin nombre).
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Jugador'
    ),
    'player'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. FUNCIONES HELPER (STABLE SECURITY DEFINER) — evitan recursión en RLS
--    Al ser SECURITY DEFINER ignoran la RLS de las tablas que consultan.
-- ----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organizer_members
    where user_id = auth.uid() and organizer_id = org
  );
$$;

create or replace function public.is_org_owner(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organizer_members
    where user_id = auth.uid() and organizer_id = org and member_role = 'owner'
  );
$$;

-- Resuelven el tenant/estado de un torneo sin gatillar RLS (definer).
create or replace function public.tournament_org(t_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select organizer_id from public.tournaments where id = t_id;
$$;

create or replace function public.tournament_status(t_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select status::text from public.tournaments where id = t_id;
$$;

grant execute on function public.is_admin()              to authenticated;
grant execute on function public.is_org_member(uuid)     to authenticated;
grant execute on function public.is_org_owner(uuid)      to authenticated;
grant execute on function public.tournament_org(uuid)    to authenticated;
grant execute on function public.tournament_status(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. GUARD ANTI-ESCALACIÓN DE ROL
--    Un usuario autenticado no-admin NO puede cambiar su propio users.role.
--    Service role / postgres (auth.uid() null) no se ven afectados.
-- ----------------------------------------------------------------------------

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'No autorizado: no puedes cambiar tu rol de plataforma.';
  end if;
  return new;
end;
$$;

drop trigger if exists users_prevent_role_escalation on public.users;
create trigger users_prevent_role_escalation
  before update on public.users
  for each row execute function public.prevent_role_escalation();

-- ----------------------------------------------------------------------------
-- 4. RLS — habilitar en todas las tablas de hoy
-- ----------------------------------------------------------------------------

alter table public.users             enable row level security;
alter table public.organizer_members enable row level security;
alter table public.organizers        enable row level security;
alter table public.tournaments       enable row level security;
alter table public.categories        enable row level security;
alter table public.pairs             enable row level security;
alter table public.player_ratings    enable row level security;
alter table public.ranking_points    enable row level security;

-- ---- users -----------------------------------------------------------------
-- Invariante #1: cada quien lee/edita SOLO su fila. #5: admin todo.
create policy users_admin_all on public.users
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_update_own on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- (sin INSERT/DELETE para authenticated: la fila la crea el trigger;
--  altas provisionales de pareja van por Edge Function con service role.)

-- ---- organizer_members -----------------------------------------------------
-- Ves tus membresías; el owner ve/gestiona las de su org; admin todo.
create policy orgmembers_admin_all on public.organizer_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy orgmembers_select on public.organizer_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_owner(organizer_id));

create policy orgmembers_owner_write on public.organizer_members
  for all to authenticated
  using (public.is_org_owner(organizer_id))
  with check (public.is_org_owner(organizer_id));
-- (la PRIMERA membresía owner de un org la crea admin/servicio.)

-- ---- organizers ------------------------------------------------------------
-- Invariante #2: miembro ve solo su org. Alta de org = admin (self-serve es Sprint 4).
create policy organizers_admin_all on public.organizers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy organizers_select_member on public.organizers
  for select to authenticated
  using (public.is_org_member(id));

create policy organizers_update_owner on public.organizers
  for update to authenticated
  using (public.is_org_owner(id))
  with check (public.is_org_owner(id));

-- ---- tournaments -----------------------------------------------------------
-- Invariante #3: cualquiera ve torneos NO-draft (públicos). Miembro ve también drafts.
-- Crear/editar = owner del tenant o admin.
create policy tournaments_admin_all on public.tournaments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy tournaments_select on public.tournaments
  for select to authenticated
  using (status::text <> 'draft' or public.is_org_member(organizer_id));

create policy tournaments_insert_owner on public.tournaments
  for insert to authenticated
  with check (public.is_org_owner(organizer_id));

create policy tournaments_update_owner on public.tournaments
  for update to authenticated
  using (public.is_org_owner(organizer_id))
  with check (public.is_org_owner(organizer_id));

create policy tournaments_delete_owner on public.tournaments
  for delete to authenticated
  using (public.is_org_owner(organizer_id));

-- ---- categories ------------------------------------------------------------
-- Visibilidad espejo del torneo padre; gestión = owner del tenant o admin.
create policy categories_admin_all on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy categories_select on public.categories
  for select to authenticated
  using (
    public.tournament_status(tournament_id) <> 'draft'
    or public.is_org_member(public.tournament_org(tournament_id))
  );

create policy categories_write_owner on public.categories
  for all to authenticated
  using (public.is_org_owner(public.tournament_org(tournament_id)))
  with check (public.is_org_owner(public.tournament_org(tournament_id)));

-- ---- pairs -----------------------------------------------------------------
-- Invariante #3 (corazón): un jugador inserta su pareja (es player1/2) en torneo
-- registration_open. Owner registra a mano (paid_offline). Admin todo.
create policy pairs_admin_all on public.pairs
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Ver: tu propia pareja, o miembro (owner/juez) del tenant.
create policy pairs_select on public.pairs
  for select to authenticated
  using (
    player1_id = auth.uid()
    or player2_id = auth.uid()
    or public.is_org_member(public.tournament_org(tournament_id))
  );

-- Inscripción del propio jugador (solo con torneo abierto) o registro manual del owner.
create policy pairs_insert on public.pairs
  for insert to authenticated
  with check (
    public.is_org_owner(public.tournament_org(tournament_id))
    or (
      (player1_id = auth.uid() or player2_id = auth.uid())
      and public.tournament_status(tournament_id) = 'registration_open'
    )
  );

-- Editar parejas (asignar grupo/seed) = owner/admin. (El jugador no edita seed/grupo.)
create policy pairs_update_owner on public.pairs
  for update to authenticated
  using (public.is_org_owner(public.tournament_org(tournament_id)))
  with check (public.is_org_owner(public.tournament_org(tournament_id)));

-- Cancelar inscripción: el owner, o el propio jugador mientras el torneo siga abierto.
create policy pairs_delete on public.pairs
  for delete to authenticated
  using (
    public.is_org_owner(public.tournament_org(tournament_id))
    or (
      (player1_id = auth.uid() or player2_id = auth.uid())
      and public.tournament_status(tournament_id) = 'registration_open'
    )
  );

-- ---- player_ratings (Glicko OCULTO) ----------------------------------------
-- Solo admin lee/escribe vía cliente; el motor escribe con service role (ignora RLS).
create policy ratings_admin_all on public.player_ratings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- ranking_points (puntos VISIBLES, bien común de la red) -----------------
-- Lectura pública autenticada. Escritura solo admin/servicio.
create policy ranking_select_all on public.ranking_points
  for select to authenticated
  using (true);

create policy ranking_admin_write on public.ranking_points
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- NOTA Sprint 5: para mostrar el ranking con nombre del jugador hará falta una
-- vista pública (full_name, points, position) que NO exponga email/teléfono,
-- porque public.users queda en lectura estricta "solo tu fila".

-- ============================================================================
-- 5. REALTIME — PREPARADO Y COMENTADO PARA SPRINT 3 (NO ACTIVAR HOY)
--    Tablas en vivo: group_standings, matches (Doc A §5 y §10).
--    Suscripción permitida solo a: jugadores de ese torneo, juez asignado,
--    organizador (owner) del tenant. Descomentar y afinar en Sprint 3, cuando
--    el flujo de captura de resultados exista y se confirme contra Doc B.
-- ============================================================================

-- -- Habilitar publicación Realtime de las tablas en vivo:
-- alter publication supabase_realtime add table public.group_standings;
-- alter publication supabase_realtime add table public.matches;
--
-- -- RLS de matches (esqueleto — afinar en Sprint 3):
-- alter table public.matches enable row level security;
-- create policy matches_admin_all on public.matches
--   for all to authenticated
--   using (public.is_admin()) with check (public.is_admin());
-- -- Ver/recibir en vivo: miembro del tenant (owner/juez) o jugador de una de las parejas.
-- create policy matches_select on public.matches
--   for select to authenticated
--   using (
--     public.is_org_member(public.tournament_org(tournament_id))
--     or exists (
--       select 1 from public.pairs p
--       where p.id in (matches.pair_a_id, matches.pair_b_id)
--         and (p.player1_id = auth.uid() or p.player2_id = auth.uid())
--     )
--   );
-- -- Capturar resultado: SOLO juez/owner del tenant (scope fino "este juez → este
-- -- torneo asignado" se modela en Sprint 3 con la tabla de asignaciones de juez).
-- create policy matches_update_staff on public.matches
--   for update to authenticated
--   using (public.is_org_member(public.tournament_org(tournament_id)))
--   with check (public.is_org_member(public.tournament_org(tournament_id)));
--
-- -- RLS de group_standings (esqueleto — afinar en Sprint 3):
-- alter table public.group_standings enable row level security;
-- create policy standings_admin_all on public.group_standings
--   for all to authenticated
--   using (public.is_admin()) with check (public.is_admin());
-- -- Lectura espejo de la categoría/torneo (público no-draft); escritura solo servicio/owner.
-- -- (Requiere helper group_tournament(group_id) -> definir en Sprint 3.)

-- ============================================================================
-- FIN 008_auth_rls.sql
-- ============================================================================
