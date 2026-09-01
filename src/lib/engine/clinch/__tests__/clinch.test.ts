// src/lib/engine/clinch/__tests__/clinch.test.ts
import { computeClinch, type ClinchGroup } from '../index';
import type { MatchResultInput, SetScore } from '../../types';

const twoNil = (winnerIsA: boolean): SetScore[] => [
  { gamesA: winnerIsA ? 6 : 0, gamesB: winnerIsA ? 0 : 6, isSuperTiebreak: false },
  { gamesA: winnerIsA ? 6 : 0, gamesB: winnerIsA ? 0 : 6, isSuperTiebreak: false },
];

const played = (id: string, A: string, B: string, winner: string): MatchResultInput => ({
  matchId: id,
  pairAId: A,
  pairBId: B,
  winnerPairId: winner,
  sets: twoNil(winner === A),
  played: true,
});

/** Partido jugado con marcador concreto (para los ciclos perfectos). */
const conMarcador = (
  id: string, A: string, B: string, winner: string, gA: number, gB: number,
): MatchResultInput => ({
  matchId: id,
  pairAId: A,
  pairBId: B,
  winnerPairId: winner,
  sets: [
    { gamesA: gA, gamesB: gB, isSuperTiebreak: false },
    { gamesA: gA, gamesB: gB, isSuperTiebreak: false },
  ],
  played: true,
});

const pending = (id: string, A: string, B: string): MatchResultInput => ({
  matchId: id,
  pairAId: A,
  pairBId: B,
  winnerPairId: null,
  sets: [],
  played: false,
});

const grupo = (groupId: string, pairIds: string[], matches: MatchResultInput[]): ClinchGroup =>
  ({ groupId, pairIds, matches });

/** Grupo de 3 sin jugar: los tres partidos pendientes. */
const grupoVirgen = (groupId: string, [x, y, z]: string[]): ClinchGroup =>
  grupo(groupId, [x, y, z], [
    pending(`${groupId}-1`, x, y),
    pending(`${groupId}-2`, x, z),
    pending(`${groupId}-3`, y, z),
  ]);

const porPareja = (res: ReturnType<typeof computeClinch>) =>
  Object.fromEntries(res.map((r) => [r.pairId, r]));

describe('computeClinch — top 2 con un partido pendiente', () => {
  const g = grupo('G', ['A', 'B', 'C'], [
    played('m1', 'A', 'B', 'A'),
    played('m2', 'A', 'C', 'A'),
    pending('m3', 'B', 'C'),
  ]);
  const byId = porPareja(
    computeClinch({ groups: [g], advancePerGroup: 2, bestExtraQualifiers: 0 }),
  );

  it('A ya clasificó (clinched)', () => {
    expect(byId['A'].status).toBe('clinched');
  });
  it('B y C dependen del partido pendiente (alive)', () => {
    expect(byId['B'].status).toBe('alive');
    expect(byId['C'].status).toBe('alive');
    expect(byId['B'].dependsOnMatchIds).toContain('m3');
  });
});

describe('computeClinch — solo top 1 y SIN repesca elimina a los demás', () => {
  const g = grupo('G', ['A', 'B', 'C'], [
    played('m1', 'A', 'B', 'A'),
    played('m2', 'A', 'C', 'A'),
    played('m3', 'B', 'C', 'B'),
  ]);
  const byId = porPareja(
    computeClinch({ groups: [g], advancePerGroup: 1, bestExtraQualifiers: 0 }),
  );

  it('A clinched, B y C eliminated', () => {
    expect(byId['A'].status).toBe('clinched');
    expect(byId['B'].status).toBe('eliminated');
    expect(byId['C'].status).toBe('eliminated');
  });
});

describe('computeClinch — el dato que falta truena, no se asume', () => {
  const g = grupo('G', ['A', 'B'], [played('m1', 'A', 'B', 'A')]);

  it('sin bestExtraQualifiers lanza y nombra el campo', () => {
    expect(() =>
      // @ts-expect-error: exactamente el error que se quiere impedir en runtime
      computeClinch({ groups: [g], advancePerGroup: 1 }),
    ).toThrow(/bestExtraQualifiers/);
  });

  it('bestExtraQualifiers null lanza (no cae a 0)', () => {
    expect(() =>
      computeClinch({ groups: [g], advancePerGroup: 1, bestExtraQualifiers: null as never }),
    ).toThrow(/bestExtraQualifiers/);
  });

  it('sin advancePerGroup lanza y nombra el campo', () => {
    expect(() =>
      computeClinch({ groups: [g], advancePerGroup: undefined as never, bestExtraQualifiers: 3 }),
    ).toThrow(/advancePerGroup/);
  });

  it('bestExtraQualifiers = 0 es válido: es un dato, no un hueco', () => {
    expect(() =>
      computeClinch({ groups: [g], advancePerGroup: 1, bestExtraQualifiers: 0 }),
    ).not.toThrow();
  });
});

/**
 * EL CASO REAL. Torneo bb8e137e, 6ª Varonil: 5 grupos, pasa 1 por grupo + 3
 * repescados. Solo se jugaron A y B; C, D y E están en cero partidos.
 *
 * El grupo B terminó en ciclo perfecto (los tres 6-4 6-4, todos 1-1, sets 2-2,
 * games 20-20, 2 puntos) y el motor viejo publicó una "clasificada" y dos
 * "eliminadas". Con tres plazas de repesca abiertas y nueve parejas sin jugar
 * un solo partido, ninguna de esas dos cosas era cierta.
 */
