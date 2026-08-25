-- 035_close_last_category_moves_tournament.sql  ·  RALLY
-- El torneo pasa a 'in_progress' solo al cerrar la ÚLTIMA categoría abierta.
--
-- QUÉ CAMBIA Y POR QUÉ
--   Hasta ahora, cerrar UNA categoría movía el torneo entero a 'in_progress':
--
--     UPDATE public.tournaments SET status = 'in_progress'
--      WHERE id = v_tournament_id AND status = 'registration_open';
--
--   Y `pairs_insert` (008) exige `tournament_status(...) = 'registration_open'`
--   para que un JUGADOR se inscriba. O sea: cerrar la 5ª Mixta cortaba las
--   inscripciones de la 4ª, que el organizador había dejado abierta a propósito
--   porque esperaba una pareja más. El producto hacía justo lo contrario de lo
--   que le estaban pidiendo.
--
--   Ahora la transición espera a que no quede ninguna categoría en 'open'.
--
--   El orden dentro de la función ya lo permite: la categoría que se acaba de
--   cerrar pasa a 'in_progress' ANTES de este UPDATE, así que no se cuenta a
--   sí misma como bloqueante.
--
-- QUÉ NO CAMBIA
--   Nada más de la función. Se reescribe entera porque es CREATE OR REPLACE,
--   pero la única diferencia con la 011 es el NOT EXISTS del paso 5.
--
-- ⚠ CONSECUENCIA A VIGILAR: LA CATEGORÍA VACÍA
--   Una categoría con menos de 2 parejas pagadas NO se puede cerrar
--   (close-registration devuelve `not_enough_pairs`), así que se queda en
--   'open' indefinidamente — y con este cambio, mantiene el torneo entero en
--   'registration_open' para siempre.
--
--   Eso importa porque `finish_tournament` (026) exige 'in_progress':
--     if v_status <> 'in_progress' then raise 'invalid_status_transition'
--   Es decir: una categoría vacía olvidada impide TERMINAR el torneo.
--
--   La salida existe y es de producto, no de base: quitar la categoría vacía
--   desde la pantalla de Categorías. La pantalla de cierre lo señala. Si en la
--   práctica resulta que se olvida, la alternativa es ignorar aquí las
--   categorías con 0 parejas — pero eso reabre en pequeño el problema que esta
--   migración viene a resolver, así que no se hace por defecto.
--
-- Aplicar DESPUÉS de 011.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.close_registration_for_category(
  p_actor       uuid,    -- id del usuario que invoca (verificado por la Edge Function)
  p_category_id uuid,
  p_plan        jsonb,   -- FormatPlan del engine
  p_groups      jsonb    -- [ { "name":"A", "pair_ids":[...], "matches":[...] }, ... ]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_organizer_id  uuid;
  v_cat_status    text;
  v_existing_grp  int;
  v_group         jsonb;
  v_match         jsonb;
  v_group_id      uuid;
  v_pair_id       uuid;
  v_groups_created  int := 0;
  v_matches_created int := 0;
  v_abiertas_restantes int;
BEGIN
  -- 1) Resolver torneo + organizador de la categoría
  SELECT c.tournament_id, t.organizer_id, c.status::text
    INTO v_tournament_id, v_organizer_id, v_cat_status
  FROM public.categories c
  JOIN public.tournaments t ON t.id = c.tournament_id
  WHERE c.id = p_category_id;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'category_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 2) AUTH: solo el owner del organizador dueño puede cerrar.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizer_members om
    WHERE om.organizer_id = v_organizer_id
      AND om.user_id      = p_actor
      AND om.member_role  = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  -- 3) IDEMPOTENCIA: si ya se cerró o ya hay grupos, devolver lo existente.
  SELECT count(*) INTO v_existing_grp FROM public.groups WHERE category_id = p_category_id;
  IF v_cat_status <> 'open' OR v_existing_grp > 0 THEN
    RETURN jsonb_build_object(
      'already_closed', true,
      'category_id', p_category_id,
      'groups', v_existing_grp,
      'matches', (SELECT count(*) FROM public.matches WHERE category_id = p_category_id)
    );
  END IF;

  -- 4) Materializar grupo por grupo
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
  LOOP
    INSERT INTO public.groups (category_id, name)
    VALUES (p_category_id, v_group->>'name')
    RETURNING id INTO v_group_id;
    v_groups_created := v_groups_created + 1;

    FOR v_pair_id IN SELECT (jsonb_array_elements_text(v_group->'pair_ids'))::uuid
    LOOP
      UPDATE public.pairs
        SET group_id = v_group_id
      WHERE id = v_pair_id AND category_id = p_category_id;

      INSERT INTO public.group_standings (group_id, pair_id)
      VALUES (v_group_id, v_pair_id);
    END LOOP;

    FOR v_match IN SELECT * FROM jsonb_array_elements(v_group->'matches')
    LOOP
      INSERT INTO public.matches
        (tournament_id, category_id, stage, group_id, round_label,
         pair_a_id, pair_b_id, status)
      VALUES
        (v_tournament_id, p_category_id, 'group', v_group_id, v_match->>'round_label',
         (v_match->>'pair_a')::uuid, (v_match->>'pair_b')::uuid, 'scheduled');
      v_matches_created := v_matches_created + 1;
    END LOOP;
  END LOOP;

  -- 5) Estado final de la categoría (igual que antes)
  UPDATE public.categories
     SET status                = 'in_progress',
         format_type           = (p_plan->>'formatType')::format_type,
         num_groups            = jsonb_array_length(p_groups),
         advance_per_group     = (p_plan->>'advancePerGroup')::int,
         best_extra_qualifiers = COALESCE((p_plan->>'bestExtraQualifiers')::int, 0)
   WHERE id = p_category_id;

  -- 6) ⭐ EL CAMBIO: el torneo avanza solo si ya no queda ninguna categoría
  --    abierta. La recién cerrada no cuenta: el UPDATE de arriba ya la sacó
  --    de 'open'.
  SELECT count(*) INTO v_abiertas_restantes
  FROM public.categories c
  WHERE c.tournament_id = v_tournament_id
    AND c.status = 'open';

  IF v_abiertas_restantes = 0 THEN
    UPDATE public.tournaments
       SET status = 'in_progress'
     WHERE id = v_tournament_id AND status = 'registration_open';
  END IF;

  RETURN jsonb_build_object(
    'already_closed', false,
    'category_id', p_category_id,
    'groups', v_groups_created,
    'matches', v_matches_created,
    -- Nuevo: la UI necesita saber si el torneo avanzó o siguen abiertas.
    'categories_still_open', v_abiertas_restantes,
    'tournament_advanced', (v_abiertas_restantes = 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_registration_for_category(uuid,uuid,jsonb,jsonb)
  FROM public, anon, authenticated;
-- La invoca solo la Edge Function con service role.
