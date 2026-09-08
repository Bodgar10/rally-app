-- 067_advance_hereda_el_plan.sql  ·  RALLY
--
-- LA TERCERA RUTA, Y LA ULTIMA
--
--   Un partido de eliminatoria puede nacer por tres caminos:
--     1. la siembra inicial        -> `seed_bracket_for_category`   (066)
--     2. la captura de un resultado -> `record_knockout_result`     (061)
--     3. `generate-bracket action=advance` -> `advance_bracket_round`  <- esta
--
--   Las dos primeras ya heredan su hueco de `match_schedule`. Esta no, y por
--   eso "Reprogramar" seguia pareciendo un paso obligatorio: por uno de los
--   tres caminos los partidos seguian naciendo sin hora.
--
--   Con esta, el plan se aplica en TODAS. Reprogramar vuelve a ser lo que
--   deberia: la respuesta a que algo cambio de verdad — una cancha caida, una
--   hora movida, un resultado corregido que reordena el cuadro.
--
--   Solo cambia el INSERT. El resto del cuerpo es identico al de la 049.
--
-- ORDEN: correr ANTES de desplegar `generate-bracket`, que es quien empieza a
-- mandar `slot_index`. Al reves no rompe nada, pero el arreglo no aplica.

create or replace function public.advance_bracket_round(
  p_actor       uuid,
  p_category_id uuid,
  p_next        jsonb   -- [{stage,round_label,slot_index,pair_a_id,pair_b_id,source_match_ids}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid; m jsonb; v_count int := 0;
  v_slot int; v_at timestamptz; v_court text;
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
    -- LA HORA Y LA CANCHA SALEN DEL PLAN. La tercera y ultima ruta por la que
    -- nace un partido de eliminatoria; las otras dos ya lo hacian (061 al
    -- capturar, 066 al sembrar). Sin esto, la ronda creada por
    -- `generate-bracket action=advance` nacia sin hora teniendo su hueco
    -- reservado, y habia que darle a Reprogramar para algo ya decidido.
    v_slot  := nullif(m->>'slot_index','')::int;
    v_at    := null;
    v_court := null;
    if v_slot is not null then
      select ms.scheduled_at, ms.court_label into v_at, v_court
      from public.match_schedule ms
      where ms.category_id = p_category_id
        and ms.stage       = (m->>'stage')::match_stage
        and ms.slot_index  = v_slot;
    end if;

    insert into public.matches
      (tournament_id, category_id, stage, round_label, pair_a_id, pair_b_id, status,
       source_match_ids, scheduled_at, court_label)
    values (
      v_tournament, p_category_id, (m->>'stage')::match_stage, (m->>'round_label'),
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
      -- COALESCE: si el organizador ya movio ese partido a mano, su hora manda.
      scheduled_at     = coalesce(public.matches.scheduled_at, excluded.scheduled_at),
      court_label      = coalesce(public.matches.court_label,  excluded.court_label);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'matches', v_count);
end $$;


revoke all     on function public.advance_bracket_round(uuid,uuid,jsonb) from public, anon, authenticated;
grant  execute on function public.advance_bracket_round(uuid,uuid,jsonb) to service_role;
