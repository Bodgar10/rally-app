// src/lib/engine/expres/__tests__/clinch.test.ts
import {
  DELTAS_SUMA6,
  MAX_ESCENARIOS,
  computeClinchExpres,
  rondasDelCirculo,
  type ClinchExpresResult,
  type ResultadoSuma6,
} from '../index';

let n = 0;
const R = (a: string, b: string, ga: number | null): ResultadoSuma6 => ({
  matchId: `m${++n}`,
  pairAId: a,
  pairBId: b,
  gamesA: ga,
  gamesB: ga === null ? null : 6 - ga,
});
beforeEach(() => {
  n = 0;
});

const estados = (r: ClinchExpresResult[]) =>
  Object.fromEntries(r.map((x) => [x.pairId, x.estado]));

const CUATRO = ['a', 'b', 'c', 'd'];

/**
 * La verdad, calculada aparte: enumera TODOS los escenarios con código
 * independiente del motor y dice si cada pareja está dentro siempre / alguna
 * vez. Es el único test que puede cazar un 'clinched' falso.
 */
function verdad(
  ids: readonly string[],
  balance: readonly number[],
  pendientes: readonly (readonly [number, number])[],
  clasifican: number,
): { siempre: boolean[]; alguna: boolean[] } {
  const n = ids.length;
  const siempre = new Array(n).fill(true);
  const alguna = new Array(n).fill(false);
  const bal = [...balance];

  const bajar = (i: number) => {
    if (i === pendientes.length) {
      for (let p = 0; p < n; p++) {
        let encima = 0;
        let iguales = 0;
        for (let q = 0; q < n; q++) {
          if (q === p) continue;
          if (bal[q] > bal[p]) encima++;
          else if (bal[q] === bal[p]) iguales++;
        }
        if (encima + iguales + 1 > clasifican) siempre[p] = false;
        if (encima + 1 <= clasifican) alguna[p] = true;
      }
      return;
    }
    const [a, b] = pendientes[i];
    for (const d of DELTAS_SUMA6) {
      bal[a] += d;
      bal[b] -= d;
      bajar(i + 1);
      bal[a] -= d;
      bal[b] += d;
    }
  };
  bajar(0);
  return { siempre, alguna };
}

describe('el signo de la cota, que es donde estaba el error del plan', () => {
  it('el suelo BAJA: perder resta 6 games por partido, no cero', () => {
    const r = computeClinchExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [R('a', 'b', 6), R('a', 'c', 6), R('a', 'd', null), R('b', 'c', 3), R('b', 'd', null), R('c', 'd', null)],
    });
    const a = r.find((x) => x.pairId === 'a')!;
    expect(a.balance).toBe(12);
    expect(a.pendientes).toBe(1);
    expect(a.balanceMaximo).toBe(18); // 12 + 6
    expect(a.balanceMinimo).toBe(6); // 12 − 6, NO 12
  });

  it('con 3 pendientes el recorrido es de ±18', () => {
    const r = computeClinchExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [R('a', 'b', null), R('a', 'c', null), R('a', 'd', null), R('b', 'c', 3), R('b', 'd', 3), R('c', 'd', 3)],
    });
    const a = r.find((x) => x.pairId === 'a')!;
    expect([a.balanceMinimo, a.balance, a.balanceMaximo]).toEqual([-18, 0, 18]);
  });
});

describe('grupo terminado: la respuesta es la tabla', () => {
  const terminado = computeClinchExpres({
    pairIds: CUATRO,
    clasifican: 2,
    resultados: [R('a', 'b', 6), R('a', 'c', 6), R('a', 'd', 6), R('b', 'c', 6), R('b', 'd', 6), R('c', 'd', 6)],
  });

  it('los dos primeros clasificados, los dos últimos eliminados', () => {
    expect(estados(terminado)).toEqual({ a: 'clinched', b: 'clinched', c: 'eliminated', d: 'eliminated' });
  });

  it('sin pendientes, nadie depende de nada y nada es aproximado', () => {
    for (const x of terminado) {
      expect(x.pendientes).toBe(0);
      expect(x.dependeDe).toEqual([]);
      expect(x.aproximado).toBe(false);
      expect(x.balanceMinimo).toBe(x.balance);
      expect(x.balanceMaximo).toBe(x.balance);
    }
  });
});

