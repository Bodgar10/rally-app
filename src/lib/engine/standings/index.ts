// src/lib/engine/standings/index.ts
// Motor de standings + desempates (Doc B §2). Determinista.

import type { MatchResultInput, SetScore, StandingRow } from '../types';

export interface StandingsConfig {
  pointsWin: number;
  /**
   * Puntos por partido JUGADO y PERDIDO. Hoy 0. Ver DEFAULT_STANDINGS_CONFIG.
   * Se conserva como parámetro porque `computeClinch` lo usa como cota
   * inferior de puntos por partido restante.
   */
  pointsPlayedLoss: number;
  /** Cómo cuentan los games del super muerte para el desempate. */
  superTiebreakGames: 'one' | 'score';
  /**
   * Ignorar los partidos en curso, con sets capturados pero sin ganador.
   *
   * Por defecto NO se ignoran: sus sets y games entran en la tabla en cuanto
   * el juez los teclea, que es el punto de la captura set a set. Lo que no
   * entra son los PUNTOS ni los PJ — ver `computeStats`.
   *
   * `computeClinch` lo pone en true, y esa decisión tiene motivo propio: ver
   * la cabecera de ../clinch/index.ts.
   */
  soloTerminados?: boolean;
}

/**
 * 2 por victoria, 0 por derrota. Los puntos son victorias × 2, punto.
 *
 * ► NO LO DEVUELVAS A 1 PENSANDO QUE PREMIA LA PARTICIPACIÓN. Era 1 y hubo
 *   que quitarlo. El punto por presentarse no premia a nadie: se lo lleva
 *   TODO el que juega, así que no distingue entre parejas — lo único que
 *   hace es escalar la columna PTS con el número de partidos del grupo.
 *
 *   Y los grupos no son todos del mismo tamaño. `computeFormat` reparte el
 *   resto (ver `distribute` en ../format/index.ts) y la tabla literal tiene
 *   escritos a mano los mixtos: 10 = [4,3,3], 16 = [4,3,3,3,3],
 *   20 = [4,4,3,3,3,3], 32 = [4,4,3,3,3,3,3,3,3,3]. En todos ellos pasa 1
 *   por grupo y el resto del cuadro se llena con los MEJORES SEGUNDOS, que
 *   `selectQualifiers` compara entre grupos distintos por esta misma columna.
 *
 *   Con 1 por derrota, un 1-2 en grupo de 4 sumaba 4 puntos y un 1-1 en
 *   grupo de 3 sumaba 3: el que perdió dos de tres clasificaba por encima
 *   del que ganó uno de dos, y ni siquiera se llegaban a comparar los sets.
 *   Peor: un 0-3 en grupo de 4 sumaba 3 y EMPATABA con ese 1-1.
 *
 *   Con 0, ambos quedan en 2 puntos y decide el desempate, que son
 *   diferencias y no acumulados. La tabla además se lee sola: el jugador que
 *   ve 2 puntos sabe que ganó un partido. No hacía falta normalizar por
 *   partidos jugados; hacía falta dejar de repartir puntos por jugar.
 */
export const DEFAULT_STANDINGS_CONFIG: StandingsConfig = {
  pointsWin: 2,
  pointsPlayedLoss: 0,
  superTiebreakGames: 'one',
  soloTerminados: false,
};

interface Stats {
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
}

const emptyStats = (): Stats => ({
  played: 0,
  won: 0,
  lost: 0,
  setsWon: 0,
  setsLost: 0,
  gamesWon: 0,
  gamesLost: 0,
  points: 0,
});

/** Lado ganador de un set ('A' | 'B'), considerando super muerte. */
function setWinner(set: SetScore): 'A' | 'B' {
  if (set.isSuperTiebreak && set.tiebreakA != null && set.tiebreakB != null) {
    return set.tiebreakA > set.tiebreakB ? 'A' : 'B';
  }
  return set.gamesA >= set.gamesB ? 'A' : 'B';
}

/** Games que aporta un set a cada lado, según config de super muerte. */
function setGames(
  set: SetScore,
  cfg: StandingsConfig,
): { a: number; b: number } {
  if (set.isSuperTiebreak) {
    if (cfg.superTiebreakGames === 'score' && set.tiebreakA != null && set.tiebreakB != null) {
      return { a: set.tiebreakA, b: set.tiebreakB };
    }
    const w = setWinner(set);
    return { a: w === 'A' ? 1 : 0, b: w === 'B' ? 1 : 0 };
  }
  return { a: set.gamesA, b: set.gamesB };
}

/**
 * Acumula stats de un conjunto de parejas usando SOLO los partidos jugados
 * cuyas dos parejas estén en `pairIds` (permite mini-tablas de desempate).
 */
