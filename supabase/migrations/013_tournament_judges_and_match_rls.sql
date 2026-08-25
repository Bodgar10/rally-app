-- 013 · Asignación juez→torneo + RLS/Realtime de matches y group_standings (Sprint 3)
-- Reusa helpers SECURITY DEFINER del 008: is_admin(), is_org_owner(), tournament_org().
-- NOTA: numerada 013 (no 012) porque 012_find_user_rpc.sql ya existe.

-- ⚠️ ESTE ARCHIVO NO REFLEJA LA BASE REAL (verificado 2026-08-25)
--
-- La tabla `tournament_judges` que existe hoy en producción tiene SOLO estas
-- cinco columnas:
--     id, tournament_id, user_id, assigned_by, created_at
--
-- Es decir:
--   · `organizer_id` (línea ~10)  NO existe en la base.
--   · `assigned_at`  (línea ~12)  NO existe en la base; la columna de tiempo
--                                 real se llama `created_at`.
--   · `assigned_by`  y `created_at` existen en la base pero NO se declaran aquí.
--   · El índice `tournament_judges_org_idx` sobre organizer_id tampoco existe.
--
-- Presumiblemente la tabla se creó a mano en el editor de Supabase antes de
-- que se escribiera esta migración, y el `create table IF NOT EXISTS` la
-- encontró ya presente y no hizo nada. La divergencia pasó inadvertida hasta
-- que la pantalla de asignación de jueces (2026) intentó insertar
-- `organizer_id` y PostgREST devolvió PGRST204 / 42703.
--
-- Lo que SÍ existe en la base y esta migración no menciona:
--     tournament_judges_tournament_id_user_id_key  UNIQUE (tournament_id, user_id)
--
-- NO "arregles" esto añadiendo las columnas: el código ya está alineado con la
-- base real (jueces.tsx inserta assigned_by y ordena por created_at). Si algún
-- día se quiere reconciliar, hazlo en una migración nueva, nunca editando ésta.
--
-- El resto del archivo (RLS de matches, group_standings, Realtime) sí se aplicó
-- correctamente. La divergencia se limita al bloque 1.

-- 1) Tabla de asignación juez → torneo ------------------------------------------------
create table if not exists public.tournament_judges (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.users(id)       on delete cascade,
  organizer_id  uuid references public.organizers(id) on delete cascade,  -- denormalizado: lo puebla la UI de asignación (prompt 44). Nullable para no romper inserts mínimos.
  assigned_by   uuid references public.users(id),
  assigned_at   timestamptz not null default now(),
  unique (tournament_id, user_id)
);
create index if not exists tournament_judges_tournament_idx on public.tournament_judges(tournament_id);
create index if not exists tournament_judges_user_idx       on public.tournament_judges(user_id);
create index if not exists tournament_judges_org_idx        on public.tournament_judges(organizer_id);

alter table public.tournament_judges enable row level security;

-- Helper: ¿este actor es juez asignado a este torneo?
create or replace function public.is_tournament_judge(p_tournament_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_judges tj
    where tj.tournament_id = p_tournament_id and tj.user_id = auth.uid()
  );
$$;

-- Helper: ¿este actor participa en este torneo? (juega en alguna pareja)
create or replace function public.is_tournament_participant(p_tournament_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pairs p
    where p.tournament_id = p_tournament_id
      and (p.player1_id = auth.uid() or p.player2_id = auth.uid())
  );
$$;

-- Helper: ¿este actor puede capturar resultados de este torneo? (juez asignado | owner | admin)
create or replace function public.can_capture_tournament(p_tournament_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.is_org_owner(public.tournament_org(p_tournament_id))
      or public.is_tournament_judge(p_tournament_id);
$$;

grant execute on function public.is_tournament_judge(uuid)       to authenticated;
grant execute on function public.is_tournament_participant(uuid) to authenticated;
grant execute on function public.can_capture_tournament(uuid)    to authenticated;

-- RLS de tournament_judges: el owner/admin gestiona; el juez ve sus asignaciones.
create policy tj_select on public.tournament_judges for select to authenticated
  using ( user_id = auth.uid()
          or public.is_org_owner(public.tournament_org(tournament_id))
          or public.is_admin() );
create policy tj_write on public.tournament_judges for all to authenticated
  using ( public.is_org_owner(public.tournament_org(tournament_id)) or public.is_admin() )
  with check ( public.is_org_owner(public.tournament_org(tournament_id)) or public.is_admin() );

-- 2) RLS de matches (descomenta/aterriza lo preparado en 008) -------------------------
alter table public.matches enable row level security;

-- Lectura: participantes del torneo + juez asignado + owner del organizador + admin
-- (alimenta la UI del juez y Realtime, que respeta RLS: sin SELECT no hay suscripción).
create policy matches_select on public.matches for select to authenticated
  using ( public.is_tournament_participant(tournament_id)
          or public.is_tournament_judge(tournament_id)
          or public.is_org_owner(public.tournament_org(tournament_id))
          or public.is_admin() );

-- UPDATE: SOLO quien puede capturar en ESE torneo (juez asignado | owner | admin).
-- Defensa en profundidad: el camino real de escritura es la RPC con service_role.
create policy matches_update on public.matches for update to authenticated
  using ( public.can_capture_tournament(tournament_id) )
  with check ( public.can_capture_tournament(tournament_id) );

-- 3) RLS de group_standings ------------------------------------------------------------
alter table public.group_standings enable row level security;

-- Lectura: participantes/owner/admin del torneo dueño del grupo.
-- group_standings → group_id → groups.category_id → categories.tournament_id.
create policy gs_select on public.group_standings for select to authenticated
  using ( exists (
            select 1
            from public.groups g
            join public.categories c on c.id = g.category_id
            where g.id = group_standings.group_id
              and ( public.is_tournament_participant(c.tournament_id)
                    or public.is_tournament_judge(c.tournament_id)
                    or public.is_org_owner(public.tournament_org(c.tournament_id))
                    or public.is_admin() )
          ) );
-- Sin policy de escritura para cliente: group_standings/clinch SOLO los escribe service_role (RPC).

-- 4) Realtime: asegurar publication (idempotente; revisar §1-E antes para no duplicar) --
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='matches') then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='group_standings') then
    alter publication supabase_realtime add table public.group_standings;
  end if;
  -- match_sets también en vivo (consumido por la UI de captura / score detail).
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='match_sets') then
    alter publication supabase_realtime add table public.match_sets;
  end if;
end $$;
