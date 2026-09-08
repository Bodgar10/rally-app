/**
 * RALLY · El formato del torneo, en una línea
 *
 * QUÉ PRIORIZA, Y POR QUÉ SE CAMBIÓ
 *   La tarjeta "Formato" del panel decía "Sin 3.er lugar". El tercer lugar casi
 *   nunca se juega: es la excepción, y estaba ocupando la única línea de
 *   subtítulo que tiene la tarjeta para decir algo.
 *
 *   Lo que sí aplica a TODOS los partidos del torneo es cómo se juega el tercer
 *   set — súper muerte a diez, o un set completo. Eso es lo que cambia cómo
 *   dura un partido, cuántos caben en el día y qué captura el juez. Va delante.
 *
 * EL TERCER LUGAR, DETRÁS Y SOLO CUANDO LO HAY
 *   "Sin 3.er lugar" es el estado por defecto y no informa a nadie: decirlo es
 *   gastar media línea en confirmar que no pasa nada. Con el tercer lugar
 *   activado sí cambia el último día —ocho partidos más que caen todos a la
 *   vez— así que ahí sí se menciona.
 *
 * Módulo puro: la tarjeta pinta lo que salga de aquí, y esto se prueba sin
 * pantalla ni base.
 */

/** `tournaments.tercer_set_formato`. */
export type FormatoTercerSet = 'super_muerte' | 'set_completo';

/**
 * El subtítulo de la tarjeta Formato.
 *
 * `puntos` solo se usa en súper muerte: un set completo se juega a seis juegos
 * y el número de la columna no dice nada de él.
 */
export function resumenDeFormato(
  formato: FormatoTercerSet | null | undefined,
  puntos: number | null | undefined,
  tercerLugar: boolean,
): string {
  const tercerSet = formato === 'set_completo'
    ? 'Tercer set: set completo'
    // Sin dato todavía, se dice lo que la app aplica por defecto en vez de un
    // hueco: la súper muerte a 10 es lo normal en padel y es lo que el motor
    // asume mientras nadie toque la pantalla.
    : `Tercer set: súper muerte a ${puntos ?? 10}`;

  return tercerLugar ? `${tercerSet} · con 3.er lugar` : tercerSet;
}
