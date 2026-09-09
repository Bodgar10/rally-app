-- 070 · apply_tournament_ranking_points particionada por temporada.
-- Cambia en tres puntos: deriva la temporada de end_date, el rollup suma solo
-- los torneos de esa temporada, y position se calcula por (division, season).
-- El bloque de AUTH y el upsert del ledger van verbatim de la 018.

begin;

create or replace function public.apply_tournament_ranking_points(
  p_actor       uuid,
  p_tournament_id uuid,
  p_ledger      jsonb   -- [{player_id, division, points, breakdown}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb; v_rows int := 0; v_season int;
begin
  -- AUTH explícita contra p_actor (admin | owner del organizador del torneo).
  -- (No usar is_admin()/is_org_owner(): dependen de auth.uid(), que vía service_role es NULL.)
  if not exists (select 1 from public.users u where u.id = p_actor and u.role = 'admin')
     and not exists (
       select 1 from public.tournaments t
       join public.organizer_members om on om.organizer_id = t.organizer_id
       where t.id = p_tournament_id and om.user_id = p_actor and om.member_role = 'owner')
  then raise exception 'not_authorized'; end if;

  -- Temporada: de end_date, obligatoria. Sin default: que truene.
  select extract(year from t.end_date)::int into v_season
    from public.tournaments t where t.id = p_tournament_id;
  if v_season is null then
    raise exception 'sin_end_date: la temporada sale de tournaments.end_date';
  end if;

  -- 3.1) Upsert del ledger (sin cambios: su unique ya distingue torneos)
  for e in select * from jsonb_array_elements(p_ledger) loop
    insert into public.tournament_ranking_points (player_id, tournament_id, division, points, breakdown)
    values ((e->>'player_id')::uuid, p_tournament_id, (e->>'division')::division,
            (e->>'points')::int, e->'breakdown')
    on conflict (player_id, tournament_id, division)
      do update set points = excluded.points, breakdown = excluded.breakdown;
    v_rows := v_rows + 1;
  end loop;

  -- 3.2) Rollup de ESTA temporada: suma solo torneos que terminaron en v_season
  with touched as (
    select distinct (e->>'player_id')::uuid as player_id, (e->>'division')::division as division
    from jsonb_array_elements(p_ledger) e
  ),
  sums as (
    select trp.player_id, trp.division, sum(trp.points)::int as total
    from public.tournament_ranking_points trp
    join public.tournaments t on t.id = trp.tournament_id
    join touched tc on tc.player_id = trp.player_id and tc.division = trp.division
    where extract(year from t.end_date)::int = v_season
    group by trp.player_id, trp.division
  )
  insert into public.ranking_points (player_id, division, season, points)
  select player_id, division, v_season, total from sums
  on conflict (player_id, division, season)
    do update set points = excluded.points, updated_at = now();

  -- 3.3) position dentro de cada división Y temporada
  update public.ranking_points rp
     set position = sub.rn
  from (
    select player_id, division, season,
           row_number() over (partition by division, season order by points desc, player_id) as rn
    from public.ranking_points
    where season = v_season
      and division in (select distinct (e->>'division')::division from jsonb_array_elements(p_ledger) e)
  ) sub
  where rp.player_id = sub.player_id
    and rp.division  = sub.division
    and rp.season    = sub.season;

  return jsonb_build_object('ok', true, 'ledger_rows', v_rows, 'season', v_season);
end $$;

revoke all on function public.apply_tournament_ranking_points(uuid, uuid, jsonb) from public, anon, authenticated;

commit;
