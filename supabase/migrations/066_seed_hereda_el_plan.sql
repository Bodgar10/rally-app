-- 066_seed_hereda_el_plan.sql  ·  RALLY
--
-- LA SIEMBRA TAMBIEN HEREDA LA HORA DEL PLAN
--
--   Es el mismo bug que arreglo la 061, en el otro camino. Aquella hizo que un
--   partido creado AL CAPTURAR un resultado heredara su hueco de
--   `match_schedule`. `generate-bracket` crea la PRIMERA ronda y nunca se le
--   aplico lo mismo.
--
--   Verificado en 5a Varonil recien sembrada: los ocho `round_of_16` con
--   scheduled_at y court_label en null, y el plan completo al lado —
--   round_of_16 slots 0..7 el domingo a las 10:00 en las canchas 1 a 8.
--
--   Esta migracion solo cambia el INSERT. El resto del cuerpo es identico al de
--   la 045.
--
-- ORDEN: correr ANTES de desplegar `generate-bracket`, que es quien empieza a
-- mandar `slot_index`. Al reves no rompe nada —el campo llega null y el partido
-- nace sin hora, como hoy— pero el arreglo no aplica.

create or replace function public.seed_bracket_for_category(
  p_actor       uuid,
  p_category_id uuid,
  p_matches     jsonb   -- [{stage,round_label,slot_index,pair_a_id,pair_b_id}, ...]
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
  v_slot       int;
  v_at         timestamptz;
  v_court      text;
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

    -- LA HORA Y LA CANCHA SALEN DEL PLAN, IGUAL QUE EN LA 061.
    --
    --   Aquel arreglo hizo que un partido creado AL CAPTURAR heredara su hueco
    --   de `match_schedule`. La primera ronda se crea por este otro camino y
    --   nunca se le aplico lo mismo: los ocho octavos de 5a Varonil nacieron
    --   con scheduled_at en null mientras el plan tenia domingo 10:00 y las
    --   ocho canchas. La pantalla decia "POR PROGRAMAR" en octavos y si
    --   mostraba hora en cuartos, semis y final — esas se pintan como celdas
    --   futuras leyendo el plan, no `matches`.
    --
    --   El hueco se identifica por (category_id, stage, slot_index). El slot lo
    --   manda quien llama, contando SOLO los cruces jugables: un bye no ocupa
    --   cancha y el scheduler no le reserva hueco, asi que contarlo desplazaria
    --   la hora de todos los cruces de detras.
    --
    --   Sin slot para ese cruce, el partido nace sin hora y sale en el aviso de
    --   partidos sin hora asignada. Es la excepcion, no lo normal.
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
      (tournament_id, category_id, stage, round_label,
       pair_a_id, pair_b_id, status, winner_pair_id, played_at,
       scheduled_at, court_label)
    values (
      v_tournament, p_category_id,
      (m->>'stage')::match_stage,
      (m->>'round_label'),
      v_a, v_b,
      -- El bye nace resuelto. Sin esto el cuadro no avanza nunca.
      case when v_solo is not null then 'finished' else 'scheduled' end::match_status,
      v_solo,
      -- played_at se queda NULL a propósito: no se jugó. Ver cabecera.
      null,
      v_at, v_court
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


revoke all     on function public.seed_bracket_for_category(uuid,uuid,jsonb) from public, anon, authenticated;
grant  execute on function public.seed_bracket_for_category(uuid,uuid,jsonb) to service_role;
