/**
 * RALLY · Dónde estás en el ranking y qué te falta para subir.
 *
 * "VAS 8º" NO ES UNA META, "TE FALTAN 60 PUNTOS" SÍ
 *   Un ranking a secas es una foto: se mira una vez y no cambia nada. Lo que
 *   convierte la foto en un motivo para inscribirse al domingo siguiente es la
 *   distancia — y la distancia solo sirve si va acompañada de qué hacer para
 *   recorrerla.
 *
 *   Por eso esto no devuelve una posición: devuelve un hueco, a quién, y
 *   cuántos puntos daría un torneo. Las tres cosas juntas o ninguna.
 *
 * ► MIRA HACIA ARRIBA Y HACIA ABAJO
 *   La app le decía al jugador a cuánto estaba del de delante. Faltaba lo otro,
 *   que motiva igual o más: quién lo persigue y a cuánto. Un 8º que sabe que el
 *   9º está a 20 puntos tiene una razón para jugar que no tenía.
 *
 * LOS HITOS SON REDONDOS PORQUE ASÍ SE PIENSA
 *   Nadie aspira al puesto 7: se aspira al top 10, al top 5, al podio y al
 *   primero. Se da el más cercano que todavía no ha alcanzado — el siguiente
 *   escalón, no el más lejano ni el ya conseguido.
 */

import { computeRankingPoints } from '@/lib/engine/ranking-points';

export interface FilaRanking {
  player_id: string;
  points: number;
  position: number;
}

export interface Hito {
  /** 'top 10', 'top 5', 'el podio', 'el primer puesto'. */
  nombre: string;
  posicion: number;
  faltan: number;
}

export interface Proyeccion {
  posicion: number;
  puntos: number;
  /** El de delante y lo que le falta para pasarlo. null si es primero. */
  siguiente: { posicion: number; faltan: number } | null;
  /** El de detrás y a cuánto viene. null si es último. */
  persigue: { posicion: number; a: number } | null;
  hito: Hito | null;
}

const HITOS: { limite: number; nombre: string }[] = [
  { limite: 1, nombre: 'el primer puesto' },
  { limite: 3, nombre: 'el podio' },
  { limite: 5, nombre: 'el top 5' },
  { limite: 10, nombre: 'el top 10' },
];

/**
 * Sitúa al jugador en la tabla de su división.
 *
 * `tabla` tiene que venir COMPLETA y ordenada por posición: con media tabla,
 * "el de delante" sería otro y la distancia estaría mal. Devuelve null si el
 * jugador no está en ella, que es lo que pasa hasta que puntúa por primera vez.
 */
export function proyectarRanking(tabla: readonly FilaRanking[], playerId: string): Proyeccion | null {
  const orden = [...tabla].sort((a, b) => a.position - b.position);
  const i = orden.findIndex((f) => f.player_id === playerId);
  if (i === -1) return null;

  const yo = orden[i];

  // ► EL DE DELANTE ES EL PRIMERO QUE ESTÁ DE VERDAD DELANTE.
  //
  //   La posición es un `rank()`: los empatados comparten puesto. Los dos de
  //   una pareja campeona son 1.º y 1.º con los MISMOS puntos, y coger la fila
  //   de al lado por índice hacía que la app le dijera a uno "te falta 1 punto
  //   para alcanzar al 1.º" — su compañero, con quien está empatado, en un
  //   puesto que ya es el suyo.
  //
  //   Se salta a todo el que comparta puesto, arriba y abajo. Un empate no es
  //   una distancia que recorrer.
  const arriba = orden.slice(0, i).reverse().find((f) => f.position < yo.position) ?? null;
  const abajo = orden.slice(i + 1).find((f) => f.position > yo.position) ?? null;

  // El hito más cercano que todavía NO ha alcanzado: el siguiente escalón.
  const hito = HITOS.filter((h) => yo.position > h.limite)
    .map((h) => {
      const enEsePuesto = orden.find((f) => f.position === h.limite);
      return enEsePuesto
        ? { nombre: h.nombre, posicion: h.limite, faltan: Math.max(enEsePuesto.points - yo.points + 1, 1) }
        : null;
    })
    .filter((h): h is Hito => h !== null)
    .sort((a, b) => a.faltan - b.faltan)[0] ?? null;

  return {
    posicion: yo.position,
    puntos: yo.points,
    siguiente: arriba ? { posicion: arriba.position, faltan: Math.max(arriba.points - yo.points + 1, 1) } : null,
    persigue: abajo ? { posicion: abajo.position, a: Math.max(yo.points - abajo.points, 0) } : null,
    hito,
  };
}

/**
 * Cuántos puntos daría ganar un torneo así.
 *
 * Es la línea que convierte el hueco en una acción: "te faltan 340 y ganar un
 * P2 de 16 parejas te daría 1.750". Sin esto, la distancia es un número sin
 * escala — el jugador no sabe si 340 son dos torneos o veinte.
 */
export function puntosDeGanarUnTorneo(
  tier: 'major' | 'p1' | 'p2' = 'p2',
  parejas = 16,
): number {
  return computeRankingPoints({
    // Campeón invicto: 3 de grupo, pasa, y gana la final.
    groupWins: 3,
    qualified: true,
    furthestRound: 'champion',
    drawSize: parejas,
    roundRobinOnly: false,
    wonRoundRobin: false,
    tier,
    parejasEnCategoria: parejas,
  });
}

// ── Cómo se cuenta ──────────────────────────────────────────────────────────

export function textoDePosicion(p: Proyeccion): string {
  return `Vas ${p.posicion}º con ${p.puntos.toLocaleString('es-MX')} puntos.`;
}

/** La meta. Lo primero que hay que leer después de la posición. */
export function textoDelHito(p: Proyeccion): string | null {
  if (!p.hito) return p.posicion === 1 ? 'Eres el número uno de tu división.' : null;
  return `Te faltan ${p.hito.faltan.toLocaleString('es-MX')} puntos para ${p.hito.nombre}.`;
}

/** Qué hacer con esa distancia. Sin esto, el número no tiene escala. */
export function textoDeLoQueDaUnTorneo(p: Proyeccion, puntosPorTorneo: number): string | null {
  if (!p.hito || puntosPorTorneo <= 0) return null;
  const torneos = Math.ceil(p.hito.faltan / puntosPorTorneo);
  if (torneos === 1) return `Con ganar un torneo lo alcanzas.`;
  if (torneos <= 4) return `Ganando ${torneos} torneos lo alcanzas.`;
  return `Ganar un torneo te daría unos ${puntosPorTorneo.toLocaleString('es-MX')} puntos.`;
}

/** Quién te persigue. Motiva tanto como la meta de arriba. */
export function textoDeQuienPersigue(p: Proyeccion): string | null {
  if (!p.persigue) return null;
  if (p.persigue.a === 0) return `El ${p.persigue.posicion}º está empatado contigo.`;
  return `El ${p.persigue.posicion}º está a ${p.persigue.a.toLocaleString('es-MX')} puntos de ti.`;
}
