-- ============================================================================
-- 053_move_match.sql  ·  RALLY
--
-- Mover un partido de hora y/o cancha, con la comprobación del lado servidor.
--
-- POR QUÉ NO BASTA LA VALIDACIÓN DEL CLIENTE
--   La pantalla valida en vivo con `validarMovimiento` (engine) para que el
--   organizador vea el conflicto mientras toca los botones. Eso es UX, no
--   seguridad: entre que la pantalla leyó el calendario y pulsa «Mover»,
--   cualquiera pudo mover otro partido a ese hueco. Y un cliente viejo, o un
--   curl, no valida nada.
--
-- QUÉ SE REVALIDA AQUÍ Y QUÉ NO
--   Aquí se rehacen las dos comprobaciones que son seguridad de datos y que
--   SQL puede decidir sin ambigüedad:
--     · la cancha libre,
--     · que ninguno de los cuatro jugadores esté ocupado ni venga de jugar.
--
--   La del orden de rondas —una semifinal no puede ir antes de sus cuartos—
--   se queda en el engine. Es la regla que más se va a mover cuando aparezcan
--   formatos nuevos, y tenerla en dos sitios garantiza que un día digan cosas
--   distintas. Lo que la protege aquí es el bloqueo: la Edge Function calcula
--   sobre el estado que esta función acaba de fijar.
--
-- LA CARRERA, RESUELTA SIN HUELLA GORDA
--   No se manda la foto del torneo entero —serían 250 filas en cada
--   movimiento— sino DÓNDE creía el cliente que estaba este partido. Si ya no
--   está ahí, alguien lo movió en medio y se aborta. El resto no hace falta:
--   las comprobaciones de conflicto leen el estado VIVO, bajo el bloqueo, así
--   que un cliente desactualizado no puede colar una escritura mala.
--
-- QUIÉN PUEDE
--   Admin y owner del organizador. NO el juez: mover partidos es programar, y
--   programar es del organizador — el mismo reparto que
--   `seed_bracket_for_category`. El juez captura lo que se juega; no decide
--   cuándo se juega.
--
-- Aplicar DESPUÉS de 047 (match_schedule) y 052.
-- ============================================================================

create or replace function public.move_match(
  p_actor        uuid,
  p_match_id     uuid,
  p_scheduled_at timestamptz,
  p_court_label  text,
  -- Dónde creía el cliente que estaba. NULL/NULL si no tenía hora.
  p_esperado_at    timestamptz,
  p_esperado_court text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tournament uuid;
  v_pair_a     uuid;
  v_pair_b     uuid;
  v_actual_at  timestamptz;
  v_actual_ct  text;
  v_min        int;
  v_desc       int := 30;   -- mismo descanso que DEFAULT_DESCANSO_MINIMO
  v_choque     uuid;
  v_quien      text;
begin
  if p_scheduled_at is null or p_court_label is null or btrim(p_court_label) = '' then
    raise exception 'destino_incompleto';
  end if;

  select m.tournament_id, m.pair_a_id, m.pair_b_id, m.scheduled_at, m.court_label
    into v_tournament, v_pair_a, v_pair_b, v_actual_at, v_actual_ct
  from public.matches m where m.id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;

  -- ── Autorización ─────────────────────────────────────────────────────────
  if not (
    exists (select 1 from public.users u where u.id = p_actor and u.role = 'admin')
    or exists (select 1 from public.organizer_members om
                where om.organizer_id = public.tournament_org(v_tournament)
                  and om.user_id = p_actor and om.member_role = 'owner')
  ) then
    raise exception 'not_authorized';
  end if;

  select coalesce(t.match_minutes, 60) into v_min
  from public.tournaments t where t.id = v_tournament;

  -- ── Bloqueo del torneo ───────────────────────────────────────────────────
  -- Ordenado por id: dos movimientos simultáneos se serializan en vez de
  -- leerse el mismo hueco libre.
  perform 1 from public.matches
   where tournament_id = v_tournament
   order by id
     for update;

  -- ── ¿Sigue donde el cliente lo dejó? ─────────────────────────────────────
  if v_actual_at is distinct from p_esperado_at
     or v_actual_ct is distinct from p_esperado_court then
    raise exception 'match_moved_meanwhile';
  end if;

  -- ── La cancha ────────────────────────────────────────────────────────────
  select o.id into v_choque
  from public.matches o
  where o.tournament_id = v_tournament
    and o.id <> p_match_id
    and o.court_label = p_court_label
    and o.scheduled_at is not null
    and o.scheduled_at <  p_scheduled_at + make_interval(mins => v_min)
    and p_scheduled_at  <  o.scheduled_at + make_interval(mins => v_min)
  limit 1;
  if v_choque is not null then
    raise exception 'cancha_ocupada: %', v_choque;
  end if;

  -- ── Los cuatro jugadores ─────────────────────────────────────────────────
  -- La ventana se ensancha con el descanso por los dos lados: así una sola
  -- comparación cubre "juega a la vez" y "acaba de jugar" / "juega justo
  -- después", que es la misma regla vista desde tres sitios.
  with mios as (
    select unnest(array[pa.player1_id, pa.player2_id]) as jugador
    from public.pairs pa where pa.id = v_pair_a
    union
    select unnest(array[pb.player1_id, pb.player2_id])
    from public.pairs pb where pb.id = v_pair_b
  ),
  otros as (
    select o.id,
           unnest(array[qa.player1_id, qa.player2_id, qb.player1_id, qb.player2_id]) as jugador
    from public.matches o
    left join public.pairs qa on qa.id = o.pair_a_id
    left join public.pairs qb on qb.id = o.pair_b_id
    where o.tournament_id = v_tournament
      and o.id <> p_match_id
      and o.scheduled_at is not null
      and o.scheduled_at <  p_scheduled_at + make_interval(mins => v_min + v_desc)
      and p_scheduled_at  <  o.scheduled_at + make_interval(mins => v_min + v_desc)
  )
  select o.id, coalesce(u.full_name, 'Un jugador')
    into v_choque, v_quien
  from otros o
  join mios m on m.jugador = o.jugador
  left join public.users u on u.id = o.jugador
  where o.jugador is not null
  limit 1;

  if v_choque is not null then
    raise exception 'jugador_ocupado: % (%)', v_quien, v_choque;
  end if;

  -- ── Escribir ─────────────────────────────────────────────────────────────
  update public.matches
     set scheduled_at = p_scheduled_at,
         court_label  = p_court_label
   where id = p_match_id;

  return jsonb_build_object(
    'ok', true,
    'match_id', p_match_id,
    'scheduled_at', p_scheduled_at,
    'court_label', p_court_label
  );
end $$;

revoke all on function public.move_match(uuid,uuid,timestamptz,text,timestamptz,text)
  from public, anon, authenticated;
-- La invoca solo la Edge Function con service role.
