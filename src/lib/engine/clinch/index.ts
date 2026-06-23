// src/lib/engine/clinch/index.ts
// Motor de clasificación anticipada (Doc B §3). Determinista.

import type { ClinchStatus, MatchResultInput } from '../types';
import {
  computeStandings,
  DEFAULT_STANDINGS_CONFIG,
  type StandingsConfig,
} from '../standings';

export interface ClinchResult {
  pairId: string;
  status: ClinchStatus;
  /** Partidos restantes de los que depende su clasificación (para el mensaje "alive"). */
  dependsOnMatchIds: string[];
}

/** Límite de partidos restantes para fuerza bruta (2^k escenarios). */
const MAX_BRUTE_FORCE_MATCHES = 16;

/** Conjunto de parejas que clasifican (top advanceCount) en un escenario dado. */
function qualifiersForScenario(
  pairIds: string[],
  matches: MatchResultInput[],
  advanceCount: number,
  cfg: StandingsConfig,
): Set<string> {
  const table = computeStandings(pairIds, matches, cfg);
  return new Set(table.slice(0, advanceCount).map((r) => r.pairId));
}

/** Aplica un escenario (bitmask) a los partidos restantes: bit=0 gana A, bit=1 gana B. */
function applyScenario(
  base: MatchResultInput[],
  remaining: MatchResultInput[],
  mask: number,
): MatchResultInput[] {
  const decided = remaining.map((m, i) => {
    const bWins = (mask >> i) & 1;
    return {
      ...m,
      played: true,
      winnerPairId: bWins ? m.pairBId : m.pairAId,
      sets: m.sets.length
        ? m.sets
        : [
            // marcador mínimo coherente para standings (2-0 al ganador)
            { gamesA: bWins ? 0 : 6, gamesB: bWins ? 6 : 0, isSuperTiebreak: false },
            { gamesA: bWins ? 0 : 6, gamesB: bWins ? 6 : 0, isSuperTiebreak: false },
          ],
    };
  });
  const playedBase = base.filter((m) => m.played && m.winnerPairId != null);
  return [...playedBase, ...decided];
}

export function computeClinch(
  pairIds: string[],
  matches: MatchResultInput[],
  advanceCount: number,
  config: StandingsConfig = DEFAULT_STANDINGS_CONFIG,
): ClinchResult[] {
  const remaining = matches.filter((m) => !m.played || m.winnerPairId == null);
  const k = remaining.length;

  // Sin partidos restantes: el estado es definitivo según la tabla actual.
  if (k === 0) {
    const quals = qualifiersForScenario(pairIds, matches, advanceCount, config);
    return pairIds.map((pairId) => ({
      pairId,
      status: quals.has(pairId) ? 'clinched' : 'eliminated',
      dependsOnMatchIds: [],
    }));
  }

  // Demasiados escenarios: cota de puntos conservadora.
  if (k > MAX_BRUTE_FORCE_MATCHES) {
    return conservativeByPointBound(pairIds, matches, remaining, advanceCount, config);
  }

  const scenarios = 1 << k;
  // qualifiedMask[pairId] = array de booleanos por escenario.
  const qualifiedPerScenario: boolean[][] = pairIds.map(() => []);
  const idx = new Map(pairIds.map((id, i) => [id, i]));

  for (let mask = 0; mask < scenarios; mask++) {
    const scenarioMatches = applyScenario(matches, remaining, mask);
    const quals = qualifiersForScenario(pairIds, scenarioMatches, advanceCount, config);
    pairIds.forEach((id) => qualifiedPerScenario[idx.get(id)!].push(quals.has(id)));
  }

  return pairIds.map((pairId) => {
    const arr = qualifiedPerScenario[idx.get(pairId)!];
    const allYes = arr.every(Boolean);
    const noneYes = arr.every((x) => !x);
    let status: ClinchStatus = 'alive';
    if (allYes) status = 'clinched';
    else if (noneYes) status = 'eliminated';

    let dependsOnMatchIds: string[] = [];
    if (status === 'alive') {
      dependsOnMatchIds = remaining
        .filter((_, bit) => scenarioFlipsQualification(arr, bit, k))
        .map((m) => m.matchId);
    }
    return { pairId, status, dependsOnMatchIds };
  });
}

/** ¿Cambiar el resultado del partido `bit` altera la clasificación de la pareja? */
function scenarioFlipsQualification(arr: boolean[], bit: number, k: number): boolean {
  const total = 1 << k;
  for (let mask = 0; mask < total; mask++) {
    if ((mask >> bit) & 1) continue; // solo pares (mask, mask|bit)
    const other = mask | (1 << bit);
    if (arr[mask] !== arr[other]) return true;
  }
  return false;
}

/** Clasificación conservadora por cota de puntos (solo marca estados 100% seguros). */
function conservativeByPointBound(
  pairIds: string[],
  matches: MatchResultInput[],
  remaining: MatchResultInput[],
  advanceCount: number,
  config: StandingsConfig,
): ClinchResult[] {
  const current = computeStandings(pairIds, matches, config);
  const pointsNow = new Map(current.map((r) => [r.pairId, r.points]));
  const remainingCount = new Map(pairIds.map((id) => [id, 0]));
  for (const m of remaining) {
    remainingCount.set(m.pairAId, (remainingCount.get(m.pairAId) ?? 0) + 1);
    remainingCount.set(m.pairBId, (remainingCount.get(m.pairBId) ?? 0) + 1);
  }
  const best = (id: string) =>
    (pointsNow.get(id) ?? 0) + config.pointsWin * (remainingCount.get(id) ?? 0);
  const worst = (id: string) =>
    (pointsNow.get(id) ?? 0) + config.pointsPlayedLoss * (remainingCount.get(id) ?? 0);

  return pairIds.map((pairId) => {
    const myWorst = worst(pairId);
    const myBest = best(pairId);
    const guaranteedAbove = pairIds.filter((o) => o !== pairId && worst(o) > myBest).length;
    const canBeAbove = pairIds.filter((o) => o !== pairId && best(o) >= myWorst).length;
    let status: ClinchStatus = 'alive';
    if (canBeAbove < advanceCount) status = 'clinched';
    else if (guaranteedAbove >= advanceCount) status = 'eliminated';
    return { pairId, status, dependsOnMatchIds: status === 'alive' ? remaining.map((m) => m.matchId) : [] };
  });
}