describe('con partidos por jugar', () => {
  it('quien ya no puede ser alcanzada está clasificada', () => {
    // a arrasó; b no puede caer porque ya no juega. c y d se reparten un
    // partido cuyo mejor resultado los deja por debajo de b.
    const r = computeClinchExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [R('a', 'b', 6), R('a', 'c', 6), R('a', 'd', 6), R('b', 'c', 6), R('b', 'd', 6), R('c', 'd', null)],
    });
    expect(estados(r)).toEqual({ a: 'clinched', b: 'clinched', c: 'eliminated', d: 'eliminated' });
    expect(r.every((x) => x.aproximado === false)).toBe(true);
  });

  it('un empate posible al final mantiene a todos vivos, sin prometer nada', () => {
    // a está dentro seguro. b, c y d pueden acabar empatados a −6: entonces el
    // segundo puesto lo decide el organizador, así que nadie está garantizado.
    const r = computeClinchExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [R('a', 'b', 6), R('a', 'c', 6), R('a', 'd', 6), R('b', 'c', 3), R('b', 'd', 3), R('c', 'd', null)],
    });
    expect(estados(r)).toEqual({ a: 'clinched', b: 'alive', c: 'alive', d: 'alive' });
  });

  it('quien está decidida no depende de ningún partido; quien no, sí', () => {
    const r = computeClinchExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [R('a', 'b', 6), R('a', 'c', 6), R('a', 'd', 6), R('b', 'c', 3), R('b', 'd', 3), R('c', 'd', null)],
    });
    expect(r.find((x) => x.pairId === 'a')!.dependeDe).toEqual([]);
    expect(r.find((x) => x.pairId === 'c')!.dependeDe).toEqual(['m6']);
  });
});

describe('la última ronda de un grupo de 8: el caso que importa', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const partidos = rondasDelCirculo(8, 5).map((ronda) => ronda.map(([i, j]) => [ids[i], ids[j]] as const));

  /** Cuatro rondas jugadas con un patrón fijo; la quinta, pendiente. */
  const resultados = partidos.flatMap((ronda, r) =>
    ronda.map(([a, b], i) => R(a, b, r === 4 ? null : [6, 4, 2, 0][(r + i) % 4])),
  );

  it('enumera exacto: una ronda de un grupo de 8 son 4 partidos = 2401 escenarios', () => {
    const r = computeClinchExpres({ pairIds: ids, resultados, clasifican: 4 });
    expect(Math.pow(DELTAS_SUMA6.length, 4)).toBeLessThan(MAX_ESCENARIOS);
    expect(r.every((x) => x.aproximado === false)).toBe(true);
    expect(r.every((x) => x.pendientes === 1)).toBe(true);
  });

  it('coincide exactamente con la verdad calculada aparte', () => {
    const r = computeClinchExpres({ pairIds: ids, resultados, clasifican: 4 });
    const indice = new Map(r.map((x, i) => [x.pairId, i]));
    const pendientes = resultados
      .filter((m) => m.gamesA === null)
      .map((m) => [indice.get(m.pairAId)!, indice.get(m.pairBId)!] as const);
    const v = verdad(r.map((x) => x.pairId), r.map((x) => x.balance), pendientes, 4);

    r.forEach((x, i) => {
      expect(x.estado).toBe(v.siempre[i] ? 'clinched' : v.alguna[i] ? 'alive' : 'eliminated');
    });
  });
});

describe('camino por cotas: cuando hay demasiados escenarios', () => {
  // Grupo de 6 jugando round robin (5 partidos cada una, 15 en total).
  // Se dejan 7 pendientes: 7^7 = 823.543 escenarios, por encima del tope.
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const todos = rondasDelCirculo(6, 5).flat();
  const resultados = todos.map(([i, j], idx) =>
    R(ids[i], ids[j], idx < 8 ? [6, 5, 4, 2, 1, 0, 3, 6][idx] : null),
  );

  it('responde por cotas y lo dice', () => {
    expect(Math.pow(DELTAS_SUMA6.length, 7)).toBeGreaterThan(MAX_ESCENARIOS);
    const r = computeClinchExpres({ pairIds: ids, resultados, clasifican: 2 });
    expect(r.every((x) => x.aproximado === true)).toBe(true);
  });

  it('NUNCA miente: lo que da por decidido lo comprueba la enumeración completa', () => {
    const r = computeClinchExpres({ pairIds: ids, resultados, clasifican: 2 });
    const indice = new Map(r.map((x, i) => [x.pairId, i]));
    const pendientes = resultados
      .filter((m) => m.gamesA === null)
      .map((m) => [indice.get(m.pairAId)!, indice.get(m.pairBId)!] as const);
    const v = verdad(r.map((x) => x.pairId), r.map((x) => x.balance), pendientes, 2);

    r.forEach((x, i) => {
      // Estas dos son la promesa del motor y no admiten excepción.
      if (x.estado === 'clinched') expect(v.siempre[i]).toBe(true);
      if (x.estado === 'eliminated') expect(v.alguna[i]).toBe(false);
      // Y esta es la dirección en la que sí se permite fallar.
      if (v.siempre[i] && x.estado !== 'clinched') expect(x.estado).toBe('alive');
      if (!v.alguna[i] && x.estado !== 'eliminated') expect(x.estado).toBe('alive');
    });
  });
});

