// src/lib/engine/bracket/__tests__/bracket.test.ts
import { advanceBracket, thirdPlaceFromSemis } from '../index';
import type { RoundMatch } from '../index';

const m = (
  matchId: string,
  pairAId: string | null,
  pairBId: string | null,
  winnerPairId: string | null,
): RoundMatch => ({ matchId, pairAId, pairBId, winnerPairId });

describe('advanceBracket', () => {
  it('cuartos completos → semis con ganadores adyacentes', () => {
    const round = [
      m('q1', 'A', 'H', 'A'),
      m('q2', 'D', 'E', 'E'),
      m('q3', 'C', 'F', 'C'),
      m('q4', 'B', 'G', 'B'),
    ];
    const { next, complete } = advanceBracket(round);
    expect(complete).toBe(true);
    expect(next).toHaveLength(2);
    expect([next[0].pairAId, next[0].pairBId]).toEqual(['A', 'E']);
    expect([next[1].pairAId, next[1].pairBId]).toEqual(['C', 'B']);
    expect(next[0].sourceMatchIds).toEqual(['q1', 'q2']);
  });

  it('bye: avanza la pareja presente sin winner explícito', () => {
    const round = [m('s1', 'A', null, null), m('s2', 'C', 'B', 'C')];
    const { next, complete } = advanceBracket(round);
    expect(complete).toBe(true);
    expect([next[0].pairAId, next[0].pairBId]).toEqual(['A', 'C']);
  });

  it('ronda incompleta marca complete=false', () => {
    const round = [m('q1', 'A', 'H', 'A'), m('q2', 'D', 'E', null)];
    expect(advanceBracket(round).complete).toBe(false);
  });

  it('lanza error con nº impar de partidos', () => {
    expect(() => advanceBracket([m('x', 'A', 'B', 'A')])).toThrow();
  });
});

describe('thirdPlaceFromSemis', () => {
  it('arma el 3.er lugar con los perdedores de semis', () => {
    const tp = thirdPlaceFromSemis([m('sf1', 'A', 'E', 'A'), m('sf2', 'C', 'B', 'B')]);
    expect(tp).not.toBeNull();
    expect([tp!.pairAId, tp!.pairBId]).toEqual(['E', 'C']);
  });

  it('devuelve null si falta un resultado', () => {
    expect(thirdPlaceFromSemis([m('sf1', 'A', 'E', null), m('sf2', 'C', 'B', 'B')])).toBeNull();
  });
});
