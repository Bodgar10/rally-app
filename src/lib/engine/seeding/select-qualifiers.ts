import type { SeedInput } from './index'; // ajustar si SeedInput vive en otro módulo

/** Fila de group_standings necesaria para seleccionar y ordenar clasificados. */
export type QualifierStanding = {
  pairId: string;
  groupId: string;
  position: number;   // 1-based dentro del grupo
  points: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
};

/**
 * Desempate CROSS-GRUPO: puntos → dif. sets → dif. games → % de games → pairId.
 *
 * OJO CON LO QUE SE COMPARA AQUÍ. Esta función mide parejas de grupos
 * DISTINTOS, que pueden haber jugado distinto número de partidos: los planes
 * con repesca y tamaños mixtos (10 = [4,3,3], 16 = [4,3,3,3,3],
 * 20 = [4,4,3,3,3,3], 32 = [4,4,3,3,3,3,3,3,3,3]) son justamente los que
 * llenan el cuadro con los mejores segundos. Cualquier criterio ACUMULADO
 * premia aquí al que jugó más, no al que jugó mejor.
 *
 * Por eso los puntos son victorias × 2 (ver DEFAULT_STANDINGS_CONFIG) y los
 * criterios 2 y 3 son diferencias.
 *
 * El criterio 4 ERA `gamesWon` a secas — un acumulado, el mismo defecto que
 * se acababa de quitar de los puntos, escondido un escalón más abajo. Ahora
 * es la PROPORCIÓN de games ganados sobre los jugados, comparada por
 * multiplicación cruzada para no meter flotantes en un motor determinista.
 * Una pareja sin games jugados (grupo sin capturar) va al fondo de este
 * criterio en vez de dividir entre cero.
 *
 * El último criterio es `pairId`. No es deportivo y no pretende serlo: sin él
 * la comparación no es un orden total, y estas filas llegan de un `select` de
 * Postgres SIN `order by` (ver generate-bracket/index.ts), así que un empate
 * perfecto sembraba el cuadro según el orden en que la base devolviera las
 * filas. Empate perfecto = el organizador debería sortear; mientras eso no
 * exista, que al menos sea reproducible y no dependa del planificador de
 * consultas.
 */
function cmpTiebreak(a: QualifierStanding, b: QualifierStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  const setsA = a.setsWon - a.setsLost, setsB = b.setsWon - b.setsLost;
  if (setsB !== setsA) return setsB - setsA;
  const gA = a.gamesWon - a.gamesLost, gB = b.gamesWon - b.gamesLost;
  if (gB !== gA) return gB - gA;
  // % de games ganados: a.won/a.total vs b.won/b.total, sin dividir.
  const totalA = a.gamesWon + a.gamesLost, totalB = b.gamesWon + b.gamesLost;
  if (totalA === 0 || totalB === 0) {
    if (totalA !== totalB) return totalA === 0 ? 1 : -1;
  } else {
    const cruzada = b.gamesWon * totalA - a.gamesWon * totalB;
    if (cruzada !== 0) return cruzada;
  }
  return a.pairId < b.pairId ? -1 : a.pairId > b.pairId ? 1 : 0;
}

/**
 * Selecciona los clasificados (directos + mejores extra) y devuelve SeedInput[]
 * con un rating SINTÉTICO derivado del resultado de grupo (NO del Glicko):
 * mejor posición de grupo → mejor seed; dentro de misma posición desempata cmpTiebreak.
 *
 * Determinista. No conoce Glicko ni BD.
 */
export function selectQualifiers(
  standings: QualifierStanding[],
  advancePerGroup: number,
  bestExtraQualifiers: number,
): SeedInput[] {
  if (advancePerGroup < 1) throw new Error('advancePerGroup must be >= 1');

  // 1) Directos: position <= advancePerGroup
  const directos = standings.filter((s) => s.position <= advancePerGroup);

  // 2) Mejores extra: entre los position === advancePerGroup+1 de todos los grupos
  let extra: QualifierStanding[] = [];
  if (bestExtraQualifiers > 0) {
    extra = standings
      .filter((s) => s.position === advancePerGroup + 1)
      .sort(cmpTiebreak)
      .slice(0, bestExtraQualifiers);
  }

  // 3) Orden global de siembra: primero por posición de grupo (asc), luego por desempate (desc)
  const ordered = [...directos, ...extra].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return cmpTiebreak(a, b);
  });

  // 4) Rating sintético estrictamente decreciente (mayor = mejor seed) = tournament_rank
  const n = ordered.length;
  return ordered.map((s, i) => ({
    pairId: s.pairId,
    groupId: s.groupId,
    rating: (n - i) * 100, // separación amplia y determinista; computeSeeding solo usa el orden
  }));
}
