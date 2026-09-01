/**
 * CAPTURA SET A SET: qué se mueve en vivo y qué no.
 *
 * El juez teclea cada set en cuanto termina, así que el motor recibe partidos
 * con sets y sin ganador. Dos reglas, y la segunda es la que protege al
 * jugador:
 *
 *   1. La TABLA cuenta esos sets y games —son los que desempatan— pero no da
 *      puntos ni suma PJ: no hay ganador y el partido sigue en la cancha.
 *   2. El CLINCH los ignora. 'clinched' promete "clasificas pase lo que pase",
 *      y decirle a alguien que ya pasó para quitárselo media hora después es
 *      peor que no habérselo dicho.
 */
import { computeStandings } from '../standings';
import { computeClinch, type ClinchGroup } from '../clinch';
import type { MatchResultInput, SetScore } from '../types';

const set = (a: number, b: number): SetScore => ({ gamesA: a, gamesB: b, isSuperTiebreak: false });

const terminado = (
  id: string, A: string, B: string, winner: string, sets: SetScore[],
): MatchResultInput => ({ matchId: id, pairAId: A, pairBId: B, winnerPairId: winner, played: true, sets });

/** Partido EN CURSO: tiene sets capturados y no tiene ganador. */
const enCurso = (id: string, A: string, B: string, sets: SetScore[]): MatchResultInput =>
  ({ matchId: id, pairAId: A, pairBId: B, winnerPairId: null, played: false, sets });

const pendiente = (id: string, A: string, B: string): MatchResultInput =>
  ({ matchId: id, pairAId: A, pairBId: B, winnerPairId: null, played: false, sets: [] });

describe('la tabla se mueve con cada set, sin regalar puntos', () => {
  const fila = (m: MatchResultInput[], id: string) =>
    computeStandings(['A', 'B', 'C'], m).find((r) => r.pairId === id)!;

  it('un partido en curso aporta sus games, pero ni PJ ni puntos', () => {
    const f = fila([enCurso('m1', 'A', 'B', [set(6, 0)])], 'A');
    expect(f.gamesWon).toBe(6);
    expect(f.gamesLost).toBe(0);
    expect(f.setsWon).toBe(1);
    expect(f.played).toBe(0);   // sigue en la cancha
    expect(f.points).toBe(0);   // sin ganador no hay victoria
    expect(f.won).toBe(0);
  });

  it('el rival tampoco suma PJ, y sus games sí', () => {
    const f = fila([enCurso('m1', 'A', 'B', [set(6, 0)])], 'B');
    expect(f.gamesLost).toBe(6);
    expect(f.played).toBe(0);
    expect(f.points).toBe(0);
  });

  it('al cerrarse el partido aparecen el PJ y los puntos', () => {
    const f = fila([terminado('m1', 'A', 'B', 'A', [set(6, 0), set(6, 0)])], 'A');
    expect(f.played).toBe(1);
    expect(f.points).toBe(2);
    expect(f.gamesWon).toBe(12);
  });

  it('sin sets capturados, un partido pendiente sigue sin existir para la tabla', () => {
    const f = fila([pendiente('m1', 'A', 'B')], 'A');
    expect(f.gamesWon).toBe(0);
    expect(f.setsWon).toBe(0);
    expect(f.played).toBe(0);
  });

  it('"2 puntos = una victoria" se sigue leyendo igual con partidos en curso', () => {
    const m = [terminado('m1', 'A', 'B', 'A', [set(6, 4), set(6, 4)]), enCurso('m2', 'A', 'C', [set(6, 1)])];
    const f = fila(m, 'A');
    expect(f.points).toBe(f.won * 2);
    expect(f.played).toBe(f.won + f.lost);
  });
});

/**
 * MONOTONÍA. Se captura el set 1, luego el 2, luego se cierra el partido.
 * En ningún paso una pareja puede perder un 'clinched' ya anunciado.
 */
describe('el clinch no retrocede nunca', () => {
  const grupo = (matches: MatchResultInput[]): ClinchGroup[] => [
    { groupId: 'G', pairIds: ['A', 'B', 'C'], matches },
    // Un segundo grupo entero sin jugar, para que la repesca esté viva y el
    // motor tenga algo que decidir además del corte del grupo.
    { groupId: 'H', pairIds: ['D', 'E', 'F'], matches: [
      pendiente('h1', 'D', 'E'), pendiente('h2', 'D', 'F'), pendiente('h3', 'E', 'F'),
    ] },
  ];

  const estados = (matches: MatchResultInput[]) => {
    const r = computeClinch({
      groups: grupo(matches), advancePerGroup: 1, bestExtraQualifiers: 1,
    });
    return Object.fromEntries(r.map((x) => [x.pairId, x.status]));
  };

  // A ya ganó sus dos partidos. B y C se juegan el resto.
  const base = [
    terminado('m1', 'A', 'B', 'A', [set(6, 0), set(6, 0)]),
    terminado('m2', 'A', 'C', 'A', [set(6, 0), set(6, 0)]),
  ];

  const pasos = [
    { nombre: 'antes de empezar B vs C', m: [...base, pendiente('m3', 'B', 'C')] },
    { nombre: 'set 1 capturado',         m: [...base, enCurso('m3', 'B', 'C', [set(6, 0)])] },
    { nombre: 'set 2 capturado',         m: [...base, enCurso('m3', 'B', 'C', [set(6, 0), set(0, 6)])] },
    { nombre: 'partido cerrado',         m: [...base, terminado('m3', 'B', 'C', 'B', [set(6, 0), set(0, 6), set(6, 4)])] },
  ];

  it('nadie pasa de clinched a otra cosa en ningún paso', () => {
    const yaClasificados = new Set<string>();
    for (const paso of pasos) {
      const e = estados(paso.m);
      for (const id of yaClasificados) {
        expect(`${paso.nombre}: ${id} = ${e[id]}`).toBe(`${paso.nombre}: ${id} = clinched`);
      }
      for (const [id, st] of Object.entries(e)) if (st === 'clinched') yaClasificados.add(id);
    }
    // Y el caso de verdad ocurrió: alguien llegó a clinched durante la serie.
    expect(yaClasificados.size).toBeGreaterThan(0);
  });

  it('tampoco se retracta un eliminated', () => {
    const yaFuera = new Set<string>();
    for (const paso of pasos) {
      const e = estados(paso.m);
      for (const id of yaFuera) expect(e[id]).toBe('eliminated');
      for (const [id, st] of Object.entries(e)) if (st === 'eliminated') yaFuera.add(id);
    }
  });

  it('el clinch NO cambia por capturar un set: solo por cerrar un partido', () => {
    // Los tres primeros pasos son el mismo partido sin ganador. El clinch los
    // ve idénticos a propósito: es lo que garantiza que no se retracte.
    expect(estados(pasos[1].m)).toEqual(estados(pasos[0].m));
    expect(estados(pasos[2].m)).toEqual(estados(pasos[0].m));
    // Y al cerrar sí puede moverse.
    expect(estados(pasos[3].m)).not.toEqual(estados(pasos[0].m));
  });
});
