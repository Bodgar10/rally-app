-- ============================================================================
-- 048_match_result_group_lock.sql  ·  RALLY
--
-- Sustituye a record_match_result (migración 014).
--
-- EL BUG QUE ARREGLA: DOS CAPTURAS DEL MISMO GRUPO SE PISAN
--   La tabla del grupo la calcula `computeStandings` en TypeScript, dentro de
--   la Edge Function, ANTES de llamar aquí. La 014 solo bloqueaba la fila del
--   partido que se estaba capturando:
--
--       select ... from matches where id = p_match_id for update;
--
--   Así que dos jueces capturando dos partidos DISTINTOS del MISMO grupo a la
--   vez leían ambos el estado previo, cada uno calculaba la tabla ignorando el
--   partido del otro, y el segundo en escribir pisaba al primero. Los dos
--   partidos quedaban 'finished' pero group_standings reflejaba uno solo.
--
-- LA SOLUCIÓN: BLOQUEO DEL GRUPO + HUELLA DE ESTADO
--   1. Se bloquean TODOS los partidos del grupo (`for update`, ordenados por id
--      para no provocar deadlocks entre dos capturas cruzadas).
--   2. La Edge Function manda en `p_group_state` la foto del grupo sobre la
--      que hizo sus cuentas: [{match_id, status, winner_pair_id}, ...].
--   3. Si la foto no coincide con lo que hay ya bloqueado, alguien escribió en
--      medio: se aborta con 'group_changed' y la Edge Function reintenta
--      releyendo y recalculando.
--
--   El recálculo NO se mueve a SQL a propósito: la tabla de posiciones y los
--   desempates viven en el engine (standings/index.ts), con sus tests. Tener
--   dos implementaciones sería tener dos verdades.
--
-- COMPATIBILIDAD
--   Cambia la firma (añade p_group_state), así que se elimina la vieja para no
--   dejar dos sobrecargas y que PostgREST no tenga que adivinar.
--
-- Aplicar DESPUÉS de 014.
-- ============================================================================

drop function if exists public.record_match_result(uuid,uuid,uuid,timestamptz,jsonb,jsonb);

create or replace function public.record_match_result(
  p_actor       uuid,        -- auth.uid() del que captura (re-verificado aquí)
  p_match_id    uuid,
  p_winner_pair uuid,
  p_played_at   timestamptz,
  p_sets        jsonb,       -- [{set_number,games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b}, ...]
  p_standings   jsonb,       -- [{pair_id,played,won,lost,sets_won,sets_lost,games_won,games_lost,points,position,clinch_status}, ...]
  p_group_state jsonb        -- [{match_id,status,winner_pair_id}, ...] tal como lo leyó la Edge Function
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_group      uuid;
  v_actual     jsonb;
  v_filas      int;
  s            jsonb;
begin
  -- Contexto del partido (sin bloquear todavía: primero hace falta el group_id).
  select tournament_id, group_id into v_tournament, v_group
  from public.matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if v_group is null then raise exception 'not_a_group_match'; end if;

  -- Autorización servidor: verificación explícita contra p_actor (patrón 011),
  -- porque vía service_role auth.uid() es NULL y can_capture_tournament() fallaría.
  if not (
    exists (select 1 from public.users u
              where u.id = p_actor and u.role = 'admin')
    or exists (select 1 from public.organizer_members om
              where om.organizer_id = public.tournament_org(v_tournament)
                and om.user_id = p_actor and om.member_role = 'owner')
    or exists (select 1 from public.tournament_judges tj
              where tj.tournament_id = v_tournament and tj.user_id = p_actor)
  ) then
    raise exception 'not_authorized';
  end if;

  -- Bloqueo del GRUPO entero, en orden de id: dos capturas cruzadas del mismo
  -- grupo se serializan aquí en vez de pisarse.
  perform 1 from public.matches
   where group_id = v_group
   order by id
     for update;

  -- ¿Sigue el grupo como lo vio quien calculó la tabla?
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'match_id',       m.id,
               'status',         m.status::text,
               'winner_pair_id', m.winner_pair_id
             ) order by m.id
           ),
           '[]'::jsonb
         )
    into v_actual
  from public.matches m
  where m.group_id = v_group;

  if p_group_state is null or v_actual <> p_group_state then
    raise exception 'group_changed';
  end if;

  -- Sets: se regraban enteros. Permite RE-captura/corrección de un resultado
  -- ya guardado (no se toca el rating; de eso se encarga el cron de Glicko).
  delete from public.match_sets where match_id = p_match_id;
  for s in select * from jsonb_array_elements(p_sets) loop
    insert into public.match_sets
      (match_id, set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b)
    values (
      p_match_id,
      (s->>'set_number')::int,
      (s->>'games_a')::int,
      (s->>'games_b')::int,
      coalesce((s->>'is_super_tiebreak')::boolean, false),
      nullif(s->>'tiebreak_a','')::int,
      nullif(s->>'tiebreak_b','')::int
    );
  end loop;

  -- Actualizar el partido
  update public.matches
     set winner_pair_id = p_winner_pair,
         status         = 'finished',
         played_at      = coalesce(p_played_at, now())
   where id = p_match_id;

  -- Regrabar standings del grupo (todas las filas calculadas por computeStandings + clinch).
  -- Se cuenta lo actualizado: si la Edge Function mandó filas que no existen en
  -- group_standings, el UPDATE no daría error y la tabla se quedaría a medias.
  v_filas := 0;
  for s in select * from jsonb_array_elements(p_standings) loop
    update public.group_standings
       set played       = (s->>'played')::int,
           won          = (s->>'won')::int,
           lost         = (s->>'lost')::int,
           sets_won     = (s->>'sets_won')::int,
           sets_lost    = (s->>'sets_lost')::int,
           games_won    = (s->>'games_won')::int,
           games_lost   = (s->>'games_lost')::int,
           points       = (s->>'points')::int,
           position     = (s->>'position')::int,
           clinch_status= (s->>'clinch_status')::clinch_status,
           updated_at   = now()
     where group_id = v_group and pair_id = (s->>'pair_id')::uuid;
    if found then v_filas := v_filas + 1; end if;
  end loop;

  if v_filas <> jsonb_array_length(p_standings) then
    raise exception 'standings_mismatch: % de % filas', v_filas, jsonb_array_length(p_standings);
  end if;

  return jsonb_build_object(
    'ok', true, 'match_id', p_match_id, 'group_id', v_group, 'standings_rows', v_filas
  );
end $$;

revoke all on function public.record_match_result(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb) from public, anon, authenticated;
-- La invoca solo la Edge Function con service role.
