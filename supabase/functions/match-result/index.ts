import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  validateScore,
  computeStandings,
  computeClinch,
  planAvance,
} from '../_shared/engine.bundle.js';

// CORS mínimo
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

// --- Mapeos BD(snake) <-> engine(camel). El engine NO se edita; mapeamos aquí. ---
// Set de la BD/request -> SetScore del engine.
const toSetScore = (s: any) => ({
  gamesA: Number(s.games_a),
  gamesB: Number(s.games_b),
  isSuperTiebreak: Boolean(s.is_super_tiebreak ?? false),
  tiebreakA: s.tiebreak_a ?? null,
  tiebreakB: s.tiebreak_b ?? null,
});

/**
 * Huella del estado del grupo tal y como lo leyó ESTA invocación.
 *
 * La RPC bloquea los partidos del grupo y compara esta huella contra lo que hay
 * en ese momento. Si otra captura del mismo grupo entró en medio, la huella no
 * cuadra, la RPC aborta con 'group_changed' y aquí reintentamos leyendo de
 * nuevo. Así `computeStandings` se queda en TypeScript (no se reimplementa la
 * tabla en SQL) y aun así dos capturas simultáneas no se pisan.
 *
 * Ordenada por match_id para que las dos partes comparen lo mismo.
 */
const huellaDelGrupo = (matches: any[]) =>
  [...matches]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m) => ({
      match_id: m.id,
      status: m.status,
      winner_pair_id: m.winner_pair_id ?? null,
    }));

/**
 * Huella del cuadro de la categoría. Mismo mecanismo que `huellaDelGrupo`,
 * pero para eliminatorias: incluye las parejas porque avanzar el cuadro las
 * cambia, y una corrección tiene que ver el estado real.
 */
const huellaDelCuadro = (partidos: any[]) =>
  [...partidos]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m) => ({
      match_id: m.id,
      status: m.status,
      winner_pair_id: m.winner_pair_id ?? null,
      pair_a_id: m.pair_a_id ?? null,
      pair_b_id: m.pair_b_id ?? null,
    }));