function computeStats(
  pairIds: string[],
  matches: MatchResultInput[],
  cfg: StandingsConfig,
): Map<string, Stats> {
  const set = new Set(pairIds);
  const stats = new Map<string, Stats>();
  pairIds.forEach((id) => stats.set(id, emptyStats()));

  for (const m of matches) {
    if (!set.has(m.pairAId) || !set.has(m.pairBId)) continue;

    /**
     * UN PARTIDO EN CURSO CUENTA SUS SETS, PERO NO SUS PUNTOS NI SU PJ.
     *
     *   El juez captura set a set: en cuanto termina el primero, la cancha
     *   deja de ser una caja negra durante 75 minutos. Esos games ya se
     *   jugaron y son los que desempatan, así que entran en la tabla.
     *
     *   Los PUNTOS no, porque no hay ganador todavía. Y el PJ tampoco: la
     *   columna dice PARTIDOS JUGADOS, y un partido que sigue en la cancha no
     *   lo está. Si contara, la tabla afirmaría "2 puntos en 2 partidos" de
     *   alguien que va por la mitad del segundo, y se rompería la lectura que
     *   sostiene toda la columna PTS: 2 puntos = una victoria.
     */
    const terminado = m.played && m.winnerPairId != null;
    if (!terminado && (cfg.soloTerminados || m.sets.length === 0)) continue;

    const sa = stats.get(m.pairAId)!;
    const sb = stats.get(m.pairBId)!;
    if (terminado) {
      sa.played++;
      sb.played++;
    }

    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const st of m.sets) {
      if (setWinner(st) === 'A') setsA++;
      else setsB++;
      const g = setGames(st, cfg);
      gamesA += g.a;
      gamesB += g.b;
    }
    sa.setsWon += setsA;
    sa.setsLost += setsB;
    sb.setsWon += setsB;
    sb.setsLost += setsA;
    sa.gamesWon += gamesA;
    sa.gamesLost += gamesB;
    sb.gamesWon += gamesB;
    sb.gamesLost += gamesA;

    if (!terminado) continue;   // sin ganador no hay ni victoria ni puntos

    if (m.winnerPairId === m.pairAId) {
      sa.won++;
      sb.lost++;
      sa.points += cfg.pointsWin;
      sb.points += cfg.pointsPlayedLoss;
    } else {
      sb.won++;
      sa.lost++;
      sb.points += cfg.pointsWin;
      sa.points += cfg.pointsPlayedLoss;
    }
  }
  return stats;
}

const diff = (s: Stats, k: 'sets' | 'games'): number =>
  k === 'sets' ? s.setsWon - s.setsLost : s.gamesWon - s.gamesLost;

/**
 * LA CADENA DE DESEMPATE, EN UN SOLO SITIO.
 *
 * Estaba escrita a mano dentro del `sort` y no se podía ni nombrar ni reusar:
 * la interfaz no tenía cómo decir POR QUÉ el primero es el primero, y nadie
 * podía saber si dos parejas estaban de verdad empatadas en todo o si el orden
 * lo había puesto el `sort`.
 *
 * Orden (Doc B §2): primero la mini-tabla SOLO entre las empatadas —lo que
 * pasó cuando se enfrentaron—, y solo si eso no separa, las diferencias del
 * grupo entero.
 */
export type CriterioDesempate =
  | 'minitabla_puntos'
  | 'minitabla_sets'
  | 'minitabla_games'
  | 'minitabla_games_favor'
  | 'sets'
  | 'games'
  | 'games_favor'
  | 'sin_resolver';

/** Un criterio = un id y el número que compara (mayor gana). */
interface Criterio {
  id: Exclude<CriterioDesempate, 'sin_resolver'>;
  /** `mini` = stats solo entre las empatadas; `full` = stats del grupo entero. */
  valor: (mini: Stats, full: Stats) => number;
}

const CADENA_DESEMPATE: readonly Criterio[] = [
  { id: 'minitabla_puntos',      valor: (m) => m.points },
  { id: 'minitabla_sets',        valor: (m) => diff(m, 'sets') },
  { id: 'minitabla_games',       valor: (m) => diff(m, 'games') },
  { id: 'minitabla_games_favor', valor: (m) => m.gamesWon },
  { id: 'sets',                  valor: (_m, f) => diff(f, 'sets') },
  { id: 'games',                 valor: (_m, f) => diff(f, 'games') },
  { id: 'games_favor',           valor: (_m, f) => f.gamesWon },
];

/**
 * Primer criterio de la cadena que separa a `a` de `b`, o 'sin_resolver'.
 * Devuelve también el signo para poder ordenar con la MISMA función que
 * explica: si se escribieran dos veces, un día dirían cosas distintas.
 */
function compararConCriterio(
  a: string,
  b: string,
  mini: Map<string, Stats>,
  full: Map<string, Stats>,
): { orden: number; criterio: CriterioDesempate } {
  const ma = mini.get(a)!;
  const mb = mini.get(b)!;
  const fa = full.get(a)!;
  const fb = full.get(b)!;
  for (const c of CADENA_DESEMPATE) {
    const va = c.valor(ma, fa);
    const vb = c.valor(mb, fb);
    if (va !== vb) return { orden: vb - va, criterio: c.id };
  }
  return { orden: 0, criterio: 'sin_resolver' };
}

