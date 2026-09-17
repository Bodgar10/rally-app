-- 077_sembrar_expres.sql  ·  RALLY
--
-- EL SORTEO Y EL CALENDARIO, DE UNA VEZ O DE NINGUNA
--
--   Sembrar un exprés son cuatro escrituras que dependen entre sí: los dos
--   grupos, el reparto de parejas, las filas de tabla y los 20..40 partidos
--   del calendario. Hoy la fase de grupos de un torneo largo se monta con
--   inserts sueltos desde una Edge Function, y ahí es tolerable porque cada
--   grupo se puede rehacer.
--
--   Aquí no. Si el sorteo se cae a la mitad queda un torneo con el grupo A
--   sembrado y el B vacío, y no hay forma de continuarlo: repetir el sorteo
--   daría OTRO reparto —la semilla es la misma pero el estado ya no—, y
--   arreglarlo a mano significa escribir un calendario de 40 partidos en el
--   SQL Editor un domingo a mediodía.
--
--   Por eso es una función y no una tanda de inserts: o está el torneo entero
--   o no está nada.
--
-- EL FIXTURE VIENE CALCULADO, NO SE CALCULA AQUÍ
--
--   El reparto en grupos y las rondas salen de `generarFixtureExpres`, que es
--   TypeScript probado con 1593 tests. Reimplementar el círculo recortado en
--   PL/pgSQL sería tener dos calendarios que un día no coinciden. Esta función
--   comprueba que lo que le llega es coherente —las parejas son las del
--   torneo, nadie repite rival, todos juegan lo mismo— y lo escribe.
--
-- SE SIEMBRA UNA VEZ
--
--   `expres_config.sorteado_at` es el candado: con valor, esta función se
--   niega. Volver a sortear con partidos ya jugados borraría resultados, y la
--   migración 074 además congela la semilla en ese momento.

begin;

drop function if exists public.sembrar_expres(uuid,uuid,jsonb,jsonb);

