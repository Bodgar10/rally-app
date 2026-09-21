/**
 * RALLY · El tier del torneo
 *
 * `tournaments.tier` (migración 068). Es un contrato que el organizador
 * declara al crear el torneo: determina el multiplicador de puntos de
 * ranking que reparte (el motor lo exige — ver `ranking-points/index.ts` —
 * y la Edge Function `compute-ranking-points` corta con 400 `sin_tier` si
 * falta).
 *
 * EL MÍNIMO ES POR CATEGORÍA, NO DEL TORNEO
 *   Un Major con 165 parejas repartidas en 8 categorías puede tener una
 *   categoría con solo 15 — esa categoría sola cae al tier de abajo (P1) al
 *   repartir sus puntos; el resto del torneo sigue siendo Major. La pantalla
 *   lo advierte una vez, no en cada opción.
 *
 * Módulo puro: la pantalla pinta lo que sale de aquí, y esto se prueba sin
 * pantalla ni base.
 */

/** `tournaments.tier` (enum `tournament_tier`). */
export type TierTorneo = 'major' | 'p1' | 'p2';

export interface OpcionTier {
  valor:  TierTorneo;
  titulo: string;
  /** Línea corta debajo de la opción: se entiende sin abrir documentación. */
  sub:    string;
  /**
   * EL PESO VISUAL DE LA OPCIÓN, y no es adorno.
   *
   * Las tres opciones se pintaban iguales —tres rectángulos con un borde gris—
   * y la única diferencia estaba enterrada al final de la línea de abajo: ×2,
   * ×1, ×0.6. Un Major es el torneo grande del calendario y tiene que VERSE
   * como el grande antes de leer nada; si los tres pesan lo mismo en la
   * pantalla, el organizador elige el primero.
   *
   * Es una propiedad del dato y no del componente porque es el tier el que
   * tiene jerarquía: la pantalla solo la obedece.
   */
  destaque: 'maximo' | 'medio' | 'base';
  /** Lo que multiplica los puntos de ranking. Se pinta grande, a la derecha. */
  multiplicador: string;
  /** Cuántos días dura, en una palabra. Para la línea de arriba de la tarjeta. */
  dias: string;
}

export const TIER_OPCIONES: OpcionTier[] = [
  {
    valor:  'major',
    titulo: 'Major',
    sub:    'El torneo grande del calendario. Mínimo 24 parejas por categoría.',
    destaque: 'maximo',
    multiplicador: '×2',
    dias: '3+ días',
  },
  {
    valor:  'p1',
    titulo: 'P1',
    sub:    'Fin de semana completo. Mínimo 12 parejas por categoría.',
    destaque: 'medio',
    multiplicador: '×1',
    dias: '2+ días',
  },
  {
    valor:  'p2',
    titulo: 'P2',
    sub:    'Una jornada. Sin mínimo de parejas.',
    destaque: 'base',
    multiplicador: '×0.6',
    dias: '1 día',
  },
];

/**
 * ► EL TIER DE UN EXPRÉS NO SE PREGUNTA: ES P2 Y PUNTO.
 *
 *   Un exprés es, por definición, una tarde. Un Major exige 3+ días y 24
 *   parejas por categoría; un P1, dos días y 12. Ninguno de los dos CABE en un
 *   exprés, así que ofrecerlos en el formulario es ofrecer dos respuestas
 *   equivocadas y esperar que el organizador acierte — y si acierta mal, el
 *   torneo reparte el doble de puntos de ranking que los que le tocan y eso
 *   contamina la temporada de todos los que jugaron.
 *
 *   La pantalla del exprés no lo pregunta: lo declara y explica por qué.
 */
export const TIER_EXPRES: TierTorneo = 'p2';

/** La opción completa de un tier, para pintarla sin repetir el `find`. */
export function opcionDeTier(tier: TierTorneo): OpcionTier {
  // El `!` es seguro: `TierTorneo` es un enum cerrado y hay una opción por valor.
  return TIER_OPCIONES.find((o) => o.valor === tier)!;
}

/** El valor de la tarjeta "Tier" del panel del organizador. */
export function resumenDeTier(tier: TierTorneo | string | null | undefined): string {
  const opcion = TIER_OPCIONES.find((o) => o.valor === tier);
  return opcion ? opcion.titulo : 'Sin elegir';
}
