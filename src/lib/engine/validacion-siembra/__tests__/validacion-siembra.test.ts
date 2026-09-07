import { validarSiembra, type FilaDeGrupo, type GrupoAValidar } from '../index';
import type { MatchResultInput, SetScore } from '../../types';

const s = (a: number, b: number): SetScore => ({ gamesA: a, gamesB: b, isSuperTiebreak: false });
const m = (id: string, A: string, B: string, w: string | null, a = 6, b = 2): MatchResultInput =>
  ({ matchId: id, pairAId: A, pairBId: B, winnerPairId: w, played: w != null, sets: w ? [s(a, b), s(a, b)] : [] });

const fila = (
  pairId: string, groupId: string, position: number, points: number,
  clinchStatus: FilaDeGrupo['clinchStatus'],
  gw = 12, gl = 4,
): FilaDeGrupo => ({
  pairId, groupId, position, points,
  setsWon: 2, setsLost: 0, gamesWon: gw, gamesLost: gl, clinchStatus,
});

/** Grupo de 3 sano: 1.º clinched, 2.º repechage_pending, 3.º eliminated. */
const grupoSano = (n: string): GrupoAValidar => {
  const [p1, p2, p3] = [`${n}1`, `${n}2`, `${n}3`];
  return {
    groupId: `g${n}`, nombre: n, pairIds: [p1, p2, p3],
    matches: [m(`${n}a`, p1, p2, p1), m(`${n}b`, p1, p3, p1), m(`${n}c`, p2, p3, p2)],
    filas: [
      fila(p1, `g${n}`, 1, 4, 'clinched', 24, 8),
      fila(p2, `g${n}`, 2, 2, 'repechage_pending', 14, 14),
      fila(p3, `g${n}`, 3, 0, 'eliminated', 4, 24),
    ],
  };
};

const nombres = Object.fromEntries(
  ['A', 'B', 'C', 'D'].flatMap((n) => [1, 2, 3].map((i) => [`${n}${i}`, `Pareja ${n}${i}`])),
);

const base = (grupos: GrupoAValidar[], extra = 0) => validarSiembra({
  grupos, advancePerGroup: 1, bestExtraQualifiers: extra, nombres,
});

describe('cuando todo está bien, no dice nada', () => {
  it('cuatro grupos sanos y cuatro clasificados: silencio', () => {
    const r = base([grupoSano('A'), grupoSano('B'), grupoSano('C'), grupoSano('D')]);
    expect(r.bloqueantes).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.puedeSembrar).toBe(true);
  });
});

describe('1 · cuadran los números', () => {
  it('si salen menos clasificados de los que pide el formato, bloquea', () => {
    // Pide 4 grupos × 1 + 4 de repesca = 8, pero solo hay 4 segundos.
    const r = base([grupoSano('A'), grupoSano('B'), grupoSano('C'), grupoSano('D')], 5);
    expect(r.puedeSembrar).toBe(false);
    expect(r.bloqueantes[0].codigo).toBe('numeros_no_cuadran');
    expect(r.bloqueantes[0].mensaje).toMatch(/deberían ser 9/);
  });
});

describe('2 · nadie clasifica dos veces', () => {
  it('la misma pareja como primera y como mejor segunda', () => {
    const g = grupoSano('A');
    // La 2.ª fila apunta a la misma pareja que la 1.ª.
    g.filas[1] = { ...g.filas[1], pairId: 'A1' };
    const r = base([g, grupoSano('B')], 2);
    expect(r.bloqueantes.some((p) => p.codigo === 'clasifica_dos_veces')).toBe(true);
    expect(r.bloqueantes.find((p) => p.codigo === 'clasifica_dos_veces')!.mensaje)
      .toMatch(/Se jugaría contra sí misma/);
  });
});

describe('3 · coherencia con lo que ve el jugador', () => {
  it('un eliminado que entra al cuadro bloquea, y se le nombra', () => {
    const g = grupoSano('A');
    g.filas[0] = { ...g.filas[0], clinchStatus: 'eliminated' };   // el 1.º, que sí entra
    const r = base([g, grupoSano('B')]);
    const p = r.bloqueantes.find((x) => x.codigo === 'eliminado_clasificado')!;
    expect(p).toBeDefined();
    expect(p.parejas).toEqual(['Pareja A1']);
    expect(p.mensaje).toMatch(/le dijo que estaba eliminada/);
  });

  it('un clinched que se queda fuera bloquea', () => {
    const g = grupoSano('A');
    g.filas[2] = { ...g.filas[2], clinchStatus: 'clinched' };     // el 3.º, que no entra
    const r = base([g, grupoSano('B')]);
    const p = r.bloqueantes.find((x) => x.codigo === 'clasificado_fuera')!;
    expect(p).toBeDefined();
    expect(p.parejas).toEqual(['Pareja A3']);
  });
});

