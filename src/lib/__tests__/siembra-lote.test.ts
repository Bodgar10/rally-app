import { checklistDeSiembra, listasParaSembrar, type CategoriaParaSembrar } from '@/lib/siembra-lote';
import type { GrupoAValidar } from '@/lib/engine/validacion-siembra';
import type { MatchResultInput, SetScore } from '@/lib/engine/types';

const s = (a: number, b: number): SetScore => ({ gamesA: a, gamesB: b, isSuperTiebreak: false });
const m = (id: string, A: string, B: string, w: string | null, a = 6, b = 2): MatchResultInput =>
  ({ matchId: id, pairAId: A, pairBId: B, winnerPairId: w, played: w != null, sets: w ? [s(a, b), s(a, b)] : [] });

const grupoSano = (cat: string, n: string, completo = true): GrupoAValidar => {
  const [p1, p2, p3] = [`${cat}${n}1`, `${cat}${n}2`, `${cat}${n}3`];
  return {
    groupId: `g${cat}${n}`, nombre: n, pairIds: [p1, p2, p3],
    matches: [
      m(`${cat}${n}a`, p1, p2, p1), m(`${cat}${n}b`, p1, p3, p1),
      m(`${cat}${n}c`, p2, p3, completo ? p2 : null),
    ],
    filas: [
      { pairId: p1, groupId: `g${cat}${n}`, position: 1, points: 4, setsWon: 4, setsLost: 0, gamesWon: 24, gamesLost: 8, clinchStatus: 'clinched' },
      { pairId: p2, groupId: `g${cat}${n}`, position: 2, points: 2, setsWon: 2, setsLost: 2, gamesWon: 14, gamesLost: 14, clinchStatus: 'repechage_pending' },
      { pairId: p3, groupId: `g${cat}${n}`, position: 3, points: 0, setsWon: 0, setsLost: 4, gamesWon: 4, gamesLost: 24, clinchStatus: 'eliminated' },
    ],
  };
};

/** Grupo con ciclo perfecto: empate que el reglamento no separa. */
const grupoEmpatado = (cat: string, n: string): GrupoAValidar => {
  const [p1, p2, p3] = [`${cat}${n}1`, `${cat}${n}2`, `${cat}${n}3`];
  const fila = (id: string, pos: number) => ({
    pairId: id, groupId: `g${cat}${n}`, position: pos, points: 2,
    setsWon: 2, setsLost: 2, gamesWon: 20, gamesLost: 20, clinchStatus: 'alive' as const,
  });
  return {
    groupId: `g${cat}${n}`, nombre: n, pairIds: [p1, p2, p3],
    matches: [
      m(`${cat}${n}a`, p1, p2, p1, 6, 4),
      m(`${cat}${n}b`, p2, p3, p2, 6, 4),
      m(`${cat}${n}c`, p3, p1, p3, 6, 4),
    ],
    filas: [fila(p1, 1), fila(p2, 2), fila(p3, 3)],
  };
};

const cat = (over: Partial<CategoriaParaSembrar> & { id: string }): CategoriaParaSembrar => ({
  nombre: over.id, grupos: [grupoSano(over.id, 'A'), grupoSano(over.id, 'B')],
  advancePerGroup: 1, bestExtraQualifiers: 0, cuadroSembrado: false, nombres: {},
  ...over,
});

describe('el checklist dice cómo va cada categoría', () => {
  it('una categoría lista se marca como lista', () => {
    const [e] = checklistDeSiembra([cat({ id: 'A' })]);
    expect(e.seSiembraEnLote).toBe(true);
    expect(e.motivoFuera).toBeNull();
    expect(e.resumen).toBe('Lista para sembrar');
    expect(e.gruposCompletos).toBe(2);
    expect(e.totalGrupos).toBe(2);
  });

  it('una ya sembrada se salta sin ruido', () => {
    const [e] = checklistDeSiembra([cat({ id: 'A', cuadroSembrado: true })]);
    expect(e.motivoFuera).toBe('ya_sembrada');
    expect(e.seSiembraEnLote).toBe(false);
    // Sin problemas que enseñar: no es un problema.
    expect(e.bloqueantes).toEqual([]);
    expect(e.avisos).toEqual([]);
  });

  it('con grupos por terminar dice cuántos faltan', () => {
    const c = cat({ id: 'A', grupos: [grupoSano('A', 'A'), grupoSano('A', 'B', false)] });
    const [e] = checklistDeSiembra([c]);
    expect(e.motivoFuera).toBe('grupos_incompletos');
    expect(e.gruposCompletos).toBe(1);
    expect(e.resumen).toBe('Faltan 1 grupo por terminar');
  });

  it('con bloqueantes no entra al lote y los trae', () => {
    // Los números no cuadran: pide 4 de repesca y no hay tantos segundos.
    const [e] = checklistDeSiembra([cat({ id: 'A', bestExtraQualifiers: 5 })]);
    expect(e.motivoFuera).toBe('bloqueantes');
    expect(e.seSiembraEnLote).toBe(false);
    expect(e.bloqueantes.length).toBeGreaterThan(0);
  });
});

describe('un empate sin sortear NO se siembra en lote', () => {
  const c = cat({ id: 'A', grupos: [grupoSano('A', 'A'), grupoEmpatado('A', 'J')] });

  it('queda fuera aunque no haya nada roto', () => {
    const [e] = checklistDeSiembra([c]);
    expect(e.bloqueantes).toEqual([]);
    expect(e.avisos).toHaveLength(1);
    expect(e.motivoFuera).toBe('avisos');
    expect(e.seSiembraEnLote).toBe(false);
  });

  it('y el resumen dice que la decisión es suya', () => {
    const [e] = checklistDeSiembra([c]);
    expect(e.resumen).toMatch(/decide tú/);
    // El aviso trae el grupo, que es lo que permite el enlace.
    expect(e.avisos[0].grupo).toBe('J');
  });
});

describe('el lote', () => {
  it('solo entran las listas', () => {
    const estados = checklistDeSiembra([
      cat({ id: 'A' }),
      cat({ id: 'B', cuadroSembrado: true }),
      cat({ id: 'C', grupos: [grupoSano('C', 'A'), grupoEmpatado('C', 'J')] }),
      cat({ id: 'D', bestExtraQualifiers: 5 }),
      cat({ id: 'E' }),
    ]);
    expect(listasParaSembrar(estados).map((e) => e.id)).toEqual(['A', 'E']);
  });

  it('sin ninguna lista, el lote está vacío y no hay nada que pulsar', () => {
    const estados = checklistDeSiembra([cat({ id: 'B', cuadroSembrado: true })]);
    expect(listasParaSembrar(estados)).toEqual([]);
  });
});
