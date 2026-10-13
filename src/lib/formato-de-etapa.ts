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

/**
 * Cuánto se planifica un partido de ese formato.
 *
 * ► LOS MINUTOS DEPENDEN DEL FORMATO, Y LA APP NO LO SABÍA
 *   Un set se juega en media hora; dos de tres, en una. Son dos campos
 *   independientes —`match_minutes` y el formato de la etapa— así que nada
 *   impedía elegir "un set" y dejar 60 minutos. El planificador reservaría el
 *   doble de cancha por partido y diría que el torneo no cabe cuando cabe de
 *   sobra.
 *
 *   Es un dato del deporte, no una preferencia: "cuando es un solo set son 30
 *   minutos" — las palabras del organizador.
 *
 * ► SE SUGIERE, NO SE IMPONE
 *   Un club con canchas lentas o con cambio de pelotas entre partidos puede
 *   querer 35, y eso lo sabe él y no la app. Lo que no puede pasar es que la
 *   diferencia esté ahí sin que nadie la vea.
 */
export function minutosSugeridos(f: FormatoDeEtapa): number {
  return f === 'set_oro' || f === 'set_star_point' ? 30 : 60;
}

/**
 * El aviso cuando la duración capturada no cuadra con el formato elegido.
 *
 * `null` cuando cuadra, para que la pantalla no tenga que comprobarlo otra vez.
 * Manda la FASE DE GRUPOS: es donde están casi todos los partidos de un
 * torneo, y es la que llena el calendario.
 */
export function avisoDeDuracion(
  grupos: FormatoDeEtapa,
  minutos: number | null | undefined,
): string | null {
  if (minutos == null) return null;
  const toca = minutosSugeridos(grupos);
  if (minutos === toca) return null;

  return minutos > toca
    ? `Los partidos están capturados a ${minutos} min y a este formato se juegan en ${toca}. `
      + 'Con la duración de más el calendario reserva cancha que no se usa y puede decir que no cabe.'
    : `Los partidos están capturados a ${minutos} min y a este formato suelen durar ${toca}. `
      + 'Si se alargan, el día entero se va retrasando.';
}