describe('4 · todos los grupos completos', () => {
  it('un partido sin resultado bloquea aunque el botón lo dejara pasar', () => {
    const g = grupoSano('A');
    g.matches[2] = m('Ac', 'A2', 'A3', null);
    const r = base([g, grupoSano('B')]);
    const p = r.bloqueantes.find((x) => x.codigo === 'grupo_incompleto')!;
    expect(p.grupo).toBe('A');
    expect(p.mensaje).toMatch(/1 partido sin resultado/);
  });
});

describe('6 · posiciones coherentes', () => {
  it('dos parejas con la misma posición bloquea', () => {
    const g = grupoSano('A');
    g.filas[1] = { ...g.filas[1], position: 1 };
    const r = base([g, grupoSano('B')]);
    expect(r.bloqueantes.some((x) => x.codigo === 'posiciones_incoherentes')).toBe(true);
  });

  it('una fila de menos también', () => {
    const g = grupoSano('A');
    g.filas = g.filas.slice(0, 2);
    const r = base([g, grupoSano('B')]);
    expect(r.bloqueantes.some((x) => x.codigo === 'posiciones_incoherentes')).toBe(true);
  });
});

/**
 * EL CASO REAL: 5ª Varonil, grupo J. Ciclo perfecto de tres — las tres con 2
 * puntos y ni sets ni games las separan. `position` dice 1-2-3 porque
 * `selectQualifiers` necesita un orden total y cae al `pairId`.
 */
describe('5 · empate sin resolver: AVISO, no bloqueo', () => {
  const grupoJ = (): GrupoAValidar => ({
    groupId: 'gJ', nombre: 'J', pairIds: ['J1', 'J2', 'J3'],
    // Ciclo: J1→J2, J2→J3, J3→J1, todos 6-4 6-4.
    matches: [
      m('Ja', 'J1', 'J2', 'J1', 6, 4),
      m('Jb', 'J2', 'J3', 'J2', 6, 4),
      m('Jc', 'J3', 'J1', 'J3', 6, 4),
    ],
    filas: [
      fila('J1', 'gJ', 1, 2, 'alive', 20, 20),
      fila('J2', 'gJ', 2, 2, 'alive', 20, 20),
      fila('J3', 'gJ', 3, 2, 'alive', 20, 20),
    ],
  });

  const nombresJ = { ...nombres, J1: 'Pareja J1', J2: 'Pareja J2', J3: 'Pareja J3' };

  it('se puede sembrar, pero se avisa', () => {
    const r = validarSiembra({
      grupos: [grupoJ(), grupoSano('A')], advancePerGroup: 1, bestExtraQualifiers: 0,
      nombres: nombresJ,
    });
    expect(r.puedeSembrar).toBe(true);
    expect(r.bloqueantes).toEqual([]);
    expect(r.avisos).toHaveLength(1);
  });

  it('el aviso nombra el grupo y las tres parejas', () => {
    const r = validarSiembra({
      grupos: [grupoJ(), grupoSano('A')], advancePerGroup: 1, bestExtraQualifiers: 0,
      nombres: nombresJ,
    });
    const a = r.avisos[0];
    expect(a.codigo).toBe('empate_sin_resolver');
    expect(a.grupo).toBe('J');
    expect(a.parejas).toHaveLength(3);
    expect(a.mensaje).toMatch(/NO es deportivo/);
    expect(a.mensaje).toMatch(/Sortéalo antes de sembrar/);
  });

  it('con el sorteo hecho, el aviso desaparece', () => {
    const r = validarSiembra({
      grupos: [grupoJ(), grupoSano('A')], advancePerGroup: 1, bestExtraQualifiers: 0,
      nombres: nombresJ,
      config: {
        pointsWin: 2, pointsPlayedLoss: 0, superTiebreakGames: 'one', soloTerminados: false,
        desempateManual: { J2: 1, J3: 2, J1: 3 },
      },
    });
    expect(r.avisos).toEqual([]);
    expect(r.puedeSembrar).toBe(true);
  });
});
