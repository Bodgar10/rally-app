-- ════════════════════════════════════════════════════════════════════
-- RALLY · PARA COPIAR Y PEGAR EN EL SQL EDITOR
--
--   Una sola migración: 085_expres_cierra_y_arranca.sql
--
--   QUÉ ARREGLA
--     El sorteo de un exprés creaba los grupos pero dejaba la categoría
--     en 'open' y el torneo en 'registration_open'. Eso hacía que:
--       · siguiera abierta la inscripción a un torneo ya sorteado, y
--       · el exprés NO SE PUDIERA TERMINAR — finish_tournament exige
--         'in_progress', y terminarlo es lo que reparte los puntos de
--         ranking y recalcula los ratings.
--     Y de paso: al sorteo le entraban las parejas sin pagar, cosa que
--     el camino largo nunca permitió.
--
--   ES UN `create or replace` de sembrar_expres. Se puede correr dos
--   veces sin romper nada.
--
--   DESPUÉS DE ESTO HAY QUE REDESPLEGAR LA EDGE FUNCTION:
--     supabase functions deploy expres-sortear
--
--   COMPROBACIÓN (antes y después de sortear):
--     select t.status as torneo, c.status as categoria, ec.sorteado_at
--       from public.tournaments t
--       join public.categories c on c.tournament_id = t.id
--       join public.expres_config ec on ec.tournament_id = t.id
--      where t.modo = 'expres';
-- ════════════════════════════════════════════════════════════════════

-- 085_expres_cierra_y_arranca.sql  ·  RALLY
--
-- EL SORTEO DE UN EXPRÉS TIENE QUE CERRAR LA CATEGORÍA Y ARRANCAR EL TORNEO
--
-- ► LO QUE SE ENCONTRÓ PROBANDO
--   `sembrar_expres` (077/078) creaba los grupos, la tabla y el calendario, y
--   ponía el candado `sorteado_at`. Nada más. La categoría se quedaba en
--   'open' y el torneo en 'registration_open'.
--
--   Tres fallos encadenados, y el tercero es el que de verdad duele:
--
--   1. SEGUÍA ABIERTA LA INSCRIPCIÓN A UN TORNEO YA SORTEADO. Quien se
--      apuntara después no estaría en ningún grupo ni en ninguna tabla, y se
--      enteraría el mismo día, en la cancha.
--
--   2. EL EXPRÉS NO SE PODÍA TERMINAR. `finish_tournament` (026) exige
--      'in_progress' y corta con `invalid_status_transition`. Terminar el
--      torneo es lo que dispara `compute-ranking-points` y
--      `cron-recompute-ratings`: sin eso el torneo se juega entero y no
--      cuenta para nada — ni puntos, ni rating, ni la curva del jugador.
--
--   3. AL EXPRÉS LE ENTRABAN LAS PAREJAS SIN PAGAR. El camino largo
--      (`close_registration_for_category`, 011/035) siempre contó solo
--      paid_online, paid_offline y comp. El exprés tomaba todas. Dos caminos
--      con la misma pregunta y dos respuestas distintas.
--
-- ► POR QUÉ VA EN EL SORTEO Y NO EN UNA PANTALLA DE "CERRAR"
--   Un exprés no cierra inscripciones y luego siembra: sortear ES cerrar. Son
--   el mismo gesto, y partirlo en dos daría un estado intermedio —sorteado
--   pero abierto— que no significa nada y que es justo el que estaba pasando.
--
--   Va DENTRO de la misma transacción que crea los grupos por lo de siempre:
--   un torneo con grupos creados y la inscripción todavía abierta es peor que
--   un sorteo que falla entero y se reintenta.

