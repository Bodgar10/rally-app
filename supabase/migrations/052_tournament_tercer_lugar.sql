-- ============================================================================
-- 052_tournament_tercer_lugar.sql  ·  RALLY
--
-- El partido por el 3.er lugar pasa a ser configurable por torneo.
--
-- DEFAULT TRUE, Y NO ES UN DETALLE
--   Hoy se crea SIEMPRE: lo hace `generate-bracket` al avanzar semifinales y
--   también `record_knockout_result` (migración 050). Poner el default en
--   `false` cambiaría el comportamiento de los torneos existentes sin que nadie
--   lo hubiera pedido, y de la peor manera: un torneo que ya contaba con su
--   3.er lugar se quedaría sin él a media fase final.
--
--   `not null default true` deja a todos los torneos actuales exactamente como
--   están. Quien no quiera jugarlo, lo apaga.
--
-- POR QUÉ ES DE TORNEO Y NO DE CATEGORÍA
--   Es una decisión de formato del evento, no de una rama. Un torneo donde 3ª
--   Fuerza juega el 3.er lugar y 4ª no sería incomprensible para el jugador, y
--   además reparte premios distintos por accidente.
--
-- LO QUE ARRASTRA
--   El planificador y el scheduler del último día ahora lo CUENTAN en el
--   presupuesto. Eran ocho partidos invisibles que aun así ocupaban cancha, y
--   en el peor momento: la transición de semifinales a final, cuando las ocho
--   categorías convergen. Medido contra Cimepa, la hora de fin realista pasa de
--   19:30 a 20:00 — que es la hora de cierre exacta. El margen de media hora que
--   el plan prometía no existía.
--
-- Aplicar DESPUÉS de 050.
-- ============================================================================

alter table public.tournaments
  add column if not exists tercer_lugar boolean not null default true;

comment on column public.tournaments.tercer_lugar is
  'Si el torneo juega el partido por el 3.er lugar. Default true: es lo que se '
  'venia haciendo siempre. Lo consumen generate-bracket y record_knockout_result '
  'para decidir si lo crean, y el planificador para contarlo en el presupuesto '
  'del ultimo dia.';


-- ----------------------------------------------------------------------------
-- record_knockout_result: no crea el 3.er lugar si el torneo no lo juega.
--
-- Se revalida AQUÍ, no solo en la Edge Function que propone la escritura. Un
-- guard que se fía de lo que le mandan no es un guard: esta función tiene que
-- ser segura aunque la llame un cliente equivocado o desactualizado.
--
-- Es un `raise`, no un salto silencioso: si alguien manda un 3.er lugar en un
-- torneo que lo tiene apagado, hay una discrepancia entre cliente y servidor
-- que conviene ver, no tapar.
--
-- Todo lo demás de la función queda igual que en la 050.
-- ----------------------------------------------------------------------------

create or replace function public.record_knockout_result(
  p_actor         uuid,
  p_match_id      uuid,
  p_winner_pair   uuid,
  p_played_at     timestamptz,
  p_sets          jsonb,
  p_bracket_state jsonb,
  p_crear         jsonb,
  p_reapuntar     jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_category   uuid;
  v_stage      public.match_stage;
  v_pair_a     uuid;
  v_pair_b     uuid;
  v_status     public.match_status;
  v_tercero    boolean;
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
  -- 1. Contexto del partido
  select tournament_id, category_id, stage, pair_a_id, pair_b_id, status
    into v_tournament, v_category, v_stage, v_pair_a, v_pair_b, v_status
  from public.matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if v_stage = 'group' then raise exception 'not_a_knockout_match'; end if;

  select tercer_lugar into v_tercero from public.tournaments where id = v_tournament;

  -- 2. Autorización: las tres ramas de captura
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

  -- 3. Bloqueo del cuadro entero, ordenado por id para no provocar deadlocks
  perform 1 from public.matches
   where category_id = v_category and stage <> 'group'
   order by id
     for update;

  -- 4. ¿Sigue el cuadro como lo vio quien calculó el plan?
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

  -- 5. Un bye no se captura
  if v_pair_a is null or v_pair_b is null then
    raise exception 'is_a_bye';
  end if;

  if p_winner_pair is null or (p_winner_pair <> v_pair_a and p_winner_pair <> v_pair_b) then
    raise exception 'winner_not_in_match';
  end if;

  -- 5.bis. El 3.er lugar, solo si el torneo lo juega.
  if coalesce(v_tercero, true) = false
     and exists (
       select 1 from jsonb_array_elements(coalesce(p_crear, '[]'::jsonb)) c
       where c->>'stage' = 'third_place'
     ) then
    raise exception 'third_place_disabled';
  end if;

  -- 6. Lo que DEPENDE de este partido según la base, no según lo que mandaron
  for v_dep in
    select id, pair_a_id, pair_b_id, status
    from public.matches
    where category_id = v_category
      and stage <> 'group'
      and source_match_ids is not null
      and p_match_id = any(source_match_ids)
  loop
    if v_dep.status = 'finished' then
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

  -- 7. El resultado
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

  -- 8. Reapuntar los cruces que ya existen y cambian de protagonistas
  for m in select * from jsonb_array_elements(coalesce(p_reapuntar, '[]'::jsonb)) loop
    select status into v_otro_st
    from public.matches
    where id = (m->>'match_id')::uuid and category_id = v_category and stage <> 'group';

    if not found then
      raise exception 'repoint_target_not_found: %', (m->>'match_id');
    end if;
    if v_otro_st = 'finished' then
      raise exception 'downstream_already_played: %', (m->>'match_id');
    end if;

    update public.matches
       set pair_a_id = nullif(m->>'pair_a_id','')::uuid,
           pair_b_id = nullif(m->>'pair_b_id','')::uuid
     where id = (m->>'match_id')::uuid;
    v_movidos := v_movidos + 1;
  end loop;

  -- 9. Crear la ronda siguiente (y el 3.er lugar, si toca)
  for m in select * from jsonb_array_elements(coalesce(p_crear, '[]'::jsonb)) loop
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
