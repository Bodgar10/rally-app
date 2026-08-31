/**
 * RALLY · Lo que cuesta el partido por el 3.er lugar
 *
 * EL INTERRUPTOR NECESITA UN PRECIO
 *   "¿Quieres jugar el 3.er lugar?" es una pregunta que el organizador no puede
 *   responder sin saber qué le cuesta. Y cuesta dos cosas a la vez: partidos y
 *   hora de cierre.
 *
 *   No es un partido por categoría: hacen falta DOS perdedores de semifinal, y
 *   una categoría con 3 clasificados tiene una semifinal que es bye. Y no es
 *   media hora repartida: los ocho caen a la vez, en la transición de semis a
 *   final, cuando las ocho categorías convergen y el día va más cargado.
 */

/** Cuántas categorías pueden jugarlo: las que tienen dos semifinales reales. */
export function categoriasConTercerLugar(clasificadosPorCategoria: number[]): number {
  return clasificadosPorCategoria.filter((c) => c >= 4).length;
}

/**
 * Los minutos que añade al último día, dado el número de canchas.
 *
 * Los partidos caen todos en la misma oleada, así que lo que manda es cuántas
 * tandas de canchas hacen falta: con 8 categorías y 8 canchas es UNA tanda —
 * una hora de partido— y no ocho horas.
 */
export function minutosQueAnade(
  categorias: number,
  canchas: number,
  minutosPorPartido: number,
): number {
  if (categorias <= 0 || canchas <= 0) return 0;
  return Math.ceil(categorias / canchas) * minutosPorPartido;
}

/**
 * La línea que va debajo del interruptor. Dice el precio en los dos ejes.
 */
export function frasePrecioTercerLugar(
  clasificadosPorCategoria: number[],
  canchas: number,
  minutosPorPartido: number,
): string {
  const n = categoriasConTercerLugar(clasificadosPorCategoria);
  if (n === 0) {
    return 'Ninguna categoría llega a dos semifinales, así que no añade partidos.';
  }
  const min = minutosQueAnade(n, canchas, minutosPorPartido);
  const tiempo = min >= 60 && min % 60 === 0
    ? `${min / 60} ${min === 60 ? 'hora' : 'horas'}`
    : `${min} min`;
  return `Añade ${n} ${n === 1 ? 'partido' : 'partidos'} y alarga el último día ` +
         `unos ${tiempo}: se juegan todos a la vez, entre las semifinales y las finales.`;
}
