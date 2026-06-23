// src/lib/engine/score/__tests__/score.test.ts
import { validateScore } from '../index';
import type { SetScore } from '../../types';

const set = (a: number, b: number): SetScore => ({
  gamesA: a,
  gamesB: b,
  isSuperTiebreak: false,
});

const superSet = (a: number, b: number): SetScore => ({
  gamesA: a > b ? 1 : 0,
  gamesB: b > a ? 1 : 0,
  isSuperTiebreak: true,
  tiebreakA: a,
  tiebreakB: b,
});

describe('validateScore — marcadores válidos', () => {
  it('6-4, 6-3 → A gana 2-0', () => {
    const r = validateScore([set(6, 4), set(6, 3)]);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('A');
    expect([r.setsA, r.setsB]).toEqual([2, 0]);
  });

  it('6-7, 6-4, super muerte 10-7 → A gana 2-1', () => {
    const r = validateScore([set(6, 7), set(6, 4), superSet(10, 7)]);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('A');
    expect([r.setsA, r.setsB]).toEqual([2, 1]);
  });

  it('7-6, 7-5 → válido', () => {
    expect(validateScore([set(7, 6), set(7, 5)]).valid).toBe(true);
  });
});

describe('validateScore — marcadores inválidos', () => {
  it('rechaza set 3-1 (no llega a 6)', () => {
    const r = validateScore([set(3, 1), set(6, 2)]);
    expect(r.valid).toBe(false);
    expect(r.winnerSide).toBeNull();
  });

  it('rechaza super muerte en el primer set', () => {
    const r = validateScore([superSet(10, 5), set(6, 2)]);
    expect(r.valid).toBe(false);
  });

  it('rechaza partido incompleto (1-0 en sets)', () => {
    const r = validateScore([set(6, 4)]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/incompleto/i);
  });

  it('rechaza set extra tras estar decidido', () => {
    const r = validateScore([set(6, 0), set(6, 0), set(6, 0)]);
    expect(r.valid).toBe(false);
  });
});

describe('validateScore — determinismo', () => {
  it('misma entrada, misma salida', () => {
    const s = [set(6, 4), set(6, 3)];
    expect(validateScore(s)).toEqual(validateScore(s));
  });
});
