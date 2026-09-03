/**
 * EL FORMATO DEL SET DECISIVO LO DICE EL TORNEO.
 *
 * Un 5-4 en el tercer set es legal de dos formas: camino de un set completo o
 * camino de una súper muerte. Nada en los números lo separa, así que el motor
 * dejó de intentar adivinarlo — mientras lo intentaba, rechazaba los
 * marcadores en curso del tercero como si fueran imposibles.
 */
import { DEFAULT_SCORE_CONFIG, estadoDeSet, validateParcial, validateScore } from '../score';
import { computeStandings } from '../standings';
import type { MatchResultInput, SetScore } from '../types';

const set = (a: number, b: number): SetScore => ({ gamesA: a, gamesB: b, isSuperTiebreak: false });

const SUPER_10 = DEFAULT_SCORE_CONFIG;
const SUPER_15 = { ...DEFAULT_SCORE_CONFIG, superTiebreakTarget: 15 };
const COMPLETO = { ...DEFAULT_SCORE_CONFIG, deciderFormat: 'full' as const };

const dec = (a: number, b: number, cfg = SUPER_10) => estadoDeSet(a, b, cfg, true);

describe('súper muerte a 10', () => {
  it.each([[10, 8], [11, 9], [12, 10], [10, 0]])(
    '%i-%i está TERMINADO', (a, b) => expect(dec(a, b)).toBe('terminado'));

  it.each([[2, 1], [7, 5], [9, 9], [10, 9], [11, 10]])(
    '%i-%i está EN CURSO', (a, b) => expect(dec(a, b)).toBe('en_curso'));

  it('10-9 no cierra: se llegó a 10 sin dos de diferencia', () => {
    expect(dec(10, 9)).toBe('en_curso');
  });

  it('7-5 tampoco: en súper muerte eso no cierra nada', () => {
    expect(dec(7, 5)).toBe('en_curso');
    // Y en un set normal el mismo 7-5 sí cierra. Es el caso que obligaba a
    // preguntar el formato.
    expect(estadoDeSet(7, 5)).toBe('terminado');
  });

  it.each([[12, 3], [11, 2], [15, 0]])(
    '%i-%i es IMPOSIBLE: habría acabado antes', (a, b) => expect(dec(a, b)).toBe(null));

  it('el 0-0 sigue sin ser una foto de nada', () => {
    expect(dec(0, 0)).toBe(null);
  });
});

describe('súper muerte a 15', () => {
  it.each([[15, 13], [16, 14], [15, 0]])(
    '%i-%i está TERMINADO', (a, b) => expect(dec(a, b, SUPER_15)).toBe('terminado'));

  it.each([[10, 8], [14, 14], [15, 14], [16, 15]])(
    '%i-%i está EN CURSO', (a, b) => expect(dec(a, b, SUPER_15)).toBe('en_curso'));

  it('el 10-8 que cerraba a 10 aquí sigue en juego', () => {
    expect(dec(10, 8, SUPER_15)).toBe('en_curso');
    expect(dec(10, 8, SUPER_10)).toBe('terminado');
  });

  it('17-3 es imposible: habría acabado en el 15-3', () => {
    expect(dec(17, 3, SUPER_15)).toBe(null);
  });
});

describe('torneo que juega SET COMPLETO', () => {
  it('el tercer set se comporta como los otros dos', () => {
    expect(dec(6, 4, COMPLETO)).toBe('terminado');
    expect(dec(7, 5, COMPLETO)).toBe('terminado');
    expect(dec(7, 6, COMPLETO)).toBe('terminado');
    expect(dec(6, 5, COMPLETO)).toBe('en_curso');
    expect(dec(3, 1, COMPLETO)).toBe('en_curso');
  });

  it('una súper muerte deja de ser válida ahí', () => {
    expect(dec(10, 8, COMPLETO)).toBe(null);
  });

  it('cierra el partido con 7-5 en el tercero', () => {
    const r = validateScore([set(6, 4), set(4, 6), set(7, 5)], COMPLETO);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('A');
  });
});

describe('el tercer set en curso ya no se rechaza', () => {
  it('un 2-1 en súper muerte se puede guardar', () => {
    const r = validateParcial([set(6, 4), set(4, 6), set(2, 1)]);
    expect(r.valid).toBe(true);
    expect(r.completo).toBe(false);
  });

  it('y se puede ir actualizando', () => {
    for (const [a, b] of [[2, 1], [5, 4], [9, 9], [10, 9]]) {
      expect(validateParcial([set(6, 4), set(4, 6), set(a, b)]).valid).toBe(true);
    }
    // Hasta que cierra.
    const fin = validateParcial([set(6, 4), set(4, 6), set(11, 9)]);
    expect(fin.completo).toBe(true);
  });
});

describe('un tercer set en curso no cuenta para la tabla', () => {
  const enCurso = (sets: SetScore[]): MatchResultInput =>
    ({ matchId: 'm1', pairAId: 'A', pairBId: 'B', winnerPairId: null, played: false, sets });
  const fila = (m: MatchResultInput[]) =>
    computeStandings(['A', 'B'], m).find((r) => r.pairId === 'A')!;

  it('los dos primeros sets cuentan; la súper muerte a medias no', () => {
    const f = fila([enCurso([set(6, 4), set(4, 6), set(7, 5)])]);
    expect(f.setsWon).toBe(1);
    expect(f.setsLost).toBe(1);
    expect(f.gamesWon).toBe(10);
    expect(f.gamesLost).toBe(10);
  });

  it('la tabla no se mueve mientras avanza la súper muerte', () => {
    const a = fila([enCurso([set(6, 4), set(4, 6), set(2, 1)])]);
    const b = fila([enCurso([set(6, 4), set(4, 6), set(9, 9)])]);
    expect(b).toEqual(a);
  });
});

describe('cambiar el formato no reinterpreta lo ya guardado', () => {
  /**
   * Un 10-8 se guarda como súper muerte: games 1-0 y los puntos en los
   * tiebreaks (el contrato de captura-sets). Esa forma dice por sí sola que el
   * set cerró y quién lo ganó, sin volver a mirar la regla del torneo.
   */
  const superGuardado: SetScore = {
    gamesA: 1, gamesB: 0, isSuperTiebreak: true, tiebreakA: 10, tiebreakB: 8,
  };
  const jugado: MatchResultInput = {
    matchId: 'm1', pairAId: 'A', pairBId: 'B', winnerPairId: 'A', played: true,
    sets: [set(6, 4), set(4, 6), superGuardado],
  };

  it('el partido cuenta igual con el torneo en súper muerte o en set completo', () => {
    const conSuper = computeStandings(['A', 'B'], [jugado]);
    const conCompleto = computeStandings(['A', 'B'], [jugado], {
      ...DEFAULT_STANDINGS_CONFIG_LOCAL, superTiebreakGames: 'one',
    });
    expect(conCompleto).toEqual(conSuper);
  });

  it('el ganador del set guardado no depende del formato vigente', () => {
    const f = computeStandings(['A', 'B'], [jugado]).find((r) => r.pairId === 'A')!;
    expect(f.setsWon).toBe(2);
    expect(f.won).toBe(1);
    expect(f.points).toBe(2);
  });
});

// La config de standings es otra cosa que la de score; se declara aquí para no
// arrastrar el import entero en el test de arriba.
const DEFAULT_STANDINGS_CONFIG_LOCAL = {
  pointsWin: 2, pointsPlayedLoss: 0, superTiebreakGames: 'one' as const, soloTerminados: false,
};
