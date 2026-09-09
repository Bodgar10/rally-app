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
}

export const TIER_OPCIONES: OpcionTier[] = [
  {
    valor:  'major',
    titulo: 'Major',
    sub:    '3+ días · mínimo 24 parejas por categoría · puntos de ranking ×2',
  },
  {
    valor:  'p1',
    titulo: 'P1',
    sub:    '2+ días · mínimo 12 parejas por categoría · puntos de ranking ×1',
  },
  {
    valor:  'p2',
    titulo: 'P2',
    sub:    '1 día · sin mínimo de parejas · puntos de ranking ×0.6',
  },
];

/** El valor de la tarjeta "Tier" del panel del organizador. */
export function resumenDeTier(tier: TierTorneo | string | null | undefined): string {
  const opcion = TIER_OPCIONES.find((o) => o.valor === tier);
  return opcion ? opcion.titulo : 'Sin elegir';
}
