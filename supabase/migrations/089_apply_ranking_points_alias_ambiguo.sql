-- 089 · apply_tournament_ranking_points: el alias `e` chocaba con la variable `e`.
--
-- EL FALLO
--   'column reference "e" is ambiguous'. La función declara `e jsonb` para el
--   bucle del ledger, y DOS consultas de más abajo aliasan la misma expansión
--   como `e`:
--
--       from jsonb_array_elements(p_ledger) e
--
--   Para un `FROM funcion() AS alias` que devuelve un escalar, la única columna
--   se llama IGUAL que el alias. Así que dentro de esas consultas `e->>'x'`
--   puede ser la variable plpgsql o la columna, y Postgres no elige: aborta.
--
-- CÓMO SE ESCAPÓ
--   Es un error de ejecución, no de creación: `create function` valida la
--   sintaxis y no resuelve los nombres. La migración 070 se aplicó sin ruido y
--   la función quedó rota desde el primer día. Nadie lo vio porque el reparto
--   de puntos moría ANTES, en la autorización —`finish-tournament` llamaba sin
--   actor— y ese fallo tapaba este.
--
--   Los dos juntos hacían que ningún torneo cerrado repartiera un solo punto.
--
-- EL ARREGLO
--   Se renombra el alias a `led`. Nada más: el resto va verbatim de la 070,
--   incluida la partición por temporada, para que este cambio no pueda
--   arrastrar otra cosa.

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
  --      Aquí `e` es la variable del bucle y no hay alias en juego: no choca.
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
    -- `led`, no `e`: ver la cabecera de esta migración.
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

  -- 3.3) position dentro de cada división Y temporada
  update public.ranking_points rp
     set position = sub.rn
  from (
    select player_id, division, season,
           row_number() over (partition by division, season order by points desc, player_id) as rn
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

commit;
