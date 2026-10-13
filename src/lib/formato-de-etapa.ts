/**
 * RALLY · Cómo se juega cada etapa de un torneo largo, dicho para la pantalla
 *
 * ► EL CASO
 *   Padel Hype juega sus grupos a UN SET con punto de oro, el cuadro igual, y
 *   la final a dos de tres. Hasta ahora un torneo largo solo sabía jugarse al
 *   mejor de 3 en todo.
 *
 * ► CUATRO NOMBRES, TRES MARCADORES
 *   `set_oro` y `set_star_point` se validan idénticos: los dos son un set a 6
 *   games, y lo que cambia es cómo se resuelve el deuce —un punto en vez de
 *   ventajas—, que no deja rastro en los números. 6-4 es 6-4 de las dos
 *   formas.
 *
 *   Se ofrecen como opciones distintas igualmente, porque el organizador las
 *   ANUNCIA distinto y las dice por el micrófono. Que la app no sepa
 *   nombrarlas como él las nombra es lo que hace que la gente use una hoja de
 *   cálculo.
 *
 *   Lo mismo con `dos_sets_oro` y "mejor de 3": mismo marcador, distinto
 *   cartel.
 *
 * ► NULL ES UNA OPCIÓN, NO UN HUECO
 *   Un torneo que no diga nada se juega como se ha jugado siempre. Por eso la
 *   lista empieza por ahí y no por un valor vacío: el organizador elige "mejor
 *   de 3", no deja algo sin contestar.
 */

import type { FormatoPartido } from '@/lib/engine/score/formato-partido';

/** Lo que se puede elegir para una etapa. `null` = mejor de 3, lo de siempre. */
export type FormatoDeEtapa = Exclude<FormatoPartido, 'suma_6'> | null;

export interface OpcionDeFormato {
  valor: FormatoDeEtapa;
  titulo: string;
  sub: string;
}

/**
 * Las opciones, en orden de "lo más común primero".
 *
 * `suma_6` no está: no tiene ganador y su tabla se ordena por saldo de games.
 * Es el motor del exprés, y dejarlo entrar aquí daría una fase de grupos que
 * `computeStandings` no sabe leer. La base también lo prohíbe (migración 092).
 */
export const OPCIONES_DE_ETAPA: readonly OpcionDeFormato[] = [
  { valor: null,             titulo: 'Mejor de 3 sets',   sub: 'Lo normal en un torneo de fin de semana' },
  { valor: 'set_oro',        titulo: 'Un set',            sub: 'Con punto de oro. Gana quien lo gane' },
  { valor: 'set_star_point', titulo: 'Un set, star point', sub: 'Igual, pero el deuce se llama así' },
  { valor: 'dos_sets_oro',   titulo: 'Dos de tres',       sub: 'A punto de oro, con súper muerte si hace falta' },
];

/** Cómo se llama un formato guardado. Para resúmenes y tarjetas. */
export function textoDeFormatoDeEtapa(f: FormatoDeEtapa): string {
  return OPCIONES_DE_ETAPA.find((o) => o.valor === f)?.titulo ?? 'Mejor de 3 sets';
}

/**
 * La línea que resume las tres etapas.
 *
 * SE AGRUPA CUANDO COINCIDEN. "Un set en grupos, cuadro y final" se lee de un
 * golpe; "Grupos: un set · Cuadro: un set · Final: un set" obliga a comparar
 * tres cosas para descubrir que son la misma.
 */
export function resumenDeEtapas(
  grupos: FormatoDeEtapa,
  cuadro: FormatoDeEtapa,
  final: FormatoDeEtapa,
): string {
  if (grupos === cuadro && cuadro === final) {
    return `${textoDeFormatoDeEtapa(grupos)} en todo el torneo`;
  }
  if (grupos === cuadro) {
    return `${textoDeFormatoDeEtapa(grupos)} hasta semifinales · `
      + `final a ${textoDeFormatoDeEtapa(final).toLocaleLowerCase('es-MX')}`;
  }
  return `Grupos a ${textoDeFormatoDeEtapa(grupos).toLocaleLowerCase('es-MX')} · `
    + `cuadro a ${textoDeFormatoDeEtapa(cuadro).toLocaleLowerCase('es-MX')} · `
    + `final a ${textoDeFormatoDeEtapa(final).toLocaleLowerCase('es-MX')}`;
}
