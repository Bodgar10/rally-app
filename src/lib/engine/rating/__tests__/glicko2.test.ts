// src/lib/engine/rating/__tests__/glicko2.test.ts
import { updateRating, rateDoublesMatch } from '../glicko2';

describe('Glicko-2 — ejemplo de referencia (Glickman)', () => {
  // Jugador (1500, 200, 0.06) vs 3 oponentes; tau = 0.5.
  // Resultado esperado del paper: rating ≈ 1464.06, RD ≈ 151.52, vol ≈ 0.05999.
  it('reproduce los valores del paper', () => {
    const out = updateRating(
      { rating: 1500, rd: 200, volatility: 0.06 },
      [
        { rating: 1400, rd: 30, score: 1 },
        { rating: 1550, rd: 100, score: 0 },
        { rating: 1700, rd: 300, score: 0 },
      ],
      0.5,
    );
    expect(out.rating).toBeCloseTo(1464.06, 0);
    expect(out.rd).toBeCloseTo(151.52, 0);
    expect(out.volatility).toBeCloseTo(0.05999, 4);
  });

  it('sin partidos solo infla la RD y conserva rating/volatilidad', () => {
    const out = updateRating({ rating: 1500, rd: 200, volatility: 0.06 }, []);
    expect(out.rating).toBe(1500);
    expect(out.rd).toBeGreaterThan(200);
    expect(out.volatility).toBe(0.06);
  });
});

describe('Glicko-2 — dobles', () => {
  it('ambos ganadores suben y ambos perdedores bajan', () => {
    const base = { rating: 1500, rd: 200, volatility: 0.06 };
    const { winners, losers } = rateDoublesMatch(
      [{ ...base }, { ...base }],
      [{ ...base }, { ...base }],
    );
    winners.forEach((w) => expect(w.rating).toBeGreaterThan(1500));
    losers.forEach((l) => expect(l.rating).toBeLessThan(1500));
  });

  it('es determinista', () => {
    const base = { rating: 1500, rd: 200, volatility: 0.06 };
    const a = rateDoublesMatch([{ ...base }, { ...base }], [{ ...base }, { ...base }]);
    const b = rateDoublesMatch([{ ...base }, { ...base }], [{ ...base }, { ...base }]);
    expect(a).toEqual(b);
  });
});
