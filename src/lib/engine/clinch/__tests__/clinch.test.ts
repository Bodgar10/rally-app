// src/lib/engine/clinch/__tests__/clinch.test.ts
import { computeClinch } from '../index';
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

const pending = (id: string, A: string, B: string): MatchResultInput => ({
  matchId: id,
  pairAId: A,
  pairBId: B,
  winnerPairId: null,
  sets: [],
  played: false,
});

describe('computeClinch — top 2 con un partido pendiente', () => {
  const matches = [
    played('m1', 'A', 'B', 'A'),
    played('m2', 'A', 'C', 'A'),
    pending('m3', 'B', 'C'),
  ];
  const res = computeClinch(['A', 'B', 'C'], matches, 2);
  const byId = Object.fromEntries(res.map((r) => [r.pairId, r]));

  it('A ya clasificó (clinched)', () => {
    expect(byId['A'].status).toBe('clinched');
  });
  it('B y C dependen del partido pendiente (alive)', () => {
    expect(byId['B'].status).toBe('alive');
    expect(byId['C'].status).toBe('alive');
    expect(byId['B'].dependsOnMatchIds).toContain('m3');
  });
});

describe('computeClinch — solo top 1 elimina a los demás', () => {
  const matches = [
    played('m1', 'A', 'B', 'A'),
    played('m2', 'A', 'C', 'A'),
    pending('m3', 'B', 'C'),
  ];
  const res = computeClinch(['A', 'B', 'C'], matches, 1);
  const byId = Object.fromEntries(res.map((r) => [r.pairId, r]));

  it('A clinched, B y C eliminated', () => {
    expect(byId['A'].status).toBe('clinched');
    expect(byId['B'].status).toBe('eliminated');
    expect(byId['C'].status).toBe('eliminated');
  });
});

describe('computeClinch — determinismo', () => {
  it('misma entrada, misma salida', () => {
    const matches = [played('m1', 'A', 'B', 'A'), pending('m2', 'A', 'C')];
    expect(computeClinch(['A', 'B', 'C'], matches, 2)).toEqual(
      computeClinch(['A', 'B', 'C'], matches, 2),
    );
  });
});
