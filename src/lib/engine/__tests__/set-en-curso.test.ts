/**
 * EL SET QUE SE ESTÁ JUGANDO.
 *
 * El juez actualiza el marcador del set en curso cada dos o tres games, para
 * que quien espera su turno vea "6-2, 3-1" y sepa cuánto falta de verdad. El
 * motor deduce del propio marcador si el set cerró: sin interruptores y sin
 * preguntas, igual que ya deduce la súper muerte.
 */
import { estadoDeSet, validateParcial, validateScore } from '../score';
import { computeStandings } from '../standings';
import { computeClinch, type ClinchGroup } from '../clinch';
import type { MatchResultInput, SetScore } from '../types';

const set = (a: number, b: number): SetScore => ({ gamesA: a, gamesB: b, isSuperTiebreak: false });

describe('estadoDeSet — la regla, caso por caso', () => {
  it.each([[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6]])(
    '%i-%i está TERMINADO', (a, b) => expect(estadoDeSet(a, b)).toBe('terminado'));

  it('la súper muerte a 10 o más con dos de diferencia está terminada', () => {
    expect(estadoDeSet(10, 8)).toBe('terminado');
    expect(estadoDeSet(12, 10)).toBe('terminado');
  });

  it.each([[3, 1], [5, 4], [6, 5], [6, 6]])(
    '%i-%i está EN CURSO', (a, b) => expect(estadoDeSet(a, b)).toBe('en_curso'));

  it.each([[8, 3], [6, 8], [9, 4], [7, 7], [10, 9]])(
    '%i-%i es IMPOSIBLE', (a, b) => expect(estadoDeSet(a, b)).toBe(null));

  it('el 7-6 nunca está en curso: llegado el 6-6 el único desenlace es 7-6', () => {
    expect(estadoDeSet(7, 6)).toBe('terminado');
  });

  it('el 6-6 sí lo está: se está jugando el tiebreak, y sus puntos no se capturan', () => {
    expect(estadoDeSet(6, 6)).toBe('en_curso');
  });

  it('el 0-0 no es una foto de nada', () => {
    expect(estadoDeSet(0, 0)).toBe(null);
  });
});

describe('validateParcial — solo el ÚLTIMO set puede estar abierto', () => {
  it('un set en curso solo, se acepta', () => {
    const r = validateParcial([set(3, 1)]);
    expect(r.valid).toBe(true);
    expect(r.completo).toBe(false);
  });

  it('un set cerrado y otro en curso detrás, se acepta', () => {
    const r = validateParcial([set(6, 2), set(3, 1)]);
    expect(r.valid).toBe(true);
    expect(r.completo).toBe(false);
  });

  it('[3-1, 2-0] se rechaza: no se empieza un set con el anterior abierto', () => {
    const r = validateParcial([set(3, 1), set(2, 0)]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Set 1: 3-1 todavía no ha terminado/);
  });

  it('reenviar el mismo set con más games sigue valiendo', () => {
    for (const [a, b] of [[3, 1], [4, 1], [5, 2], [6, 2]]) {
      expect(validateParcial([set(a, b)]).valid).toBe(true);
    }
  });

  it('validateScore NO acepta un set abierto: cerrar el partido es otra cosa', () => {
    expect(validateScore([set(6, 2), set(3, 1)]).valid).toBe(false);
  });
});

describe('un set en curso no mueve la tabla', () => {
  const enCurso = (sets: SetScore[]): MatchResultInput =>
    ({ matchId: 'm1', pairAId: 'A', pairBId: 'B', winnerPairId: null, played: false, sets });
  const fila = (m: MatchResultInput[], id: string) =>
    computeStandings(['A', 'B', 'C'], m).find((r) => r.pairId === id)!;

  it('un 3-1 suelto no aporta games ni sets', () => {
    const f = fila([enCurso([set(3, 1)])], 'A');
    expect(f.gamesWon).toBe(0);
    expect(f.setsWon).toBe(0);
  });

  it('el set cerrado cuenta y el abierto que va detrás no', () => {
    const f = fila([enCurso([set(6, 2), set(3, 1)])], 'A');
    expect(f.gamesWon).toBe(6);
    expect(f.gamesLost).toBe(2);
    expect(f.setsWon).toBe(1);
  });

  it('la tabla no baila mientras el set avanza', () => {
    const antes = fila([enCurso([set(6, 2), set(3, 1)])], 'A');
    const luego = fila([enCurso([set(6, 2), set(5, 4)])], 'A');
    expect(luego).toEqual(antes);
  });

  it('al cerrar el set, entonces sí entra', () => {
    const f = fila([enCurso([set(6, 2), set(6, 4)])], 'A');
    expect(f.gamesWon).toBe(12);
    expect(f.setsWon).toBe(2);
    // Y sigue sin dar puntos: el partido no se ha cerrado.
    expect(f.points).toBe(0);
    expect(f.played).toBe(0);
  });

  it('una súper muerte cerrada no se confunde con un set abierto', () => {
    // Guardada como games 1-0 con los puntos en los tiebreaks.
    const superSet: SetScore = { gamesA: 1, gamesB: 0, isSuperTiebreak: true, tiebreakA: 10, tiebreakB: 7 };
    const f = fila([enCurso([set(6, 2), set(2, 6), superSet])], 'A');
    expect(f.setsWon).toBe(2);
  });
});

describe('el clinch sigue esperando al cierre del partido', () => {
  const m = (sets: SetScore[]): MatchResultInput =>
    ({ matchId: 'm3', pairAId: 'B', pairBId: 'C', winnerPairId: null, played: false, sets });
  const base: MatchResultInput[] = [
    { matchId: 'm1', pairAId: 'A', pairBId: 'B', winnerPairId: 'A', played: true, sets: [set(6, 0), set(6, 0)] },
    { matchId: 'm2', pairAId: 'A', pairBId: 'C', winnerPairId: 'A', played: true, sets: [set(6, 0), set(6, 0)] },
  ];
  const grupos = (matches: MatchResultInput[]): ClinchGroup[] => [
    { groupId: 'G', pairIds: ['A', 'B', 'C'], matches },
    { groupId: 'H', pairIds: ['D', 'E', 'F'], matches: [] },
  ];
  const estados = (matches: MatchResultInput[]) =>
    Object.fromEntries(
      computeClinch({ groups: grupos(matches), advancePerGroup: 1, bestExtraQualifiers: 1 })
        .map((x) => [x.pairId, x.status]),
    );

  const pasos = [
    [...base, m([])],
    [...base, m([set(3, 1)])],
    [...base, m([set(6, 2)])],
    [...base, m([set(6, 2), set(4, 3)])],
    [...base, m([set(6, 2), set(6, 3)])],
  ];

  it('ningún paso mueve el clinch: solo lo movería cerrar el partido', () => {
    for (const paso of pasos) expect(estados(paso)).toEqual(estados(pasos[0]));
  });

  it('y nadie pierde un clinched por el camino', () => {
    const ya = new Set<string>();
    for (const paso of pasos) {
      const e = estados(paso);
      for (const id of ya) expect(e[id]).toBe('clinched');
      for (const [id, st] of Object.entries(e)) if (st === 'clinched') ya.add(id);
    }
    expect(ya.size).toBeGreaterThan(0);
  });
});
