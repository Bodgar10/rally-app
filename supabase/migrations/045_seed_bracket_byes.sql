-- ============================================================================
-- 045_seed_bracket_byes.sql  ·  RALLY
--
-- Sustituye a seed_bracket_for_category (migración 015).
--
-- EL BUG QUE ARREGLA: EL CUADRO SE CUELGA PARA SIEMPRE
--   Un bye —una llave con una sola pareja— se sembraba con status 'scheduled'
--   y winner_pair_id null. Nadie lo juega, así que nada lo pone en 'finished'.
--
--   Y `generate-bracket` decide qué ronda avanzar así:
--       allFinished = ms.every(m => m.status === 'finished' && m.winner_pair_id)
--   Con un solo bye eso NUNCA es cierto. El cuadro se atasca en la primera
--   ronda que tenga uno y no avanza jamás. El motor sabía resolverlo
--   (`winnerOf` en bracket/index.ts contempla el bye) pero nunca llegaba a
--   llamarse: el guard rechazaba la ronda antes.
--
--   De paso arreglaba dos más: el juez veía los byes en su lista de partidos
--   pendientes (filtra por status <> 'finished') con el rival como "— / —", y
--   si intentaba capturarlos, match-result guardaba winner_pair_id null.
--
-- LA INVARIANTE
--   Un bye es un RESULTADO CONOCIDO desde que se siembra el cuadro, no un
--   partido pendiente. Va en la RPC y no en la Edge Function a propósito: así
--   se cumple venga la escritura de donde venga.
--
-- POR QUÉ played_at SE QUEDA EN NULL
--   Un bye no se jugó nunca; ponerle una hora sería inventarla. Verificado que
--   nada se rompe con un 'finished' sin played_at:
--
--     · cron-recompute-ratings (Glicko) filtra
--         .not('played_at','is',null).not('winner_pair_id','is',null)
--       → los byes quedan fuera SOLOS. Es lo correcto: nadie ganó nada, no
--         debe mover el rating de nadie.
--
--     · get_player_match_stats (migración 030) ordena por
--         coalesce(m.played_at, m.created_at)
--       → sin played_at cae a created_at y el orden sigue siendo estable.
--
--     · group_standings no los toca: son de fase final, no de grupo.
--
--   ► LO QUE SÍ HAY QUE ARREGLAR APARTE (no es SQL, va en la Edge Function):
--     compute-ranking-points cuenta como victoria cualquier partido con
--     `status='finished' && winner_pair_id`, sin mirar si hubo rival. Un bye
--     le sumaría una victoria a quien no jugó. Se corrige en la función
--     exigiendo que pair_a_id y pair_b_id existan.
--
-- Aplicar DESPUÉS de 015.
-- ============================================================================

create or replace function public.seed_bracket_for_category(
  p_actor       uuid,
  p_category_id uuid,
  p_matches     jsonb   -- [{stage,round_label,pair_a_id,pair_b_id}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  m            jsonb;
  v_count      int := 0;
  v_byes       int := 0;
  v_a          uuid;
  v_b          uuid;
  v_solo       uuid;   -- la pareja presente cuando la otra falta
begin
  select c.tournament_id into v_tournament
  from public.categories c where c.id = p_category_id for update;
  if not found then raise exception 'category_not_found'; end if;

  if not (
    exists (select 1 from public.users u where u.id = p_actor and u.role = 'admin')
    or exists (select 1 from public.organizer_members om
              where om.organizer_id = public.tournament_org(v_tournament)
                and om.user_id = p_actor and om.member_role = 'owner')
  ) then raise exception 'not_authorized'; end if;

  -- Idempotencia: si ya hay partidos no-group, no re-sembrar.
  if exists (select 1 from public.matches where category_id = p_category_id and stage <> 'group') then
    return jsonb_build_object('ok', true, 'already_seeded', true);
  end if;

  for m in select * from jsonb_array_elements(p_matches) loop
    v_a := nullif(m->>'pair_a_id','')::uuid;
    v_b := nullif(m->>'pair_b_id','')::uuid;

    -- Exactamente un lado presente = bye. Con los dos en null la llave está
    -- vacía (puede pasar en cuadros muy holgados) y se queda pendiente: no hay
    -- nadie a quien declarar ganador.
    v_solo := case
                when v_a is not null and v_b is null then v_a
                when v_b is not null and v_a is null then v_b
                else null
              end;

    if v_solo is not null then v_byes := v_byes + 1; end if;

    insert into public.matches
      (tournament_id, category_id, stage, round_label,
       pair_a_id, pair_b_id, status, winner_pair_id, played_at)
    values (
      v_tournament, p_category_id,
      (m->>'stage')::match_stage,
      (m->>'round_label'),
      v_a, v_b,
      -- El bye nace resuelto. Sin esto el cuadro no avanza nunca.
      case when v_solo is not null then 'finished' else 'scheduled' end::match_status,
      v_solo,
      -- played_at se queda NULL a propósito: no se jugó. Ver cabecera.
      null
    );
    v_count := v_count + 1;
  end loop;

  update public.categories set status = 'seeded' where id = p_category_id;

  return jsonb_build_object(
    'ok', true, 'already_seeded', false,
    'matches', v_count, 'byes', v_byes
  );
end $$;

comment on function public.seed_bracket_for_category(uuid,uuid,jsonb) is
  'Siembra el cuadro de una categoria. Un partido con UN SOLO lado es un bye y '
  'nace status=finished con winner_pair_id = la pareja presente: es un '
  'resultado conocido, no un partido pendiente. played_at queda NULL porque no '
  'se jugo — el Glicko lo filtra solo. Reemplaza a la version de la 015.';

-- Los grants de la 015 siguen valiendo (misma firma), pero se reafirman por si
-- alguien corre esta migración sobre una base donde no se aplicó aquella.
revoke all     on function public.seed_bracket_for_category(uuid,uuid,jsonb) from public, anon, authenticated;
grant  execute on function public.seed_bracket_for_category(uuid,uuid,jsonb) to service_role;


-- ── Verificación ────────────────────────────────────────────────────────────
-- Tras sembrar una categoría con byes:
--
--   select stage, round_label, pair_a_id is null as sin_a, pair_b_id is null as sin_b,
--          status, winner_pair_id is not null as tiene_ganador, played_at
--     from public.matches
--    where category_id = '<id>' and stage <> 'group'
--    order by round_label;
--
-- Las filas con un solo lado deben salir status='finished', tiene_ganador=true
-- y played_at=null. Las de dos lados, 'scheduled' sin ganador.
