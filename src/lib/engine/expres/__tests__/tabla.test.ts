// src/lib/engine/expres/__tests__/tabla.test.ts
import {
  computeTablaExpres,
  generarFixtureExpres,
  type ResultadoSuma6,
  type TablaExpres,
} from '../index';

let n = 0;
const R = (a: string, b: string, ga: number | null, gb: number | null = ga === null ? null : 6 - ga): ResultadoSuma6 => ({
  matchId: `m${++n}`,
  pairAId: a,
  pairBId: b,
  gamesA: ga,
  gamesB: gb,
});
beforeEach(() => {
  n = 0;
});

const orden = (t: TablaExpres) => t.filas.map((f) => f.pairId);
const balances = (t: TablaExpres) => t.filas.map((f) => f.balance);

/** Round robin de 4 parejas: a, b, c, d. Todas se enfrentan. */
const CUATRO = ['a', 'b', 'c', 'd'];

describe('la tabla no cuenta victorias, cuenta games', () => {
  it('ordena por balance y publica PJ, GF, GC y balance', () => {
    const t = computeTablaExpres({
      grupo: 'A',
      pairIds: CUATRO,
      resultados: [R('a', 'b', 4), R('c', 'd', 6), R('a', 'c', 2), R('b', 'd', 3), R('a', 'd', 6), R('b', 'c', 1)],
    });
    expect(t.filas.find((f) => f.pairId === 'a')).toMatchObject({
      posicion: 2,
      jugados: 3,
      gamesFavor: 12, // 4 contra b, 2 contra c, 6 contra d
      gamesContra: 6, // 2, 4 y 0
      balance: 6,
      criterio: 'balance',
      empateSinResolver: false,
    });
    expect(orden(t)).toEqual(['c', 'a', 'b', 'd']);
    expect(Object.keys(t.filas[0])).not.toEqual(expect.arrayContaining(['won', 'lost', 'points', 'empatados']));
  });

  it('un 3-3 no es un empate que contar: es sumar 3 y restar 3', () => {
    const t = computeTablaExpres({ pairIds: ['a', 'b'], resultados: [R('a', 'b', 3)] });
    expect(t.filas.map((f) => [f.gamesFavor, f.gamesContra, f.balance])).toEqual([
      [3, 3, 0],
      [3, 3, 0],
    ]);
  });

  it('ganar más partidos no sirve de nada si restas más games', () => {
    // `a` gana dos de tres por la mínima y encaja un 0-6. `b` pierde dos y
    // arrasa el otro. La tabla pone a `b` delante, y eso es el formato.
    const t = computeTablaExpres({
      pairIds: ['a', 'b', 'c', 'd'],
      resultados: [
        R('a', 'c', 4), R('a', 'd', 4), R('a', 'b', 0),
        R('b', 'c', 2), R('b', 'd', 2),
        R('c', 'd', 3),
      ],
    });
    // `a` gana 2 de 3 y queda ÚLTIMA; `b` gana 1 de 3 y queda PRIMERA.
    expect(orden(t)[0]).toBe('b');
    expect(orden(t)[3]).toBe('a');
    expect(balances(t)).toEqual([2, 0, 0, -2]);
  });
});

describe('GF, GC y balance son el MISMO criterio', () => {
  it('con todas jugando lo mismo, GF + GC es constante', () => {
    const f = generarFixtureExpres({ pairIds: Array.from({ length: 16 }, (_, i) => `p${i}`), semilla: 's' });
    const g = f.grupos[0];
    const resultados = f.partidos
      .filter((m) => m.grupo === 'A')
      .map((m, i) => R(m.pairAId, m.pairBId, [6, 5, 4, 3, 2, 1, 0][i % 7]));
    const t = computeTablaExpres({ pairIds: g.pairIds, resultados });

    for (const fila of t.filas) expect(fila.gamesFavor + fila.gamesContra).toBe(30);
    // Y por eso balance y GF nunca pueden discrepar: para CUALQUIER par de
    // filas, quien tiene más balance tiene más GF y menos GC. Se comparan los
    // criterios entre sí, no el orden publicado, porque ese ya lleva aplicados
    // los desempates.
    const signo = (v: number) => Math.sign(v);
    for (const x of t.filas) {
      for (const y of t.filas) {
        expect(signo(x.balance - y.balance)).toBe(signo(x.gamesFavor - y.gamesFavor));
        expect(signo(x.balance - y.balance)).toBe(signo(y.gamesContra - x.gamesContra));
      }
    }
  });

  it('dos empatadas a balance lo están también a GF y a GC, exactamente', () => {
    const t = computeTablaExpres({
      pairIds: CUATRO,
      resultados: [
        R('a', 'b', 4), R('b', 'c', 4), R('c', 'a', 4),
        R('a', 'd', 6), R('b', 'd', 6), R('c', 'd', 6),
      ],
    });
    const empatadas = t.filas.filter((f) => f.balance === 6);
    expect(empatadas).toHaveLength(3);
    expect(new Set(empatadas.map((f) => f.gamesFavor)).size).toBe(1);
    expect(new Set(empatadas.map((f) => f.gamesContra)).size).toBe(1);
  });
});

