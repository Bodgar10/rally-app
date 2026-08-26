-- 015 · RPCs atómicas para sembrar y avanzar el cuadro eliminatorio (Sprint 3)
-- Reciben lo YA calculado por el engine. No llaman al engine. Idempotentes.
-- NOTA: numerada 015 (014_match_result_rpc ya existe).
-- AUTH: igual que 011/014, NO usamos auth.uid() (vía service_role es NULL).
-- Verificamos explícitamente contra p_actor: admin | owner del organizador dueño.

-- Idempotencia: una sola fila por (category_id, stage, round_label) fuera de grupos
create unique index if not exists matches_bracket_slot_uniq
  on public.matches (category_id, stage, round_label)
  where stage <> 'group';

-- SEED: materializa la 1.ª ronda eliminatoria de una categoría.
-- ⚠️ SUSTITUIDA POR LA MIGRACIÓN 045 (no editar esta: queda como registro).
--
--    Esta versión sembraba los byes con status 'scheduled' y winner_pair_id
--    null. Como nadie los juega, nada los ponía en 'finished', y el guard de
--    generate-bracket —`allFinished = ms.every(m => m.status === 'finished'
--    && m.winner_pair_id)`— nunca se cumplía: el cuadro se atascaba en la
--    primera ronda con un bye y no avanzaba jamás.
--
--    La 045 hace que un partido con un solo lado nazca resuelto. Ver allí el
--    razonamiento completo, incluido por qué played_at se queda en NULL.

create or replace function public.seed_bracket_for_category(
  p_actor       uuid,
  p_category_id uuid,
  p_matches     jsonb   -- [{stage,round_label,pair_a_id,pair_b_id}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid; m jsonb; v_count int := 0;
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
    insert into public.matches
      (tournament_id, category_id, stage, round_label, pair_a_id, pair_b_id, status)
    values (
      v_tournament, p_category_id,
      (m->>'stage')::match_stage,
      (m->>'round_label'),
      nullif(m->>'pair_a_id','')::uuid,
      nullif(m->>'pair_b_id','')::uuid,
      'scheduled'
    );
    v_count := v_count + 1;
  end loop;

  update public.categories set status = 'seeded' where id = p_category_id;
  return jsonb_build_object('ok', true, 'already_seeded', false, 'matches', v_count);
end $$;

-- ADVANCE: persiste la siguiente ronda (y/o 3.er lugar).
create or replace function public.advance_bracket_round(
  p_actor       uuid,
  p_category_id uuid,
  p_next        jsonb   -- [{stage,round_label,pair_a_id,pair_b_id}, ...]
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
      (tournament_id, category_id, stage, round_label, pair_a_id, pair_b_id, status)
    values (
      v_tournament, p_category_id, (m->>'stage')::match_stage, (m->>'round_label'),
      nullif(m->>'pair_a_id','')::uuid, nullif(m->>'pair_b_id','')::uuid, 'scheduled'
    )
    on conflict (category_id, stage, round_label) where stage <> 'group'
    do update set pair_a_id = excluded.pair_a_id, pair_b_id = excluded.pair_b_id;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'matches', v_count);
end $$;

revoke all on function public.seed_bracket_for_category(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.advance_bracket_round(uuid,uuid,jsonb)    from public, anon, authenticated;
-- Las invoca solo la Edge Function con service role.
