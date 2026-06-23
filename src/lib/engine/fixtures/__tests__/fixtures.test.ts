// src/lib/engine/fixtures/__tests__/fixtures.test.ts
import { generateRoundRobin, expectedMatchCount } from '../index';

const key = (a: string, b: string) => [a, b].sort().join('-');

describe('generateRoundRobin — completitud', () => {
  it('grupo de 4 → 6 partidos, todos los pares únicos', () => {
    const f = generateRoundRobin(['A', 'B', 'C', 'D']);
    expect(f).toHaveLength(expectedMatchCount(4)); // 6
    const pairs = new Set(f.map((m) => key(m.pairAId, m.pairBId)));
    expect(pairs.size).toBe(6);
  });

  it('grupo de 3 (impar) → 3 partidos', () => {
    const f = generateRoundRobin(['A', 'B', 'C']);
    expect(f).toHaveLength(expectedMatchCount(3)); // 3
  });

  it('ninguna pareja juega dos veces en la misma ronda', () => {
    const f = generateRoundRobin(['A', 'B', 'C', 'D', 'E', 'F']);
    const byRound = new Map<number, string[]>();
    f.forEach((m) => {
      const arr = byRound.get(m.round) ?? [];
      arr.push(m.pairAId, m.pairBId);
      byRound.set(m.round, arr);
    });
    byRound.forEach((parejas) => {
      expect(new Set(parejas).size).toBe(parejas.length);
    });
  });

  it('es determinista', () => {
    expect(generateRoundRobin(['A', 'B', 'C', 'D'])).toEqual(
      generateRoundRobin(['A', 'B', 'C', 'D']),
    );
  });

  it('lanza error con menos de 2 parejas', () => {
    expect(() => generateRoundRobin(['A'])).toThrow();
  });
});
