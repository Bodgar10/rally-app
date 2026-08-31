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

/**
 * CONTRATO DE LA SUPER MUERTE
 *
 * Fija el formato que cliente y servidor tienen que compartir. La UI del juez
 * (ScoreCapture.tsx) construye el payload exactamente así:
 *
 *   { is_super_tiebreak: true, tiebreak_a: <puntos>, tiebreak_b: <puntos>,
 *     games_a/games_b: 1-0 del lado que ganó }
 *
 * Si esto se rompe, el tercer set decisivo deja de capturarse. Ya pasó una vez:
 * la UI mandaba games en NaN porque su formulario de super muerte solo pide
 * puntos, y el envío moría en la validación de cliente.
 */
describe('validateScore — contrato de super muerte', () => {
  it('los PUNTOS van en tiebreak_a/b; games solo marca 1-0', () => {
    const st: SetScore = {
      gamesA: 1, gamesB: 0, isSuperTiebreak: true, tiebreakA: 10, tiebreakB: 7,
    };
    const r = validateScore([set(6, 7), set(6, 4), st]);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('A');
  });

  it('el ganador sale de los tiebreaks, no de los games', () => {
    // games dicen A, tiebreaks dicen B: mandan los tiebreaks.
    const st: SetScore = {
      gamesA: 1, gamesB: 0, isSuperTiebreak: true, tiebreakA: 7, tiebreakB: 10,
    };
    const r = validateScore([set(6, 4), set(4, 6), st]);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('B');
  });

  it('con games en 0-0 sigue siendo válido: los tiebreaks bastan', () => {
    const st: SetScore = {
      gamesA: 0, gamesB: 0, isSuperTiebreak: true, tiebreakA: 11, tiebreakB: 9,
    };
    expect(validateScore([set(6, 4), set(4, 6), st]).valid).toBe(true);
  });

  it('exige llegar a 10 y ganar por 2', () => {
    const casos: [number, number][] = [[9, 7], [10, 9], [10, 10]];
    for (const [a, b] of casos) {
      const r = validateScore([set(6, 4), set(4, 6), superSet(a, b)]);
      expect(r.valid).toBe(false);
      expect(r.errors.join(' ')).toMatch(/[Ss]uper muerte/);
    }
    // 12-10 sí: pasa de 10 con margen de 2.
    expect(validateScore([set(6, 4), set(4, 6), superSet(12, 10)]).valid).toBe(true);
  });

  it('sin tiebreaks cae a los games, que en el formato real son 1-0 e inválidos', () => {
    const st: SetScore = {
      gamesA: 1, gamesB: 0, isSuperTiebreak: true, tiebreakA: null, tiebreakB: null,
    };
    // 1-0 no llega a 10: se rechaza en vez de colar un super muerte falso.
    expect(validateScore([set(6, 4), set(4, 6), st]).valid).toBe(false);
  });
});

describe('validateScore — determinismo', () => {
  it('misma entrada, misma salida', () => {
    const s = [set(6, 4), set(6, 3)];
    expect(validateScore(s)).toEqual(validateScore(s));
  });
});
