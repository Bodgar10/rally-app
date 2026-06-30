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

/** Desempate cross-grupo: puntos → dif. sets → dif. games → games ganados (todo desc). */
function cmpTiebreak(a: QualifierStanding, b: QualifierStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  const setsA = a.setsWon - a.setsLost, setsB = b.setsWon - b.setsLost;
  if (setsB !== setsA) return setsB - setsA;
  const gA = a.gamesWon - a.gamesLost, gB = b.gamesWon - b.gamesLost;
  if (gB !== gA) return gB - gA;
  return b.gamesWon - a.gamesWon;
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
