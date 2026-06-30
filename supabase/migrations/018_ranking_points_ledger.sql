-- 018 · Ledger de puntos de ranking por torneo + rollup idempotente a ranking_points (Sprint 5/6)
-- ranking_points.points = SUMA del ledger por (player, division). El engine calcula; la RPC persiste.

-- 1) Ledger: qué ganó cada jugador en cada torneo (auditable, idempotente)
create table if not exists public.tournament_ranking_points (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.users(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  division      public.division not null,
  points        int not null default 0,
  breakdown     jsonb,                                     -- {group_wins,qualified,furthest_round,...}
  created_at    timestamptz not null default now(),
  unique (player_id, tournament_id, division)
);
create index if not exists trp_division_idx on public.tournament_ranking_points(division);
alter table public.tournament_ranking_points enable row level security;
-- Lectura pública (bien común de la red); escritura solo service_role (RPC)
create policy trp_select on public.tournament_ranking_points for select to authenticated using (true);

-- 2) Destino del rollup (ranking_points ya trae unique(player_id,division) desde 002; índice redundante pero idempotente)
create unique index if not exists ranking_points_player_division_uniq
  on public.ranking_points (player_id, division);

-- 3) RPC: aplica el ledger de UN torneo y recalcula el rollup + posición de las divisiones tocadas
create or replace function public.apply_tournament_ranking_points(
  p_actor       uuid,
  p_tournament_id uuid,
  p_ledger      jsonb   -- [{player_id, division, points, breakdown}, ...]  (ya agregado por jugador×división)
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb; v_rows int := 0;
begin
  -- AUTH explícita contra p_actor (admin | owner del organizador del torneo).
  -- (No usar is_admin()/is_org_owner(): dependen de auth.uid(), que vía service_role es NULL.)
  if not exists (select 1 from public.users u where u.id = p_actor and u.role = 'admin')
     and not exists (
       select 1 from public.tournaments t
       join public.organizer_members om on om.organizer_id = t.organizer_id
       where t.id = p_tournament_id and om.user_id = p_actor and om.member_role = 'owner')
  then raise exception 'not_authorized'; end if;

  -- 3.1) Upsert del ledger de este torneo (idempotente)
  for e in select * from jsonb_array_elements(p_ledger) loop
    insert into public.tournament_ranking_points (player_id, tournament_id, division, points, breakdown)
    values ((e->>'player_id')::uuid, p_tournament_id, (e->>'division')::division,
            (e->>'points')::int, e->'breakdown')
    on conflict (player_id, tournament_id, division)
      do update set points = excluded.points, breakdown = excluded.breakdown;
    v_rows := v_rows + 1;
  end loop;

  -- 3.2) Rollup: ranking_points = SUMA del ledger, para los jugadores×división tocados
  with touched as (
    select distinct (e->>'player_id')::uuid as player_id, (e->>'division')::division as division
    from jsonb_array_elements(p_ledger) e
  ),
  sums as (
    select trp.player_id, trp.division, sum(trp.points)::int as total
    from public.tournament_ranking_points trp
    join touched t on t.player_id = trp.player_id and t.division = trp.division
    group by trp.player_id, trp.division
  )
  insert into public.ranking_points (player_id, division, points)
  select player_id, division, total from sums
  on conflict (player_id, division) do update set points = excluded.points, updated_at = now();

  -- 3.3) Recalcular position dentro de cada división tocada (top de la red)
  update public.ranking_points rp
     set position = sub.rn
  from (
    select player_id, division,
           row_number() over (partition by division order by points desc, player_id) as rn
    from public.ranking_points
    where division in (select distinct (e->>'division')::division from jsonb_array_elements(p_ledger) e)
  ) sub
  where rp.player_id = sub.player_id and rp.division = sub.division;

  return jsonb_build_object('ok', true, 'ledger_rows', v_rows);
end $$;

revoke all on function public.apply_tournament_ranking_points(uuid, uuid, jsonb) from public, anon, authenticated;
