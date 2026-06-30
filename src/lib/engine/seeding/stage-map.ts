/** Etiquetas reales del enum match_stage de la BD (NO 'r16'/'r32' del engine). */
export type MatchStage = 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'final';

/** Mapea el tamaño de cuadro (potencia de 2) al stage de esa ronda. Determinista. */
export function stageForBracketSize(bracketSize: number): MatchStage {
  switch (bracketSize) {
    case 32: return 'round_of_32';
    case 16: return 'round_of_16';
    case 8:  return 'quarter';
    case 4:  return 'semi';
    case 2:  return 'final';
    default: throw new Error(`unsupported bracket size: ${bracketSize}`);
  }
}