describe('desempate: el enfrentamiento directo', () => {
  it('separa cuando las empatadas se enfrentaron', () => {
    const t = computeTablaExpres({
      pairIds: CUATRO,
      resultados: [
        R('a', 'd', 6), R('a', 'c', 2), R('a', 'b', 4),
        R('b', 'c', 6), R('b', 'd', 4),
        R('c', 'd', 3),
      ],
    });
    expect(balances(t).slice(0, 2)).toEqual([6, 6]);
    expect(orden(t).slice(0, 2)).toEqual(['a', 'b']); // a le ganó 4-2 a b
    expect(t.filas[0].criterio).toBe('directo');
    expect(t.filas[1].criterio).toBe('directo');
    expect(t.empatesSinResolver).toEqual([]);
    expect(t.bloqueaClasificacion).toBe(false);
  });

  it('NO se aplica si las empatadas no se enfrentaron entre todas', () => {
    // Grupo de 6 donde cada pareja juega solo 2: `a` y `d` empatan a +8 y
    // nunca se vieron. Una mini-tabla ahí compararía un duelo que no existe.
    const t = computeTablaExpres({
      pairIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      clasifican: 2,
      resultados: [
        R('a', 'f', 6), R('b', 'e', 6), R('c', 'd', 0),
        R('b', 'f', 6), R('a', 'c', 4), R('d', 'e', 4),
      ],
    });
    expect(t.filas[0].pairId).toBe('b');
    const bloque = t.empatesSinResolver.find((e) => e.balance === 8)!;
    expect(bloque.pairIds).toEqual(['a', 'd']);
    expect(bloque.motivo).toBe('no_se_enfrentaron');
    expect(bloque.posiciones).toEqual([2, 3]);
  });

  it('tampoco separa un ciclo perfecto, aunque se hayan enfrentado todas', () => {
    const t = computeTablaExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [
        R('a', 'b', 4), R('b', 'c', 4), R('c', 'a', 4),
        R('a', 'd', 6), R('b', 'd', 6), R('c', 'd', 6),
      ],
    });
    const bloque = t.empatesSinResolver[0];
    expect(bloque.pairIds).toEqual(['a', 'b', 'c']);
    expect(bloque.motivo).toBe('directo_no_separa');
    expect(t.filas.slice(0, 3).map((f) => f.criterio)).toEqual([
      'sin_resolver', 'sin_resolver', 'sin_resolver',
    ]);
    expect(t.filas[0].empatadaCon).toEqual(['b', 'c']);
  });
});

describe('bloqueaClasificacion — la señal para pedirle al organizador que decida', () => {
  const cicloEnLaLinea = (clasifican: number) =>
    computeTablaExpres({
      pairIds: CUATRO,
      clasifican,
      resultados: [
        R('a', 'b', 4), R('b', 'c', 4), R('c', 'a', 4),
        R('a', 'd', 6), R('b', 'd', 6), R('c', 'd', 6),
      ],
    });

  it('true cuando el empate parte la línea de corte', () => {
    const t = cicloEnLaLinea(2); // empate en los puestos 1-2-3, pasan 2
    expect(t.grupoTerminado).toBe(true);
    expect(t.empatesSinResolver[0].decideClasificacion).toBe(true);
    expect(t.bloqueaClasificacion).toBe(true);
  });

  it('false si todas las empatadas clasifican igual', () => {
    const t = cicloEnLaLinea(3); // pasan 3: el empate 1-2-3 no decide nada
    expect(t.empatesSinResolver[0].decideClasificacion).toBe(false);
    expect(t.bloqueaClasificacion).toBe(false);
  });

  it('false mientras el grupo no haya terminado: todavía puede deshacerse', () => {
    const t = computeTablaExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [
        R('a', 'b', 4), R('b', 'c', 4), R('c', 'a', 4),
        R('a', 'd', 6), R('b', 'd', 6), R('c', 'd', null),
      ],
    });
    expect(t.grupoTerminado).toBe(false);
    expect(t.bloqueaClasificacion).toBe(false);
    expect(t.comparable).toBe(false); // d ha jugado 2 y el resto 3
  });
});

