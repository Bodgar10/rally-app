// src/lib/engine/ranking-points/__tests__/ranking-points.test.ts
import { computeRankingPoints } from '../index';

describe('computeRankingPoints — Doc B §5', () => {
  it('finalista en cuadro de 16 con 2 victorias de grupo', () => {
    // 2*50 + 100 (clasificar) + 650 (finalista) = 850; multiplicador 9-16 = 1.0
    const pts = computeRankingPoints({
      groupWins: 2,
      qualified: true,
      furthestRound: 'final',
      drawSize: 16,
      roundRobinOnly: false,
      wonRoundRobin: false,
    });
    expect(pts).toBe(850);
  });

  it('campeón en cuadro de 24 con 3 victorias de grupo aplica multiplicador 1.3', () => {
    // (3*50 + 100 + 1000) * 1.3 = 1250 * 1.3 = 1625
    const pts = computeRankingPoints({
      groupWins: 3,
      qualified: true,
      furthestRound: 'champion',
      drawSize: 24,
      roundRobinOnly: false,
      wonRoundRobin: false,
    });
    expect(pts).toBe(1625);
  });

  it('round-robin only: campeón con 4 victorias en cuadro chico (≤8) ×0.7', () => {
    // (4*50 + 1000) * 0.7 = 1200 * 0.7 = 840
    const pts = computeRankingPoints({
      groupWins: 4,
      qualified: false,
      furthestRound: 'none',
      drawSize: 6,
      roundRobinOnly: true,
      wonRoundRobin: true,
    });
    expect(pts).toBe(840);
  });

  it('eliminado en grupos no suma bono de clasificación', () => {
    // 1*50 * 1.0 = 50
    const pts = computeRankingPoints({
      groupWins: 1,
      qualified: false,
      furthestRound: 'none',
      drawSize: 12,
      roundRobinOnly: false,
      wonRoundRobin: false,
    });
    expect(pts).toBe(50);
  });
});
