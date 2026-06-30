import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  computeSeeding,
  selectQualifiers,
  stageForBracketSize,
  advanceBracket,
  thirdPlaceFromSemis,
} from '../_shared/engine.bundle.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

// Orden de rondas (de la más grande a la final) para localizar la ronda activa.
const STAGE_ORDER = ['round_of_32', 'round_of_16', 'quarter', 'semi', 'final'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const { action, category_id } = await req.json(); // 'seed' | 'advance'
    if (!category_id || !['seed', 'advance'].includes(action)) return json({ error: 'bad_request' }, 400);

    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: ures } = await asUser.auth.getUser();
    const actor = ures?.user?.id;
    if (!actor) return json({ error: 'unauthenticated' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: cat } = await admin
      .from('categories')
      .select('id, tournament_id, advance_per_group, best_extra_qualifiers')
      .eq('id', category_id).single();
    if (!cat) return json({ error: 'category_not_found' }, 404);

    const { data: canUser } = await asUser.rpc('can_capture_tournament', { p_tournament_id: cat.tournament_id });
    if (!canUser) return json({ error: 'not_authorized' }, 403);

    // ───────────────────────── SEED ─────────────────────────
    if (action === 'seed') {
      // Standings de TODOS los grupos de la categoría (con dif. para el desempate)
      const { data: rows } = await admin
        .from('group_standings')
        .select('pair_id, position, points, sets_won, sets_lost, games_won, games_lost, group_id, groups!inner(category_id)')
        .eq('groups.category_id', category_id);

      const standings = (rows ?? []).map((r: any) => ({
        pairId: r.pair_id, groupId: r.group_id, position: r.position, points: r.points,
        setsWon: r.sets_won, setsLost: r.sets_lost, gamesWon: r.games_won, gamesLost: r.games_lost,
      }));

      // ENGINE: selecciona clasificados + rating sintético; luego siembra.
      const qualifiers = selectQualifiers(standings, cat.advance_per_group ?? 2, cat.best_extra_qualifiers ?? 0);
      const seeded = computeSeeding(qualifiers); // {bracketSize, matches:[{slotA,slotB,pairAId,pairBId,isRematch}], rematchesAllowed}
      const stage = stageForBracketSize(seeded.bracketSize);

      const toPersist = seeded.matches.map((mt: any) => ({
        stage,
        round_label: `${stage}-${String(mt.slotA).padStart(2, '0')}-${String(mt.slotB).padStart(2, '0')}`, // zero-pad: orden lexicográfico = numérico (cuadros 16/32)
        pair_a_id: mt.pairAId ?? null,
        pair_b_id: mt.pairBId ?? null,
      }));

      const { data: result, error } = await admin.rpc('seed_bracket_for_category', {
        p_actor: actor, p_category_id: category_id, p_matches: toPersist,
      });
      if (error) return json({ error: 'seed_failed', detail: error.message }, 400);
      return json({ ok: true, bracket_size: seeded.bracketSize, rematches_allowed: seeded.rematchesAllowed ?? [], result });
    }

    // ──────────────────────── ADVANCE ───────────────────────
    // Orden por round_label: advanceBracket exige la ronda EN ORDEN de bracket.
    const { data: bracket } = await admin
      .from('matches')
      .select('id, stage, round_label, pair_a_id, pair_b_id, winner_pair_id, status')
      .eq('category_id', category_id).neq('stage', 'group')
      .order('round_label');

    // Localizar la ronda activa: el stage más profundo TOTALMENTE finished cuyo siguiente stage aún no existe.
    const byStage = new Map<string, any[]>();
    for (const m of bracket ?? []) {
      if (m.stage === 'third_place') continue;
      (byStage.get(m.stage) ?? byStage.set(m.stage, []).get(m.stage)!).push(m);
    }
    let active: { stage: string; matches: any[] } | null = null;
    for (const st of STAGE_ORDER) {
      const ms = byStage.get(st);
      if (!ms || ms.length === 0) continue;
      const allFinished = ms.every((m) => m.status === 'finished' && m.winner_pair_id);
      if (!allFinished) continue;
      const nextStage = stageForBracketSize(Math.max(2, ms.length)); // ms.length matches → bracketSize de la SIGUIENTE = ms.length
      const nextExists = (byStage.get(nextStage)?.length ?? 0) > 0;
      if (!nextExists) { active = { stage: st, matches: ms }; break; }
    }
    if (!active) return json({ ok: false, reason: 'no_round_to_advance' }, 200);

    // ENGINE: avanzar la ronda activa. RoundMatch = {matchId,pairAId,pairBId,winnerPairId}.
    const round = active.matches.map((m) => ({
      matchId: m.id, pairAId: m.pair_a_id, pairBId: m.pair_b_id, winnerPairId: m.winner_pair_id,
    }));
    const res = advanceBracket(round); // {next:[{pairAId,pairBId,sourceMatchIds}], complete}
    if (!res.complete) return json({ ok: false, reason: 'round_incomplete' }, 200);

    // El siguiente cuadro tiene 2× los partidos de la siguiente ronda (next.length partidos → 2·next.length parejas).
    const nextStage = stageForBracketSize(res.next.length * 2); // 1 partido → final(2); 2 → semi(4); etc.
    // stage: string (no MatchStage) para admitir el push de 'third_place' (stage válido en BD, fuera del mapeo de bracket).
    const toPersist: Array<{ stage: string; round_label: string; pair_a_id: string | null; pair_b_id: string | null }> =
      res.next.map((mt: any, i: number) => ({
        stage: nextStage as string,
        round_label: `${nextStage}-${String(i + 1).padStart(2, '0')}`,
        pair_a_id: mt.pairAId ?? null,
        pair_b_id: mt.pairBId ?? null,
      }));

    // 3.er lugar: solo al avanzar SEMIS (las 2 semis → tupla). thirdPlaceFromSemis([semi1, semi2]).
    if (active.stage === 'semi' && active.matches.length === 2) {
      const third = thirdPlaceFromSemis([
        { matchId: active.matches[0].id, pairAId: active.matches[0].pair_a_id, pairBId: active.matches[0].pair_b_id, winnerPairId: active.matches[0].winner_pair_id },
        { matchId: active.matches[1].id, pairAId: active.matches[1].pair_a_id, pairBId: active.matches[1].pair_b_id, winnerPairId: active.matches[1].winner_pair_id },
      ]);
      if (third) toPersist.push({
        stage: 'third_place',
        round_label: 'third_place-1',
        pair_a_id: third.pairAId ?? null,
        pair_b_id: third.pairBId ?? null,
      });
    }

    const { data: result, error } = await admin.rpc('advance_bracket_round', {
      p_actor: actor, p_category_id: category_id, p_next: toPersist,
    });
    if (error) return json({ error: 'advance_failed', detail: error.message }, 400);
    return json({ ok: true, advanced_from: active.stage, next_stage: nextStage, result });
  } catch (e) {
    return json({ error: 'unhandled', detail: String(e) }, 500);
  }
});