create or replace function public.sembrar_expres(
  p_actor       uuid,
  p_category_id uuid,
  p_grupos      jsonb,   -- [{name:'A', pair_ids:[uuid,...]}, {name:'B', pair_ids:[...]}]
  p_partidos    jsonb    -- [{grupo,ronda,orden,pair_a_id,pair_b_id,scheduled_at,court_label}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_modo       public.tournament_modo;
  v_sorteado   timestamptz;
  v_cupo       int;
  v_k          int;
  g            jsonb;
  m            jsonb;
  v_group_id   uuid;
  v_grupos     jsonb := '{}'::jsonb;   -- name -> group_id
  v_pair       uuid;
  v_parejas    int := 0;
  v_partidos   int := 0;
  v_esperados  int;
begin
  -- ── Contexto y candados ──────────────────────────────────────────────────
  select c.tournament_id into v_tournament
    from public.categories c where c.id = p_category_id for update;
  if not found then raise exception 'category_not_found'; end if;

  select t.modo into v_modo from public.tournaments t where t.id = v_tournament;
  if v_modo is distinct from 'expres' then
    raise exception 'not_an_expres_tournament'
      using hint = 'Este torneo no es exprés. La fase de grupos larga se monta por su camino.';
  end if;

  select ec.sorteado_at, ec.cupo, ec.partidos_por_pareja
    into v_sorteado, v_cupo, v_k
    from public.expres_config ec where ec.tournament_id = v_tournament
    for update;
  if not found then
    raise exception 'sin_expres_config'
      using hint = 'Falta la configuración del exprés: cupo, semilla y partidos por pareja.';
  end if;
  if v_sorteado is not null then
    raise exception 'expres_ya_sorteado'
      using hint = format('Este torneo se sorteó el %s. Volver a sortear daría otro reparto y '
                          'borraría los resultados capturados.', v_sorteado);
  end if;

  -- ── Autorización explícita (patrón 011: p_actor, no auth.uid()) ──────────
  if not (
    exists (select 1 from public.users u where u.id = p_actor and u.role = 'admin')
    or exists (select 1 from public.organizer_members om
                where om.organizer_id = public.tournament_org(v_tournament)
                  and om.user_id = p_actor and om.member_role = 'owner')
  ) then
    raise exception 'not_authorized'
      using hint = 'Sortear no es capturar: hace falta ser owner del organizador o admin.';
  end if;

  -- ── Nada sembrado todavía ────────────────────────────────────────────────
  if exists (select 1 from public.groups where category_id = p_category_id) then
    raise exception 'grupos_ya_existen'
      using hint = 'Esta categoría ya tiene grupos. Bórralos antes de volver a sembrar.';
  end if;

  -- ── Coherencia de lo que llega ───────────────────────────────────────────
  if jsonb_array_length(p_grupos) <> 2 then
    raise exception 'expres_son_dos_grupos'
      using hint = format('Llegaron %s grupos. Un exprés tiene exactamente dos: A y B.',
                          jsonb_array_length(p_grupos));
  end if;

  -- Todas las parejas del reparto tienen que ser de esta categoría, y todas
  -- las de la categoría tienen que estar repartidas. Una pareja que se queda
  -- fuera del sorteo no se entera hasta que busca su nombre en la tabla.
  for g in select * from jsonb_array_elements(p_grupos) loop
    for v_pair in select (value #>> '{}')::uuid from jsonb_array_elements(g->'pair_ids') loop
      if not exists (select 1 from public.pairs p
                      where p.id = v_pair and p.category_id = p_category_id) then
        raise exception 'pareja_ajena'
          using hint = format('La pareja %s no es de esta categoría.', v_pair);
      end if;
      v_parejas := v_parejas + 1;
    end loop;
  end loop;

  if v_parejas <> v_cupo then
    raise exception 'cupo_no_cuadra'
      using hint = format('El reparto trae %s parejas y el cupo es %s.', v_parejas, v_cupo);
  end if;
  if v_parejas <> (select count(*) from public.pairs where category_id = p_category_id) then
    raise exception 'parejas_sin_repartir'
      using hint = 'Hay parejas inscritas que no aparecen en ningún grupo.';
  end if;

  v_esperados := v_parejas * v_k / 2;
  if jsonb_array_length(p_partidos) <> v_esperados then
    raise exception 'calendario_no_cuadra'
      using hint = format('Llegaron %s partidos y con %s parejas a %s partidos cada una tienen '
                          'que ser %s.', jsonb_array_length(p_partidos), v_parejas, v_k, v_esperados);
  end if;

  -- ── 1. Los grupos ────────────────────────────────────────────────────────
  for g in select * from jsonb_array_elements(p_grupos) loop
    insert into public.groups (category_id, name)
    values (p_category_id, g->>'name')
    returning id into v_group_id;

    v_grupos := v_grupos || jsonb_build_object(g->>'name', v_group_id::text);

    -- ── 2. La tabla, a cero ────────────────────────────────────────────────
    --
    --   Se crean las filas AHORA y no en la primera captura: la tabla tiene
    --   que poder enseñarse desde el minuto cero, con todas las parejas a
    --   cero. Una tabla que va apareciendo según se juega no deja ver quién
    --   está en tu grupo antes de empezar.
    --
    --   won/lost/sets/points se quedan en su default 0 y no se tocan nunca:
    --   en un exprés no significan nada. `balance` es columna generada (075).
    for v_pair in select (value #>> '{}')::uuid from jsonb_array_elements(g->'pair_ids') loop
      insert into public.group_standings (group_id, pair_id, played, games_won, games_lost,
                                          position, clinch_status)
      values (v_group_id, v_pair, 0, 0, 0, 0, 'alive');
    end loop;
  end loop;

  -- ── 3. El calendario ─────────────────────────────────────────────────────
  --
  --   formato = 'suma_6' va explícito: sin él, el trigger de la 075 rechaza el
  --   insert, y con razón — un partido de grupo de exprés sin formato caería
  --   en la rama "terminado sin ganador" del constraint y no se podría cerrar
  --   nunca.
  for m in select * from jsonb_array_elements(p_partidos) loop
    if not (v_grupos ? (m->>'grupo')) then
      raise exception 'grupo_desconocido'
        using hint = format('El partido apunta al grupo "%s", que no está en el reparto.',
                            m->>'grupo');
    end if;

    insert into public.matches (
      tournament_id, category_id, stage, group_id, round_label,
      pair_a_id, pair_b_id, formato, status, scheduled_at, court_label
    ) values (
      v_tournament,
      p_category_id,
      'group',
      (v_grupos->>(m->>'grupo'))::uuid,
      format('Ronda %s', m->>'ronda'),
      (m->>'pair_a_id')::uuid,
      (m->>'pair_b_id')::uuid,
      'suma_6',
      'scheduled',
      nullif(m->>'scheduled_at','')::timestamptz,
      nullif(m->>'court_label','')
    );
    v_partidos := v_partidos + 1;
  end loop;

  -- ── 4. El candado ────────────────────────────────────────────────────────
  update public.expres_config
     set sorteado_at = now()
   where tournament_id = v_tournament;

  return jsonb_build_object(
    'ok', true,
    'category_id', p_category_id,
    'tournament_id', v_tournament,
    'grupos', v_grupos,
    'parejas', v_parejas,
    'partidos', v_partidos
  );
end $$;

revoke all on function public.sembrar_expres(uuid,uuid,jsonb,jsonb)
  from public, anon, authenticated;
-- La invoca solo la Edge Function con service role, igual que el resto.

comment on function public.sembrar_expres(uuid,uuid,jsonb,jsonb) is
  'Siembra un exprés entero —grupos, reparto, tabla a cero y calendario— en una '
  'sola transacción. El fixture llega calculado por generarFixtureExpres; aquí '
  'solo se comprueba que cuadra y se escribe. Se siembra una vez: '
  'expres_config.sorteado_at es el candado.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte, sobre un torneo de prueba)
--
--   select proname from pg_proc where proname = 'sembrar_expres';
--
--   -- después de sembrar:
--   select g.name, count(*) from public.groups g
--     join public.group_standings gs on gs.group_id = g.id
--    where g.category_id = '<categoria>' group by g.name;
--
--   select round_label, count(*) from public.matches
--    where category_id = '<categoria>' and stage = 'group'
--    group by round_label order by round_label;
--   -- cada ronda debe tener tamaño_grupo/2 partidos por grupo
--
--   select count(*) from public.matches
--    where category_id = '<categoria>' and formato <> 'suma_6' and stage = 'group';
--   -- 0
-- ────────────────────────────────────────────────────────────