describe('la decisión del organizador', () => {
  const conOrden = (ordenManual?: Record<string, number>) =>
    computeTablaExpres({
      pairIds: CUATRO,
      clasifican: 2,
      ordenManual,
      resultados: [
        R('a', 'b', 4), R('b', 'c', 4), R('c', 'a', 4),
        R('a', 'd', 6), R('b', 'd', 6), R('c', 'd', 6),
      ],
    });

  it('se aplica y deja de haber empate sin resolver', () => {
    const t = conOrden({ c: 1, a: 2, b: 3 });
    expect(orden(t).slice(0, 3)).toEqual(['c', 'a', 'b']);
    expect(t.filas.slice(0, 3).map((f) => f.criterio)).toEqual(['manual', 'manual', 'manual']);
    expect(t.empatesSinResolver).toEqual([]);
    expect(t.bloqueaClasificacion).toBe(false);
  });

  it('se ignora sola si el empate ya no tiene esos miembros', () => {
    // El organizador decidió sobre un empate a tres; luego se corrigió un
    // resultado y el empate es de dos. Aplicar aquel orden sería publicar una
    // decisión tomada sobre otra situación.
    const t = computeTablaExpres({
      pairIds: CUATRO,
      clasifican: 2,
      ordenManual: { c: 1, a: 2, b: 3 },
      resultados: [
        R('a', 'd', 6), R('a', 'c', 2), R('a', 'b', 4),
        R('b', 'c', 6), R('b', 'd', 4),
        R('c', 'd', 3),
      ],
    });
    expect(t.filas[0].criterio).toBe('directo'); // lo resolvió el reglamento
  });

  it('se ignora si no cubre a todas las empatadas', () => {
    expect(conOrden({ a: 1, b: 2 }).filas[0].criterio).toBe('sin_resolver');
  });

  it('se ignora si el organizador repitió un número', () => {
    expect(conOrden({ a: 1, b: 1, c: 2 }).filas[0].criterio).toBe('sin_resolver');
  });

  it('sin decisión, el orden publicado es estable pero NO deportivo, y va marcado', () => {
    const t = conOrden();
    expect(t.filas.slice(0, 3).every((f) => f.empateSinResolver)).toBe(true);
    expect(orden(conOrden())).toEqual(orden(conOrden())); // determinista
  });
});

describe('con el fixture real', () => {
  const fixture = generarFixtureExpres({
    pairIds: Array.from({ length: 16 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`),
    semilla: 'domingo-2026-09-20',
  });

  it('un grupo entero jugado da una tabla comparable de 8 filas', () => {
    const g = fixture.grupos[0];
    const resultados = fixture.partidos
      .filter((m) => m.grupo === 'A')
      .map((m, i) => R(m.pairAId, m.pairBId, [6, 4, 3, 2, 5, 1, 0, 3, 4, 2][i % 10]));
    const t = computeTablaExpres({ grupo: 'A', pairIds: g.pairIds, resultados });

    expect(t.filas).toHaveLength(8);
    expect(t.grupoTerminado).toBe(true);
    expect(t.comparable).toBe(true);
    expect(t.filas.every((f) => f.jugados === 5)).toBe(true);
    expect(t.filas.every((f) => f.gamesFavor + f.gamesContra === 30)).toBe(true);
    // Los balances suman cero: lo que una gana, otra lo pierde.
    expect(t.filas.reduce((s, f) => s + f.balance, 0)).toBe(0);
    // Y salen ordenados de mayor a menor.
    expect(balances(t)).toEqual([...balances(t)].sort((x, y) => y - x));
  });

  it('un grupo sin capturar nada: todo a cero y nada bloqueado todavía', () => {
    const g = fixture.grupos[0];
    const resultados = fixture.partidos.filter((m) => m.grupo === 'A').map((m) => R(m.pairAId, m.pairBId, null));
    const t = computeTablaExpres({ pairIds: g.pairIds, resultados });
    expect(t.grupoTerminado).toBe(false);
    expect(t.bloqueaClasificacion).toBe(false);
    expect(t.filas.every((f) => f.jugados === 0 && f.balance === 0)).toBe(true);
  });
});

describe('lo que rechaza', () => {
  it('un marcador que no suma 6, diciendo cuál', () => {
    expect(() =>
      computeTablaExpres({ pairIds: CUATRO, resultados: [R('a', 'b', 6, 4)] }),
    ).toThrow(/partido "m1" — .*son 6 games exactos/);
  });

  it('medio marcador: un suma 6 se captura entero', () => {
    expect(() =>
      computeTablaExpres({ pairIds: CUATRO, resultados: [R('a', 'b', 4, null)] }),
    ).toThrow(/un lado capturado y el otro no/);
  });

  it('una pareja que no es de este grupo', () => {
    expect(() =>
      computeTablaExpres({ pairIds: CUATRO, resultados: [R('a', 'z', 4)] }),
    ).toThrow(/no están en este grupo/);
  });

  it('el mismo partido dos veces', () => {
    const r = R('a', 'b', 4);
    expect(() => computeTablaExpres({ pairIds: CUATRO, resultados: [r, r] })).toThrow(
      /aparece dos veces/,
    );
  });

  it('dos parejas enfrentadas dos veces: eso es un fixture corrupto', () => {
    expect(() =>
      computeTablaExpres({ pairIds: CUATRO, resultados: [R('a', 'b', 4), R('b', 'a', 2)] }),
    ).toThrow(/nadie repite rival/);
  });

  it('parejas repetidas en el grupo', () => {
    expect(() => computeTablaExpres({ pairIds: ['a', 'a'], resultados: [] })).toThrow(/repetidas/);
  });

  it('resultados que no es un array, y dice cómo se pasa un grupo vacío', () => {
    expect(() =>
      computeTablaExpres({ pairIds: CUATRO, resultados: undefined as unknown as ResultadoSuma6[] }),
    ).toThrow(/Un grupo sin partidos se pasa como \[\]/);
  });
});
