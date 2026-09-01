-- 062_captura_parcial.sql  ·  RALLY
--
-- EL JUEZ ANOTA SET A SET, NO AL FINAL
--
--   Hasta hoy un partido se capturaba entero al terminar. Durante 60-75
--   minutos nadie sabia nada de esa cancha: ni el que espera para entrar, ni el
--   que ya jugo y quiere saber si clasifico, ni el organizador que quiere saber
--   si va tarde.
--
--   Con `p_parcial` el juez guarda cada set en cuanto termina. El partido queda
--   en 'in_progress' con los sets que haya, y se cierra como siempre cuando el
--   marcador determina un ganador.
--
-- EL CONTRATO DE HOY NO SE TOCA
--   `p_parcial boolean default false`. Sin ese argumento las dos funciones se
--   comportan EXACTAMENTE como antes — es lo que usan los scripts de QA y lo
--   que seguira usando el juez que anote el partido de una sola vez.
--
-- LO QUE NO SE TOCA, Y CONVIENE QUE SIGA ASI
--   La autorizacion por `p_actor` contra users / organizer_members /
--   tournament_judges. NO se sustituye por can_capture_tournament(): bajo
--   service_role auth.uid() es NULL y esa funcion rechaza a todo el mundo. Ya
--   tumbo la captura una vez.
--
--   Y los sets se siguen regrabando enteros en cada envio, asi que corregir un
--   set ya guardado es un envio normal.

-- LAS FIRMAS VIEJAS SE TIRAN PRIMERO, Y NO ES OPCIONAL.
--
--   Un parametro con DEFAULT no reemplaza la funcion: crea una SOBRECARGA. Con
--   la de 7 argumentos y la de 8-con-default conviviendo, la llamada de 7 que
--   hace la Edge Function pasa a ser AMBIGUA y Postgres la rechaza con
--   'function is not unique'. Seria cambiar un bug por otro peor.
--
--   Se tiran ANTES de crear las nuevas. Entre el drop y el create no hay
--   ventana: el SQL Editor corre el archivo entero en una transaccion.

drop function if exists public.record_match_result(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb);
drop function if exists public.record_knockout_result(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb);

