-- 011_close_registration_rpc.sql
-- RPC atómica que materializa grupos + partidos de UNA categoría.
-- La invoca la Edge Function close-registration con el plan ya calculado por el engine.
-- NO contiene lógica de torneo: solo escribe lo que el engine decidió, con guards.

-- Idempotencia estructural: no puede haber dos grupos con el mismo nombre en una categoría.
CREATE UNIQUE INDEX IF NOT EXISTS groups_category_name_uniq
  ON public.groups (category_id, name);

CREATE OR REPLACE FUNCTION public.close_registration_for_category(
  p_actor       uuid,    -- id del usuario que invoca (verificado por la Edge Function)
  p_category_id uuid,
  p_plan        jsonb,   -- FormatPlan del engine: { formatType, groupSizes, advancePerGroup, bestExtraQualifiers, knockoutStart, ambiguous }
  p_groups      jsonb    -- [ { "name":"A", "pair_ids":[...], "matches":[ {"pair_a":uuid,"pair_b":uuid,"round_label":"R1"}, ... ] }, ... ]
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

  -- 2) AUTH: solo el owner del organizador dueño puede cerrar. (No dependemos de auth.uid()
  --    porque corremos vía service role; verificamos explícitamente contra p_actor.)
  IF NOT EXISTS (
    SELECT 1 FROM public.organizer_members om
    WHERE om.organizer_id = v_organizer_id
      AND om.user_id      = p_actor
      AND om.member_role  = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  -- 3) IDEMPOTENCIA: si ya se cerró o ya hay grupos, devolver lo existente sin duplicar.
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

    -- 4a) Asignar parejas al grupo + fila inicial de standings.
    --     group_standings tiene defaults para todo (played/won/.../position=0, clinch_status='alive',
    --     updated_at=now()); position es NOT NULL, así que insertamos solo (group_id, pair_id).
    FOR v_pair_id IN SELECT (jsonb_array_elements_text(v_group->'pair_ids'))::uuid
    LOOP
      UPDATE public.pairs
        SET group_id = v_group_id
      WHERE id = v_pair_id AND category_id = p_category_id;

      INSERT INTO public.group_standings (group_id, pair_id)
      VALUES (v_group_id, v_pair_id);
    END LOOP;

    -- 4b) Partidos del grupo (round-robin que produjo el engine de fixtures)
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

  -- 5) Estado final: categoría a in_progress + metadata del plan; torneo a in_progress si seguía abierto.
  UPDATE public.categories
     SET status                = 'in_progress',
         format_type           = (p_plan->>'formatType')::format_type,
         num_groups            = jsonb_array_length(p_groups),
         advance_per_group     = (p_plan->>'advancePerGroup')::int,
         best_extra_qualifiers = COALESCE((p_plan->>'bestExtraQualifiers')::int, 0)
   WHERE id = p_category_id;

  UPDATE public.tournaments
     SET status = 'in_progress'
   WHERE id = v_tournament_id AND status = 'registration_open';

  RETURN jsonb_build_object(
    'already_closed', false,
    'category_id', p_category_id,
    'groups', v_groups_created,
    'matches', v_matches_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_registration_for_category(uuid,uuid,jsonb,jsonb) FROM public, anon, authenticated;
-- La invoca solo la Edge Function con service role.
