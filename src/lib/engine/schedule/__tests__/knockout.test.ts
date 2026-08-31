import {
  programarEliminatorias,
  cotaInferior,
  partidosPorRonda,
  etapaDeRonda,
  FACTOR_RETRASO,
  finRealistaEncadenado,
  cadenasDePartidos,
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
    // 17:00 con el 3.er lugar contando cancha en la oleada de las finales;
    // 16:30 sin el. La cota mide dos cosas a la vez: el camino critico y si
    // los partidos caben en las canchas.
    expect(formatHora(cotaInferior(CIMEPA))).toBe('17:00');
    expect(formatHora(cotaInferior({ ...CIMEPA, tercerLugar: false }))).toBe('16:30');
  });
});

describe('Cimepa', () => {
  const r = programarEliminatorias(CIMEPA);

  it('programa los 70 partidos: 62 de cuadro y 8 terceros lugares', () => {
    // El 3.er lugar entra en el presupuesto desde que es configurable. Antes
    // eran 8 partidos invisibles que aun asi ocupaban cancha, y justo en la
    // transicion de semis a final: el momento en que las ocho categorias
    // convergen y el dia va mas cargado.
    expect(r.totalPartidos).toBe(70);
    expect(r.partidos).toHaveLength(70);
    expect(r.cabe).toBe(true);
    expect(r.partidos.filter((p) => p.etapa === 'third_place')).toHaveLength(8);
  });

  it('termina a las 17:00; sin 3.er lugar eran las 16:30', () => {
    expect(r.finEstimado).toBe('17:00');
    // La cota tambien sube: el 3.er lugar no alarga la cadena —corre en
    // paralelo a la final— pero si ocupa cancha en esa oleada, y la cota mide
    // las dos cosas.
    expect(r.cotaInferior).toBe('17:00');
  });

  it('sigue mejorando el domingo real, que acabo 19:15', () => {
    expect(parseHora(r.finEstimado!)).toBeLessThan(parseHora('19:15'));
  });

  it('sin 3.er lugar vuelve exactamente a los numeros de antes', () => {
    const sin = programarEliminatorias({ ...CIMEPA, tercerLugar: false });
    expect(sin.totalPartidos).toBe(62);
    expect(sin.finEstimado).toBe('16:30');
    expect(sin.partidos.some((p) => p.etapa === 'third_place')).toBe(false);
  });

  it('el 3.er lugar corre a la vez que su final, o despues, nunca antes', () => {
    // Depende de las dos semifinales, igual que la final. No hay razon para
    // que espere, pero tampoco puede adelantarse.
    const finales = new Map<string, number>();
    for (const p of r.partidos) if (p.etapa === 'final') finales.set(p.categoryId, p.inicioMin);
    for (const p of r.partidos) {
      if (p.etapa !== 'third_place') continue;
      expect(p.inicioMin).toBeGreaterThanOrEqual(finales.get(p.categoryId)! - 0);
    }
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

  it('no deja avisos del plan cuando es optimo', () => {
    const delPlan = r.avisos.filter((a) => !a.startsWith('Con una cancha menos'));
    expect(delPlan).toEqual([]);
  });

  it('avisa de que Cimepa depende de sus 8 canchas', () => {
    expect(r.avisos.some((a) => a.startsWith('Con una cancha menos'))).toBe(true);
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
    // 47 de cuadro + 7 terceros lugares: la categoria de 3 clasificados no
    // tiene dos perdedores de semifinal, asi que no juega el suyo.
    expect(sin.totalPartidos).toBe(54);
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
    expect(r.totalPartidos).toBe(32);   // 31 de cuadro + el 3.er lugar
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
      // El 3.er lugar cuelga del arbol, no esta dentro: sale de los dos
      // perdedores de semifinal y `etapaDeRonda` nunca lo devuelve.
      if (p.etapa === 'third_place') continue;
      expect(p.etapa).toBe(etapaDeRonda(p.ronda, p.totalRondas));
    }
  });

  it('revienta con cuadros de mas de 32', () => {
    expect(() => etapaDeRonda(1, 6)).toThrow();
  });
});

describe('las tres horas', () => {
  const r = programarEliminatorias(CIMEPA);

  it('el plan sigue dando 17:00', () => {
    expect(r.finEstimado).toBe('17:00');
  });

  it('la realista es posterior al plan', () => {
    expect(parseHora(r.finRealista!)).toBeGreaterThan(parseHora(r.finEstimado!));
  });

  it('con una cancha menos es posterior a la realista', () => {
    expect(parseHora(r.finRealistaUnaCanchaMenos!)).toBeGreaterThan(
      parseHora(r.finRealista!),
    );
  });

  it('el retraso aplicado es el factor, no un numero suelto', () => {
    expect(FACTOR_RETRASO).toBe(1.25);
  });

  it('las corridas 2 y 3 no tocan lo que produce el plan', () => {
    // 70 partidos, cabe, cota alcanzada: todo sale de la corrida 1 y las
    // simulaciones con 23:59 no lo contaminan.
    expect(r.cabe).toBe(true);
    expect(r.totalPartidos).toBe(70);
    expect(r.partidos).toHaveLength(70);
    expect(r.cotaInferior).toBe('17:00');
    expect(r.ultimoInicio).toBe('16:00');
  });

  it('con una sola cancha no simula la averia y no revienta', () => {
    const solo = programarEliminatorias({
      canchas: 1,
      desde: '08:00',
      hasta: '22:00',
      categorias: [{ id: 'a', clasificados: 4 }],
    });
    expect(solo.finRealistaUnaCanchaMenos).toBeNull();
    expect(solo.finRealista).not.toBeNull();
  });

  it('avisa de la cancha menos cuando se pasa del cierre', () => {
    // Cimepa cabe a las 16:30 con 8 canchas, pero con 7 y partidos de 75
    // minutos se va a las 22:45: el formato depende de que no falle ninguna.
    expect(r.avisos.some((a) => a.includes('Con una cancha menos'))).toBe(true);
  });

  it('no avisa cuando sobra tarde', () => {
    const holgado = programarEliminatorias({ ...CIMEPA, hasta: '23:00' });
    expect(holgado.avisos.some((a) => a.includes('Con una cancha menos'))).toBe(false);
  });
});

describe('separacion de categorias hermanas', () => {
  // Dos cuadros de 8 con holgura de sobra: si el motor quiere separarlos,
  // puede. 'ana' juega en las dos, asi que son hermanas.
  const HERMANAS: EntradaScheduler = {
    canchas: 8,
    desde: '08:00',
    hasta: '22:00',
    categorias: [
      { id: 'A', clasificados: 8, jugadores: ['ana', 'a1', 'a2'] },
      { id: 'B', clasificados: 8, jugadores: ['ana', 'b1', 'b2'] },
    ],
  };

  it('no comparten instante en rondas tempranas cuando hay holgura', () => {
    const r = programarEliminatorias(HERMANAS);
    const tempranos = r.partidos.filter((p) => p.totalRondas - p.ronda >= 2);
    // Cuartos de A y cuartos de B nunca a la misma hora.
    const porHora = new Map<string, Set<string>>();
    for (const p of tempranos) {
      if (!porHora.has(p.inicio)) porHora.set(p.inicio, new Set());
      porHora.get(p.inicio)!.add(p.categoryId);
    }
    for (const [hora, cats] of porHora) {
      expect(`${hora}:${[...cats].sort().join('+')}`).not.toBe(`${hora}:A+B`);
    }
  });

  it('ningun empalme temprano queda registrado', () => {
    const r = programarEliminatorias(HERMANAS);
    const tempranos = r.empalmes.filter(
      (e) => e.etapa !== 'semi' && e.etapa !== 'final',
    );
    expect(tempranos).toEqual([]);
  });

  // Cuadros de 4: solo dos rondas, semifinal y final. TODAS estan exentas de
  // la regla, asi que el motor las junta al arrancar sin apartarlas.
  const SOLO_SEMIS: EntradaScheduler = {
    canchas: 8,
    desde: '08:00',
    hasta: '22:00',
    categorias: [
      { id: 'A', clasificados: 4, jugadores: ['ana', 'a1'] },
      { id: 'B', clasificados: 4, jugadores: ['ana', 'b1'] },
    ],
  };

  it('las semifinales hermanas SI pueden compartir instante', () => {
    const r = programarEliminatorias(SOLO_SEMIS);
    const semis = r.partidos.filter((p) => p.etapa === 'semi');
    expect(new Set(semis.map((p) => p.categoryId))).toEqual(new Set(['A', 'B']));
    // Las dos arrancan a las 08:00: la regla no las separo.
    expect(new Set(semis.map((p) => p.inicio))).toEqual(new Set(['08:00']));
  });

  it('y ese empalme queda registrado para avisar al organizador', () => {
    const r = programarEliminatorias(SOLO_SEMIS);
    const semi = r.empalmes.find((e) => e.etapa === 'semi');
    expect(semi).toBeDefined();
    expect([semi!.categoriaA, semi!.categoriaB].sort()).toEqual(['A', 'B']);
    expect(semi!.hora).toBe('08:00');
  });

  it('la final hermana tambien se registra', () => {
    const r = programarEliminatorias(SOLO_SEMIS);
    expect(r.empalmes.some((e) => e.etapa === 'final')).toBe(true);
  });

  it('sin el campo jugadores no hay hermandad ni empalmes', () => {
    const sin = programarEliminatorias({
      ...HERMANAS,
      categorias: HERMANAS.categorias.map((c) => ({ id: c.id, clasificados: c.clasificados })),
    });
    expect(sin.empalmes).toEqual([]);
  });

  it('Cimepa sin jugadores no activa la separacion de hermanas', () => {
    // La garantia de no-regresion del campo `jugadores`: es opcional y su
    // ausencia deja el motor sin hermandades que separar.
    const r = programarEliminatorias(CIMEPA);
    expect(r.finEstimado).toBe('17:00');
    expect(r.empalmes).toEqual([]);
    expect(r.partidos).toHaveLength(70);
  });

  it('sigue siendo determinista con hermandades', () => {
    const uno = programarEliminatorias(HERMANAS);
    const otro = programarEliminatorias({
      ...HERMANAS,
      categorias: [...HERMANAS.categorias].reverse(),
    });
    expect(otro.partidos).toEqual(uno.partidos);
    expect(otro.empalmes).toEqual(uno.empalmes);
  });

  it('no se bloquea cuando todas son hermanas de todas', () => {
    // Grafo completo y SIN HOLGURA: la regla es preferencia, no restriccion.
    // Sin el tope de espera esto dejaria canchas ociosas para siempre.
    //
    // `tercerLugar: false` a proposito. El encaje exacto es la premisa —28
    // partidos en 14 horas de dos canchas, ni un hueco— y es lo que hace que
    // este test signifique algo. Anadir los cuatro terceros lugares lo
    // convertiria en un test de capacidad, que es otra cosa y ya esta cubierta.
    const r = programarEliminatorias({
      canchas: 2,
      desde: '08:00',
      hasta: '22:00',
      tercerLugar: false,
      categorias: ['A', 'B', 'C', 'D'].map((id) => ({
        id, clasificados: 8, jugadores: ['todos', `p${id}`],
      })),
    });
    expect(r.cabe).toBe(true);
    expect(r.partidos).toHaveLength(28);
  });
});

describe('retraso encadenado', () => {
  it('el retraso se acumula por RONDA, no por partido suelto', () => {
    // Una categoria de 4 rondas cuyo ultimo partido empieza a las 15:00:
    // termina 16:00 planificada, y cada ronda arrastra 15 min (25% de 60).
    // 16:00 + 4 x 15 = 17:00.
    const min = finRealistaEncadenado(
      [{ categoryId: 'a', rondas: 4, ultimoInicioMin: parseHora('15:00') }],
      60,
    );
    expect(formatHora(min!)).toBe('17:00');
  });

  it('manda la categoria que peor acaba, no la que juega mas tarde', () => {
    // 'corta' empieza su ultimo partido despues, pero encadena menos rondas.
    const min = finRealistaEncadenado([
      { categoryId: 'larga', rondas: 5, ultimoInicioMin: parseHora('15:00') },
      { categoryId: 'corta', rondas: 1, ultimoInicioMin: parseHora('15:30') },
    ], 60);
    // larga: 16:00 + 75 = 17:15 · corta: 16:30 + 15 = 16:45
    expect(formatHora(min!)).toBe('17:15');
  });

  it('un hueco ocioso NO hereda retraso', () => {
    // Dos categorias identicas, una con su ultimo partido dos horas despues.
    // El desfase se traslada tal cual: el hueco no multiplica nada.
    const a = finRealistaEncadenado([{ categoryId: 'a', rondas: 2, ultimoInicioMin: parseHora('10:00') }], 60);
    const b = finRealistaEncadenado([{ categoryId: 'b', rondas: 2, ultimoInicioMin: parseHora('12:00') }], 60);
    expect(b! - a!).toBe(120);
  });

  it('sin cadenas no hay hora', () => {
    expect(finRealistaEncadenado([], 60)).toBeNull();
  });

  it('cadenasDePartidos resume cada categoria por su peor caso', () => {
    const r = programarEliminatorias(CIMEPA);
    const cadenas = cadenasDePartidos(r.partidos);
    expect(cadenas).toHaveLength(8);
    const tresA = cadenas.find((c) => c.categoryId === '3a')!;
    // 12 clasificados -> [4,4,2,1]: cuatro rondas encadenadas.
    expect(tresA.rondas).toBe(4);
  });

  it('Cimepa: la realista sale de la cadena del plan', () => {
    const r = programarEliminatorias(CIMEPA);
    const esperado = finRealistaEncadenado(cadenasDePartidos(r.partidos), 60);
    expect(r.finRealista).toBe(formatHora(esperado!));
  });
});