create or replace function public.record_match_result(
  p_actor       uuid,        -- auth.uid() del que captura (re-verificado aquí)
  p_match_id    uuid,
  p_winner_pair uuid,
  p_played_at   timestamptz,
  p_sets        jsonb,       -- [{set_number,games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b}, ...]
  p_standings   jsonb,       -- [{pair_id,played,won,lost,sets_won,sets_lost,games_won,games_lost,points,position,clinch_status}, ...]
  p_group_state jsonb,       -- [{match_id,status,winner_pair_id}, ...] tal como lo leyó la Edge Function
  p_parcial     boolean default false  -- true = set suelto: el partido sigue en juego
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
  -- CERRAR O DEJAR EN JUEGO. Con p_parcial el partido conserva sus sets y pasa
  -- a 'in_progress': no hay ganador todavia y `played_at` no se toca, porque
  -- ese campo dice CUANDO SE JUGO y el partido sigue en la cancha.
  if p_parcial then
    update public.matches
       set winner_pair_id = null,
           status         = 'in_progress'
     where id = p_match_id;
  else
    update public.matches
       set winner_pair_id = p_winner_pair,
           status         = 'finished',
           played_at      = coalesce(p_played_at, now())
     where id = p_match_id;
  end if;

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


revoke all on function public.record_match_result(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,boolean)
  from public, anon, authenticated;
-- La invoca solo la Edge Function con service role.

create or replace function public.record_knockout_result(
  p_actor         uuid,        -- auth.uid() del que captura (re-verificado aquí)
  p_match_id      uuid,
  p_winner_pair   uuid,
  p_played_at     timestamptz,
  p_sets          jsonb,       -- [{set_number,games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b}, ...]
  p_bracket_state jsonb,       -- foto del cuadro sobre la que se calculó el plan
  p_crear         jsonb,       -- [{stage,round_label,slot_index,pair_a_id,pair_b_id,source_match_ids}, ...]
  p_reapuntar     jsonb,       -- [{match_id,pair_a_id,pair_b_id}, ...]
  p_parcial       boolean default false  -- true = set suelto: el partido sigue en juego
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_category   uuid;
  v_stage      public.match_stage;
  v_pair_a     uuid;
  v_pair_b     uuid;
  v_status     public.match_status;
  v_actual     jsonb;
  v_creados    int := 0;
  v_movidos    int := 0;
  v_dep        record;
  v_otro_a     uuid;
  v_otro_b     uuid;
  v_otro_st    public.match_status;
  m            jsonb;
  s            jsonb;
  v_slot       int;
  v_at         timestamptz;
  v_court      text;
begin
  -- ── 1. Contexto del partido ───────────────────────────────────────────────
  select tournament_id, category_id, stage, pair_a_id, pair_b_id, status
    into v_tournament, v_category, v_stage, v_pair_a, v_pair_b, v_status
  from public.matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if v_stage = 'group' then raise exception 'not_a_knockout_match'; end if;

  -- ── 2. Autorización (las tres ramas de captura, como 048) ────────────────
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

  -- ── 3. Bloqueo del cuadro entero de la categoría ─────────────────────────
  -- Ordenado por id para que dos capturas cruzadas no se hagan un deadlock.
  perform 1 from public.matches
   where category_id = v_category and stage <> 'group'
   order by id
     for update;

  -- ── 4. ¿Sigue el cuadro como lo vio quien calculó el plan? ───────────────
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'match_id',       m2.id,
               'status',         m2.status::text,
               'winner_pair_id', m2.winner_pair_id,
               'pair_a_id',      m2.pair_a_id,
               'pair_b_id',      m2.pair_b_id
             ) order by m2.id
           ),
           '[]'::jsonb
         )
    into v_actual
  from public.matches m2
  where m2.category_id = v_category and m2.stage <> 'group';

  if p_bracket_state is null or v_actual <> p_bracket_state then
    raise exception 'bracket_changed';
  end if;

  -- ── 5. Invariante 2: un bye no se captura ────────────────────────────────
  if v_pair_a is null or v_pair_b is null then
    raise exception 'is_a_bye';
  end if;

  -- El ganador tiene que ser una de las dos parejas del partido. En una
  -- captura parcial no hay ganador todavia, y eso es correcto, no un error.
  if not p_parcial then
    if p_winner_pair is null or (p_winner_pair <> v_pair_a and p_winner_pair <> v_pair_b) then
      raise exception 'winner_not_in_match';
    end if;
  end if;

  -- ── 6. Invariante 4, verificada por cuenta propia ────────────────────────
  -- Se recorre lo que DEPENDE de este partido según la base, no según lo que
  -- nos mandaron. Si algo ya se jugó y el plan pretende cambiarle las parejas,
  -- se para aquí.
  for v_dep in
    select id, pair_a_id, pair_b_id, status
    from public.matches
    where category_id = v_category
      and stage <> 'group'
      and source_match_ids is not null
      and p_match_id = any(source_match_ids)
  loop
    if v_dep.status = 'finished' then
      -- ¿El plan quiere moverlo? (se resetean: SELECT INTO sin filas deja el
      -- valor de la vuelta anterior)
      v_otro_a := null; v_otro_b := null;
      select (r->>'pair_a_id')::uuid, (r->>'pair_b_id')::uuid
        into v_otro_a, v_otro_b
      from jsonb_array_elements(coalesce(p_reapuntar, '[]'::jsonb)) r
      where (r->>'match_id')::uuid = v_dep.id
      limit 1;

      if found and (v_otro_a is distinct from v_dep.pair_a_id
                 or v_otro_b is distinct from v_dep.pair_b_id) then
        raise exception 'downstream_already_played: %', v_dep.id;
      end if;
    end if;
  end loop;

  -- ── 7. El resultado ───────────────────────────────────────────────────────
  -- Los sets se regraban enteros: así una corrección es un envío normal.
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

  -- Ver la nota gemela en record_match_result.
  if p_parcial then
    update public.matches
       set winner_pair_id = null,
           status         = 'in_progress'
     where id = p_match_id;
  else
    update public.matches
       set winner_pair_id = p_winner_pair,
           status         = 'finished',
           played_at      = coalesce(p_played_at, now())
     where id = p_match_id;
  end if;

  -- ── 8 y 9. El cuadro NO avanza con una captura parcial ───────────────────
  --
  --   Sin ganador no hay ronda siguiente que materializar ni cruce que
  --   reapuntar. Crear semifinales a partir de un partido a medias seria
  --   inventarse un resultado. Se devuelve aqui, con los sets ya guardados y
  --   el partido en 'in_progress'.
  if p_parcial then
    return jsonb_build_object(
      'ok', true,
      'match_id', p_match_id,
      'category_id', v_category,
      'parcial', true,
      'creados', 0,
      'reapuntados', 0
    );
  end if;

  -- ── 8. Reapuntar los cruces que ya existen y cambian de protagonistas ────
  for m in select * from jsonb_array_elements(coalesce(p_reapuntar, '[]'::jsonb)) loop
    select status into v_otro_st
    from public.matches
    where id = (m->>'match_id')::uuid and category_id = v_category and stage <> 'group';

    if not found then
      raise exception 'repoint_target_not_found: %', (m->>'match_id');
    end if;
    -- Nunca se toca un partido jugado. El paso 6 ya lo comprobó por la vía de
    -- source_match_ids; esto cubre los cuadros viejos que no tienen ese enlace.
    if v_otro_st = 'finished' then
      raise exception 'downstream_already_played: %', (m->>'match_id');
    end if;

    update public.matches
       set pair_a_id = nullif(m->>'pair_a_id','')::uuid,
           pair_b_id = nullif(m->>'pair_b_id','')::uuid
     where id = (m->>'match_id')::uuid;
    v_movidos := v_movidos + 1;
  end loop;

  -- ── 9. Crear la ronda siguiente (y el tercer lugar, si toca) ─────────────
  for m in select * from jsonb_array_elements(coalesce(p_crear, '[]'::jsonb)) loop
    -- Si la ranura ya existe y está jugada con otras parejas, no se pisa.
    v_otro_a := null; v_otro_b := null; v_otro_st := null;
    select pair_a_id, pair_b_id, status into v_otro_a, v_otro_b, v_otro_st
    from public.matches
    where category_id = v_category
      and stage       = (m->>'stage')::match_stage
      and round_label  = (m->>'round_label');

    if found and v_otro_st = 'finished'
       and (v_otro_a is distinct from nullif(m->>'pair_a_id','')::uuid
         or v_otro_b is distinct from nullif(m->>'pair_b_id','')::uuid) then
      raise exception 'downstream_already_played: %-%', (m->>'stage'), (m->>'round_label');
    end if;

    -- LA HORA Y LA CANCHA SALEN DEL PLAN, AQUI Y AHORA.
    --
    --   El partido nacia con scheduled_at en null y aparecia como "POR
    --   PROGRAMAR" aunque `match_schedule` YA tuviera su hueco reservado: el
    --   plan del domingo cubre todas las rondas, incluidas las que todavia no
    --   tienen fila en `matches` (ver 047). El organizador capturaba los
    --   cuartos, veian nacer las semifinales sin hora, y abajo le saltaba el
    --   aviso de "partidos sin hora asignada" sobre un calendario que si las
    --   tenia. Habia que darle a Reprogramar para algo que ya estaba decidido.
    --
    --   El plan se identifica por (category_id, stage, slot_index) — la
    --   posicion dentro de la ronda, que es lo unico que existe antes que el
    --   partido. Por eso `p_crear` ahora la trae.
    --
    --   Si no hay slot para ese hueco, se queda en null y sale en el aviso.
    --   Eso es la excepcion —un cuadro que crecio despues de programar— y no
    --   lo normal.
    v_slot  := nullif(m->>'slot_index','')::int;
    v_at    := null;
    v_court := null;
    if v_slot is not null then
      select ms.scheduled_at, ms.court_label into v_at, v_court
      from public.match_schedule ms
      where ms.category_id = v_category
        and ms.stage       = (m->>'stage')::match_stage
        and ms.slot_index  = v_slot;
    end if;

    insert into public.matches
      (tournament_id, category_id, stage, round_label, pair_a_id, pair_b_id, status,
       source_match_ids, scheduled_at, court_label)
    values (
      v_tournament, v_category, (m->>'stage')::match_stage, (m->>'round_label'),
      nullif(m->>'pair_a_id','')::uuid, nullif(m->>'pair_b_id','')::uuid, 'scheduled',
      case
        when coalesce(jsonb_typeof(m->'source_match_ids'), '') = 'array'
        then (select array_agg(value::uuid) from jsonb_array_elements_text(m->'source_match_ids'))
        else null
      end,
      v_at, v_court
    )
    on conflict (category_id, stage, round_label) where stage <> 'group'
    do update set
      pair_a_id        = excluded.pair_a_id,
      pair_b_id        = excluded.pair_b_id,
      source_match_ids = coalesce(excluded.source_match_ids, public.matches.source_match_ids),
      -- COALESCE y no asignacion directa: si el organizador ya movio ese
      -- partido a mano, su hora manda sobre el plan. Solo se rellena el hueco.
      scheduled_at     = coalesce(public.matches.scheduled_at, excluded.scheduled_at),
      court_label      = coalesce(public.matches.court_label,  excluded.court_label);
    v_creados := v_creados + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'match_id', p_match_id,
    'category_id', v_category,
    'era_correccion', (v_status = 'finished'),
    'creados', v_creados,
    'reapuntados', v_movidos
  );
end $$;



revoke all on function public.record_knockout_result(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,boolean)
  from public, anon, authenticated;
-- La invoca solo la Edge Function con service role.
