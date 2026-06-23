// src/lib/engine/seeding/__tests__/seeding.test.ts
import { computeSeeding } from '../index';

describe('computeSeeding — serpiente y evitar rematch', () => {
  const qualifiers = [
    { pairId: 'A1', groupId: 'A', rating: 1700 },
    { pairId: 'B1', groupId: 'B', rating: 1650 },
    { pairId: 'A2', groupId: 'A', rating: 1500 },
    { pairId: 'B2', groupId: 'B', rating: 1450 },
  ];

  it('cuadro de 4 sin rematches de grupo en 1.ª ronda', () => {
    const r = computeSeeding(qualifiers, 4);
    expect(r.bracketSize).toBe(4);
    r.matches.forEach((m) => expect(m.isRematch).toBe(false));
    expect(r.rematchesAllowed).toHaveLength(0);
  });

  it('el mejor seed enfrenta al peor', () => {
    const r = computeSeeding(qualifiers, 4);
    const first = r.matches[0];
    const ids = [first.pairAId, first.pairBId];
    expect(ids).toContain('A1'); // seed 1
    expect(ids).toContain('B2'); // seed 4
  });

  it('es determinista', () => {
    expect(computeSeeding(qualifiers, 4)).toEqual(computeSeeding(qualifiers, 4));
  });

  it('lanza error con menos de 2 parejas', () => {
    expect(() => computeSeeding([{ pairId: 'X', groupId: 'A', rating: 1500 }])).toThrow();
  });
});
