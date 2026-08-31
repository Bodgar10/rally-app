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
    expect(table[1].points).toBe(2); // 1 victoria; la derrota no suma
    expect(table[2].points).toBe(0); // 0 victorias
  });
});

describe('computeStandings — empate triple resuelto por diferencia de games global', () => {
  it('ciclo A>B>C>A todos a 2 puntos → ordena por diferencia de games', () => {
    const matches = [
      match('1', 'A', 'B', 'A', sets(6, 0)),
      match('2', 'B', 'C', 'B', sets(6, 0)),
      match('3', 'C', 'A', 'C', sets(6, 4)),
    ];
    const table = computeStandings(['A', 'B', 'C'], matches);
    table.forEach((r) => expect(r.points).toBe(2)); // 1 victoria cada una
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

describe('computeStandings — los puntos son victorias x 2', () => {
  it('la derrota jugada no suma: 0 ganados = 0 puntos', () => {
    // El caso que nadie entendía en la app: una pareja con 0 partidos
    // ganados aparecía con 1 punto. Ahora la columna PTS se lee sola.
    const matches = [match('1', 'A', 'B', 'A', sets(6, 3))];
    const table = computeStandings(['A', 'B'], matches);
    const byId = Object.fromEntries(table.map((r) => [r.pairId, r]));
    expect(byId['B'].played).toBe(1);
    expect(byId['B'].won).toBe(0);
    expect(byId['B'].points).toBe(0);
    expect(byId['A'].points).toBe(2);
  });

  it('el tamaño del grupo ya no infla los puntos: 1-2 y 1-1 quedan igual', () => {
    // Grupo de 4: D gana uno de tres.
    const g4 = [
      match('g4-1', 'D', 'E', 'D', sets(6, 4)),
      match('g4-2', 'D', 'F', 'F', sets(4, 6)),
      match('g4-3', 'D', 'G', 'G', sets(3, 6)),
      match('g4-4', 'E', 'F', 'F', sets(2, 6)),
      match('g4-5', 'E', 'G', 'G', sets(4, 6)),
      match('g4-6', 'F', 'G', 'F', sets(6, 4)),
    ];
    // Grupo de 3: H gana uno de dos.
    const g3 = [
      match('g3-1', 'H', 'I', 'H', sets(6, 4)),
      match('g3-2', 'H', 'J', 'J', sets(4, 6)),
      match('g3-3', 'I', 'J', 'J', sets(3, 6)),
    ];
    const t4 = computeStandings(['D', 'E', 'F', 'G'], g4);
    const t3 = computeStandings(['H', 'I', 'J'], g3);
    const D = t4.find((r) => r.pairId === 'D')!;
    const H = t3.find((r) => r.pairId === 'H')!;
    expect(D.played).toBe(3);
    expect(H.played).toBe(2);
    expect(D.points).toBe(H.points); // 2 y 2, pese a jugar uno más
  });
});