describe('computeClinch — 5 grupos, 1 por grupo + 3 repescados, solo 2 grupos jugados', () => {
  // Grupo A: resuelto de verdad. A1 gana los dos, A2 gana uno, A3 ninguno.
  const gA = grupo('A', ['A1', 'A2', 'A3'], [
    conMarcador('a1', 'A1', 'A2', 'A1', 6, 4),
    conMarcador('a2', 'A1', 'A3', 'A1', 6, 2),
    conMarcador('a3', 'A2', 'A3', 'A2', 6, 3),
  ]);

  // Grupo B: ciclo perfecto. B1→B3, B3→B2, B2→B1. Todos 6-4 6-4.
  const gB = grupo('B', ['B1', 'B2', 'B3'], [
    conMarcador('b1', 'B1', 'B3', 'B1', 6, 4),
    conMarcador('b2', 'B2', 'B3', 'B3', 4, 6),
    conMarcador('b3', 'B1', 'B2', 'B2', 4, 6),
  ]);

  const grupos = [
    gA, gB,
    grupoVirgen('C', ['C1', 'C2', 'C3']),
    grupoVirgen('D', ['D1', 'D2', 'D3']),
    grupoVirgen('E', ['E1', 'E2', 'E3']),
  ];

  const res = computeClinch({ groups: grupos, advancePerGroup: 1, bestExtraQualifiers: 3 });
  const byId = porPareja(res);

  it('NINGUNA pareja con 2 puntos queda eliminada', () => {
    for (const id of ['A2', 'B1', 'B2', 'B3']) {
      expect(byId[id].status).not.toBe('eliminated');
    }
  });

  it('la ÚNICA eliminada es la que perdió todo en un grupo ya terminado', () => {
    // A3: 0 puntos, grupo A cerrado, jamás puede ser segunda de su grupo. Esa
    // sí está fuera. Ninguna otra lo está, y menos con C, D y E en cero.
    expect(res.filter((r) => r.status === 'eliminated').map((r) => r.pairId)).toEqual(['A3']);
  });

  it('ningún SEGUNDO de grupo queda eliminado con la repesca abierta', () => {
    const segundos = ['A2', 'B1', 'B2', 'B3'];
    for (const id of segundos) {
      expect(byId[id].status).not.toBe('eliminated');
    }
  });

  it('el segundo del grupo A queda pendiente de repesca, no eliminado', () => {
    expect(byId['A2'].status).toBe('repechage_pending');
  });

  it('el ciclo perfecto del grupo B deja a las tres vivas: ninguna clasificada', () => {
    for (const id of ['B1', 'B2', 'B3']) {
      expect(byId[id].status).toBe('alive');
    }
  });

  it('el primero del grupo A sí clasificó: ahí no hay empate que sortear', () => {
    expect(byId['A1'].status).toBe('clinched');
  });

  it('las 9 parejas de C, D y E siguen vivas', () => {
    for (const id of ['C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'E1', 'E2', 'E3']) {
      expect(byId[id].status).toBe('alive');
    }
  });
});

describe('computeClinch — la repesca sí se cierra cuando de verdad se cierra', () => {
  // Mismo tablero, pero TODOS los grupos terminados y sin plazas de repesca
  // libres: el tercero de cada grupo no tiene por dónde entrar.
  const terminado = (n: string) =>
    grupo(n, [`${n}1`, `${n}2`, `${n}3`], [
      conMarcador(`${n}a`, `${n}1`, `${n}2`, `${n}1`, 6, 0),
      conMarcador(`${n}b`, `${n}1`, `${n}3`, `${n}1`, 6, 0),
      conMarcador(`${n}c`, `${n}2`, `${n}3`, `${n}2`, 6, 0),
    ]);
  const grupos = ['A', 'B', 'C', 'D', 'E'].map(terminado);
  const byId = porPareja(
    computeClinch({ groups: grupos, advancePerGroup: 1, bestExtraQualifiers: 3 }),
  );

  it('los primeros clasifican', () => {
    expect(byId['A1'].status).toBe('clinched');
    expect(byId['E1'].status).toBe('clinched');
  });

  it('los terceros, que nunca pueden ser segundos, quedan eliminados', () => {
    for (const id of ['A3', 'B3', 'C3', 'D3', 'E3']) {
      expect(byId[id].status).toBe('eliminated');
    }
  });

  it('los segundos siguen pendientes: son 5 para 3 plazas y las decide el desempate', () => {
    for (const id of ['A2', 'B2', 'C2', 'D2', 'E2']) {
      expect(byId[id].status).toBe('repechage_pending');
    }
  });
});

describe('computeClinch — determinismo', () => {
  it('misma entrada, misma salida', () => {
    const g = grupo('G', ['A', 'B', 'C'], [played('m1', 'A', 'B', 'A'), pending('m2', 'A', 'C')]);
    const args = { groups: [g], advancePerGroup: 2, bestExtraQualifiers: 0 };
    expect(computeClinch(args)).toEqual(computeClinch(args));
  });
});
