import { repartirPorBloque } from '../reparto';
import { computeFormat } from '../../format';

/** Una pareja: id y el bloque que eligio (null si no eligio). */
interface P { id: string; bloque: string | null }

const V = '2026-09-11-14:00';   // viernes 14:00
const V2 = '2026-09-11-17:00';
const S = '2026-09-12-08:00';   // sabado 08:00
const S2 = '2026-09-12-11:00';

/** n parejas del bloque b, con ids legibles. */
function parejas(b: string | null, n: number, prefijo = 'p'): P[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefijo}${i + 1}`, bloque: b }));
}

const reparte = (ps: P[], sizes: number[]) =>
  repartirPorBloque(ps, (p) => p.bloque, sizes);

/** Bloques distintos de los que sale un grupo. */
const bloquesDe = (g: { desde: Record<string, number> }) => Object.keys(g.desde).length;

describe('repartirPorBloque', () => {
  it('respeta el numero y los tamanos del plan', () => {
    // Los tamanos NO son negociables: de su cantidad sale el cuadro.
    const ps = [...parejas(V, 5, 'v'), ...parejas(S, 6, 's')];
    const sizes = [4, 4, 3];
    const g = reparte(ps, sizes);

    expect(g.length).toBe(3);
    expect(g.map((x) => x.items.length).sort()).toEqual([3, 4, 4]);
    // Y nadie se queda fuera ni se repite.
    expect(g.flatMap((x) => x.items.map((i) => i.id)).sort())
      .toEqual(ps.map((p) => p.id).sort());
  });

  it('un bloque que cuadra justo no mezcla a nadie', () => {
    // 6 del viernes y 6 del sabado, en grupos de 3: cuatro grupos limpios.
    const ps = [...parejas(V, 6, 'v'), ...parejas(S, 6, 's')];
    const g = reparte(ps, [3, 3, 3, 3]);

    expect(g.every((x) => bloquesDe(x) === 1)).toBe(true);
    expect(g.map((x) => x.bloqueId).sort()).toEqual([V, V, S, S].sort());
  });

  it('el caso del enunciado: 7 parejas en un bloque dan dos grupos y sobra una', () => {
    // 7 en el viernes, 5 en el sabado. Plan de 12 parejas: [3,3,3,3].
    const ps = [...parejas(V, 7, 'v'), ...parejas(S, 5, 's')];
    const g = reparte(ps, [3, 3, 3, 3]);

    const limpios = g.filter((x) => bloquesDe(x) === 1);
    const mezclados = g.filter((x) => bloquesDe(x) > 1);

    // Viernes: 2 grupos limpios y 1 suelta. Sabado: 1 limpio y 2 sueltas.
    expect(limpios.length).toBe(3);
    expect(mezclados.length).toBe(1);
    // El resto se junta: 1 del viernes + 2 del sabado.
    expect(mezclados[0].desde).toEqual({ [V]: 1, [S]: 2 });
    // Y su bloque es el de la mayoria.
    expect(mezclados[0].bloqueId).toBe(S);
  });

  it('nunca deja una pareja sin grupo', () => {
    // Restos por todos lados: 1, 2, 1 y 2 parejas en cuatro bloques.
    const ps = [
      ...parejas(V, 1, 'a'), ...parejas(V2, 2, 'b'),
      ...parejas(S, 1, 'c'), ...parejas(S2, 2, 'd'),
    ];
    const g = reparte(ps, [3, 3]);

    expect(g.length).toBe(2);
    expect(g.flatMap((x) => x.items).length).toBe(6);
    // Ninguno queda limpio, y eso esta bien: lo inaceptable seria dejar fuera
    // a alguien que ya pago.
    expect(g.every((x) => x.items.length === 3)).toBe(true);
  });

  it('los grupos grandes se colocan primero para no salir mezclados', () => {
    // 4 en el viernes y 3 en el sabado, plan [4,3]. Si el 3 se colocara antes,
    // partiria el cuatro del viernes y los dos grupos saldrian mezclados.
    const ps = [...parejas(V, 4, 'v'), ...parejas(S, 3, 's')];
    const g = reparte(ps, [4, 3]);

    expect(g.every((x) => bloquesDe(x) === 1)).toBe(true);
    expect(g.find((x) => x.items.length === 4)!.bloqueId).toBe(V);
    expect(g.find((x) => x.items.length === 3)!.bloqueId).toBe(S);
  });

  it('las parejas sin bloque forman grupo entre ellas si dan para uno', () => {
    const ps = [...parejas(V, 3, 'v'), ...parejas(null, 3, 'x')];
    const g = reparte(ps, [3, 3]);

    expect(g.find((x) => x.bloqueId === V)!.items.map((i) => i.id))
      .toEqual(['v1', 'v2', 'v3']);
    const huerfano = g.find((x) => x.bloqueId === null)!;
    expect(huerfano.items.map((i) => i.id)).toEqual(['x1', 'x2', 'x3']);
  });

  it('un bloque real le gana al "sin bloque" cuando empatan', () => {
    // 1 del viernes, 1 sin bloque y 1 del sabado: empate a uno. Gana el bloque
    // mas temprano, y desde luego no el hueco.
    const ps = [
      { id: 'v1', bloque: V }, { id: 'x1', bloque: null }, { id: 's1', bloque: S },
    ];
    const g = reparte(ps, [3]);
    expect(g[0].bloqueId).toBe(V);
  });

  it('sin ninguna eleccion se comporta como antes: un solo cubo', () => {
    const ps = parejas(null, 9, 'x');
    const g = reparte(ps, [3, 3, 3]);
    expect(g.length).toBe(3);
    expect(g.every((x) => x.bloqueId === null)).toBe(true);
    expect(g.map((x) => x.items.map((i) => i.id))).toEqual([
      ['x1', 'x2', 'x3'], ['x4', 'x5', 'x6'], ['x7', 'x8', 'x9'],
    ]);
  });

  it('es determinista y no depende del orden de los bloques', () => {
    const ps = [...parejas(S, 4, 's'), ...parejas(V, 5, 'v')];
    const a = reparte(ps, [3, 3, 3]);
    const b = reparte(ps, [3, 3, 3]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Los bloques se recorren en orden cronologico, no en el de llegada.
    expect(a[0].bloqueId).toBe(V);
  });

  it('no muta la entrada', () => {
    const ps = [...parejas(V, 3, 'v'), ...parejas(S, 3, 's')];
    const copia = JSON.stringify(ps);
    const sizes = [3, 3];
    reparte(ps, sizes);
    expect(JSON.stringify(ps)).toBe(copia);
    expect(sizes).toEqual([3, 3]);
  });
});

describe('reparto contra el reparto real de computeFormat', () => {
  it('20 parejas repartidas en 4 bloques de 5', () => {
    // computeFormat(20) da [4,4,3,3,3,3]. Cada bloque tiene 5 parejas: cabe un
    // grupo de 4 y sobra 1, o uno de 3 y sobran 2.
    const sizes = computeFormat(20).groupSizes;
    expect(sizes).toEqual([4, 4, 3, 3, 3, 3]);

    const ps = [
      ...parejas(V, 5, 'a'), ...parejas(V2, 5, 'b'),
      ...parejas(S, 5, 'c'), ...parejas(S2, 5, 'd'),
    ];
    const g = reparte(ps, sizes);

    expect(g.length).toBe(6);
    expect(g.map((x) => x.items.length).sort()).toEqual([3, 3, 3, 3, 4, 4]);
    expect(g.flatMap((x) => x.items).length).toBe(20);
    // Cuatro grupos limpios (uno por bloque) y dos armados con los restos.
    expect(g.filter((x) => bloquesDe(x) === 1).length).toBe(4);
    expect(g.filter((x) => bloquesDe(x) > 1).length).toBe(2);
  });

  it('21 parejas en tres bloques de 7 no mezclan nada', () => {
    const sizes = computeFormat(21).groupSizes;   // siete grupos de 3
    const ps = [...parejas(V, 7, 'a'), ...parejas(S, 7, 'b'), ...parejas(S2, 7, 'c')];
    const g = reparte(ps, sizes);

    // 7 = 3 + 3 + resto 1. Tres restos de 1 forman el septimo grupo.
    expect(g.length).toBe(7);
    expect(g.filter((x) => bloquesDe(x) === 1).length).toBe(6);
    expect(g.filter((x) => bloquesDe(x) > 1).length).toBe(1);
  });
});
