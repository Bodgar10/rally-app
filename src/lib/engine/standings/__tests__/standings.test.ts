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

// ───────────────────────────────────────────────────────────────────────────
// EMPATES QUE EL REGLAMENTO NO RESUELVE
//
// El motor los ordenaba igual, con el orden en que llegaban las filas — que en
// producción es el que devuelve Postgres SIN `order by`. En el torneo bb8e137e
// eso coronó a una pareja del grupo B por delante de otras dos idénticas en
// puntos, sets, games y resultado entre ellas. `empateSinResolver` no cambia el
// orden: solo deja de fingir que ese orden significa algo.
// ───────────────────────────────────────────────────────────────────────────

import { computeStandingsDetalle } from '../index';

const setIgual = (a: number, b: number) => ({ gamesA: a, gamesB: b, isSuperTiebreak: false });

const partido = (
  id: string, A: string, B: string, winner: string, gA: number, gB: number,
): MatchResultInput => ({
  matchId: id,
  pairAId: A,
  pairBId: B,
  winnerPairId: winner,
  played: true,
  sets: [setIgual(gA, gB), setIgual(gA, gB)],
});

describe('empateSinResolver — ciclo perfecto de tres', () => {
  // Los tres partidos 6-4 6-4. S→I, I→A, A→S. Las tres quedan en 2 PJ, 1-1,
  // sets 2-2, games 20-20, 2 puntos: idénticas en absolutamente todo.
  const matches = [
    partido('m1', 'S', 'I', 'S', 6, 4),
    partido('m2', 'A', 'I', 'I', 4, 6),
    partido('m3', 'S', 'A', 'A', 4, 6),
  ];

  it('las tres quedan marcadas como empate sin resolver', () => {
    const { filas } = computeStandingsDetalle(['S', 'A', 'I'], matches);
    expect(filas.every((f) => f.empateSinResolver)).toBe(true);
  });

  it('el desempate se reporta como no resuelto', () => {
    const { desempates } = computeStandingsDetalle(['S', 'A', 'I'], matches);
    expect(desempates).toHaveLength(1);
    expect(desempates[0].criterio).toBe('sin_resolver');
    expect(desempates[0].puntos).toBe(2);
    expect(desempates[0].pairIds).toHaveLength(3);
  });

  it('el orden publicado depende del orden de entrada — por eso hace falta el flag', () => {
    const primera = (entrada: string[]) =>
      computeStandingsDetalle(entrada, matches).filas[0].pairId;
    expect(primera(['S', 'A', 'I'])).toBe('S');
    expect(primera(['I', 'A', 'S'])).toBe('I');
    expect(primera(['A', 'I', 'S'])).toBe('A');
  });
});

describe('empateSinResolver — empate perfecto de dos', () => {
  // A y B ganan uno cada una contra la misma tercera, con marcadores gemelos, y
  // el partido entre ellas se reparte igual: nada las separa.
  const matches = [
    partido('m1', 'A', 'C', 'A', 6, 3),
    partido('m2', 'B', 'C', 'B', 6, 3),
    partido('m3', 'A', 'B', 'A', 6, 4),
    partido('m4', 'B', 'A', 'B', 6, 4),
  ];

  it('A y B quedan marcadas; C no', () => {
    const { filas } = computeStandingsDetalle(['A', 'B', 'C'], matches);
    const porId = Object.fromEntries(filas.map((f) => [f.pairId, f]));
    expect(porId['A'].empateSinResolver).toBe(true);
    expect(porId['B'].empateSinResolver).toBe(true);
    expect(porId['C'].empateSinResolver).toBe(false);
  });
});

describe('empateSinResolver — un empate que SÍ se resuelve no se marca', () => {
  // A y B empatan a 2 puntos, pero A ganó el partido entre ellas.
  const matches = [
    partido('m1', 'A', 'B', 'A', 6, 4),
    partido('m2', 'B', 'C', 'B', 6, 0),
    partido('m3', 'A', 'C', 'C', 4, 6),
  ];

  it('nadie queda marcado y se reporta el criterio que decidió', () => {
    const { filas, desempates } = computeStandingsDetalle(['A', 'B', 'C'], matches);
    expect(filas.some((f) => f.empateSinResolver)).toBe(false);
    expect(desempates[0].criterio).not.toBe('sin_resolver');
  });
});
