// src/lib/engine/standings/index.ts
// Motor de standings + desempates (Doc B §2). Determinista.

import type { MatchResultInput, SetScore, StandingRow } from '../types';

export interface StandingsConfig {
  pointsWin: number;
  pointsPlayedLoss: number;
  /** Cómo cuentan los games del super muerte para el desempate. */
  superTiebreakGames: 'one' | 'score';
}

export const DEFAULT_STANDINGS_CONFIG: StandingsConfig = {
  pointsWin: 2,
  pointsPlayedLoss: 1,
  superTiebreakGames: 'one',
};

interface Stats {
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
}

const emptyStats = (): Stats => ({
  played: 0,
  won: 0,
  lost: 0,
  setsWon: 0,
  setsLost: 0,
  gamesWon: 0,
  gamesLost: 0,
  points: 0,
});

/** Lado ganador de un set ('A' | 'B'), considerando super muerte. */
function setWinner(set: SetScore): 'A' | 'B' {
  if (set.isSuperTiebreak && set.tiebreakA != null && set.tiebreakB != null) {
    return set.tiebreakA > set.tiebreakB ? 'A' : 'B';
  }
  return set.gamesA >= set.gamesB ? 'A' : 'B';
}

/** Games que aporta un set a cada lado, según config de super muerte. */
function setGames(
  set: SetScore,
  cfg: StandingsConfig,
): { a: number; b: number } {
  if (set.isSuperTiebreak) {
    if (cfg.superTiebreakGames === 'score' && set.tiebreakA != null && set.tiebreakB != null) {
      return { a: set.tiebreakA, b: set.tiebreakB };
    }
    const w = setWinner(set);
    return { a: w === 'A' ? 1 : 0, b: w === 'B' ? 1 : 0 };
  }
  return { a: set.gamesA, b: set.gamesB };
}

/**
 * Acumula stats de un conjunto de parejas usando SOLO los partidos jugados
 * cuyas dos parejas estén en `pairIds` (permite mini-tablas de desempate).
 */
function computeStats(
  pairIds: string[],
  matches: MatchResultInput[],
  cfg: StandingsConfig,
): Map<string, Stats> {
  const set = new Set(pairIds);
  const stats = new Map<string, Stats>();
  pairIds.forEach((id) => stats.set(id, emptyStats()));

  for (const m of matches) {
    if (!m.played || m.winnerPairId == null) continue;
    if (!set.has(m.pairAId) || !set.has(m.pairBId)) continue;

    const sa = stats.get(m.pairAId)!;
    const sb = stats.get(m.pairBId)!;
    sa.played++;
    sb.played++;

    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const st of m.sets) {
      if (setWinner(st) === 'A') setsA++;
      else setsB++;
      const g = setGames(st, cfg);
      gamesA += g.a;
      gamesB += g.b;
    }
    sa.setsWon += setsA;
    sa.setsLost += setsB;
    sb.setsWon += setsB;
    sb.setsLost += setsA;
    sa.gamesWon += gamesA;
    sa.gamesLost += gamesB;
    sb.gamesWon += gamesB;
    sb.gamesLost += gamesA;

    if (m.winnerPairId === m.pairAId) {
      sa.won++;
      sb.lost++;
      sa.points += cfg.pointsWin;
      sb.points += cfg.pointsPlayedLoss;
    } else {
      sb.won++;
      sa.lost++;
      sb.points += cfg.pointsWin;
      sa.points += cfg.pointsPlayedLoss;
    }
  }
  return stats;
}

const diff = (s: Stats, k: 'sets' | 'games'): number =>
  k === 'sets' ? s.setsWon - s.setsLost : s.gamesWon - s.gamesLost;

/**
 * Resuelve un grupo de parejas EMPATADAS en puntos.
 * Mini-tabla entre ellas (criterios 1–5 del subconjunto), luego desempates globales.
 * (Para 2 parejas la mini-tabla equivale al head-to-head directo.)
 */
function resolveTie(
  run: string[],
  matches: MatchResultInput[],
  full: Map<string, Stats>,
  cfg: StandingsConfig,
): string[] {
  if (run.length === 1) return run;
  const mini = computeStats(run, matches, cfg);
  return [...run].sort((a, b) => {
    const ma = mini.get(a)!;
    const mb = mini.get(b)!;
    if (mb.points !== ma.points) return mb.points - ma.points;
    if (diff(mb, 'sets') !== diff(ma, 'sets')) return diff(mb, 'sets') - diff(ma, 'sets');
    if (diff(mb, 'games') !== diff(ma, 'games')) return diff(mb, 'games') - diff(ma, 'games');
    if (mb.gamesWon !== ma.gamesWon) return mb.gamesWon - ma.gamesWon;
    // Desempates globales (Doc B §2, criterios 3–5):
    const ga = full.get(a)!;
    const gb = full.get(b)!;
    if (diff(gb, 'sets') !== diff(ga, 'sets')) return diff(gb, 'sets') - diff(ga, 'sets');
    if (diff(gb, 'games') !== diff(ga, 'games')) return diff(gb, 'games') - diff(ga, 'games');
    if (gb.gamesWon !== ga.gamesWon) return gb.gamesWon - ga.gamesWon;
    return 0; // último recurso: orden estable (sorteo / criterio del organizador)
  });
}

/**
 * Calcula la tabla de posiciones ordenada de un grupo.
 * `pairIds` = parejas del grupo; `matches` = partidos del grupo (jugados o no).
 */
export function computeStandings(
  pairIds: string[],
  matches: MatchResultInput[],
  config: StandingsConfig = DEFAULT_STANDINGS_CONFIG,
): StandingRow[] {
  const full = computeStats(pairIds, matches, config);

  // Orden inicial por puntos (desc), estable por orden de entrada.
  const byPoints = [...pairIds].sort(
    (a, b) => full.get(b)!.points - full.get(a)!.points,
  );

  // Segmentar en corridas de puntos iguales y resolver cada una.
  const ordered: string[] = [];
  let i = 0;
  while (i < byPoints.length) {
    let j = i;
    const p = full.get(byPoints[i])!.points;
    while (j < byPoints.length && full.get(byPoints[j])!.points === p) j++;
    ordered.push(...resolveTie(byPoints.slice(i, j), matches, full, config));
    i = j;
  }

  return ordered.map((pairId, idx) => {
    const s = full.get(pairId)!;
    return {
      pairId,
      played: s.played,
      won: s.won,
      lost: s.lost,
      setsWon: s.setsWon,
      setsLost: s.setsLost,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      points: s.points,
      position: idx + 1,
    };
  });
}
