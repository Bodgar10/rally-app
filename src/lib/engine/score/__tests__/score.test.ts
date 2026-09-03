// src/lib/engine/score/__tests__/score.test.ts
import { clasificarSet, DEFAULT_SCORE_CONFIG, estadoDeSet, validateParcial, validateScore } from '../index';
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

  it('rechaza partido incompleto (1-0 en sets) y NOMBRA el set que falta', () => {
    const r = validateScore([set(6, 4)]);
    expect(r.valid).toBe(false);
    // "ningún lado alcanzó los sets necesarios" era cierto y no servía: el juez
    // necesita saber qué teclear, no en qué estado quedó la validación.
    expect(r.errors.join(' ')).toBe('Falta el segundo set.');
  });

  it('con 1-1 en sets pide el TERCERO y dice que es el desempate', () => {
    const r = validateScore([set(6, 4), set(3, 6)]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toBe('Falta el tercer set para desempatar.');
  });

  it('no llama desempate al segundo set: 1-0 no es 1-1', () => {
    expect(validateScore([set(6, 4)]).errors.join(' ')).not.toMatch(/desempatar/);
  });

  it('con sets de más no inventa un cuarto set que no existe', () => {
    // 6-0, 6-0, 6-0: sobra el tercero y ninguno de los errores puede pedir más.
    const r = validateScore([set(6, 0), set(6, 0), set(6, 0)]);
    expect(r.errors.join(' ')).not.toMatch(/Falta el/);
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
    // Desde la 063 estos NO son imposibles: son súper muertes EN CURSO, y
    // `validateScore` las rechaza porque no cierran el partido, no porque no
    // existan. Ver 'el set decisivo se juega como diga el torneo'.
    const casos: [number, number][] = [[9, 7], [10, 9], [10, 10]];
    for (const [a, b] of casos) {
      const r = validateScore([set(6, 4), set(4, 6), superSet(a, b)]);
      expect(r.valid).toBe(false);
      expect(r.errors.join(' ')).toMatch(/todavía no ha terminado/);
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

/**
 * EL FORMATO SE DEDUCE DE LOS NÚMEROS
 *
 * El interruptor "super muerte" de la pantalla del juez preguntaba un dato que
 * ya estaba escrito en el marcador. Estos tests fijan que no hace falta: los
 * dos formatos no se solapan, porque un set normal no pasa de 7 y una súper
 * muerte no baja de 10.
 */
describe('clasificarSet — los dos formatos y sus límites', () => {
  it('sets normales: 6-0 a 6-4, 7-5 y 7-6', () => {
    const validos: [number, number][] = [
      [6, 0], [6, 1], [6, 2], [6, 3], [6, 4],
      [7, 5], [7, 6],
      [0, 6], [4, 6], [5, 7], [6, 7],   // y al revés
    ];
    for (const [a, b] of validos) expect(clasificarSet(a, b)).toBe('normal');
  });

  it('6-5 NO es un set: falta el juego de cierre', () => {
    expect(clasificarSet(6, 5)).toBeNull();
  });

  it('7-4 y 8-6 NO son sets: el 7 solo vale contra 5 o 6, y no hay 8', () => {
    expect(clasificarSet(7, 4)).toBeNull();
    expect(clasificarSet(8, 6)).toBeNull();
  });

  it('súper muertes: 10 o más con dos de diferencia', () => {
    const validos: [number, number][] = [[10, 0], [10, 8], [12, 10], [15, 13], [8, 10]];
    for (const [a, b] of validos) expect(clasificarSet(a, b)).toBe('super');
  });

  it('10-9 NO es súper muerte: falta el margen de dos', () => {
    expect(clasificarSet(10, 9)).toBeNull();
  });

  it('9-7 NO es nada: ni llega a 10 ni es un set', () => {
    expect(clasificarSet(9, 7)).toBeNull();
  });

  it('la tierra de nadie entre 7 y 10 no es de nadie: por eso no hay ambigüedad', () => {
    for (const [a, b] of [[8, 0], [9, 0], [8, 6], [9, 7]] as [number, number][]) {
      expect(clasificarSet(a, b)).toBeNull();
    }
  });

  it('empate y números imposibles', () => {
    expect(clasificarSet(6, 6)).toBeNull();
    expect(clasificarSet(10, 10)).toBeNull();
    expect(clasificarSet(NaN, 4)).toBeNull();
    expect(clasificarSet(-1, 6)).toBeNull();
  });
});

describe('validateScore — tercer set sin interruptor', () => {
  it('acepta un 10-8 en el tercer set aunque nadie lo marque como súper muerte', () => {
    // Así llega ahora del formulario: dos números y nada más.
    const r = validateScore([set(6, 4), set(4, 6), set(10, 8)]);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('A');
    expect([r.setsA, r.setsB]).toEqual([2, 1]);
  });

  it('acepta un tercer set normal, 7-5, si el TORNEO juega set completo', () => {
    // Antes lo aceptaba siempre, adivinando. Ahora lo dice el torneo: con el
    // default (súper muerte) un 5-7 en el tercero es un set en curso.
    const completo = { ...DEFAULT_SCORE_CONFIG, deciderFormat: 'full' as const };
    const r = validateScore([set(6, 4), set(4, 6), set(5, 7)], completo);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('B');
  });

  it('el error del tercer set ofrece EL formato del torneo, no los dos', () => {
    // Ofrecer los dos era consecuencia de no saber cuál se juega. Ahora se
    // sabe, y decir el que no toca solo confunde.
    // 12-3 es imposible en una súper muerte a 10: habría acabado en el 10-3.
    // (Un 7-3, en cambio, ya no es un error: es una súper muerte en curso.)
    const r = validateScore([set(6, 4), set(4, 6), set(12, 3)]);
    expect(r.valid).toBe(false);
    const msg = r.errors.join(' ');
    expect(msg).toMatch(/12-3/);
    expect(msg).toMatch(/súper muerte a 10/);
    expect(msg).not.toMatch(/set normal/);
  });

  it('en un set que NO es el decisivo, el error ofrece solo el formato normal', () => {
    const r = validateScore([set(7, 3), set(6, 2)]);
    expect(r.valid).toBe(false);
    const msg = r.errors.join(' ');
    expect(msg).toMatch(/set normal/);
    expect(msg).not.toMatch(/o una súper muerte/);
  });

  it('un 10-8 en el PRIMER set se rechaza diciendo por qué, no como marcador ilegible', () => {
    const r = validateScore([set(10, 8), set(6, 2)]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/solo se juega en el set decisivo/);
  });
});

describe('validateScore — determinismo', () => {
  it('misma entrada, misma salida', () => {
    const s = [set(6, 4), set(6, 3)];
    expect(validateScore(s)).toEqual(validateScore(s));
  });
});

describe('validateParcial — un set suelto es legal', () => {
  it('un 6-4 solo no es un partido, pero sí un set bien anotado', () => {
    const p = validateParcial([set(6, 4)]);
    expect(p.valid).toBe(true);
    expect(p.completo).toBe(false);
    expect(p.errors).toEqual([]);
  });

  it('1-1 en sets es legal y sigue sin estar decidido', () => {
    const p = validateParcial([set(6, 4), set(3, 6)]);
    expect(p.valid).toBe(true);
    expect(p.completo).toBe(false);
  });

  it('un set IMPOSIBLE sigue siendo un error', () => {
    // Perdonar "falta un set" no es perdonar cualquier cosa. Un 8-3 no existe;
    // un 3-1, desde que el juez actualiza el set en curso, sí (ver más abajo).
    const p = validateParcial([set(8, 3)]);
    expect(p.valid).toBe(false);
    expect(p.errors.join(' ')).toMatch(/Set 1/);
  });

  it('una súper muerte en el primer set se sigue rechazando', () => {
    const p = validateParcial([superSet(10, 5)]);
    expect(p.valid).toBe(false);
  });

  it('cuando el partido ya está decidido, lo dice', () => {
    const p = validateParcial([set(6, 4), set(6, 3)]);
    expect(p.completo).toBe(true);
    expect(p.valid).toBe(true);
  });

  it('validateScore no cambió: el partido incompleto sigue siendo inválido', () => {
    const r = validateScore([set(6, 4)]);
    expect(r.valid).toBe(false);
    expect(r.completo).toBe(false);
  });
});
