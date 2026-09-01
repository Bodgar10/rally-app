/**
 * RALLY · Qué se puede tocar de los clasificados, y qué no
 *
 * Las tres situaciones de una categoría ya cerrada, en un solo sitio, porque
 * las tienen que compartir la pantalla —que decide qué enseñar— y la RPC
 * `ajustar_clasificados` —que decide qué permitir—. Si divergieran, la
 * pantalla ofrecería un botón que el servidor rechaza, o al revés.
 *
 * 'bloqueada' NO es una advertencia fuerte: es un no. Borrar partidos que dos
 * parejas jugaron de verdad, para arreglar una configuración, destruye el
 * único dato que el sistema no puede recalcular — lo que pasó en la cancha.
 */

export type SituacionCuadro = 'libre' | 'resembrar' | 'bloqueada';

/**
 * @param partidosDeCuadro partidos de eliminatoria que existen hoy
 * @param conResultado     de esos, cuántos ya tienen ganador
 */
export function situacionDeCuadro(
  partidosDeCuadro: number,
  conResultado: number,
): SituacionCuadro {
  if (conResultado > 0) return 'bloqueada';
  if (partidosDeCuadro > 0) return 'resembrar';
  return 'libre';
}