begin;

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
  v_abiertas   int;
  v_inscritas  int;
  v_pagadas    int;
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
  -- ► SOLO ENTRAN LAS QUE PAGARON, IGUAL QUE EN EL TORNEO LARGO.
  --
  --   `close_registration_for_category` (011/035) siempre contó únicamente
  --   paid_online, paid_offline y comp. El exprés no lo hacía: tomaba todas
  --   las parejas de la categoría, así que una inscripción a medio pagar
  --   entraba al sorteo igual que una pagada. Dos caminos con la misma
  --   pregunta y dos respuestas distintas es un error esperando su día.
  select count(*) into v_inscritas
    from public.pairs where category_id = p_category_id;
  select count(*) into v_pagadas
    from public.pairs
   where category_id = p_category_id
     and payment_status in ('paid_online', 'paid_offline', 'comp');

  if v_parejas <> v_pagadas then
    raise exception 'parejas_sin_repartir'
      using hint = format('El reparto trae %s parejas y hay %s con el pago en regla. %s',
                          v_parejas, v_pagadas,
                          case when v_inscritas > v_pagadas
                            then format('Ojo: %s inscrita(s) siguen en pending y NO entran al sorteo.',
                                        v_inscritas - v_pagadas)
                            else 'Hay parejas que no aparecen en ningún grupo.' end);
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

  -- ── 5. LA CATEGORÍA SE CIERRA Y EL TORNEO ARRANCA ────────────────────────
  --
  -- ► ESTO FALTABA, Y SE NOTABA TRES PASOS DESPUÉS
  --   Sortear dejaba la categoría en 'open' y el torneo en
  --   'registration_open'. Dos consecuencias, y la segunda es la cara:
  --
  --     · Seguía abierta la inscripción a un torneo YA SORTEADO. Quien se
  --       apuntara después no estaría en ningún grupo ni en ninguna tabla, y
  --       se enteraría el domingo en la cancha.
  --     · `finish_tournament` (026) exige 'in_progress' y corta con
  --       `invalid_status_transition`. O sea que un exprés no se podía
  --       TERMINAR — y terminarlo es lo que dispara los puntos de ranking y
  --       el recálculo de ratings. El torneo se jugaba entero y no contaba
  --       para nada.
  --
  --   Es exactamente lo que hace el camino largo al cerrar una categoría
  --   (035): la categoría a 'in_progress', y el torneo solo si ya no queda
  --   ninguna abierta. En un exprés solo hay una, así que el torneo arranca
  --   siempre — pero se escribe con la misma comprobación para que los dos
  --   caminos digan lo mismo si algún día un exprés tuviera dos.
  update public.categories
     set status = 'in_progress'
   where id = p_category_id;

  select count(*) into v_abiertas
    from public.categories c
   where c.tournament_id = v_tournament and c.status = 'open';

  if v_abiertas = 0 then
    update public.tournaments
       set status = 'in_progress'
     where id = v_tournament and status = 'registration_open';
  end if;

  return jsonb_build_object(
    'ok', true,
    'category_id', p_category_id,
    'tournament_id', v_tournament,
    'grupos', v_grupos,
    'parejas', v_parejas,
    'partidos', v_partidos,
    'categorias_abiertas', v_abiertas
  );
end $$;


revoke all on function public.sembrar_expres(uuid,uuid,jsonb,jsonb)
  from public, anon, authenticated;
-- La invoca solo la Edge Function con service role, igual que el resto.

comment on function public.sembrar_expres(uuid,uuid,jsonb,jsonb) is
  'Siembra un exprés entero —grupos, reparto, tabla a cero y calendario—, '
  'CIERRA la categoría y arranca el torneo, todo en una transacción. Sortear '
  'es cerrar: partirlo daría un estado sorteado-pero-abierto que no significa '
  'nada. Solo entran las parejas con el pago en regla, igual que en el camino '
  'largo. Se siembra una vez: expres_config.sorteado_at es el candado.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte, sobre el torneo de prueba)
--
--   select t.status as torneo, c.status as categoria, ec.sorteado_at
--     from public.tournaments t
--     join public.categories c on c.tournament_id = t.id
--     join public.expres_config ec on ec.tournament_id = t.id
--    where t.modo = 'expres';
--
--   -- ANTES de sortear:   registration_open / open      / null
--   -- DESPUÉS de sortear: in_progress       / in_progress / <fecha>
-- ────────────────────────────────────────────────────────────
