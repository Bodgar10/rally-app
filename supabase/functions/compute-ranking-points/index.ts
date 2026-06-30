import { createClient } from 'jsr:@supabase/supabase-js@2';
import { computeRankingPoints } from '../_shared/engine.bundle.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret' };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

// stage de la BD → token de ronda del engine (RoundReached). OJO: el engine NO tiene 'r32';
// quien cae en round_of_32 no tiene tier de puntos → se trata como 'none' (solo qualifyBonus).
const STAGE_TOKEN: Record<string, string> = {
  round_of_16: 'r16', quarter: 'quarter', semi: 'semi', final: 'final',
};

// Mapea la fila de ranking_point_rules (snake_case + jsonb con llaves propias) a RankingRules (camelCase).
// applyMultiplierToTotal NO se almacena en BD → fijo true (Doc B §5: multiplicador al total).
function mapRules(db: any) {
  const rp = db.round_points ?? {};
  const dm = db.drawsize_multipliers ?? {};
  return {
    groupWinPoints: db.group_win_points,
    qualifyBonus: db.qualify_bonus,
    roundPoints: { r16: rp.r16, quarter: rp.quarter, semi: rp.semi, final: rp.final, champion: rp.champion },
    drawsizeMultipliers: { lte8: dm.lte8, from9to16: dm['9to16'], from17to32: dm['17to32'], gte33: dm['33plus'] },
    roundrobinChampionBonus: db.roundrobin_champion_bonus,
    applyMultiplierToTotal: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { tournament_id, actor_id } = await req.json();
    if (!tournament_id) return json({ error: 'bad_request' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // AUTH: secret de cron, o un actor (admin|owner) que la RPC re-verifica
    let actor = actor_id as string | undefined;
    const cronOk = req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET');
    if (!cronOk) {
      const asUser = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      );
      const { data: ures } = await asUser.auth.getUser();
      if (!ures?.user?.id) return json({ error: 'unauthenticated' }, 401);
      actor = ures.user.id; // la RPC valida que sea admin|owner
    }
    if (!actor && !cronOk) return json({ error: 'no_actor' }, 400);

    // Reglas: override por torneo si existe, si no la global
    const { data: ruleRows } = await admin
      .from('ranking_point_rules').select('*')
      .or(`scope.eq.global,and(scope.eq.tournament,tournament_id.eq.${tournament_id})`);
    const ruleRow = (ruleRows ?? []).find((r: any) => r.scope === 'tournament')
                 ?? (ruleRows ?? []).find((r: any) => r.scope === 'global');
    if (!ruleRow) return json({ error: 'no_rules' }, 500);
    const rules = mapRules(ruleRow);

    // Categorías del torneo
    const { data: cats } = await admin
      .from('categories').select('id, division, format_type, num_groups')
      .eq('tournament_id', tournament_id);

    // Acumulador por jugador×división dentro de este torneo
    const ledger = new Map<string, { player_id: string; division: string; points: number; breakdown: any }>();
    const add = (playerId: string, division: string, points: number, breakdown: any) => {
      const k = `${playerId}|${division}`;
      const prev = ledger.get(k);
      if (prev) prev.points += points;
      else ledger.set(k, { player_id: playerId, division, points, breakdown });
    };

    const order = ['final', 'semi', 'quarter', 'round_of_16', 'round_of_32'];

    for (const cat of (cats ?? []) as any[]) {
      const { data: pairs } = await admin
        .from('pairs').select('id, player1_id, player2_id').eq('category_id', cat.id);
      const { data: matches } = await admin
        .from('matches').select('id, stage, pair_a_id, pair_b_id, winner_pair_id, status')
        .eq('category_id', cat.id);
      const finished = (matches ?? []).filter((m: any) => m.status === 'finished' && m.winner_pair_id);

      // drawSize = nº de parejas en knockout; si no hubo knockout, nº de parejas de la categoría.
      const knockout = finished.filter((m: any) => m.stage !== 'group');
      const koPairs = new Set<string>();
      knockout.forEach((m: any) => { if (m.pair_a_id) koPairs.add(m.pair_a_id); if (m.pair_b_id) koPairs.add(m.pair_b_id); });
      const drawSize = koPairs.size || (pairs ?? []).length;

      const finalMatch = finished.find((m: any) => m.stage === 'final');
      const roundRobinOnly = cat.format_type === 'round_robin';

      for (const p of (pairs ?? []) as any[]) {
        const groupWins = finished.filter((m: any) => m.stage === 'group' && m.winner_pair_id === p.id).length;
        const qualified = knockout.some((m: any) => m.pair_a_id === p.id || m.pair_b_id === p.id);

        // ronda más lejana (RoundReached): 'none' si no aplica (NUNCA null).
        let furthestRound = 'none';
        if (!roundRobinOnly && qualified) {
          if (finalMatch && finalMatch.winner_pair_id === p.id) furthestRound = 'champion';
          else if (finalMatch && (finalMatch.pair_a_id === p.id || finalMatch.pair_b_id === p.id)) furthestRound = 'final';
          else {
            const stages = finished
              .filter((m: any) => m.stage !== 'group' && (m.pair_a_id === p.id || m.pair_b_id === p.id))
              .map((m: any) => (m.stage === 'third_place' ? 'semi' : m.stage));
            const deepest = order.find((s) => stages.includes(s));
            furthestRound = deepest ? (STAGE_TOKEN[deepest] ?? 'none') : 'none';
          }
        }

        // ENGINE: calcula los puntos (no reimplementar la tabla). En el loop principal wonRoundRobin=false;
        // el campeón de RR se re-puntúa abajo.
        const points = computeRankingPoints(
          { groupWins, qualified, furthestRound, drawSize, roundRobinOnly, wonRoundRobin: false } as any,
          rules as any,
        );
        if (points > 0) {
          const bd = { group_wins: groupWins, qualified, furthest_round: furthestRound, draw_size: drawSize };
          if (p.player1_id) add(p.player1_id, cat.division, points, bd);
          if (p.player2_id) add(p.player2_id, cat.division, points, bd);
        }
      }

      // Campeón de round-robin: leerlo de group_standings (position=1 del único grupo) y re-puntuar.
      if (roundRobinOnly) {
        const { data: gs } = await admin
          .from('group_standings').select('pair_id, position, groups!inner(category_id)')
          .eq('groups.category_id', cat.id).eq('position', 1);
        const champPairId = (gs as any)?.[0]?.pair_id;
        const champ = (pairs ?? []).find((p: any) => p.id === champPairId);
        if (champ) {
          const groupWins = finished.filter((m: any) => m.winner_pair_id === champ.id).length;
          const points = computeRankingPoints(
            { groupWins, qualified: false, furthestRound: 'none', drawSize, roundRobinOnly: true, wonRoundRobin: true } as any,
            rules as any,
          );
          // Reemplaza (no suma) lo ya puesto al campeón en esta división (evita doble conteo del RR).
          const bd = { group_wins: groupWins, round_robin_champion: true, draw_size: drawSize };
          if (champ.player1_id) ledger.set(`${champ.player1_id}|${cat.division}`, { player_id: champ.player1_id, division: cat.division, points, breakdown: bd });
          if (champ.player2_id) ledger.set(`${champ.player2_id}|${cat.division}`, { player_id: champ.player2_id, division: cat.division, points, breakdown: bd });
        }
      }
    }

    const ledgerArr = [...ledger.values()];
    const { data: result, error } = await admin.rpc('apply_tournament_ranking_points', {
      p_actor: actor, p_tournament_id: tournament_id, p_ledger: ledgerArr,
    });
    if (error) return json({ error: 'apply_failed', detail: error.message }, 400);
    return json({ ok: true, players: ledgerArr.length, result });
  } catch (e) {
    return json({ error: 'unhandled', detail: String(e) }, 500);
  }
});
