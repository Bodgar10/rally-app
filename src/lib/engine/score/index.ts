// src/lib/engine/score/index.ts
// Validación de marcador y derivación del ganador (Doc A §4.10, Doc B).
// Determinista. El juez captura; este motor valida antes de persistir.

import type { SetScore } from '../types';

export interface ScoreConfig {
  bestOf: number; // nº de sets de la serie (3 → gana quien llega a 2)
  setTarget: number; // games para cerrar set normal (6)
  setWinBy: number; // margen mínimo en set normal (2)
  /** Tope de games de un set normal con tiebreak (a 6-6 → 7-6). */
  setTiebreakCap: number; // 7
  superTiebreakTarget: number; // puntos para cerrar super muerte (10)
  superTiebreakWinBy: number; // margen mínimo en super muerte (2)
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  bestOf: 3,
  setTarget: 6,
  setWinBy: 2,
  setTiebreakCap: 7,
  superTiebreakTarget: 10,
  superTiebreakWinBy: 2,
};

export interface ValidatedScore {
  valid: boolean;
  errors: string[];
  /** Ganador derivado del marcador. null si inválido o incompleto. */
  winnerSide: 'A' | 'B' | null;
  setsA: number;
  setsB: number;
}

/** Lado ganador de un set normal, o null si el marcador del set es inválido. */
function normalSetWinner(a: number, b: number, cfg: ScoreConfig): 'A' | 'B' | null {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const okClean = hi === cfg.setTarget && lo <= cfg.setTarget - cfg.setWinBy; // 6-0..6-4
  const okSeven = hi === cfg.setTiebreakCap && (lo === cfg.setTarget - 1 || lo === cfg.setTarget); // 7-5 / 7-6
  if (!okClean && !okSeven) return null;
  if (a === b) return null;
  return a > b ? 'A' : 'B';
}

/** Lado ganador de un super muerte, o null si inválido. Usa tiebreak_a/b si existen. */
function superSetWinner(set: SetScore, cfg: ScoreConfig): 'A' | 'B' | null {
  const a = set.tiebreakA ?? set.gamesA;
  const b = set.tiebreakB ?? set.gamesB;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < cfg.superTiebreakTarget) return null;
  if (hi - lo < cfg.superTiebreakWinBy) return null;
  if (a === b) return null;
  return a > b ? 'A' : 'B';
}

/**
 * Valida un marcador completo y deriva el ganador.
 * No persiste nada; solo dice si el marcador es legal y quién ganó.
 */
export function validateScore(
  sets: SetScore[],
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ValidatedScore {
  const errors: string[] = [];
  const setsToWin = Math.ceil(config.bestOf / 2);

  if (!sets || sets.length === 0) {
    return { valid: false, errors: ['Sin sets capturados.'], winnerSide: null, setsA: 0, setsB: 0 };
  }
  if (sets.length > config.bestOf) {
    errors.push(`Demasiados sets: ${sets.length} > mejor de ${config.bestOf}.`);
  }

  let setsA = 0;
  let setsB = 0;
  let decided = false;

  for (let i = 0; i < sets.length; i++) {
    const st = sets[i];

    if (decided) {
      errors.push(`Set ${i + 1} capturado después de que el partido ya estaba decidido.`);
      continue;
    }

    const isDecider = setsA === setsToWin - 1 && setsB === setsToWin - 1;

    if (st.isSuperTiebreak) {
      if (!isDecider) {
        errors.push(`Super muerte en el set ${i + 1} pero no es el set decisivo.`);
      }
      const w = superSetWinner(st, config);
      if (w === null) {
        errors.push(`Super muerte del set ${i + 1} con marcador inválido.`);
      } else if (w === 'A') setsA++;
      else setsB++;
    } else {
      const w = normalSetWinner(st.gamesA, st.gamesB, config);
      if (w === null) {
        errors.push(`Set ${i + 1} con marcador de games inválido (${st.gamesA}-${st.gamesB}).`);
      } else if (w === 'A') setsA++;
      else setsB++;
    }

    if (setsA >= setsToWin || setsB >= setsToWin) decided = true;
  }

  if (!decided) {
    errors.push('Partido incompleto: ningún lado alcanzó los sets necesarios para ganar.');
  }

  const valid = errors.length === 0;
  const winnerSide = valid ? (setsA > setsB ? 'A' : 'B') : null;

  return { valid, errors, winnerSide, setsA, setsB };
}
