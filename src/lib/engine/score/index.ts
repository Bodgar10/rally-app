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

/** Qué formato tiene un par de números, si es que tiene alguno. */
export type FormatoDeSet = 'normal' | 'super' | null;

/**
 * Clasifica un marcador de set POR SUS NÚMEROS.
 *
 * NO HACE FALTA PREGUNTAR SI ES SUPER MUERTE: los dos formatos no se solapan.
 *   · Set normal: termina en 6 con 4 o menos enfrente (6-0 … 6-4), o en 7 con
 *     5 o 6 (7-5, 7-6). El máximo posible es 7.
 *   · Super muerte: llega a 10 o más con dos de diferencia (10-0, 10-8, 12-10).
 *     El mínimo posible del ganador es 10.
 *
 * Entre 7 y 10 no hay nada, así que ningún marcador puede ser las dos cosas.
 * El interruptor "super muerte" de la pantalla del juez preguntaba un dato que
 * ya estaba escrito en los números — y que se podía contestar mal.
 *
 * Devuelve null si no cabe en ninguno de los dos.
 */
export function clasificarSet(
  a: number,
  b: number,
  cfg: ScoreConfig = DEFAULT_SCORE_CONFIG,
): FormatoDeSet {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return null;
  if (a === b) return null;

  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  const limpio = hi === cfg.setTarget && lo <= cfg.setTarget - cfg.setWinBy;   // 6-0 … 6-4
  const siete  = hi === cfg.setTiebreakCap && (lo === cfg.setTarget - 1 || lo === cfg.setTarget); // 7-5 / 7-6
  if (limpio || siete) return 'normal';

  if (hi >= cfg.superTiebreakTarget && hi - lo >= cfg.superTiebreakWinBy) return 'super';

  return null;
}

/**
 * Cómo se escribe un marcador válido, para decírselo al juez cuando el suyo no
 * lo es. Antes el error decía "marcador de games inválido (7-3)" y se quedaba
 * ahí: señalaba el problema sin decir qué sí vale.
 */
const FORMATO_NORMAL = 'un set normal (6-4, 7-5, 7-6)';
const FORMATO_SUPER  = 'una súper muerte a 10 (10-8, 12-10)';

/**
 * Los dos números de un set, tal como hay que leerlos.
 *
 * CON `isSuperTiebreak` MARCADO, mandan los tiebreaks. Es el contrato de lo
 * ALMACENADO: `match_sets` guarda un super muerte con games 1-0 y los puntos en
 * tiebreak_a/b (ver ScoreCapture). Leer los games de esa fila daría "1-0", que
 * no es un set válido de nada.
 *
 * SIN LA MARCA se leen los games y el formato se deduce con `clasificarSet`.
 * Ese es el camino de lo que llega del formulario, que ya no pregunta.
 */
function numerosDelSet(set: SetScore): { a: number; b: number } {
  if (set.isSuperTiebreak) {
    return { a: set.tiebreakA ?? set.gamesA, b: set.tiebreakB ?? set.gamesB };
  }
  return { a: set.gamesA, b: set.gamesB };
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

    const { a, b } = numerosDelSet(st);
    const formato = clasificarSet(a, b, config);

    if (formato === null) {
      // El mensaje dice qué SÍ vale, y solo lo que vale AHÍ: ofrecer la súper
      // muerte en el primer set sería invitar a un error.
      const permitido = isDecider
        ? `${FORMATO_NORMAL} o ${FORMATO_SUPER}`
        : FORMATO_NORMAL;
      errors.push(`Set ${i + 1}: ${a}-${b} no es un marcador válido. Puede ser ${permitido}.`);
    } else if (formato === 'super' && !isDecider) {
      // Un 10-8 en el primer set no es un formato equivocado: es que ese set
      // no puede ser una súper muerte, y decir "marcador inválido" sonaría a
      // que los números están mal tecleados.
      errors.push(
        `Set ${i + 1}: la súper muerte solo se juega en el set decisivo, con un set por lado. ` +
        `Aquí el marcador tiene que ser ${FORMATO_NORMAL}.`,
      );
    } else if (a > b) setsA++;
    else setsB++;

    if (setsA >= setsToWin || setsB >= setsToWin) decided = true;
  }

  if (!decided) {
    errors.push('Partido incompleto: ningún lado alcanzó los sets necesarios para ganar.');
  }

  const valid = errors.length === 0;
  const winnerSide = valid ? (setsA > setsB ? 'A' : 'B') : null;

  return { valid, errors, winnerSide, setsA, setsB };
}
