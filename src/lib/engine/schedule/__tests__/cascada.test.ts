import { planearDiaEnCascada, turnosDeCuadro, type CategoriaEnCascada } from '../cascada';

/** Un grupo de 4: 3 rondas x 2 partidos, round robin completo. */
function grupoDe4(catId: string, g: string) {
  const p = (i: number) => `${catId}#${g}#${i}`;
  const rondas = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  return {
    id: `${catId}-${g}`,
    nombre: g,
    partidos: rondas.flatMap((ronda, ri) =>
      ronda.map(([a, b], k) => ({
        matchId: `${catId}-${g}-r${ri}-${k}`,
        pairAId: p(a), pairBId: p(b), ronda: ri + 1,
      }))),
  };
}

const cat = (id: string, grupos: string[], clasificados: number): CategoriaEnCascada => ({
  id, clasificados, grupos: grupos.map((g) => grupoDe4(id, g)),
});

/**
 * PADEL HYPE, el torneo real: 4 canchas, 30 min, 12:00 a 23:00.
 * 12 + 12 + 8 parejas en grupos de 4.
 */
const HYPE = {
  canchas: 4, desde: '12:00', hasta: '23:00', minutosPorPartido: 30,
  categorias: [
    cat('5a', ['A', 'B', 'C'], 8),
    cat('6a', ['A', 'B', 'C'], 8),
    cat('7a', ['A', 'B'], 4),
  ],
};

describe('turnosDeCuadro', () => {
  it('un cuadro de 8 en 4 canchas son tres turnos: cuartos, semis y final', () => {
    expect(turnosDeCuadro(8, 4)).toBe(3);
  });
  it('en 2 canchas los cuartos ocupan dos turnos', () => {
    expect(turnosDeCuadro(8, 2)).toBe(4);
  });
  it('un cuadro de 4 son dos turnos', () => {
    expect(turnosDeCuadro(4, 4)).toBe(2);
  });
});

describe('el día en cascada · Padel Hype', () => {
  const plan = planearDiaEnCascada(HYPE);

  it('coloca los 48 partidos de grupos', () => {
    expect(plan.partidos).toHaveLength(48);
    expect(plan.sinColocar).toEqual([]);
  });

  it('empieza por la categoría más grande', () => {
    expect(plan.orden[0]).toBe('5a');
    expect(plan.orden[2]).toBe('7a');
  });

  it('nunca pone más partidos que canchas en un turno', () => {
    const porTurno = new Map<number, number>();
    for (const p of plan.partidos) porTurno.set(p.inicioMin, (porTurno.get(p.inicioMin) ?? 0) + 1);
    for (const n of porTurno.values()) expect(n).toBeLessThanOrEqual(4);
  });

  it('nadie juega dos partidos a la vez', () => {
    const vistos = new Set<string>();
    for (const p of plan.partidos) {
      const m = HYPE.categorias.flatMap((c) => c.grupos).flatMap((g) => g.partidos)
        .find((x) => x.matchId === p.matchId)!;
      for (const pareja of [m.pairAId, m.pairBId]) {
        const clave = `${pareja}@${p.inicioMin}`;
        expect(vistos.has(clave)).toBe(false);
        vistos.add(clave);
      }
    }
  });

  it('cada categoría tiene su hueco de cuadro reservado al acabar sus grupos', () => {
    expect(plan.huecos).toHaveLength(3);
    for (const h of plan.huecos) {
      const suyos = plan.partidos.filter((p) => p.categoryId === h.categoryId);
      const fin = Math.max(...suyos.map((p) => p.inicioMin)) + 30;
      // El cuadro arranca justo cuando acaban sus grupos, no horas después.
      expect(h.desdeMin).toBe(fin);
    }
  });

  it('los grupos nunca le quitan una cancha al cuadro que ya la tenía pedida', () => {
    // La reserva es de CANCHAS, no de turnos: mientras una categoría juega su
    // final en una cancha, las otras tres son de la siguiente. Lo que no puede
    // pasar es que entre las dos pidan más canchas de las que hay.
    const rondas = (c: number) => (c === 8 ? [4, 2, 1] : [2, 1]);
    const pedidas = new Map<number, number>();
    for (const h of plan.huecos) {
      const cat = HYPE.categorias.find((c) => c.id === h.categoryId)!;
      rondas(cat.clasificados).forEach((n, i) => {
        const t = h.desdeMin + i * 30;
        pedidas.set(t, (pedidas.get(t) ?? 0) + n);
      });
    }
    const grupos = new Map<number, number>();
    for (const p of plan.partidos) grupos.set(p.inicioMin, (grupos.get(p.inicioMin) ?? 0) + 1);
    for (const [t, n] of pedidas) {
      expect(n + (grupos.get(t) ?? 0)).toBeLessThanOrEqual(4);
    }
  });

  it('el día cabe en la ventana y nadie espera tres horas', () => {
    // Con cuatro canchas el mínimo teórico son 65 partidos / 4 = 16,25 turnos.
    // La cascada paga media hora por encima de eso; lo que compra es que la
    // 5ª Mixto se vaya a casa a media tarde en vez de a las ocho.
    expect(plan.finMin).not.toBeNull();
    expect(plan.finMin!).toBeLessThanOrEqual(21 * 60 + 30);
    expect(plan.avisos.filter((a) => a.includes('se sale de la ventana'))).toEqual([]);
  });

  it('entre dos partidos de la misma pareja nunca pasa más de una hora y media', () => {
    const porPareja = new Map<string, number[]>();
    for (const p of plan.partidos) {
      const m = HYPE.categorias.flatMap((c) => c.grupos).flatMap((g) => g.partidos)
        .find((x) => x.matchId === p.matchId)!;
      for (const pareja of [m.pairAId, m.pairBId]) {
        porPareja.set(pareja, [...(porPareja.get(pareja) ?? []), p.inicioMin]);
      }
    }
    for (const [pareja, slots] of porPareja) {
      const s = slots.sort((a, b) => a - b);
      for (let i = 1; i < s.length; i++) {
        const espera = s[i] - s[i - 1] - 30;
        expect({ pareja, espera }).toEqual({ pareja, espera: expect.any(Number) });
        expect(espera).toBeLessThanOrEqual(90);
      }
    }
  });
});

describe('el día en cascada · casos de borde', () => {
  it('una sola categoría es simplemente su día', () => {
    const plan = planearDiaEnCascada({ ...HYPE, categorias: [cat('5a', ['A', 'B', 'C'], 8)] });
    expect(plan.partidos).toHaveLength(18);
    expect(plan.orden).toEqual(['5a']);
  });

  it('sin ventana suficiente lo dice en vez de inventarse horas', () => {
    const plan = planearDiaEnCascada({ ...HYPE, hasta: '14:00' });
    expect(plan.sinColocar.length).toBeGreaterThan(0);
    expect(plan.avisos.join(' ')).toContain('no caben');
  });

  it('rechaza una ventana invertida', () => {
    expect(() => planearDiaEnCascada({ ...HYPE, desde: '20:00', hasta: '12:00' })).toThrow();
  });
});
