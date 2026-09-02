/**
 * RALLY · Del formulario del juez al payload de `match-result`
 *
 * AUSENCIA Y CERO NO SON LO MISMO, Y ESTE ARCHIVO EXISTE POR ESO
 *
 *   La hoja de captura arranca con DOS filas de set vacías. Con la captura set
 *   a set, el caso normal es guardar la primera y dejar la segunda sin tocar —
 *   el partido sigue. Pero el payload se construía mapeando TODAS las filas:
 *
 *       parseInt('', 10)  →  NaN
 *       JSON.stringify({ games_a: NaN })  →  {"games_a": null}
 *       Number(null) en el servidor       →  0
 *
 *   Tres saltos y un set que nadie había jugado llegaba al motor como un 0-0.
 *   El motor hacía lo correcto —"Set 2: 0-0 no es un marcador válido"— y el
 *   juez no podía guardar un solo set, que es justo el caso central.
 *
 *   La corrección no es que el motor perdone el 0-0: un 0-0 TECLEADO A MANO
 *   sigue siendo un marcador imposible y tiene que rechazarse. La corrección
 *   es no fabricarlo. Un set sin capturar no viaja.
 *
 *   Vive fuera del componente para poder probarlo: el bug no era de UI, era de
 *   conversión, y desde una pantalla no se prueba una conversión.
 */

import { clasificarSet } from '@/lib/engine/score';
import type { SetScore as SetDelMotor } from '@/lib/engine/types';

/** Una fila del formulario. Los dos números como los teclea el juez. */
export interface FilaDeSet {
  a: string;
  b: string;
}

/** Un set del payload de `match-result`, en snake_case. */
export interface SetDePayload {
  set_number: number;
  games_a: number;
  games_b: number;
  is_super_tiebreak: boolean;
  tiebreak_a: number | null;
  tiebreak_b: number | null;
}

/**
 * ¿Están los DOS números de este set?
 *
 * Vacío no es inválido: es "todavía no se ha jugado". La diferencia es la que
 * separa "no hay dato" de "hay un dato imposible", y es la que se perdía al
 * convertir.
 */
export function capturado(s: FilaDeSet): boolean {
  return s.a.trim() !== '' && s.b.trim() !== '';
}

/**
 * Formulario -> entrada del motor, SOLO con los sets capturados.
 *
 * Se mandan los números crudos con `isSuperTiebreak: false`: es la señal de
 * "dedúcelo tú". `validateScore` los clasifica solo, y así la pantalla y el
 * servidor llegan a la misma conclusión sin que ninguno de los dos la escriba
 * por su cuenta.
 */
export function aMotor(sets: FilaDeSet[]): SetDelMotor[] {
  return sets.filter(capturado).map((s) => ({
    gamesA: parseInt(s.a, 10),
    gamesB: parseInt(s.b, 10),
    isSuperTiebreak: false,
  }));
}

/**
 * Formulario -> payload de `match-result` (snake, números).
 *
 * SOLO LOS SETS CAPTURADOS, y numerados 1..n sobre los que quedan. Si se
 * mandara la fila vacía, el servidor la leería como 0-0 (ver la cabecera). Y
 * si se conservara el índice original, un hueco dejaría un `set_number` sin
 * usar y la tabla `match_sets` guardaría una numeración con agujeros.
 *
 * FORMATO DE LA SUPER MUERTE — el contrato con el engine:
 *   Los PUNTOS van en tiebreak_a/tiebreak_b. `games_a/games_b` llevan el
 *   marcador 1-0 del lado que ganó, nunca los puntos.
 *
 *   `computeStandings` con superTiebreakGames:'one' (el default) ignora
 *   games_a/b en un super muerte y deriva 1-0 de los tiebreaks, y
 *   `superSetWinner` lee `tiebreakA ?? gamesA`. Mandar los puntos en games
 *   inflaría la diferencia de games que desempata la tabla.
 *
 *   Los tests del engine (score.test.ts, 'contrato de super muerte') fijan
 *   este formato.
 */
export function payloadDeSets(sets: FilaDeSet[]): SetDePayload[] {
  return sets.filter(capturado).map((s, i) => {
    const a = parseInt(s.a, 10);
    const b = parseInt(s.b, 10);

    // El motor dice qué es esto. La pantalla ya no opina.
    if (clasificarSet(a, b) === 'super') {
      return {
        set_number: i + 1,
        games_a: a > b ? 1 : 0,
        games_b: b > a ? 1 : 0,
        is_super_tiebreak: true,
        tiebreak_a: a,
        tiebreak_b: b,
      };
    }
    return {
      set_number: i + 1,
      games_a: a,
      games_b: b,
      is_super_tiebreak: false,
      tiebreak_a: null,
      tiebreak_b: null,
    };
  });
}
