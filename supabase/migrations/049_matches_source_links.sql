-- ============================================================================
-- 049_matches_source_links.sql  ·  RALLY
--
-- Hace EXPLÍCITO el árbol del cuadro: de qué dos partidos sale cada cruce.
--
-- POR QUÉ HACE FALTA
--   Hasta hoy la dependencia entre rondas era implícita: vivía en el orden de
--   `round_label` y en la aritmética de `advanceBracket`, que empareja los
--   partidos i e i+1. El motor YA calculaba `sourceMatchIds` en cada avance
--   (bracket/index.ts) y `generate-bracket` los tiraba a la basura.
--
--   Sin ese enlace, la base no puede responder a la única pregunta que hace
--   falta para corregir un resultado de eliminatorias con seguridad:
--
--       ¿qué partido depende de éste, y ya se jugó?
--
--   Y esa pregunta tiene que poder responderla el SERVIDOR, no la Edge
--   Function que propone la escritura. Un guard que se fía de lo que le mandan
--   no es un guard.
--
-- NULL EN LA PRIMERA RONDA
--   Los partidos sembrados no salen de ningún partido: salen de la tabla de
--   grupos. Su `source_match_ids` es NULL a propósito, y no es un hueco que
--   rellenar.
--
-- NO SE HACE BACKFILL
--   Los cuadros ya sembrados se quedan con NULL. El plan de avance
--   (avance-captura.ts) los reconoce por `round_label` cuando no hay orígenes,
--   justo para que esos cuadros no queden a medias. El enlace se puebla solo
--   en los avances a partir de aquí.
--
-- Aplicar DESPUÉS de 015 y 045.
-- ============================================================================

alter table public.matches
  add column if not exists source_match_ids uuid[];

comment on column public.matches.source_match_ids is
  'Los dos partidos de la ronda previa que alimentan este cruce. NULL en la '
  'ronda sembrada (sale de la fase de grupos, no de otro partido). Lo escribe '
  'advance_bracket_round / record_knockout_result. Permite preguntarle a la '
  'base que partidos dependen de uno dado, que es lo que hace falta para '
  'saber si una correccion es segura.';

-- Para "¿qué depende de este partido?": where p_match_id = any(source_match_ids)
create index if not exists matches_source_match_ids_idx
  on public.matches using gin (source_match_ids);


-- ----------------------------------------------------------------------------
-- advance_bracket_round: ahora persiste el enlace.
--
-- Se mantiene la firma y el comportamiento; lo único nuevo es que
-- `source_match_ids` viaja en cada elemento de p_next y se guarda. Los
-- llamadores viejos que no lo manden siguen funcionando: el campo queda NULL.
-- ----------------------------------------------------------------------------

create or replace function public.advance_bracket_round(
  p_actor       uuid,
  p_category_id uuid,
  p_next        jsonb   -- [{stage,round_label,pair_a_id,pair_b_id,source_match_ids}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid; m jsonb; v_count int := 0;
begin
  select tournament_id into v_tournament from public.categories where id = p_category_id for update;
  if not found then raise exception 'category_not_found'; end if;
  if not (
    exists (select 1 from public.users u where u.id = p_actor and u.role = 'admin')
    or exists (select 1 from public.organizer_members om
              where om.organizer_id = public.tournament_org(v_tournament)
                and om.user_id = p_actor and om.member_role = 'owner')
  ) then raise exception 'not_authorized'; end if;

  for m in select * from jsonb_array_elements(p_next) loop
    insert into public.matches
      (tournament_id, category_id, stage, round_label, pair_a_id, pair_b_id, status, source_match_ids)
    values (
      v_tournament, p_category_id, (m->>'stage')::match_stage, (m->>'round_label'),
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
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'matches', v_count);
end $$;

revoke all on function public.advance_bracket_round(uuid,uuid,jsonb) from public, anon, authenticated;
