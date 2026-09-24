-- 090 · Un empate en el ranking comparte puesto.
--
-- EL FALLO
--   Los dos jugadores de una pareja suman EXACTAMENTE lo mismo: mismo torneo,
--   misma ronda, mismo cuadro. No es una coincidencia que haya que desempatar
--   — es la unidad de competición del pádel.
--
--   `row_number()` les daba 1.º y 2.º, y el criterio de desempate era
--   `player_id`: el orden de un uuid. La app le decía a uno de los dos
--   campeones que había quedado segundo de su propio torneo.
--
-- EL ARREGLO
--   `rank()`. Los empatados comparten puesto y el siguiente salta:
--   1, 1, 3, 3, 5, 5, 5, 5, 9… Es como se cuenta un podio en cualquier deporte,
--   y es lo que hace que los dos campeones lean lo mismo.
--
-- LO QUE ARRASTRA EN LA APP (ya corregido, pero conviene saberlo aquí)
--   · `conCortes` deducía el hueco de la lista restando posiciones, y entre un
--     1.º y un 3.º eso daba "1 jugador más" con las dos filas pegadas. El hueco
--     pasó a ser una propiedad de cómo se arma la lista, no de los números.
--   · `proyectarRanking` cogía al vecino por índice y mandaba a un campeón a
--     perseguir a su propio compañero por 1 punto. Ahora salta a los empatados.
--
--   Si algún día se vuelve a `row_number()`, esas dos cosas hay que revisarlas.

begin;

create or replace function public.apply_tournament_ranking_points(
  p_actor       uuid,
  p_tournament_id uuid,
  p_ledger      jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb; v_rows int := 0; v_season int;
begin
  if not exists (select 1 from public.users u where u.id = p_actor and u.role = 'admin')
     and not exists (
       select 1 from public.tournaments t
       join public.organizer_members om on om.organizer_id = t.organizer_id
       where t.id = p_tournament_id and om.user_id = p_actor and om.member_role = 'owner')
  then raise exception 'not_authorized'; end if;

  select extract(year from t.end_date)::int into v_season
    from public.tournaments t where t.id = p_tournament_id;
  if v_season is null then
    raise exception 'sin_end_date: la temporada sale de tournaments.end_date';
  end if;

  for e in select * from jsonb_array_elements(p_ledger) loop
    insert into public.tournament_ranking_points (player_id, tournament_id, division, points, breakdown)
    values ((e->>'player_id')::uuid, p_tournament_id, (e->>'division')::division,
            (e->>'points')::int, e->'breakdown')
    on conflict (player_id, tournament_id, division)
      do update set points = excluded.points, breakdown = excluded.breakdown;
    v_rows := v_rows + 1;
  end loop;

  with touched as (
    select distinct (led->>'player_id')::uuid as player_id, (led->>'division')::division as division
    from jsonb_array_elements(p_ledger) led
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

  -- EMPATE = MISMO PUESTO. `rank()`, no `row_number()`. Ver la cabecera.
  update public.ranking_points rp
     set position = sub.rn
  from (
    select player_id, division, season,
           rank() over (partition by division, season order by points desc) as rn
    from public.ranking_points
    where season = v_season
      and division in (select distinct (led->>'division')::division
                       from jsonb_array_elements(p_ledger) led)
  ) sub
  where rp.player_id = sub.player_id
    and rp.division  = sub.division
    and rp.season    = sub.season;

  return jsonb_build_object('ok', true, 'ledger_rows', v_rows, 'season', v_season);
end $$;

revoke all on function public.apply_tournament_ranking_points(uuid, uuid, jsonb) from public, anon, authenticated;

-- Las posiciones ya escritas se recalculan con el criterio nuevo.
update public.ranking_points rp
   set position = sub.rn
from (
  select player_id, division, season,
         rank() over (partition by division, season order by points desc) as rn
  from public.ranking_points
) sub
where rp.player_id = sub.player_id
  and rp.division  = sub.division
  and rp.season    = sub.season
  and rp.position is distinct from sub.rn;

commit;
