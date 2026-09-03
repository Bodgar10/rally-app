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
  /** El marcador es un partido COMPLETO y legal. Lo que decide si se cierra. */
  valid: boolean;
  errors: string[];
  /** Ganador derivado del marcador. null si inválido o incompleto. */
  winnerSide: 'A' | 'B' | null;
  setsA: number;
  setsB: number;
  /**
   * ¿Algún lado llegó ya a los sets necesarios?
   *
   * `valid` responde "¿se puede cerrar el partido?" y `completo` responde
   * "¿está decidido?". Son casi lo mismo salvo cuando hay otro error —un set
   * mal escrito, sets de más—, y separarlas es lo que permite guardar un set
   * suelto sin que el motor exija el partido entero.
   */
  completo: boolean;
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
 * En qué punto está un set, deducido de sus DOS NÚMEROS y de nada más.
 *
 *   'terminado' — 6-0…6-4, 7-5, 7-6, y la súper muerte a 10+ con dos de
 *                 diferencia. El 7-6 SIEMPRE está terminado: si llegaron a
 *                 6-6 el único desenlace posible es 7-6, no existe un 7-6 en
 *                 curso.
 *   'en_curso'  — cualquier otro marcador legal: 3-1, 5-4, 6-5, 6-6. Al 6-6
 *                 se le está jugando el tiebreak, cuyos puntos no se capturan.
 *   null        — lo imposible: 8-3, 6-8, 9-4, y el 0-0, que no es una foto
 *                 de nada.
 *
 * Es el mismo criterio con el que `clasificarSet` deduce la súper muerte sin
 * preguntar: los números ya lo dicen. Aquí solo se le añade el escalón que
 * faltaba entre "válido" e "imposible".
 */
export type EstadoDeSet = 'terminado' | 'en_curso' | null;

export function estadoDeSet(
  a: number,
  b: number,
  cfg: ScoreConfig = DEFAULT_SCORE_CONFIG,
): EstadoDeSet {
  if (clasificarSet(a, b, cfg) !== null) return 'terminado';
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return null;
  // Un set en marcha no ha pasado del objetivo, y alguien ha ganado un juego:
  // el 0-0 es un set que no ha empezado y no dice nada que valga la pena
  // guardar.
  if (Math.max(a, b) <= cfg.setTarget && a + b > 0) return 'en_curso';
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
 * El set que falta, NOMBRADO.
 *
 * El mensaje decía "Partido incompleto: ningún lado alcanzó los sets
 * necesarios para ganar". Es cierto y no sirve: describe el estado de la
 * validación, no lo que el juez tiene que hacer. El juez tiene el teléfono en
 * la mano al lado de la cancha y lo que necesita saber es qué le falta teclear.
 *
 * Y el caso que más se da es justo el que peor se explicaba: 1-1 en sets. Ahí
 * no "falta un set" a secas — falta EL DESEMPATE, que además es el único que
 * puede ser súper muerte. Decirlo por su nombre ahorra la pregunta.
 */
const ORDINAL = ['', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto'];

function faltaEsteSet(capturados: number, esDesempate: boolean, cfg: ScoreConfig): string {
  const siguiente = capturados + 1;
  // Sin nombre que darle (serie más larga que la tabla, o ya hay sets de más,
  // que es otro error y se reporta aparte): se dice lo genérico y ya.
  if (siguiente > cfg.bestOf || !ORDINAL[siguiente]) {
    return 'Partido incompleto: ningún lado alcanzó los sets necesarios para ganar.';
  }
  return esDesempate
    ? `Falta el ${ORDINAL[siguiente]} set para desempatar.`
    : `Falta el ${ORDINAL[siguiente]} set.`;
}

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
  return validar(sets, config, false);
}

/**
 * ¿Es LEGAL lo capturado hasta ahora, aunque el partido siga?
 *
 * Igual que `validateScore` salvo en dos cosas, y solo dos:
 *   · no exige que haya ganador;
 *   · admite que el ÚLTIMO set esté EN CURSO, para que el juez pueda ir
 *     actualizando el marcador del set que se está jugando.
 *
 * Los sets anteriores sí tienen que estar cerrados: `[3-1, 2-0]` es imposible,
 * porque no se empieza un set sin terminar el anterior.
 */
export function validateParcial(
  sets: SetScore[],
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ValidatedScore {
  return validar(sets, config, true);
}

function validar(
  sets: SetScore[],
  config: ScoreConfig,
  parcial: boolean,
): ValidatedScore {
  const errors: string[] = [];
  const setsToWin = Math.ceil(config.bestOf / 2);

  if (!sets || sets.length === 0) {
    return { valid: false, errors: ['Sin sets capturados.'], winnerSide: null, setsA: 0, setsB: 0, completo: false };
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
      const abierto = estadoDeSet(a, b, config) === 'en_curso';

      // EL SET QUE SE ESTÁ JUGANDO. Solo puede ser el último, y solo en una
      // captura parcial: el juez actualiza su marcador cada dos o tres games.
      if (abierto && parcial && i === sets.length - 1) {
        continue;   // no suma set a nadie hasta que cierre
      }
      // Un set abierto que NO es el último es un imposible distinto, y decirlo
      // como "marcador inválido" mandaría al juez a revisar unos números que
      // están bien: lo que está mal es el orden.
      if (abierto && parcial) {
        errors.push(
          `Set ${i + 1}: ${a}-${b} todavía no ha terminado. ` +
          `No se puede empezar el siguiente set con este abierto.`,
        );
        continue;
      }

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

  // "Falta el segundo set" es un error solo cuando se pretende CERRAR el
  // partido. En una captura parcial es la situación normal, no un fallo.
  if (!decided && !parcial) {
    const esDesempate = setsA === setsToWin - 1 && setsB === setsToWin - 1;
    errors.push(faltaEsteSet(sets.length, esDesempate, config));
  }

  const valid = errors.length === 0;
  const winnerSide = valid ? (setsA > setsB ? 'A' : 'B') : null;

  return { valid, errors, winnerSide, setsA, setsB, completo: decided };
}


