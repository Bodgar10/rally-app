// src/lib/engine/standings/index.ts
// Motor de standings + desempates (Doc B §2). Determinista.

import type { MatchResultInput, SetScore, StandingRow } from '../types';

export interface StandingsConfig {
  pointsWin: number;
  /**
   * Puntos por partido JUGADO y PERDIDO. Hoy 0. Ver DEFAULT_STANDINGS_CONFIG.
   * Se conserva como parámetro porque `computeClinch` lo usa como cota
   * inferior de puntos por partido restante.
   */
  pointsPlayedLoss: number;
  /** Cómo cuentan los games del super muerte para el desempate. */
  superTiebreakGames: 'one' | 'score';
}

/**
 * 2 por victoria, 0 por derrota. Los puntos son victorias × 2, punto.
 *
 * ► NO LO DEVUELVAS A 1 PENSANDO QUE PREMIA LA PARTICIPACIÓN. Era 1 y hubo
 *   que quitarlo. El punto por presentarse no premia a nadie: se lo lleva
 *   TODO el que juega, así que no distingue entre parejas — lo único que
 *   hace es escalar la columna PTS con el número de partidos del grupo.
 *
 *   Y los grupos no son todos del mismo tamaño. `computeFormat` reparte el
 *   resto (ver `distribute` en ../format/index.ts) y la tabla literal tiene
 *   escritos a mano los mixtos: 10 = [4,3,3], 16 = [4,3,3,3,3],
 *   20 = [4,4,3,3,3,3], 32 = [4,4,3,3,3,3,3,3,3,3]. En todos ellos pasa 1
 *   por grupo y el resto del cuadro se llena con los MEJORES SEGUNDOS, que
 *   `selectQualifiers` compara entre grupos distintos por esta misma columna.
 *
 *   Con 1 por derrota, un 1-2 en grupo de 4 sumaba 4 puntos y un 1-1 en
 *   grupo de 3 sumaba 3: el que perdió dos de tres clasificaba por encima
 *   del que ganó uno de dos, y ni siquiera se llegaban a comparar los sets.
 *   Peor: un 0-3 en grupo de 4 sumaba 3 y EMPATABA con ese 1-1.
 *
 *   Con 0, ambos quedan en 2 puntos y decide el desempate, que son
 *   diferencias y no acumulados. La tabla además se lee sola: el jugador que
 *   ve 2 puntos sabe que ganó un partido. No hacía falta normalizar por
 *   partidos jugados; hacía falta dejar de repartir puntos por jugar.
 */
export const DEFAULT_STANDINGS_CONFIG: StandingsConfig = {
  pointsWin: 2,
  pointsPlayedLoss: 0,
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
