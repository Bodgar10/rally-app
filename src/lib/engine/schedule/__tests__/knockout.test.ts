import {
  programarEliminatorias,
  cotaInferior,
  partidosPorRonda,
  etapaDeRonda,
  byesDelCuadro,
  tamanoCuadro,
  parseHora,
  formatHora,
  type EntradaScheduler,
} from '../knockout';

const CIMEPA: EntradaScheduler = {
  canchas: 8,
  desde: '08:00',
  hasta: '20:00',
  categorias: [
    { id: '3a', clasificados: 12 },
    { id: '4a', clasificados: 12 },
    { id: '5a', clasificados: 12 },
    { id: '2a', clasificados: 8 },
    { id: '6a', clasificados: 8 },
    { id: 'mixD', clasificados: 8 },
    { id: '5fem', clasificados: 6 },
    { id: 'mixC', clasificados: 4 },
  ],
};

describe('arbol de rondas', () => {
  it('reparte los partidos y suma C - 1', () => {
    expect(partidosPorRonda(12)).toEqual([4, 4, 2, 1]);
    expect(partidosPorRonda(8)).toEqual([4, 2, 1]);
    expect(partidosPorRonda(6)).toEqual([2, 2, 1]);
    expect(partidosPorRonda(4)).toEqual([2, 1]);
    expect(partidosPorRonda(3)).toEqual([1, 1]);
    expect(partidosPorRonda(2)).toEqual([1]);
  });

  it('el total siempre es C - 1, con o sin byes', () => {
    for (let c = 2; c <= 64; c++) {
      const total = partidosPorRonda(c).reduce((a, b) => a + b, 0);
      expect(total).toBe(c - 1);
    }
  });

  it('calcula byes y tamano de cuadro', () => {
    expect(tamanoCuadro(12)).toBe(16);
    expect(byesDelCuadro(12)).toBe(4);
    expect(byesDelCuadro(6)).toBe(2);
    expect(byesDelCuadro(8)).toBe(0);
  });

  it('sin cuadro cuando hay menos de 2 clasificados', () => {
    expect(partidosPorRonda(1)).toEqual([]);
    expect(partidosPorRonda(0)).toEqual([]);
  });
});

describe('horas', () => {
  it('parsea y formatea', () => {
    expect(parseHora('08:00')).toBe(480);
    expect(parseHora('20:30')).toBe(1230);
    expect(formatHora(990)).toBe('16:30');
  });

  it('rechaza basura', () => {
    expect(() => parseHora('25:00')).toThrow();
    expect(() => parseHora('8')).toThrow();
  });
});

describe('cota inferior', () => {
  it('manda el encadenamiento, no la division simple', () => {
    expect(formatHora(cotaInferior(CIMEPA))).toBe('16:30');
  });
});

describe('Cimepa', () => {
  const r = programarEliminatorias(CIMEPA);

  it('programa los 62 partidos', () => {
    expect(r.totalPartidos).toBe(62);
    expect(r.partidos).toHaveLength(62);
    expect(r.cabe).toBe(true);
  });

  it('termina a las 16:30 y alcanza la cota', () => {
    expect(r.finEstimado).toBe('16:30');
    expect(r.cotaInferior).toBe('16:30');
  });

  it('mejora el domingo real, que acabo 19:15', () => {
    expect(parseHora(r.finEstimado!)).toBeLessThan(parseHora('17:00'));
  });

  it('nunca pone dos partidos en la misma cancha a la misma hora', () => {
    const vistos = new Set<string>();
    for (const p of r.partidos) {
      const k = `${p.inicio}#${p.cancha}`;
      expect(vistos.has(k)).toBe(false);
      vistos.add(k);
    }
  });

  it('nunca usa mas canchas de las que hay', () => {
    for (const f of r.ocupacionPorFranja) {
      expect(f.canchas).toBeLessThanOrEqual(CIMEPA.canchas);
    }
    for (const p of r.partidos) {
      expect(p.cancha).toBeGreaterThanOrEqual(1);
      expect(p.cancha).toBeLessThanOrEqual(CIMEPA.canchas);
    }
  });

  it('sincroniza cada ronda de cada categoria', () => {
    const porRonda = new Map<string, Set<string>>();
    for (const p of r.partidos) {
      const k = `${p.categoryId}#${p.ronda}`;
      if (!porRonda.has(k)) porRonda.set(k, new Set());
      porRonda.get(k)!.add(p.inicio);
    }
    for (const [k, horas] of porRonda) {
      expect(`${k}:${horas.size}`).toBe(`${k}:1`);
    }
  });

  it('respeta el encadenamiento y el descanso minimo', () => {
    const inicioDe = new Map<string, number>();
    for (const p of r.partidos) {
      inicioDe.set(`${p.categoryId}#${p.ronda}`, p.inicioMin);
    }
    for (const p of r.partidos) {
      if (p.ronda === 1) continue;
      const previa = inicioDe.get(`${p.categoryId}#${p.ronda - 1}`)!;
      expect(p.inicioMin).toBeGreaterThanOrEqual(previa + 60 + 30);
    }
  });

  it('las categorias con mas rondas abren el dia', () => {
    const primera = r.partidos
      .filter((p) => p.inicio === '08:00')
      .map((p) => p.categoryId);
    expect(new Set(primera)).toEqual(new Set(['3a', '4a']));
  });

  it('no deja avisos cuando el plan es optimo', () => {
    expect(r.avisos).toEqual([]);
  });
});

