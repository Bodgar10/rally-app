/**
 * Los textos de desempate, contra la cadena real del motor.
 *
 * La leyenda vieja decía "si dos parejas empatan, decide la diferencia de sets
 * y luego la de games" y estaba impresa debajo de un empate de TRES que la
 * diferencia de sets no resolvió. Estos tests existen para que la frase no se
 * vuelva a separar de lo que hace el motor.
 */
import { computeStandingsDetalle } from '@/lib/engine/standings';
import type { MatchResultInput } from '@/lib/engine/types';
import {
  LEYENDA_TABLA,
  avisoDeEmpateSinResolver,
  explicacionDeDesempates,
  parejasSinResolver,
} from '@/lib/desempate-texto';

const partido = (
  id: string, A: string, B: string, winner: string, gA: number, gB: number,
): MatchResultInput => ({
  matchId: id,
  pairAId: A,
  pairBId: B,
  winnerPairId: winner,
  played: true,
  sets: [
    { gamesA: gA, gamesB: gB, isSuperTiebreak: false },
    { gamesA: gA, gamesB: gB, isSuperTiebreak: false },
  ],
});

describe('LEYENDA_TABLA', () => {
  it('cubre el empate de dos y el de tres o más', () => {
    expect(LEYENDA_TABLA).toMatch(/DOS parejas/);
    expect(LEYENDA_TABLA).toMatch(/TRES O MÁS/);
  });

  it('dice que con tres manda primero lo que pasó entre ellas, no los sets del grupo', () => {
    const entreEllas = LEYENDA_TABLA.indexOf('solo con los partidos entre ellas');
    const delGrupo = LEYENDA_TABLA.indexOf('de todo el grupo');
    expect(entreEllas).toBeGreaterThan(-1);
    expect(delGrupo).toBeGreaterThan(entreEllas);
  });

  it('ya no promete que la diferencia de sets resuelve el empate de dos', () => {
    expect(LEYENDA_TABLA).not.toMatch(/Si dos parejas empatan, decide la diferencia de sets/);
  });
});

describe('explicacionDeDesempates — por qué el #1 es el #1', () => {
  it('empate triple resuelto por la mini-tabla lo dice', () => {
    // Ciclo de tres: A→B, B→C, C→A. Los tres a 2 puntos y 2-2 en sets, pero
    // A arrasó su partido (6-0 6-0) y los otros dos se ganaron 6-4 6-4: los
    // separan los GAMES de la mini-tabla, no los sets del grupo.
    const matches = [
      partido('m1', 'A', 'B', 'A', 6, 0),
      partido('m2', 'B', 'C', 'B', 6, 4),
      partido('m3', 'C', 'A', 'C', 6, 4),
    ];
    const { desempates } = computeStandingsDetalle(['A', 'B', 'C'], matches);
    const frase = explicacionDeDesempates(desempates);
    expect(frase).toMatch(/^Empate a 2 puntos entre tres parejas; se resolvió /);
  });

  it('sin empates no dice nada', () => {
    const matches = [
      partido('m1', 'A', 'B', 'A', 6, 0),
      partido('m2', 'A', 'C', 'A', 6, 0),
      partido('m3', 'B', 'C', 'B', 6, 0),
    ];
    const { desempates } = computeStandingsDetalle(['A', 'B', 'C'], matches);
    expect(explicacionDeDesempates(desempates)).toBeNull();
  });
});

describe('empate sin resolver — el aviso honesto', () => {
  // El ciclo perfecto del grupo B de 6ª Varonil: los tres 6-4 6-4.
  const matches = [
    partido('m1', 'S', 'I', 'S', 6, 4),
    partido('m2', 'A', 'I', 'I', 4, 6),
    partido('m3', 'S', 'A', 'A', 4, 6),
  ];
  const { desempates } = computeStandingsDetalle(['S', 'A', 'I'], matches);

  it('avisa, nombra el sorteo y no inventa un criterio', () => {
    const aviso = avisoDeEmpateSinResolver(desempates);
    expect(aviso).toMatch(/Tres parejas/);
    expect(aviso).toMatch(/sorteo/);
    expect(aviso).toMatch(/provisional/);
  });

  it('un empate sin resolver NO se cuenta como resuelto', () => {
    expect(explicacionDeDesempates(desempates)).toBeNull();
  });

  it('devuelve las tres parejas para marcarlas en la tabla', () => {
    expect(parejasSinResolver(desempates).sort()).toEqual(['A', 'I', 'S']);
  });

  it('sin empate irresoluble no hay aviso', () => {
    const limpio = computeStandingsDetalle(['A', 'B'], [partido('m1', 'A', 'B', 'A', 6, 0)]);
    expect(avisoDeEmpateSinResolver(limpio.desempates)).toBeNull();
    expect(parejasSinResolver(limpio.desempates)).toEqual([]);
  });
});
