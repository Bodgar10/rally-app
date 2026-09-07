/**
 * RALLY · Los torneos que el usuario ARBITRA, resumidos para el dashboard
 *
 * QUÉ LE FALTABA AL JUEZ, Y QUÉ NO
 *   El acceso ya estaba resuelto: la pestaña "Juez" aparece solo si lo es, por
 *   el camino real, va en tercera posición —donde cae el pulgar— y lleva a su
 *   lista de torneos. Eso no es el agujero que tenía el organizador.
 *
 *   Lo que falta es el AVISO. El sábado por la mañana abre la app y la pantalla
 *   no le dice que hay dos partidos jugados esperando marcador: tiene que
 *   entrar a mirar. Y mientras no lo sube, la tabla de esa categoría está
 *   congelada para todos los que la miran desde su teléfono.
 *
 * QUÉ CUENTA COMO PENDIENTE — partidos con la hora ya pasada y sin resultado.
 *   Un partido de mañana sin marcador no es un pendiente, es el calendario. La
 *   frontera es que su hora haya pasado: entonces o se jugó y nadie lo capturó,
 *   o se retrasó, y las dos cosas son suyas.
 *
 * POR QUÉ SE NOMBRA LA CANCHA, Y CUÁNDO NO
 *   "2 partidos por capturar" le dice que hay trabajo; "Cancha 3 · 2 partidos
 *   por capturar" le dice hacia dónde caminar, que es la mitad del trabajo en
 *   un club con ocho canchas. Pero solo si TODOS los pendientes están en la
 *   misma: con dos canchas distintas, nombrar una sería mandarlo al sitio
 *   equivocado la mitad de las veces. Ahí se calla y da el número.
 *
 * Módulo puro: la consulta vive en `useJudgePendientes`. Las reglas de qué se
 * dice y cuándo se calla están en `@/lib/tarjeta-de-torneo`.
 */

import type { AvisoDeTorneo } from './tarjeta-de-torneo';

/** Un partido que el juez todavía no ha capturado. */
export interface PartidoPorCapturar {
  id: string;
  /** `matches.court_label`. Puede faltar: no todo torneo asigna canchas. */
  cancha: string | null;
}

export interface TorneoArbitrado {
  id: string;
  nombre: string;
  inicio: string | null;
  fin: string | null;
  /** El club que lo organiza. Es el contexto que el juez reconoce. */
  organizador: string;
  porCapturar: PartidoPorCapturar[];
}

/**
 * La cancha a la que mandarlo, o `null` si no hay una sola.
 *
 * `null` cubre dos casos que se ven igual desde fuera y se tratan igual: que
 * los pendientes estén repartidos, y que el torneo no asigne canchas.
 */
export function canchaComun(partidos: PartidoPorCapturar[]): string | null {
  if (partidos.length === 0) return null;
  const primera = partidos[0].cancha;
  if (!primera) return null;
  return partidos.every((p) => p.cancha === primera) ? primera : null;
}

/**
 * Qué se le dice de este torneo.
 *
 * Siempre `urge`, cuando hay algo: un partido sin capturar tiene a las dos
 * parejas esperando su marcador y a una categoría entera con la tabla parada.
 * No existe aquí el equivalente al "trabajo normal" del organizador —montar
 * categorías, publicar— porque el juez no monta nada: o hay marcadores que
 * subir, o no hay nada que decirle.
 */
export function queCapturar(t: TorneoArbitrado): AvisoDeTorneo | null {
  const n = t.porCapturar.length;
  if (n === 0) return null;

  const partidos = n === 1 ? '1 partido por capturar' : `${n} partidos por capturar`;
  const cancha = canchaComun(t.porCapturar);

  return { texto: cancha ? `${cancha} · ${partidos}` : partidos, urge: true };
}

/** ¿Hay algo que capturar en alguno de sus torneos? */
export function algoQueCapturar(torneos: TorneoArbitrado[]): boolean {
  return torneos.some((t) => t.porCapturar.length > 0);
}

/**
 * El orden de la lista: donde hay trabajo, arriba.
 *
 * Y a igual trabajo, el que antes empieza. `useJudgeTournaments` ya los
 * devuelve ordenados por cercanía, así que esto solo sube los que urgen sin
 * romper ese orden dentro de cada mitad.
 */
export function ordenarArbitrados(a: TorneoArbitrado, b: TorneoArbitrado): number {
  const ta = a.porCapturar.length > 0 ? 0 : 1;
  const tb = b.porCapturar.length > 0 ? 0 : 1;
  return ta - tb;
}