const MAX_INTENTOS = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const { match_id, sets, played_at, winner_pair_id } = await req.json();
    if (!match_id || !Array.isArray(sets)) return json({ error: 'bad_request' }, 400);
    // El ganador que marcó el juez es obligatorio: se contrasta contra el que
    // deriva el marcador. Es una comprobación de intención, no un dato de más.
    if (!winner_pair_id) return json({ error: 'winner_required' }, 400);

    // Cliente con el JWT del que llama (para autenticar quién es)
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: ures } = await asUser.auth.getUser();
    const actor = ures?.user?.id;
    if (!actor) return json({ error: 'unauthenticated' }, 401);

    // Cliente service role (escribe; salta RLS — la autorización la garantiza la RPC + pre-chequeo)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1) Cargar partido + grupo
    const { data: match, error: me } = await admin
      .from('matches')
      .select('id, tournament_id, category_id, group_id, pair_a_id, pair_b_id, stage')
      // maybeSingle y no single: con `single()` la ausencia de filas ES un error
      // (PGRST116), así que un partido inexistente caía en 'match_read_failed'
      // (500, "reintenta") en vez de en su 404. El juez reintentaría para
      // siempre algo que nunca va a existir. Con maybeSingle, "no hay fila" es
      // data:null sin error, y cada caso llega a su rama.
      .eq('id', match_id).maybeSingle();
    if (me) return json({ error: 'match_read_failed', detail: me.message }, 500);
    if (!match) return json({ error: 'match_not_found' }, 404);
    const esGrupo = match.stage === 'group';
    if (esGrupo && !match.group_id) return json({ error: 'group_missing' }, 400);

    // Pre-chequeo de autorización con el JWT del usuario (can_capture_tournament usa auth.uid()).
    const { data: canUser, error: ae } = await asUser.rpc('can_capture_tournament', { p_tournament_id: match.tournament_id });
    if (ae) return json({ error: 'auth_check_failed', detail: ae.message }, 500);
    if (!canUser) return json({ error: 'not_authorized' }, 403);

    // 2) Validar marcador y derivar ganador (ENGINE — no reimplementar).
    //    validateScore espera SetScore[] (camelCase) y devuelve winnerSide 'A'|'B'.
    const reqSets = sets.map(toSetScore);
    const score = validateScore(reqSets);
    if (!score.valid) {
      return json({ error: 'invalid_score', detail: score.errors.join(' · '), errors: score.errors }, 400);
    }
    const derivado = score.winnerSide === 'A' ? match.pair_a_id : match.pair_b_id;

    // El ganador marcado por el juez tiene que coincidir con el que dice el
    // marcador. Si no, se rechaza: uno de los dos está mal y no sabemos cuál.
    if (winner_pair_id !== derivado) {
      return json({
        error: 'winner_mismatch',
        derived_winner_pair_id: derivado,
        submitted_winner_pair_id: winner_pair_id,
        detail: `El marcador (${score.setsA}-${score.setsB} en sets) dice que ganó la otra pareja.`,
      }, 400);
    }

    // ─────────────────────── ELIMINATORIAS ───────────────────────
    // Capturar y avanzar el cuadro son el MISMO acto: si el avance falla, el
    // resultado no se guarda. La RPC 050 lo hace en una transacción.
    if (!esGrupo) {
      // ¿Este torneo juega el 3.er lugar? (migración 052). Si no se puede leer
      // se aborta: asumir un default aquí crearía —o dejaría de crear— un
      // partido según una suposición.
      const { data: torneo, error: tle } = await admin
        .from('tournaments').select('tercer_lugar').eq('id', match.tournament_id).maybeSingle();
      if (tle) return json({ error: 'tournament_read_failed', detail: tle.message }, 500);
      if (!torneo) return json({ error: 'tournament_not_found' }, 404);
      const tercerLugar = torneo.tercer_lugar !== false;

      let ultimoFalloKO = '';
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        const { data: cuadro, error: be } = await admin
          .from('matches')
          .select('id, stage, round_label, pair_a_id, pair_b_id, winner_pair_id, status, source_match_ids')
          .eq('category_id', match.category_id)
          .neq('stage', 'group');
        if (be) return json({ error: 'bracket_read_failed', detail: be.message }, 500);
        if (!cuadro || cuadro.length === 0) {
          return json({ error: 'bracket_empty', detail: 'la categoría no tiene cuadro sembrado' }, 500);
        }

        const estadoCuadro = huellaDelCuadro(cuadro);

        // ENGINE: qué crear y qué reapuntar. Incluye el 3.er lugar al cerrar semis
        // y rechaza la corrección que movería un partido ya jugado.
        const plan = planAvance(
          cuadro.map((m: any) => ({
            id: m.id,
            stage: m.stage,
            roundLabel: m.round_label,
            pairAId: m.pair_a_id,
            pairBId: m.pair_b_id,
            winnerPairId: m.winner_pair_id,
            status: m.status,
            sourceMatchIds: m.source_match_ids ?? null,
          })),
          match_id,
          derivado,
          tercerLugar,
        );

        if (!plan.ok) {
          const status = plan.motivo === 'downstream_already_played' ? 409 : 400;
          return json({
            error: plan.motivo,
            detail: plan.detalle,
            blocked_by: plan.bloqueadoPor ?? [],
          }, status);
        }

        const { data: result, error: re } = await admin.rpc('record_knockout_result', {
          p_actor: actor,
          p_match_id: match_id,
          p_winner_pair: derivado,
          p_played_at: played_at ?? new Date().toISOString(),
          p_sets: sets,
          p_bracket_state: estadoCuadro,
          p_crear: plan.crear.map((c: any) => ({
            stage: c.stage,
            round_label: c.roundLabel,
            pair_a_id: c.pairAId,
            pair_b_id: c.pairBId,
            source_match_ids: c.sourceMatchIds,
          })),
          p_reapuntar: plan.reapuntar.map((r: any) => ({
            match_id: r.matchId,
            pair_a_id: r.pairAId,
            pair_b_id: r.pairBId,
          })),
        });

        if (!re) {
          return json({
            ok: true,
            winner_pair_id: derivado,
            intentos: intento,
            avance: {
              ronda_completa: plan.rondaCompleta,
              siguiente_etapa: plan.siguienteEtapa,
              creados: plan.crear.length,
              reapuntados: plan.reapuntar.length,
            },
            result,
          });
        }

        ultimoFalloKO = re.message;
        if (re.message.includes('downstream_already_played')) {
          return json({ error: 'downstream_already_played', detail: re.message }, 409);
        }
        // Otra captura del mismo cuadro ganó la carrera: releer y replanificar.
        if (!re.message.includes('bracket_changed')) {
          return json({ error: 'rpc_failed', detail: re.message }, 400);
        }
      }
      return json({ error: 'bracket_busy', detail: ultimoFalloKO }, 409);
    }

    // ───────────────────────── GRUPOS ────────────────────────
    // 3) La categoría manda cuántos clasifican. Sin ese dato no se calcula el
    //    clinch: es un error, NO un default. Un fallback a 2 escribiría
    //    'eliminated'/'qualified' equivocados en un torneo con advance=1.
    const { data: cat, error: ce } = await admin
      .from('categories').select('advance_per_group').eq('id', match.category_id).maybeSingle();
    if (ce) return json({ error: 'category_read_failed', detail: ce.message }, 500);
    if (!cat || cat.advance_per_group == null) {
      return json({ error: 'category_incomplete', detail: 'advance_per_group no definido' }, 500);
    }
    const advancePerGroup = cat.advance_per_group;

    // 4) Recalcular y persistir, reintentando si el grupo cambió bajo nuestros pies.
    let ultimoFallo = '';
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      // Todos los matches del grupo (con sets) + parejas del grupo.
      // Los errores NO se tragan: si esta lectura falla y seguimos, computeStandings
      // recibe una lista vacía y la RPC sobreescribe la tabla del grupo con ceros.
      const { data: groupMatches, error: gme } = await admin
        .from('matches')
        .select('id, status, winner_pair_id, pair_a_id, pair_b_id, match_sets(set_number,games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b)')
        .eq('group_id', match.group_id);
      if (gme) return json({ error: 'group_matches_read_failed', detail: gme.message }, 500);
      if (!groupMatches || groupMatches.length === 0) {
        return json({ error: 'group_matches_empty', detail: 'el grupo no tiene partidos' }, 500);
      }

      const { data: groupPairs, error: gpe } = await admin
        .from('group_standings').select('pair_id').eq('group_id', match.group_id);
      if (gpe) return json({ error: 'group_pairs_read_failed', detail: gpe.message }, 500);
      if (!groupPairs || groupPairs.length === 0) {
        return json({ error: 'group_pairs_empty', detail: 'el grupo no tiene tabla que actualizar' }, 500);
      }

      const estado = huellaDelGrupo(groupMatches);

      // Construir MatchResultInput[] del engine, inyectando el resultado recién capturado.
      const pairIds = groupPairs.map((p: any) => p.pair_id);
      const matchInputs = groupMatches.map((m: any) => {
        const isCurrent = m.id === match_id;
        const rawSets = isCurrent ? sets : (m.match_sets ?? []);
        return {
          matchId: m.id,
          pairAId: m.pair_a_id,
          pairBId: m.pair_b_id,
          winnerPairId: isCurrent ? derivado : m.winner_pair_id,
          played: isCurrent ? true : m.status === 'finished',
          sets: rawSets.map(toSetScore),
        };
      });

      // ENGINE: standings + clinch.
      const standings = computeStandings(pairIds, matchInputs);
      const clinch = computeClinch(pairIds, matchInputs, advancePerGroup);

      // Mapear StandingRow(camel) + clinch -> filas snake_case que persiste la RPC.
      const standingsRows = standings.map((row: any) => ({
        pair_id: row.pairId,
        played: row.played,
        won: row.won,
        lost: row.lost,
        sets_won: row.setsWon,
        sets_lost: row.setsLost,
        games_won: row.gamesWon,
        games_lost: row.gamesLost,
        points: row.points,
        position: row.position,
        clinch_status: clinch.find((c: any) => c.pairId === row.pairId)?.status ?? 'alive',
      }));

      // 5) Persistir TODO transaccional (RPC con service role). p_sets va en snake_case (request).
      const { data: result, error: re } = await admin.rpc('record_match_result', {
        p_actor: actor,
        p_match_id: match_id,
        p_winner_pair: derivado,
        p_played_at: played_at ?? new Date().toISOString(),
        p_sets: sets,
        p_standings: standingsRows,
        p_group_state: estado,
      });

      if (!re) {
        return json({ ok: true, winner_pair_id: derivado, intentos: intento, result });
      }

      ultimoFallo = re.message;
      // Otra captura del mismo grupo ganó la carrera: releer y recalcular.
      if (!re.message.includes('group_changed')) {
        return json({ error: 'rpc_failed', detail: re.message }, 400);
      }
    }

    return json({ error: 'group_busy', detail: ultimoFallo }, 409);
  } catch (e) {
    return json({ error: 'unhandled', detail: String(e) }, 500);
  }
});
