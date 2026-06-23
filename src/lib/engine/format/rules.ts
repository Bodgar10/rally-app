// src/lib/engine/format/rules.ts
// Tabla determinista de formato por nº de parejas (Doc B §1.1).
// Punto de partida; el organizador puede sobreescribir. Casos "ambiguous"
// disparan la sugerencia IA (fuera del engine) con sus alternativas.

import type { FormatType, KnockoutStart } from '../types';

export interface FormatPlan {
  formatType: FormatType;
  groupSizes: number[];
  advancePerGroup: number;
  bestExtraQualifiers: number;
  knockoutStart: KnockoutStart;
  ambiguous: boolean;
  alternatives?: FormatPlan[];
}

const plan = (
  formatType: FormatType,
  groupSizes: number[],
  advancePerGroup: number,
  bestExtraQualifiers: number,
  knockoutStart: KnockoutStart,
  ambiguous = false,
  alternatives?: FormatPlan[],
): FormatPlan => ({
  formatType,
  groupSizes,
  advancePerGroup,
  bestExtraQualifiers,
  knockoutStart,
  ambiguous,
  alternatives,
});

// Tabla literal de Doc B §1.1. Clave = nº de parejas.
export const RULES: Record<number, FormatPlan> = {
  2: plan('round_robin', [2], 2, 0, 'final'),
  3: plan('round_robin', [3], 0, 0, 'final'),
  4: plan('round_robin', [4], 2, 0, 'final', true, [
    plan('groups_then_knockout', [4], 2, 0, 'semi'), // semis 1v4, 2v3
  ]),
  5: plan('round_robin', [5], 2, 0, 'final'),
  6: plan('groups_then_knockout', [3, 3], 2, 0, 'semi'),
  7: plan('groups_then_knockout', [4, 3], 2, 0, 'semi'),
  8: plan('groups_then_knockout', [4, 4], 2, 0, 'semi'),
  9: plan('groups_then_knockout', [3, 3, 3], 1, 1, 'semi'),
  10: plan('groups_then_knockout', [5, 5], 2, 0, 'semi', true, [
    plan('groups_then_knockout', [3, 3, 2, 2], 1, 0, 'semi'),
  ]),
  12: plan('groups_then_knockout', [3, 3, 3, 3], 2, 0, 'quarter'),
  14: plan('groups_then_knockout', [4, 4, 3, 3], 2, 0, 'quarter', true, [
    plan('groups_then_knockout', [7, 7], 2, 0, 'quarter'),
  ]),
  16: plan('groups_then_knockout', [4, 4, 4, 4], 2, 0, 'quarter'),
  18: plan('groups_then_knockout', [3, 3, 3, 3, 3, 3], 1, 2, 'quarter'),
  20: plan('groups_then_knockout', [5, 5, 5, 5], 2, 0, 'quarter', true, [
    plan('groups_then_knockout', [4, 4, 4, 4, 4], 1, 3, 'quarter'),
  ]),
  24: plan('groups_then_knockout', [4, 4, 4, 4, 4, 4], 2, 4, 'r16'),
  32: plan('groups_then_knockout', [4, 4, 4, 4, 4, 4, 4, 4], 2, 0, 'r16'),
};
