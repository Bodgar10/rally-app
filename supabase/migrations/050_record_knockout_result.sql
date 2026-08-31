-- ============================================================================
-- 050_record_knockout_result.sql  ·  RALLY
--
-- Capturar el resultado de un partido de eliminatorias Y avanzar el cuadro,
-- en una sola transacción.
--
-- POR QUÉ EN UN SOLO PASO
--   El domingo el organizador está en la cancha, no en la app. Entre "capturé
--   la semifinal" y "aparece el finalista" no puede haber un paso manual: la
--   gente mira el cuadro en vivo desde el celular y durante ese hueco la
--   pantalla miente. Capturar y avanzar son el mismo acto.
--
--   De ahí la condición dura: si el avance falla, el resultado NO se guarda.
--   O las dos cosas o ninguna. Por eso es una RPC y no dos llamadas seguidas
--   desde la Edge Function.
--
-- REPARTO DE TRABAJO (el mismo patrón que 048)
--   El QUÉ escribir lo decide el motor en TypeScript (bracket/avance-captura.ts),
--   que sabe de cuadros y tiene tests. Aquí se hace lo que solo puede hacerse
--   en la base: bloquear, comprobar que nadie escribió en medio, VOLVER a
--   verificar las invariantes por cuenta propia, y escribir todo junto.
--
--   Las invariantes se revalidan aquí a propósito. Un guard que se fía de lo
--   que le mandan no es un guard: esta función tiene que ser segura aunque la
--   llame un cliente equivocado.
--
-- LAS CUATRO INVARIANTES
--   1. ATOMICIDAD. Todo dentro de una transacción; cualquier `raise` deshace
--      el resultado, los sets, los reapuntados y los partidos creados.
--
--   2. UN BYE NO SE CAPTURA NI SE PISA. Un bye llega sembrado y ya 'finished'
--      (migración 045): es un resultado conocido, no un partido pendiente.
--      Se rechaza capturarlo, y el avance nunca lo escribe.
--
--   3. EL TERCER LUGAR SE CREA AL AVANZAR SEMIS, con los dos perdedores, igual
--      que ya hacía `generate-bracket`. Llega en p_crear como un cruce más.
--
--   4. NO SE PISA UN PARTIDO YA JUGADO. Corregir un resultado solo se permite
--      mientras el partido que depende de él no se haya jugado. Si ya se jugó,
--      se rechaza con 'downstream_already_played'.
--
--      POR QUÉ RECHAZAR Y NO DESHACER EN CASCADA: deshacer significaría borrar
--      el resultado de un partido que dos parejas jugaron de verdad, para
--      arreglar un error de más arriba. Es destruir un registro cierto para
--      tapar uno falso, y no tiene fondo — corregir la primera ronda de un
--      cuadro de 32 arrastraría cinco rondas y el tercer lugar. Cuando ya se
--      jugó, qué hacer (repetir, adjudicar) es decisión del organizador; el
--      software se aparta y dice exactamente qué lo bloquea.
--
--      Matiz: se rechaza solo si la corrección CAMBIA quién juega el partido ya
--      jugado. Corregir un 6-4 anotado como 6-3, sin cambiar de ganador, se
--      permite siempre — no mueve a nadie de sitio.
--
-- CONCURRENCIA
--   Se bloquea el CUADRO ENTERO de la categoría (no solo el partido) y se
--   compara `p_bracket_state` contra lo que hay. Si no cuadra, alguien escribió
--   entre la lectura y esta llamada: se aborta con 'bracket_changed' y la Edge
--   Function reintenta releyendo. Mismo mecanismo que 048 para los grupos.
--
-- Aplicar DESPUÉS de 049.
-- ============================================================================

create or replace function public.record_knockout_result(
  p_actor         uuid,        -- auth.uid() del que captura (re-verificado aquí)
  p_match_id      uuid,
  p_winner_pair   uuid,
  p_played_at     timestamptz,
  p_sets          jsonb,       -- [{set_number,games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b}, ...]
  p_bracket_state jsonb,       -- foto del cuadro sobre la que se calculó el plan
  p_crear         jsonb,       -- [{stage,round_label,pair_a_id,pair_b_id,source_match_ids}, ...]
  p_reapuntar     jsonb        -- [{match_id,pair_a_id,pair_b_id}, ...]
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

  -- El ganador tiene que ser una de las dos parejas del partido.
  if p_winner_pair is null or (p_winner_pair <> v_pair_a and p_winner_pair <> v_pair_b) then
    raise exception 'winner_not_in_match';
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

  update public.matches
     set winner_pair_id = p_winner_pair,
         status         = 'finished',
         played_at      = coalesce(p_played_at, now())
   where id = p_match_id;

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

    insert into public.matches
      (tournament_id, category_id, stage, round_label, pair_a_id, pair_b_id, status, source_match_ids)
    values (
      v_tournament, v_category, (m->>'stage')::match_stage, (m->>'round_label'),
      nullif(m->>'pair_a_id','')::uuid, nullif(m->>'pair_b_id','')::uuid, 'scheduled',
      case
        when coalesce(jsonb_typeof(m->'source_match_ids'), '') = 'array'
        then (select array_agg(value::uuid) from jsonb_array_elements_text(m->'source_match_ids'))
        else null
      end
    )
    on conflict (category_id, stage, round_label) where stage <> 'group'
    do update set
      pair_a_id        = excluded.pair_a_id,
      pair_b_id        = excluded.pair_b_id,
      source_match_ids = coalesce(excluded.source_match_ids, public.matches.source_match_ids);
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

revoke all on function public.record_knockout_result(uuid,uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
-- La invoca solo la Edge Function con service role.
