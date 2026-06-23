// src/lib/engine/rating/glicko2.ts
// Glicko-2 (Glickman). Determinista. Rating OCULTO por jugador (Doc B §6).
// Procesar partido a partido en orden cronológico (matches.played_at).

import type { GlickoRating } from '../types';

const SCALE = 173.7178; // factor de conversión a la escala interna Glicko-2
const EPSILON = 0.000001;
export const DEFAULT_TAU = 0.5;

export interface OpponentResult {
  rating: number;
  rd: number;
  /** 1 = ganó el jugador, 0 = perdió, 0.5 = empate (no aplica en padel). */
  score: number;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Actualiza el rating de un jugador tras un periodo con uno o más oponentes.
 * Si no hay oponentes, solo infla RD por inactividad (φ* = sqrt(φ² + σ²)).
 */
export function updateRating(
  player: GlickoRating,
  opponents: OpponentResult[],
  tau: number = DEFAULT_TAU,
): GlickoRating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;

  if (opponents.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: phiStar * SCALE, volatility: sigma };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const o of opponents) {
    const muJ = (o.rating - 1500) / SCALE;
    const phiJ = o.rd / SCALE;
    const gj = g(phiJ);
    const ej = expectedScore(mu, muJ, phiJ);
    vInv += gj * gj * ej * (1 - ej);
    deltaSum += gj * (o.score - ej);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // --- Nueva volatilidad por iteración (algoritmo de Illinois) ---
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: muPrime * SCALE + 1500,
    rd: phiPrime * SCALE,
    volatility: sigmaPrime,
  };
}

// --- DOBLES (ver DECISIÓN en el encabezado del prompt) ---

/** Combina dos rivales en un oponente virtual: rating promedio, RD media cuadrática. */
export function combineOpponentPair(
  a: GlickoRating,
  b: GlickoRating,
): { rating: number; rd: number } {
  return {
    rating: (a.rating + b.rating) / 2,
    rd: Math.sqrt((a.rd * a.rd + b.rd * b.rd) / 2),
  };
}

export interface DoublesMatchOutput {
  winners: [GlickoRating, GlickoRating];
  losers: [GlickoRating, GlickoRating];
}

/**
 * Aplica un partido de dobles a los 4 ratings individuales.
 * No muta los inputs; devuelve nuevos ratings.
 */
export function rateDoublesMatch(
  winners: [GlickoRating, GlickoRating],
  losers: [GlickoRating, GlickoRating],
  tau: number = DEFAULT_TAU,
): DoublesMatchOutput {
  const loserCombo = combineOpponentPair(losers[0], losers[1]);
  const winnerCombo = combineOpponentPair(winners[0], winners[1]);
  return {
    winners: [
      updateRating(winners[0], [{ ...loserCombo, score: 1 }], tau),
      updateRating(winners[1], [{ ...loserCombo, score: 1 }], tau),
    ],
    losers: [
      updateRating(losers[0], [{ ...winnerCombo, score: 0 }], tau),
      updateRating(losers[1], [{ ...winnerCombo, score: 0 }], tau),
    ],
  };
}
