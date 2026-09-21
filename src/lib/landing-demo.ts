/**
 * RALLY · Los datos de la landing.
 *
 * ► LA DEMO CORRE EL MOTOR DE VERDAD, NO UNA IMITACIÓN
 *   La tabla que se mueve en la portada no tiene los puestos escritos a mano:
 *   sale de `computeTablaExpres`, el mismo que ordena la tabla de un torneo
 *   real. Cada paso añade un marcador y se recalcula entera.
 *
 *   Es más trabajo que pintar tres filas bonitas y vale la pena por dos
 *   motivos. El primero es que NO PUEDE MENTIR: si el orden de la landing se
 *   despegara del de la app, sería porque el motor cambió, y entonces la
 *   landing cambia con él. El segundo es que el desempate raro —dos parejas
 *   con el mismo saldo, separadas por el partido entre ellas— sale solo,
 *   sin guionizarlo.
 *
 * ► LOS NOMBRES SON INVENTADOS Y ESO SE NOTA
 *   Parejas de ejemplo, no gente real. Poner nombres de jugadores de verdad
 *   en una portada pública es usar a alguien de escaparate sin preguntarle.
 *
 * Módulo puro: se prueba sin pantalla ni base.
 */

import { computeTablaExpres, type ResultadoSuma6 } from '@/lib/engine/expres';

/** Ocho parejas, como un grupo de exprés de verdad. */
export const PAREJAS_DEMO: readonly { id: string; nombre: string }[] = [
  { id: 'p1', nombre: 'Rivera / Solís' },
  { id: 'p2', nombre: 'Cantú / Mejía' },
  { id: 'p3', nombre: 'Del Valle / Otero' },
  { id: 'p4', nombre: 'Barrera / Quintana' },
  { id: 'p5', nombre: 'Escobar / Lira' },
  { id: 'p6', nombre: 'Navarro / Peña' },
  { id: 'p7', nombre: 'Alcántara / Vega' },
  { id: 'p8', nombre: 'Fuentes / Zamora' },
] as const;

/**
 * El guion: los marcadores en el orden en que se "capturan".
 *
 * Está elegido para que al final haya un empate a saldo entre dos parejas que
 * SÍ se enfrentaron —la 3 y la 5, que empataron 3-3 la primera ronda— porque
 * ese es el caso que hace falta enseñar: dos iguales y la tabla explicando en
 * qué se separan. Si se cambia un número, el motor recalcula y la historia se
 * cuenta sola; lo que no se puede es escribir el resultado a mano.
 */
const GUION: readonly ResultadoSuma6[] = [
  { matchId: 'm1', pairAId: 'p1', pairBId: 'p2', gamesA: 4, gamesB: 2 },
  { matchId: 'm2', pairAId: 'p3', pairBId: 'p5', gamesA: 3, gamesB: 3 },
  { matchId: 'm3', pairAId: 'p4', pairBId: 'p6', gamesA: 6, gamesB: 0 },
  { matchId: 'm4', pairAId: 'p7', pairBId: 'p8', gamesA: 2, gamesB: 4 },
  { matchId: 'm5', pairAId: 'p1', pairBId: 'p4', gamesA: 3, gamesB: 3 },
  { matchId: 'm6', pairAId: 'p3', pairBId: 'p8', gamesA: 5, gamesB: 1 },
  { matchId: 'm7', pairAId: 'p5', pairBId: 'p2', gamesA: 5, gamesB: 1 },
  { matchId: 'm8', pairAId: 'p6', pairBId: 'p7', gamesA: 4, gamesB: 2 },
] as const;

/** Cuántos pasos tiene la animación, sin contar el estado inicial. */
export const PASOS_DEMO = GUION.length;

export interface FilaDemo {
  pairId: string;
  nombre: string;
  posicion: number;
  jugados: number;
  balance: number;
  /** Está en zona de clasificación. */
  dentro: boolean;
  /** Empataba a saldo y la separó el partido entre ellas. */
  porDirecto: boolean;
}

const NOMBRE = new Map(PAREJAS_DEMO.map((p) => [p.id, p.nombre]));

/**
 * La tabla después de `paso` marcadores.
 *
 * `paso` se recorta al rango válido en vez de lanzar: esto alimenta una
 * animación, y una portada que revienta porque un temporizador se pasó de
 * frenada es peor que una que se queda en el último cuadro.
 */
export function tablaEnElPaso(paso: number, clasifican = 4): FilaDemo[] {
  const n = Math.max(0, Math.min(Math.trunc(paso), GUION.length));
  const pairIds = PAREJAS_DEMO.map((p) => p.id);

  // Todos los partidos existen siempre; los que aún no "se jugaron" van en
  // null, que es exactamente como están en la base antes de capturarse.
  const resultados: ResultadoSuma6[] = GUION.map((r, i) =>
    i < n ? r : { ...r, gamesA: null, gamesB: null },
  );

  const tabla = computeTablaExpres({ pairIds, resultados, clasifican });

  return tabla.filas.map((f) => ({
    pairId: f.pairId,
    nombre: NOMBRE.get(f.pairId) ?? '—',
    posicion: f.posicion,
    jugados: f.jugados,
    balance: f.balance,
    dentro: f.posicion <= clasifican,
    porDirecto: f.criterio === 'directo',
  }));
}

// ── La ficha del rival ──────────────────────────────────────────────────────

/**
 * El caso que la ficha existe para avisar: un zurdo jugando el revés.
 *
 * En pádel es la configuración más temida — su derecha apunta al centro y
 * cierra el cruzado que la mayoría busca. Quien lleva años lo ve en el
 * calentamiento; quien lleva uno, no.
 */
export const RIVAL_DEMO = {
  pareja: 'Del Valle / Otero',
  jugadores: [
    { nombre: 'Andrés Del Valle', mano: 'Diestro', lado: 'Drive' },
    { nombre: 'Marco Otero', mano: 'Zurdo', lado: 'Revés' },
  ],
  aviso: 'Marco Otero es zurdo y juega el revés: su derecha te cierra el cruzado.',
  historial: 'Jugaron 2 veces. 1-1.',
} as const;

// ── La tarde, armada sola ───────────────────────────────────────────────────

export const AGENDA_DEMO = [
  { hora: '12:00', cancha: 'Cancha 1', grupo: 'A', ronda: 'Ronda 1' },
  { hora: '12:00', cancha: 'Cancha 2', grupo: 'A', ronda: 'Ronda 1' },
  { hora: '12:30', cancha: 'Cancha 1', grupo: 'B', ronda: 'Ronda 1' },
  { hora: '12:30', cancha: 'Cancha 2', grupo: 'B', ronda: 'Ronda 1' },
  { hora: '13:00', cancha: 'Cancha 1', grupo: 'A', ronda: 'Ronda 2' },
] as const;
