// src/lib/engine/ranking-points/__tests__/ranking-points.test.ts
import { computeRankingPoints } from '../index';

describe('computeRankingPoints — Doc B §5', () => {
  it('finalista en cuadro de 16 con 2 victorias de grupo', () => {
    // 2*50 + 100 (clasificar) + 650 (finalista) = 850; tier p1 (24 parejas) = ×1.0
    const pts = computeRankingPoints({
      groupWins: 2,
      qualified: true,
      furthestRound: 'final',
      drawSize: 16,
      roundRobinOnly: false,
      wonRoundRobin: false,
      tier: 'p1',
      parejasEnCategoria: 24,
    });
    expect(pts).toBe(850);
  });

  it('campeón major con 24 parejas aplica multiplicador ×2.0', () => {
    // (3*50 + 100 + 1000) * 2.0 = 1250 * 2.0 = 2500
    const pts = computeRankingPoints({
      groupWins: 3,
      qualified: true,
      furthestRound: 'champion',
      drawSize: 24,
      roundRobinOnly: false,
      wonRoundRobin: false,
      tier: 'major',
      parejasEnCategoria: 24,
    });
    expect(pts).toBe(2500);
  });

  it('round-robin only: campeón p2 con 4 victorias en cuadro chico ×0.6', () => {
    // (4*50 + 1000) * 0.6 = 1200 * 0.6 = 720
    const pts = computeRankingPoints({
      groupWins: 4,
      qualified: false,
      furthestRound: 'none',
      drawSize: 6,
      roundRobinOnly: true,
      wonRoundRobin: true,
      tier: 'p2',
      parejasEnCategoria: 6,
    });
    expect(pts).toBe(720);
  });

  it('eliminado en grupos no suma bono de clasificación', () => {
    // 1*50 * 1.0 (p1, 12 parejas) = 50
    const pts = computeRankingPoints({
      groupWins: 1,
      qualified: false,
      furthestRound: 'none',
      drawSize: 12,
      roundRobinOnly: false,
      wonRoundRobin: false,
      tier: 'p1',
      parejasEnCategoria: 12,
    });
    expect(pts).toBe(50);
  });

  it('major con 24 parejas → ×2.0', () => {
    // (1*50) * 2.0 = 100
    const pts = computeRankingPoints({
      groupWins: 1,
      qualified: false,
      furthestRound: 'none',
      drawSize: 8,
      roundRobinOnly: false,
      wonRoundRobin: false,
      tier: 'major',
      parejasEnCategoria: 24,
    });
    expect(pts).toBe(100);
  });

  it('major declarado con 20 parejas → cae a p1, ×1.0', () => {
    // (1*50) * 1.0 = 50
    const pts = computeRankingPoints({
      groupWins: 1,
      qualified: false,
      furthestRound: 'none',
      drawSize: 8,
      roundRobinOnly: false,
      wonRoundRobin: false,
      tier: 'major',
      parejasEnCategoria: 20,
    });
    expect(pts).toBe(50);
  });

  it('major declarado con 9 parejas → cae a p2, ×0.6', () => {
    // (1*50) * 0.6 = 30
    const pts = computeRankingPoints({
      groupWins: 1,
      qualified: false,
      furthestRound: 'none',
      drawSize: 8,
      roundRobinOnly: false,
      wonRoundRobin: false,
      tier: 'major',
      parejasEnCategoria: 9,
    });
    expect(pts).toBe(30);
  });

  it('p1 con 12 parejas → ×1.0', () => {
    // (1*50) * 1.0 = 50
    const pts = computeRankingPoints({
      groupWins: 1,
      qualified: false,
      furthestRound: 'none',
      drawSize: 8,
      roundRobinOnly: false,
      wonRoundRobin: false,
      tier: 'p1',
      parejasEnCategoria: 12,
    });
    expect(pts).toBe(50);
  });

  it('p1 con 11 parejas → cae a p2, ×0.6', () => {
    // (1*50) * 0.6 = 30
    const pts = computeRankingPoints({
      groupWins: 1,
      qualified: false,
      furthestRound: 'none',
      drawSize: 8,
      roundRobinOnly: false,
      wonRoundRobin: false,
      tier: 'p1',
      parejasEnCategoria: 11,
    });
    expect(pts).toBe(30);
  });

  it('sin tier → throw', () => {
    expect(() =>
      computeRankingPoints({
        groupWins: 1,
        qualified: false,
        furthestRound: 'none',
        drawSize: 8,
        roundRobinOnly: false,
        wonRoundRobin: false,
        parejasEnCategoria: 12,
      } as any),
    ).toThrow('tier es obligatorio: viene de tournaments.tier');
  });

  it('parejasEnCategoria = 0 → throw', () => {
    expect(() =>
      computeRankingPoints({
        groupWins: 1,
        qualified: false,
        furthestRound: 'none',
        drawSize: 8,
        roundRobinOnly: false,
        wonRoundRobin: false,
        tier: 'p1',
        parejasEnCategoria: 0,
      }),
    ).toThrow('parejasEnCategoria es obligatorio');
  });
});