/**
 * Un empate resuelto (o no) dentro de una tabla, para poder explicarlo.
 * `criterio` es el que separó a la PRIMERA del resto: es la respuesta a
 * "¿por qué el #1 es el #1?".
 */
export interface DesempateAplicado {
  /** Puntos en los que empataban. */
  puntos: number;
  /** Parejas implicadas, en el orden final. Siempre 2 o más. */
  pairIds: string[];
  criterio: CriterioDesempate;
}

/**
 * Resuelve un grupo de parejas EMPATADAS en puntos.
 * Mini-tabla entre ellas (criterios 1–5 del subconjunto), luego desempates globales.
 * (Para 2 parejas la mini-tabla equivale al head-to-head directo.)
 *
 * Devuelve además qué parejas quedaron indistinguibles: las que empatan con su
 * vecina en TODA la cadena. Para esas el orden es el de entrada y no significa
 * nada — hace falta un sorteo del organizador.
 */
function resolveTie(
  run: string[],
  matches: MatchResultInput[],
  full: Map<string, Stats>,
  cfg: StandingsConfig,
): { orden: string[]; sinResolver: Set<string>; criterio: CriterioDesempate } {
  if (run.length === 1) {
    return { orden: run, sinResolver: new Set(), criterio: 'sin_resolver' };
  }
  const mini = computeStats(run, matches, cfg);
  const orden = [...run].sort(
    (a, b) => compararConCriterio(a, b, mini, full).orden,
  );

  // Bloques de parejas consecutivas que ni la cadena entera separa.
  const sinResolver = new Set<string>();
  for (let i = 0; i < orden.length - 1; i++) {
    if (compararConCriterio(orden[i], orden[i + 1], mini, full).orden === 0) {
      sinResolver.add(orden[i]);
      sinResolver.add(orden[i + 1]);
    }
  }

  return {
    orden,
    sinResolver,
    criterio: compararConCriterio(orden[0], orden[1], mini, full).criterio,
  };
}

/** Tabla de un grupo + los empates que hubo que resolver para ordenarla. */
export interface StandingsDetalle {
  filas: StandingRow[];
  /** Un elemento por cada corrida de parejas empatadas a puntos (2 o más). */
  desempates: DesempateAplicado[];
}

/**
 * Igual que `computeStandings` pero devolviendo también CÓMO se desempató.
 *
 * Existe porque la tabla sola no se explica: el organizador ve un orden entre
 * tres parejas con los mismos puntos y no tiene forma de saber si lo decidió
 * la mini-tabla, los games, o nada. Con esto la pantalla puede decirlo.
 */
export function computeStandingsDetalle(
  pairIds: string[],
  matches: MatchResultInput[],
  config: StandingsConfig = DEFAULT_STANDINGS_CONFIG,
): StandingsDetalle {
  const full = computeStats(pairIds, matches, config);

  // Orden inicial por puntos (desc), estable por orden de entrada.
  const byPoints = [...pairIds].sort(
    (a, b) => full.get(b)!.points - full.get(a)!.points,
  );

  // Segmentar en corridas de puntos iguales y resolver cada una.
  const ordered: string[] = [];
  const sinResolver = new Set<string>();
  const desempates: DesempateAplicado[] = [];
  let i = 0;
  while (i < byPoints.length) {
    let j = i;
    const p = full.get(byPoints[i])!.points;
    while (j < byPoints.length && full.get(byPoints[j])!.points === p) j++;
    const run = byPoints.slice(i, j);
    const r = resolveTie(run, matches, full, config);
    ordered.push(...r.orden);
    r.sinResolver.forEach((id) => sinResolver.add(id));
    if (run.length > 1) {
      desempates.push({ puntos: p, pairIds: r.orden, criterio: r.criterio });
    }
    i = j;
  }

  const filas = ordered.map((pairId, idx) => {
    const s = full.get(pairId)!;
    return {
      pairId,
      played: s.played,
      won: s.won,
      lost: s.lost,
      setsWon: s.setsWon,
      setsLost: s.setsLost,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      points: s.points,
      position: idx + 1,
      empateSinResolver: sinResolver.has(pairId),
    };
  });

  return { filas, desempates };
}

/**
 * Calcula la tabla de posiciones ordenada de un grupo.
 * `pairIds` = parejas del grupo; `matches` = partidos del grupo (jugados o no).
 *
 * El ORDEN es el mismo de siempre. Lo único nuevo es `empateSinResolver` en
 * cada fila: aditivo, para no romper a nadie que ya consumía esta tabla.
 */
export function computeStandings(
  pairIds: string[],
  matches: MatchResultInput[],
  config: StandingsConfig = DEFAULT_STANDINGS_CONFIG,
): StandingRow[] {
  return computeStandingsDetalle(pairIds, matches, config).filas;
}