describe('la cota decide cuando hay de qué: no es código muerto', () => {
  // 'a' arrasa a todo el mundo y 'f' se hunde; quedan 7 partidos pendientes
  // entre las cuatro del medio, o sea por encima del tope de enumeración.
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const todos = rondasDelCirculo(6, 5).flat();
  const resultados = todos.map(([i, j], idx) => {
    const [x, y] = [ids[i], ids[j]];
    const medio = (p: string) => ['b', 'c', 'd', 'e'].includes(p);
    if ((medio(x) && medio(y)) || idx === 0) return R(x, y, null);
    if (x === 'a') return R(x, y, 6);
    if (y === 'a') return R(x, y, 0);
    if (x === 'f') return R(x, y, 0);
    return R(x, y, 6);
  });

  it('da por clasificada a la que nadie puede alcanzar, sin enumerar', () => {
    const r = computeClinchExpres({ pairIds: ids, resultados, clasifican: 2 });
    expect(resultados.filter((m) => m.gamesA === null)).toHaveLength(7);
    expect(r.every((x) => x.aproximado)).toBe(true);
    expect(r.find((x) => x.pairId === 'a')!.estado).toBe('clinched');
    expect(r.find((x) => x.pairId === 'a')!.balance).toBe(24);
  });

  it('y ese clinched es verdad: lo confirma la enumeración completa', () => {
    const r = computeClinchExpres({ pairIds: ids, resultados, clasifican: 2 });
    const indice = new Map(r.map((x, i) => [x.pairId, i]));
    const pendientes = resultados
      .filter((m) => m.gamesA === null)
      .map((m) => [indice.get(m.pairAId)!, indice.get(m.pairBId)!] as const);
    const v = verdad(r.map((x) => x.pairId), r.map((x) => x.balance), pendientes, 2);
    r.forEach((x, i) => {
      if (x.estado === 'clinched') expect(v.siempre[i]).toBe(true);
      if (x.estado === 'eliminated') expect(v.alguna[i]).toBe(false);
    });
  });
});

describe('barridos: la promesa se mantiene en muchos grupos distintos', () => {
  it('ningún clinched ni eliminated falso en 60 grupos generados', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const todos = rondasDelCirculo(6, 5).flat();
    let comprobados = 0;

    for (let semilla = 0; semilla < 60; semilla++) {
      // Patrón determinista distinto por semilla; las 3 últimas, pendientes.
      const resultados = todos.map(([i, j], idx) =>
        R(ids[i], ids[j], idx < 12 ? (idx * 7 + semilla * 5) % 7 : null),
      );
      const r = computeClinchExpres({ pairIds: ids, resultados, clasifican: 2 });
      const indice = new Map(r.map((x, i) => [x.pairId, i]));
      const pendientes = resultados
        .filter((m) => m.gamesA === null)
        .map((m) => [indice.get(m.pairAId)!, indice.get(m.pairBId)!] as const);
      const v = verdad(r.map((x) => x.pairId), r.map((x) => x.balance), pendientes, 2);

      r.forEach((x, i) => {
        expect(x.estado).toBe(v.siempre[i] ? 'clinched' : v.alguna[i] ? 'alive' : 'eliminated');
        comprobados++;
      });
    }
    expect(comprobados).toBe(360);
  });
});

describe('hereda la validación de la tabla', () => {
  it('rechaza un marcador que no suma 6', () => {
    expect(() =>
      computeClinchExpres({ pairIds: CUATRO, resultados: [{ matchId: 'x', pairAId: 'a', pairBId: 'b', gamesA: 5, gamesB: 5 }] }),
    ).toThrow(/son 6 games exactos/);
  });

  it('rechaza una pareja ajena al grupo', () => {
    expect(() => computeClinchExpres({ pairIds: CUATRO, resultados: [R('a', 'z', 3)] })).toThrow(
      /no están en este grupo/,
    );
  });
});
