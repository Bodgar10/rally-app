import { createClient } from 'jsr:@supabase/supabase-js@2';
import { updateRating, combineOpponentPair } from '../_shared/engine.bundle.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret' };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

// Glicko base (mismos defaults que el esquema 002: 1500/350/0.06)
const BASE = { rating: 1500, rd: 350, volatility: 0.06 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // AUTH: secret de cron (header) o admin autenticado
    const cronOk = req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET');
    if (!cronOk) {
      const auth = req.headers.get('Authorization') ?? '';
      const asUser = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: isAdmin } = await asUser.rpc('is_admin');
      if (!isAdmin) return json({ error: 'not_authorized' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    // Alcance: divisiones explícitas, o las del torneo, o todas las que tengan partidos.
    let divisions: string[] = body.divisions ?? [];
    if (!divisions.length && body.tournament_id) {
      const { data } = await admin.from('categories').select('division').eq('tournament_id', body.tournament_id);
      divisions = [...new Set((data ?? []).map((c: any) => c.division))];
    }
    if (!divisions.length) {
      const { data } = await admin.from('categories').select('division');
      divisions = [...new Set((data ?? []).map((c: any) => c.division))];
    }

    const out: any[] = [];
    for (const division of divisions) {
      // 1) TODOS los partidos terminados de la división (red completa), en orden cronológico
      const { data: cats } = await admin.from('categories').select('id').eq('division', division);
      const catIds = (cats ?? []).map((c: any) => c.id);
      if (!catIds.length) { out.push({ division, skipped: 'no_categories' }); continue; }

      const { data: matches } = await admin
        .from('matches')
        .select('id, played_at, winner_pair_id, pair_a_id, pair_b_id, pair_a:pair_a_id(player1_id,player2_id), pair_b:pair_b_id(player1_id,player2_id)')
        .in('category_id', catIds)
        .eq('status', 'finished')
        .not('played_at', 'is', null)
        .not('winner_pair_id', 'is', null)
        .order('played_at', { ascending: true }); // orden cronológico ESTRICTO

      // 2) REPLAY determinista desde el estado base
      const ratings = new Map<string, { rating: number; rd: number; volatility: number }>();
      const lastPlayed = new Map<string, string>();
      const history: any[] = [];
      const get = (id: string) => ratings.get(id) ?? { ...BASE };

      // PostgREST-js tipa los embeds to-one como array; en runtime son objeto → tratamos la fila como any.
      for (const m of (matches ?? []) as any[]) {
        const aIds: string[] = [m.pair_a?.player1_id, m.pair_a?.player2_id].filter(Boolean);
        const bIds: string[] = [m.pair_b?.player1_id, m.pair_b?.player2_id].filter(Boolean);
        if (aIds.length < 1 || bIds.length < 1) continue;

        // Lado ganador sin ambigüedad: winner_pair_id es el id de la pareja A o B.
        const sideAWon = m.winner_pair_id === m.pair_a_id;

        // Oponentes combinados (engine)
        const aPts = aIds.map(get);
        const bPts = bIds.map(get);
        const oppForA = bPts.length === 2 ? combineOpponentPair(bPts[0], bPts[1]) : bPts[0];
        const oppForB = aPts.length === 2 ? combineOpponentPair(aPts[0], aPts[1]) : aPts[0];

        // Actualizar los jugadores de cada lado vs su oponente combinado
        const apply = (ids: string[], opp: { rating: number; rd: number }, score: number) => {
          for (const id of ids) {
            const before = get(id);
            const after = updateRating(before, [{ rating: opp.rating, rd: opp.rd, score }]);
            history.push({
              player_id: id, match_id: m.id,
              rating_before: before.rating, rating_after: after.rating,
              rd_before: before.rd, rd_after: after.rd,
              volatility_before: before.volatility, volatility_after: after.volatility,
              played_at: m.played_at,
            });
            ratings.set(id, after);
            lastPlayed.set(id, m.played_at);
          }
        };
        apply(aIds, oppForA, sideAWon ? 1 : 0);
        apply(bIds, oppForB, sideAWon ? 0 : 1);
      }

      // 3) Persistir transaccional por división
      const playerRows = [...ratings.entries()].map(([player_id, r]) => ({
        player_id, rating: r.rating, rd: r.rd, volatility: r.volatility,
        last_played_at: lastPlayed.get(player_id) ?? null,
      }));
      const { data: result, error } = await admin.rpc('rebuild_division_ratings', {
        p_division: division, p_player_ratings: playerRows, p_history: history,
      });
      out.push(error ? { division, error: error.message } : { division, ...result });
    }

    return json({ ok: true, divisions: out });
  } catch (e) {
    return json({ error: 'unhandled', detail: String(e) }, 500);
  }
});
