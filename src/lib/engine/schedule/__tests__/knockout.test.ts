import {
  programarEliminatorias,
  grafoDeHermandad,
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

describe('formatHora', () => {
  it('envuelve pasada la medianoche: no existen las 24:30', () => {
    // Un día con retrasos puede pasar de las 24 h. La pantalla enseñaba
    // "hasta las 24:30", que le dice al organizador que el cálculo está roto
    // aunque no lo esté.
    expect(formatHora(24 * 60 + 30)).toBe('00:30');
    expect(formatHora(25 * 60)).toBe('01:00');
    expect(formatHora(48 * 60 + 15)).toBe('00:15');
  });

  it('dentro del día no cambia nada', () => {
    expect(formatHora(0)).toBe('00:00');
    expect(formatHora(8 * 60)).toBe('08:00');
    expect(formatHora(23 * 60 + 59)).toBe('23:59');
  });

  it('aguanta negativos sin escupir un guion', () => {
    expect(formatHora(-30)).toBe('23:30');
  });
});

describe('cota inferior', () => {
  it('manda el encadenamiento, no la division simple', () => {
    // 17:00 con el 3.er lugar contando cancha en la oleada de las finales. La
    // cota mide dos cosas a la vez: el camino critico y si los partidos caben
    // en las canchas.
    //
    // SIN 3.er LUGAR TAMBIEN ES 17:00, y antes era 16:30: la cota se redondea
    // a la reticula. Un minimo teorico de 16:30 con partidos de 60 alineados a
    // la hora en punto no lo puede alcanzar ningun plan —no existe ese hueco—
    // y el motor se avisaba a si mismo de no llegar a un imposible.
    // El descanso ya no figura en la cota: es preferencia, no muro, y ponerlo
    // en el MINIMO teorico prometia una hora peor que la que el plan alcanza.
    expect(formatHora(cotaInferior(CIMEPA))).toBe('17:00');
    expect(formatHora(cotaInferior({ ...CIMEPA, tercerLugar: false }))).toBe('16:00');
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
    // 16:30 con la reticula de 30 min y el descanso duro. Con la reticula
    // horaria y el descanso como preferencia, 16:00.
    expect(sin.finEstimado).toBe('16:00');
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

  it('respeta el encadenamiento: nunca antes de que acabe la ronda anterior', () => {
    const inicioDe = new Map<string, number>();
    for (const p of r.partidos) {
      inicioDe.set(`${p.categoryId}#${p.ronda}`, p.inicioMin);
    }
    for (const p of r.partidos) {
      if (p.ronda === 1) continue;
      const previa = inicioDe.get(`${p.categoryId}#${p.ronda - 1}`)!;
      // Sin `+ 30`: el descanso es preferencia. Lo que no se puede es jugar
      // la ronda siguiente antes de que termine la anterior.
      expect(p.inicioMin).toBeGreaterThanOrEqual(previa + 60);
    }
  });

  it('las categorias con mas rondas abren el dia', () => {
    const primera = r.partidos
      .filter((p) => p.inicio === '08:00')
      .map((p) => p.categoryId);
    expect(new Set(primera)).toEqual(new Set(['3a', '4a']));
  });

  it('no deja avisos de PROBLEMA cuando es optimo', () => {
    // El aviso de optimalidad si sale, y tiene que salir: es la respuesta a
    // "veo huecos al final, ¿reprogramo?".
    const problemas = r.avisos.filter(
      (a) => !a.startsWith('Con una cancha menos')
        && !a.startsWith('Este calendario ya es')
        // El descanso sacrificado se informa con nombre: es el precio de
        // cerrar antes, no un problema del plan.
        && !/sin descanso|de descanso deseable/.test(a),
    );
    expect(problemas).toEqual([]);
  });

  it('dice que el plan ya es el mas corto posible', () => {
    expect(r.avisos.some((a) => a.startsWith('Este calendario ya es'))).toBe(true);
  });

  it('con una cancha menos ya no se sale del cierre: el aviso desaparece', () => {
    // Antes saltaba. Con encadenamiento libre, 7 canchas siguen cabiendo en la
    // ventana, y avisar de un riesgo que ya no existe es ruido.
    expect(r.avisos.some((a) => a.startsWith('Con una cancha menos'))).toBe(false);
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

  it('ya no depende de sus 8 canchas: con 7 sigue cabiendo', () => {
    // Con el descanso como preferencia el dia se compacta lo suficiente para
    // absorber una cancha caida dentro de la ventana.
    expect(r.avisos.some((a) => a.includes('Con una cancha menos'))).toBe(false);
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
    // El 3.er lugar cuelga de la final: misma distancia (0), misma exencion.
    // Antes no salia aqui porque el descanso lo separaba por accidente.
    const tempranos = r.empalmes.filter(
      (e) => e.etapa !== 'semi' && e.etapa !== 'final' && e.etapa !== 'third_place',
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

describe('grafoDeHermandad — un id vacío no es una persona', () => {
  it('dos categorías con una pareja a medio inscribir NO son hermanas', () => {
    const g = grafoDeHermandad([
      { id: 'A', clasificados: 4, jugadores: ['a1', ''] },
      { id: 'B', clasificados: 4, jugadores: ['b1', ''] },
    ]);
    expect(g.get('A')?.has('B') ?? false).toBe(false);
  });

  it('un jugador de verdad compartido sí las hermana', () => {
    const g = grafoDeHermandad([
      { id: 'A', clasificados: 4, jugadores: ['comun', ''] },
      { id: 'B', clasificados: 4, jugadores: ['comun', ''] },
    ]);
    expect(g.get('A')?.has('B')).toBe(true);
  });
});

/**
 * EL DOMINGO DE bb8e137e. 8 categorías, 90 partidos, 8 canchas, 08:00–21:00.
 *
 * El organizador veía huecos al final (18:30, 19:00 y 19:30 con 2 canchas de 8)
 * y volvía a darle a Reprogramar esperando que se compactaran. No se compactan:
 * el plan YA iguala la cota inferior. Lo que sí faltaba era el aviso de que la
 * hora realista se sale de la ventana.
 */
describe('domingo de bb8e137e — el plan es óptimo y lo dice', () => {
  const CATS: { id: string; clasificados: number }[] = [
    { id: '6ª Varonil', clasificados: 8 }, { id: '5ª Femenil', clasificados: 7 },
    { id: '5ª Varonil', clasificados: 16 }, { id: '4ª Mixto', clasificados: 11 },
    { id: '4ª Varonil', clasificados: 19 }, { id: '3ª Varonil', clasificados: 19 },
    { id: '3ª Mixto', clasificados: 5 }, { id: '2ª Varonil', clasificados: 13 },
  ];
  const entrada = {
    canchas: 8, desde: '08:00', hasta: '21:00', tercerLugar: false, categorias: CATS,
  };
  const r = programarEliminatorias(entrada);

  it('cierra exactamente en la cota inferior: no hay nada que compactar', () => {
    // 20:30 era la cota SIN reticula. Con partidos de 60 en hora en punto no
    // existe el hueco de las 19:30, asi que el minimo real es 21:00 — y el
    // plan lo clava. Alinear a la hora en punto cuesta 30 minutos de cierre.
    // 20:30 con la reticula de 30 y el descanso duro; 21:00 con la reticula
    // horaria y el descanso duro; 20:00 ahora que encadenar es legal. Y el
    // plan clava la cota: no queda nada que compactar.
    expect(r.cotaInferior).toBe('20:00');
    expect(r.finEstimado).toBe('20:00');
  });

  it('avisa de que la hora realista se pasa del cierre de la ventana', () => {
    expect(r.finRealista).toBe('21:15');
    // Es un ESCENARIO, no el veredicto: el plan nominal cabe.
    expect(r.cabe).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/Escenario con retrasos/);
    expect(r.avisos.join(' ')).toMatch(/El plan nominal cierra a las 20:00 y si cabe/);
  });

  it('dice que reprogramar no lo va a acortar', () => {
    expect(r.avisos.join(' ')).toMatch(/ya es el mas corto posible/);
  });

  it('con una cancha más el cierre baja una hora entera', () => {
    const nueve = programarEliminatorias({ ...entrada, canchas: 9, hasta: '23:59' });
    expect(nueve.finEstimado).toBe('19:00');
  });
});
