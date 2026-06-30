import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  validateScore,
  computeStandings,
  computeClinch,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const { match_id, sets, played_at } = await req.json();
    if (!match_id || !Array.isArray(sets)) return json({ error: 'bad_request' }, 400);

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
      .eq('id', match_id).single();
    if (me || !match) return json({ error: 'match_not_found' }, 404);
    if (match.stage !== 'group' || !match.group_id) return json({ error: 'not_a_group_match' }, 400);

    // Pre-chequeo de autorización con el JWT del usuario (can_capture_tournament usa auth.uid()).
    const { data: canUser } = await asUser.rpc('can_capture_tournament', { p_tournament_id: match.tournament_id });
    if (!canUser) return json({ error: 'not_authorized' }, 403);

    // 2) Validar marcador y derivar ganador (ENGINE — no reimplementar).
    //    validateScore espera SetScore[] (camelCase) y devuelve winnerSide 'A'|'B'.
    const reqSets = sets.map(toSetScore);
    const score = validateScore(reqSets);
    if (!score.valid) return json({ error: 'invalid_score', detail: score }, 400);
    const winnerPairId = score.winnerSide === 'A' ? match.pair_a_id : match.pair_b_id;

    // 3) Cargar TODOS los matches del grupo (con sets) + parejas del grupo, para recalcular tabla
    const { data: groupMatches } = await admin
      .from('matches')
      .select('id, pair_a_id, pair_b_id, winner_pair_id, status, match_sets(set_number,games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b)')
      .eq('group_id', match.group_id);
    const { data: groupPairs } = await admin
      .from('group_standings').select('pair_id').eq('group_id', match.group_id);

    // Construir MatchResultInput[] del engine, inyectando el resultado recién capturado.
    const pairIds = (groupPairs ?? []).map((p: any) => p.pair_id);
    const matchInputs = (groupMatches ?? []).map((m: any) => {
      const isCurrent = m.id === match_id;
      const rawSets = isCurrent ? sets : (m.match_sets ?? []);
      return {
        matchId: m.id,
        pairAId: m.pair_a_id,
        pairBId: m.pair_b_id,
        winnerPairId: isCurrent ? winnerPairId : m.winner_pair_id,
        played: isCurrent ? true : m.status === 'finished',
        sets: rawSets.map(toSetScore),
      };
    });

    // 4) ENGINE: standings + clinch (advancePerGroup viene de categories).
    const { data: cat } = await admin
      .from('categories').select('advance_per_group').eq('id', match.category_id).single();
    const advancePerGroup = cat?.advance_per_group ?? 2;
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
      p_winner_pair: winnerPairId,
      p_played_at: played_at ?? new Date().toISOString(),
      p_sets: sets,
      p_standings: standingsRows,
    });
    if (re) return json({ error: 're_failed', detail: re.message }, 400);

    return json({ ok: true, winner_pair_id: winnerPairId, result });
  } catch (e) {
    return json({ error: 'unhandled', detail: String(e) }, 500);
  }
});
