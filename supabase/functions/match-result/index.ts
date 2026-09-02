import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  validateScore,
  validateParcial,
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
 * UN SET SIN NÚMEROS NO ES UN 0-0.
 *
 *   `Number(null)` y `Number(undefined)` valen 0 y NaN, y por ahí se coló un
 *   set que nadie había jugado: la pantalla mandaba la fila vacía, llegaba
 *   como null, se leía 0-0 y el motor lo rechazaba con "Set 2: 0-0 no es un
 *   marcador válido". El juez no podía guardar un solo set.
 *
 *   Arreglado en el cliente (ver src/lib/captura-sets.ts), pero el servidor no
 *   puede confiar en eso: un cliente viejo, o una app de otro sitio, mandaría
 *   lo mismo. Aquí se distingue explícitamente FALTA EL DATO de HAY UN DATO
 *   IMPOSIBLE, porque el 0-0 tecleado a mano tiene que seguir rechazándose por
 *   lo que es — un marcador que no existe— y no confundirse con un hueco.
 */
const setSinNumeros = (s: any): boolean =>
  s == null
  || s.games_a == null || s.games_b == null
  || !Number.isFinite(Number(s.games_a)) || !Number.isFinite(Number(s.games_b));

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
    const { match_id, sets, played_at, winner_pair_id, parcial } = await req.json();
    if (!match_id || !Array.isArray(sets)) return json({ error: 'bad_request' }, 400);
    // CAPTURA PARCIAL: el juez guarda un set en cuanto termina y el partido
    // sigue. Sin ganador todavía, y eso no es un dato que falte.
    const esParcial = parcial === true;
    // El ganador que marcó el juez es obligatorio en la captura completa: se
    // contrasta contra el que deriva el marcador. Es una comprobación de
    // intención, no un dato de más.
    if (!esParcial && !winner_pair_id) return json({ error: 'winner_required' }, 400);

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
    //
    // QUIÉN PASA POR AQUÍ: admin de RALLY, OWNER del organizador, o juez
    // asignado. El owner entra SIN estar en `tournament_judges` y es
    // deliberado — el organizador de un torneo chico es el juez, y obligarle a
    // asignarse a sí mismo sería ceremonia sin nadie a quien proteger. No lo
    // endurezcas creyendo que es un hueco; está en la migración 054.
    //
    // Lo que NO pasa: un miembro del organizador con member_role='judge' que no
    // esté en `tournament_judges`, y cualquier jugador. Los cuatro casos
    // verificados contra esta misma función, no deducidos del código.
    const { data: canUser, error: ae } = await asUser.rpc('can_capture_tournament', { p_tournament_id: match.tournament_id });
    if (ae) return json({ error: 'auth_check_failed', detail: ae.message }, 500);
    if (!canUser) return json({ error: 'not_authorized' }, 403);

    // 2) Validar marcador y derivar ganador (ENGINE — no reimplementar).
    //    validateScore espera SetScore[] (camelCase) y devuelve winnerSide 'A'|'B'.
    const huecos = sets.filter(setSinNumeros).length;
    if (huecos > 0) {
      return json({
        error: 'set_sin_numeros',
        detail: `${huecos} ${huecos === 1 ? 'set llega' : 'sets llegan'} sin marcador. ` +
          `Un set que no se ha jugado no se manda; no es un 0-0.`,
      }, 400);
    }

    const reqSets = sets.map(toSetScore);
    // `validateParcial` en la captura set a set: hace la MISMA comprobación de
    // cada set y solo perdona la de "falta un set". Un 3-1 sigue siendo un
    // marcador inválido aunque el partido esté a medias.
    const score = esParcial ? validateParcial(reqSets) : validateScore(reqSets);
    if (!score.valid) {
      return json({ error: 'invalid_score', detail: score.errors.join(' · '), errors: score.errors }, 400);
    }

    // SI EL MARCADOR YA DECIDE, EL PARTIDO SE CIERRA aunque venga marcado como
    // parcial. El juez que teclea el set que remata no tiene por qué pulsar
    // otra cosa distinta, y dejar 'in_progress' un partido terminado sería
    // mentir en la pantalla de todos.
    const cierra = score.completo;
    const derivado = cierra
      ? (score.winnerSide === 'A' ? match.pair_a_id : match.pair_b_id)
      : null;

    // El ganador marcado por el juez tiene que coincidir con el que dice el
    // marcador. Si no, se rechaza: uno de los dos está mal y no sabemos cuál.
    // En una captura que no cierra no hay ganador que contrastar.
    if (cierra && winner_pair_id && winner_pair_id !== derivado) {
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
      // `=== true`: lo desconocido se lee apagado. Ver generate-bracket.
      const tercerLugar = torneo.tercer_lugar === true;

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
        //
        // SIN CIERRE NO HAY AVANCE QUE PLANIFICAR. Un set suelto no mueve el
        // cuadro: no hay ganador del que salga el cruce siguiente, y llamar a
        // `planAvance` con un ganador nulo sería pedirle que se lo invente.
        // La RPC lo vuelve a comprobar por su cuenta con `p_parcial`.
        const plan = cierra
          ? planAvance(
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
              derivado!,
              tercerLugar,
            )
          : { ok: true as const, esCorreccion: false, rondaCompleta: false,
              siguienteEtapa: null, crear: [], reapuntar: [] };

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
          p_parcial: !cierra,
          p_played_at: played_at ?? new Date().toISOString(),
          p_sets: sets,
          p_bracket_state: estadoCuadro,
          // `slot_index` es lo que le deja a la RPC buscar el hueco en
          // `match_schedule` y nacer con hora y cancha en vez de en null.
          p_crear: plan.crear.map((c: any) => ({
            stage: c.stage,
            round_label: c.roundLabel,
            slot_index: c.slotIndex,
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
    // 3) La categoría manda cuántos clasifican, POR GRUPO Y POR REPESCA. Sin
    //    esos dos datos no se calcula el clinch: es un error, NO un default.
    //
    //    `best_extra_qualifiers` es tan obligatorio como `advance_per_group`.
    //    Un `?? 0` aquí es exactamente el bug que dejó "eliminadas" a dos
    //    parejas del grupo B de 6ª Varonil con tres plazas de repesca abiertas
    //    y tres grupos sin jugar. El motor también revienta si no le llega,
    //    pero se comprueba aquí para devolver un error que se entienda.
    const { data: cat, error: ce } = await admin
      .from('categories')
      .select('advance_per_group, best_extra_qualifiers')
      .eq('id', match.category_id).maybeSingle();
    if (ce) return json({ error: 'category_read_failed', detail: ce.message }, 500);
    if (!cat || cat.advance_per_group == null) {
      return json({ error: 'category_incomplete', detail: 'advance_per_group no definido' }, 500);
    }
    if (cat.best_extra_qualifiers == null) {
      return json({ error: 'category_incomplete', detail: 'best_extra_qualifiers no definido' }, 500);
    }
    const advancePerGroup = cat.advance_per_group;
    const bestExtraQualifiers = cat.best_extra_qualifiers;

    // 4) Recalcular y persistir, reintentando si el grupo cambió bajo nuestros pies.
    let ultimoFallo = '';
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      // Los matches de TODA LA CATEGORÍA (con sets) + las parejas de cada grupo.
      //
      // SE LEE LA CATEGORÍA ENTERA, NO EL GRUPO. El clinch ya no se puede
      // responder mirando un grupo aislado: con repesca, quedarse fuera del
      // corte de tu grupo no te elimina mientras la carrera de mejores segundos
      // siga abierta, y eso depende de lo que pase en los OTROS grupos.
      //
      // Los errores NO se tragan: si esta lectura falla y seguimos,
      // computeStandings recibe una lista vacía y la RPC sobreescribe la tabla
      // del grupo con ceros.
      const { data: catMatches, error: gme } = await admin
        .from('matches')
        .select('id, group_id, status, winner_pair_id, pair_a_id, pair_b_id, match_sets(set_number,games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b)')
        .eq('category_id', match.category_id)
        .eq('stage', 'group');
      if (gme) return json({ error: 'group_matches_read_failed', detail: gme.message }, 500);
      const groupMatches = (catMatches ?? []).filter((m: any) => m.group_id === match.group_id);
      if (groupMatches.length === 0) {
        return json({ error: 'group_matches_empty', detail: 'el grupo no tiene partidos' }, 500);
      }

      const { data: catPairs, error: gpe } = await admin
        .from('group_standings')
        .select('pair_id, group_id, groups!inner(category_id)')
        .eq('groups.category_id', match.category_id);
      if (gpe) return json({ error: 'group_pairs_read_failed', detail: gpe.message }, 500);
      const groupPairs = (catPairs ?? []).filter((p: any) => p.group_id === match.group_id);
      if (groupPairs.length === 0) {
        return json({ error: 'group_pairs_empty', detail: 'el grupo no tiene tabla que actualizar' }, 500);
      }

      // La huella sigue siendo la del GRUPO: es lo que bloquea la RPC.
      const estado = huellaDelGrupo(groupMatches);

      // Construir MatchResultInput[] del engine, inyectando el resultado recién capturado.
      const aEntradaDelEngine = (m: any) => {
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
      };

      const pairIds = groupPairs.map((p: any) => p.pair_id);
      const matchInputs = groupMatches.map(aEntradaDelEngine);

      // Un ClinchGroup por cada grupo de la categoría.
      const gruposDeLaCategoria = [...new Set((catPairs ?? []).map((p: any) => p.group_id))]
        .map((gid) => ({
          groupId: gid,
          pairIds: (catPairs ?? []).filter((p: any) => p.group_id === gid).map((p: any) => p.pair_id),
          matches: (catMatches ?? []).filter((m: any) => m.group_id === gid).map(aEntradaDelEngine),
        }));

      // ENGINE: standings del grupo + clinch de la categoría entera.
      const standings = computeStandings(pairIds, matchInputs);
      const clinch = computeClinch({
        groups: gruposDeLaCategoria,
        advancePerGroup,
        bestExtraQualifiers,
      });

      // Mapear StandingRow(camel) + clinch -> filas snake_case que persiste la RPC.
      //
      // Sin `?? 'alive'`: si el clinch no trae una pareja de este grupo, algo
      // está mal en la lectura y hay que enterarse, no rellenar el hueco.
      const clinchDe = (pairId: string, groupId: string) => {
        const c = clinch.find((x: any) => x.pairId === pairId && x.groupId === groupId);
        if (!c) throw new Error(`clinch_missing: ${pairId} en ${groupId}`);
        return c.status;
      };

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
        clinch_status: clinchDe(row.pairId, match.group_id),
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
        p_parcial: !cierra,
      });

      if (!re) {
        // 6) Refrescar el clinch de los OTROS grupos de la categoría.
        //
        //    Un resultado en el grupo B mueve la carrera de repesca de toda la
        //    categoría, pero la RPC solo puede escribir la tabla de SU grupo
        //    (es lo que bloquea). Sin esto, un segundo del grupo A se quedaría
        //    en 'repechage_pending' hasta que alguien capturara algo en A.
        //
        //    Va FUERA de la transacción y a propósito no es fatal: el estado de
        //    clinch es informativo —la siembra del cuadro NO lo mira, usa
        //    position— así que un fallo aquí no puede tumbar una captura ya
        //    guardada. Se corrige solo en la siguiente.
        await Promise.all(
          gruposDeLaCategoria
            .filter((g: any) => g.groupId !== match.group_id)
            .flatMap((g: any) =>
              g.pairIds.map(async (pid: string) => {
                const { error } = await admin
                  .from('group_standings')
                  .update({ clinch_status: clinchDe(pid, g.groupId) })
                  .eq('group_id', g.groupId).eq('pair_id', pid);
                if (error) console.warn('[match-result] clinch ajeno no refrescado:', g.groupId, pid, error.message);
              }),
            ),
        ).catch((e) => console.warn('[match-result] refresco de clinch ajeno falló:', String(e)));

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
