// src/lib/engine/format/rules.ts
// Tabla determinista de formato por nº de parejas (Doc B §1.1).
// Punto de partida; el organizador puede sobreescribir. Casos "ambiguous"
// disparan la sugerencia IA (fuera del engine) con sus alternativas.

import type { FormatType, KnockoutStart } from '../types.ts';

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
//
// RECALIBRADA A GRUPOS DE 3 (evidencia Cimepa, ver TAMANO_PREFERIDO en index.ts).
// Estas entradas GANAN sobre deriveFormat, así que tienen que decir lo mismo
// que la derivación o el motor se contradice a sí mismo — que es exactamente
// lo que pasaba antes: 9, 12 y 18 ya usaban grupos de 3 mientras la derivación
// prefería 4.
//
// `alternatives` va INVERTIDO respecto a la versión anterior: el default es el
// torneo que cabe en un fin de semana y la alternativa es la versión larga,
// para quien tenga canchas y días de sobra. El orden importa: la primera
// opción es la que el organizador acepta sin pensar.
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
  // 12 partidos en vez de 20. La alternativa de 5+5 da 1 asegurado más.
  10: plan('groups_then_knockout', [4, 3, 3], 1, 1, 'semi', false, [
    plan('groups_then_knockout', [5, 5], 2, 0, 'semi'),
  ]),
  12: plan('groups_then_knockout', [3, 3, 3, 3], 2, 0, 'quarter'),
  // Ya estaba bien; deja de ser ambigua porque con preferencia 3 no hay empate.
  14: plan('groups_then_knockout', [4, 4, 3, 3], 2, 0, 'quarter'),
  // 18 partidos en vez de 24.
  16: plan('groups_then_knockout', [4, 3, 3, 3, 3], 1, 3, 'quarter', false, [
    plan('groups_then_knockout', [4, 4, 4, 4], 2, 0, 'quarter'),
  ]),
  18: plan('groups_then_knockout', [3, 3, 3, 3, 3, 3], 1, 2, 'quarter'),
  // El peor caso de la tabla vieja: 40 partidos de grupos. Ahora 24.
  20: plan('groups_then_knockout', [4, 4, 3, 3, 3, 3], 1, 2, 'quarter', false, [
    plan('groups_then_knockout', [4, 4, 4, 4, 4], 1, 3, 'quarter'),
  ]),
  // 24 en vez de 36 partidos de grupos, aunque el cuadro pasa de 7 a 15.
  24: plan('groups_then_knockout', [3, 3, 3, 3, 3, 3, 3, 3], 2, 0, 'r16', false, [
    plan('groups_then_knockout', [4, 4, 4, 4, 4, 4], 2, 4, 'r16'),
  ]),
  // 36 en vez de 48.
  32: plan('groups_then_knockout', [4, 4, 3, 3, 3, 3, 3, 3, 3, 3], 1, 6, 'r16', false, [
    plan('groups_then_knockout', [4, 4, 4, 4, 4, 4, 4, 4], 2, 0, 'r16'),
  ]),
};