describe('efecto de la repesca', () => {
  it('sin repescados termina antes', () => {
    const sin = programarEliminatorias({
      ...CIMEPA,
      categorias: [
        { id: '3a', clasificados: 10 },
        { id: '4a', clasificados: 10 },
        { id: '5a', clasificados: 10 },
        { id: '2a', clasificados: 7 },
        { id: '6a', clasificados: 5 },
        { id: 'mixD', clasificados: 6 },
        { id: '5fem', clasificados: 4 },
        { id: 'mixC', clasificados: 3 },
      ],
    });
    expect(sin.totalPartidos).toBe(47);
    expect(parseHora(sin.finEstimado!)).toBeLessThan(parseHora('16:30'));
  });
});

describe('casos limite', () => {
  it('avisa de oleadas cuando la ronda no cabe en las canchas', () => {
    const r = programarEliminatorias({
      canchas: 8,
      desde: '08:00',
      hasta: '22:00',
      categorias: [{ id: 'x', clasificados: 32 }],
    });
    expect(r.totalPartidos).toBe(31);
    expect(r.avisos.some((a) => a.includes('oleadas'))).toBe(true);
  });

  it('reporta diagnostico cuando no cabe', () => {
    const r = programarEliminatorias({
      canchas: 2,
      desde: '08:00',
      hasta: '13:00',
      categorias: [
        { id: 'a', clasificados: 12 },
        { id: 'b', clasificados: 12 },
      ],
    });
    expect(r.cabe).toBe(false);
    expect(r.diagnostico!.partidosSinProgramar).toBeGreaterThan(0);
    expect(r.diagnostico!.canchasQueFaltan).toBeGreaterThan(0);
  });

  it('funciona en torneo express de un solo dia', () => {
    const r = programarEliminatorias({
      canchas: 4,
      desde: '09:00',
      hasta: '21:00',
      categorias: [
        { id: 'a', clasificados: 8 },
        { id: 'b', clasificados: 8 },
        { id: 'c', clasificados: 8 },
        { id: 'd', clasificados: 8 },
      ],
    });
    expect(r.cabe).toBe(true);
    expect(r.finEstimado).toBe(r.cotaInferior);
  });

  it('senala la categoria sin cuadro en vez de romperse', () => {
    const r = programarEliminatorias({
      canchas: 4,
      desde: '09:00',
      hasta: '20:00',
      categorias: [
        { id: 'a', clasificados: 8 },
        { id: 'vacia', clasificados: 1 },
      ],
    });
    expect(r.cabe).toBe(true);
    expect(r.avisos.some((a) => a.includes('vacia'))).toBe(true);
  });

  it('es determinista: el orden de entrada no cambia la salida', () => {
    const uno = programarEliminatorias(CIMEPA);
    const otro = programarEliminatorias({
      ...CIMEPA,
      categorias: [...CIMEPA.categorias].reverse(),
    });
    expect(otro.partidos).toEqual(uno.partidos);
  });

  it('rechaza entradas imposibles', () => {
    expect(() =>
      programarEliminatorias({ ...CIMEPA, canchas: 0 })
    ).toThrow();
    expect(() =>
      programarEliminatorias({ ...CIMEPA, desde: '20:00', hasta: '08:00' })
    ).toThrow();
    expect(() =>
      programarEliminatorias({ ...CIMEPA, minutosPorPartido: 200 })
    ).toThrow();
  });
});

describe('mapeo a match_stage', () => {
  it('mapea por distancia a la final', () => {
    expect(etapaDeRonda(4, 4)).toBe('final');
    expect(etapaDeRonda(3, 4)).toBe('semi');
    expect(etapaDeRonda(2, 4)).toBe('quarter');
    expect(etapaDeRonda(1, 4)).toBe('round_of_16');
    expect(etapaDeRonda(1, 2)).toBe('semi');
    expect(etapaDeRonda(2, 2)).toBe('final');
  });

  it('cada partido programado trae su etapa', () => {
    const r = programarEliminatorias(CIMEPA);
    const etapas = new Set(r.partidos.map((p) => p.etapa));
    expect(etapas.has('final')).toBe(true);
    expect(etapas.has('round_of_16')).toBe(true);
    for (const p of r.partidos) {
      expect(p.etapa).toBe(etapaDeRonda(p.ronda, p.totalRondas));
    }
  });

  it('revienta con cuadros de mas de 32', () => {
    expect(() => etapaDeRonda(1, 6)).toThrow();
  });
});
