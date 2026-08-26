// src/lib/engine/format/index.ts
// Motor de formato (Doc B §1). computeFormat(numPairs) -> FormatPlan.
// Determinista. Sin IA. La IA solo sugiere cuando ambiguous=true (fuera del engine).

import type { KnockoutStart } from '../types';
import { RULES, type FormatPlan } from './rules';

export type { FormatPlan } from './rules';

function isPow2(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

function pow2Below(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function knockoutStartForBracket(size: number): KnockoutStart {
  if (size <= 2) return 'final';
  if (size <= 4) return 'semi';
  if (size <= 8) return 'quarter';
  if (size <= 16) return 'r16';
  return 'r32';
}

/** Reparte n parejas en g grupos lo más parejo posible (sizes desc). */
function distribute(n: number, g: number): number[] {
  const base = Math.floor(n / g);
  const rem = n % g;
  const sizes: number[] = [];
  for (let i = 0; i < g; i++) sizes.push(base + (i < rem ? 1 : 0));
  return sizes;
}

/** Score de "cercanía a grupos de 4"; menor es mejor. Inválido si algún size < 3 o > 5. */
function scorePartition(sizes: number[]): number | null {
  if (sizes.some((s) => s < 3 || s > 5)) return null;
  return sizes.reduce((acc, s) => acc + Math.abs(s - 4), 0);
}

/**
 * Deriva el formato para N no listados (Doc B §1.1, regla general):
 * preferir grupos de 4; clasificados redondeados a potencia de 2 hacia abajo;
 * completar con los mejores de la posición advancePerGroup+1 (segundos si
 * pasa 1 por grupo, terceros si pasan 2). ambiguous=true si dos g empatan en score.
 */
function deriveFormat(n: number): FormatPlan {
  if (n <= 5) {
    // Categoría muy chica sin listar: round robin a una sola final entre top 2.
    return {
      formatType: 'round_robin',
      groupSizes: [n],
      advancePerGroup: n >= 4 ? 2 : 0,
      bestExtraQualifiers: 0,
      knockoutStart: 'final',
      ambiguous: false,
    };
  }

  // Buscar el nº de grupos g con mejor score (sizes en [3,5], preferir 4).
  let best: { g: number; sizes: number[]; score: number } | null = null;
  let tie = false;
  const gMin = Math.ceil(n / 5);
  const gMax = Math.floor(n / 3);
  for (let g = gMin; g <= gMax; g++) {
    const sizes = distribute(n, g);
    const score = scorePartition(sizes);
    if (score === null) continue;
    if (best === null || score < best.score) {
      best = { g, sizes, score };
      tie = false;
    } else if (score === best.score) {
      tie = true;
    }
  }

  if (best === null) {
    // Sin partición válida en [3,5]: cuadro directo (raro en este rango).
    const bracket = pow2Below(n);
    return {
      formatType: 'knockout_only',
      groupSizes: [],
      advancePerGroup: 0,
      bestExtraQualifiers: 0,
      knockoutStart: knockoutStartForBracket(bracket),
      ambiguous: true,
    };
  }

  const g = best.g;
  const direct2 = g * 2;
  let advancePerGroup: number;
  let bestExtraQualifiers: number;
  let bracket: number;

  if (isPow2(direct2)) {
    advancePerGroup = 2;
    bestExtraQualifiers = 0;
    bracket = direct2;
  } else {
    bracket = pow2Below(direct2);
    if (bracket >= g) {
      advancePerGroup = 1;
      bestExtraQualifiers = bracket - g; // top 1 de cada grupo + mejores segundos
    } else {
      advancePerGroup = 1;
      bestExtraQualifiers = 0;
      bracket = pow2Below(g);
    }
  }

  return {
    formatType: 'groups_then_knockout',
    groupSizes: best.sizes,
    advancePerGroup,
    bestExtraQualifiers,
    knockoutStart: knockoutStartForBracket(bracket),
    ambiguous: tie,
  };
}

/**
 * Calcula el formato de una categoría dado el nº de parejas.
 * Usa la tabla literal (Doc B §1.1) si N está listado; si no, deriva.
 */
export function computeFormat(numPairs: number): FormatPlan {
  if (numPairs < 2) {
    throw new Error('computeFormat: se requieren al menos 2 parejas.');
  }
  const listed = RULES[numPairs];
  if (listed) return listed;
  return deriveFormat(numPairs);
}
