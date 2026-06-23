// src/lib/engine/standings/__tests__/standings.test.ts
import { computeStandings } from '../index';
import type { MatchResultInput, SetScore } from '../../types';

const sets = (a: number, b: number): SetScore[] => [
  { gamesA: a, gamesB: b, isSuperTiebreak: false },
  { gamesA: a, gamesB: b, isSuperTiebreak: false },
];

const match = (
  id: string,
  A: string,
  B: string,
  winner: string,
  s: SetScore[],
): MatchResultInput => ({
  matchId: id,
  pairAId: A,
  pairBId: B,
  winnerPairId: winner,
  sets: s,
  played: true,
});

describe('computeStandings — orden básico por puntos', () => {
  it('A gana ambos, B uno, C ninguno', () => {
    const matches = [
      match('1', 'A', 'B', 'A', sets(6, 3)),
      match('2', 'A', 'C', 'A', sets(6, 2)),
      match('3', 'B', 'C', 'B', sets(6, 4)),
    ];
    const table = computeStandings(['A', 'B', 'C'], matches);
    expect(table.map((r) => r.pairId)).toEqual(['A', 'B', 'C']);
    expect(table[0].position).toBe(1);
    expect(table[0].points).toBe(4); // 2 victorias
    expect(table[1].points).toBe(3); // 1 victoria + 1 derrota jugada
  });
});

describe('computeStandings — empate triple resuelto por diferencia de games global', () => {
  it('ciclo A>B>C>A todos a 3 puntos → ordena por diferencia de games', () => {
    const matches = [
      match('1', 'A', 'B', 'A', sets(6, 0)),
      match('2', 'B', 'C', 'B', sets(6, 0)),
      match('3', 'C', 'A', 'C', sets(6, 4)),
    ];
    const table = computeStandings(['A', 'B', 'C'], matches);
    table.forEach((r) => expect(r.points).toBe(3));
    // dif games: A=+8, B=0, C=-8
    expect(table.map((r) => r.pairId)).toEqual(['A', 'B', 'C']);
  });
});

describe('computeStandings — determinismo', () => {
  it('misma entrada, misma salida', () => {
    const matches = [match('1', 'A', 'B', 'A', sets(6, 3))];
    expect(computeStandings(['A', 'B'], matches)).toEqual(
      computeStandings(['A', 'B'], matches),
    );
  });
});
