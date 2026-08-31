// src/lib/engine/planner/__tests__/planner.test.ts
//
// Fija el contrato del planificador contra los dos casos de la especificación:
// un torneo grande donde la capacidad aprieta (Cimepa) y uno chico donde sobra.
// Si estos dos pasan, la calibración no es una preferencia fija: es capacidad.

import { planTournament, candidatos, minutosDeVentana, type Capacidad } from '../index';

// ── Capacidades de referencia ───────────────────────────────────────────────

const CIMEPA: Capacidad = {
  canchas: 8,
  minutosPorPartido: 60,
  ventanas: [
    // `hasta` es la hora a la que TERMINA el último partido, no a la que
    // empieza: en Cimepa hubo partidos arrancando a las 22:00.
    { fecha: '2026-03-13', desde: '14:00', hasta: '23:00' }, //  9 h → 72
    { fecha: '2026-03-14', desde: '08:00', hasta: '23:00' }, // 15 h → 120
    { fecha: '2026-03-15', desde: '08:00', hasta: '20:00' }, // 12 h → 96
  ],
};

const CATEGORIAS_CIMEPA = [
  { id: '2A',  parejas: 21 },
  { id: '3A',  parejas: 30 },
  { id: '4A',  parejas: 30 },
  { id: '5A',  parejas: 30 },
  { id: '6A',  parejas: 15 },
  { id: '5F',  parejas: 12 },
  { id: 'MxD', parejas: 18 },
  { id: 'MxC', parejas: 9  },
];

describe('presupuesto (§4)', () => {
  it('reparte los días: todos menos el último a grupos, el último a eliminatorias', () => {
    const r = planTournament(CATEGORIAS_CIMEPA, CIMEPA);
    expect(r.grupos.presupuesto).toBe(192);       // 72 + 120
    expect(r.eliminacion.presupuesto).toBe(96);   // 12 h × 8
  });

  it('una ventana con hora final menor o igual a la inicial no aporta minutos', () => {
    expect(minutosDeVentana({ fecha: 'x', desde: '20:00', hasta: '08:00' })).toBe(0);
  });
});

describe('candidatos (§5)', () => {
  it('N=30 genera las tres particiones de la spec con su coste', () => {
    const c = candidatos({ id: 'x', parejas: 30 });

    // 10 grupos de 3, sin repescar: 10 clasificados en cuadro de 16.
    const diezDeTres = c.find((p) =>
      p.groupSizes.every((s) => s === 3) && p.segundosQueAvanzan === 0)!;
    expect(diezDeTres.grupos).toBe(10);
    expect(diezDeTres.costeGrupos).toBe(30);
    expect(diezDeTres.asegurados).toBe(2);
    expect(diezDeTres.clasificados).toBe(10);
    expect(diezDeTres.bracketSize).toBe(16);
    expect(diezDeTres.byes).toBe(6);
    expect(diezDeTres.partidosPrimeraRonda).toBe(2);
    // C−1 más el 3.er lugar, que va por defecto. Sin él serían 9.
    expect(diezDeTres.costeEliminacion).toBe(10);

    const seisDeCinco = c.find((p) =>
      p.groupSizes.every((s) => s === 5) && p.segundosQueAvanzan === 0)!;
    expect(seisDeCinco.grupos).toBe(6);
    expect(seisDeCinco.costeGrupos).toBe(60);
    expect(seisDeCinco.asegurados).toBe(4);
    expect(seisDeCinco.bracketSize).toBe(8);
    expect(seisDeCinco.costeEliminacion).toBe(6);   // 5 de cuadro + el 3.er lugar
  });

  it('reproduce el cuadro real de 5ª Fuerza: 12 clasificados, 4 byes, 4 partidos', () => {
    // Es lo que Cimepa armó a mano: 10 primeros + 2 mejores segundos.
    const p = candidatos({ id: 'x', parejas: 30 })
      .find((x) => x.groupSizes.every((s) => s === 3) && x.segundosQueAvanzan === 2)!;
    expect(p.clasificados).toBe(12);
    expect(p.bracketSize).toBe(16);
    expect(p.byes).toBe(4);
    expect(p.partidosPrimeraRonda).toBe(4);
    expect(p.costeEliminacion).toBe(12);   // 11 de cuadro + el 3.er lugar
  });

  it('el total de eliminatorias es siempre C−1, con byes o sin ellos', () => {
    // Cada partido elimina a una pareja; hay que eliminar a C−1 para dejar
    // campeón. Los byes cambian en qué ronda entra cada quien, no el total.
    for (let n = 6; n <= 40; n++) {
      // Sin 3.er lugar el coste es exactamente el del cuadro.
      for (const p of candidatos({ id: 'x', parejas: n }, false)) {
        expect(p.costeEliminacion).toBe(p.clasificados - 1);
        expect(p.byes).toBe(p.bracketSize - p.clasificados);
        expect(p.partidosPrimeraRonda).toBe(p.clasificados - p.bracketSize / 2);
        // Los que pasan a la 2ª ronda llenan media llave, siempre.
        expect(p.byes + p.partidosPrimeraRonda).toBe(p.bracketSize / 2);
      }
    }
  });

  it('nunca propone grupos de menos de 3 (R1)', () => {
    for (const n of [6, 7, 11, 13, 17, 23, 29, 31]) {
      for (const p of candidatos({ id: 'x', parejas: n })) {
        expect(Math.min(...p.groupSizes)).toBeGreaterThanOrEqual(3);
        expect(p.asegurados).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('el cuadro es potencia de 2, pero los clasificados NO tienen por qué serlo', () => {
    // Lo contrario era el bug: forzar C a potencia de 2 hacía los byes
    // inalcanzables, cuando en el padel real son la norma.
    let vistosConByes = 0;
    for (let n = 3; n <= 40; n++) {
      for (const p of candidatos({ id: 'x', parejas: n })) {
        expect(Math.log2(p.bracketSize) % 1).toBe(0);
        expect(p.clasificados).toBeLessThanOrEqual(p.bracketSize);
        expect(p.clasificados).toBeGreaterThan(p.bracketSize / 2);   // el cuadro es el MENOR que cabe
        if (p.byes > 0) vistosConByes++;
      }
    }
    expect(vistosConByes).toBeGreaterThan(0);
  });

  it('los tamaños de grupo suman las parejas de la categoría', () => {
    for (let n = 3; n <= 40; n++) {
      for (const p of candidatos({ id: 'x', parejas: n })) {
        expect(p.groupSizes.reduce((a, s) => a + s, 0)).toBe(n);
      }
    }
  });
});

describe('§11 · verificación contra el Sexto Torneo Cimepa', () => {
  const r = planTournament(CATEGORIAS_CIMEPA, CIMEPA);

  it('cabe, pero la fase de grupos va al límite', () => {
    // 165 de 192 slots = 86%. Sigue por encima del umbral del 85%, así que la
    // zona no cambia: con las ventanas hasta las 22:00 eran 165 de 176 (94%).
    expect(r.cabe).toBe(true);
    expect(r.grupos.usados).toBe(165);
    expect(Math.round(r.grupos.ocupacion * 100)).toBe(86);
    expect(r.grupos.zona).toBe('limite');
  });

  it('aprovecha el último día repescando, sin pasarse de la hora de cierre', () => {
    // Con el piso a secas serían 47 partidos. El paso 2 sube la repesca hasta
    // 80 y ahí para: uno más y la hora realista se iría de las 20:00.
    //
    // TRES NÚMEROS PARA LA MISMA PREGUNTA, en orden histórico:
    //   81 · puerta del 85% de slots, que es literalmente floor(96 × 0.85).
    //        No miraba la hora: terminaba 22:15 reales.
    //   72 · puerta por hora, con el retraso modelado replanificando a 75 min.
    //        Sobreestimaba el retraso y dejaba capacidad sin usar.
    //   80 · puerta por hora con el retraso encadenado, que es el modelo
    //        correcto: el retraso se acumula ronda a ronda, no partido a
    //        partido, y los huecos ociosos lo absorben en vez de heredarlo.
    //
    // Este fixture NO pasa `jugadores`, así que no hay separación de hermanas.
    // Con ella el día se alarga y el planificador baja de nuevo la repesca.
    expect(r.eliminacion.usados).toBe(88);   // 80 de cuadro + 8 terceros lugares
    expect(r.ultimoDia!.finRealista! <= '20:00').toBe(true);
  });

  it('el 3.er lugar se come los 30 minutos de margen que parecía haber', () => {
    // Los 8 partidos que antes eran invisibles caen todos en la transición de
    // semis a final, el momento en que las ocho categorías convergen. No
    // cambian el plan —los clasificados son los mismos— pero sí la hora:
    //
    //            sin 3.er lugar   con 3.er lugar
    //   usados          80              88
    //   ocupación       83%             92%
    //   finEstimado     18:30           19:00
    //   finRealista     19:30           20:00   ← el cierre, exacto
    //
    // Sigue cabiendo, pero sin un minuto de sobra. Antes el plan prometía
    // media hora de margen que no existía.
    const sin = planTournament(CATEGORIAS_CIMEPA, { ...CIMEPA, tercerLugar: false });
    expect(sin.eliminacion.usados).toBe(80);
    expect(sin.ultimoDia!.finRealista).toBe('19:30');
    expect(r.ultimoDia!.finRealista).toBe('20:00');

    // El plan elegido NO cambia: los mismos clasificados en las dos corridas.
    const clas = (x: typeof r) => [...x.planes.values()].map((p) => p.clasificados).join(',');
    expect(clas(r)).toBe(clas(sin));
  });

  it('la ocupación en slots sobrevive como dato, pero ya no manda', () => {
    // 92% suena a que no cabe; la hora dice que sí, justo. Que las dos cifras
    // cuenten historias distintas es el motivo del cambio de criterio.
    expect(Math.round(r.eliminacion.ocupacion * 100)).toBe(92);
  });

  it('repesca aunque la fase de grupos esté por encima del umbral', () => {
    // Los grupos van al 94%, pero repescar no toca ese presupuesto. Bloquearlo
    // por culpa de una fase ajena era desperdiciar el domingo.
    expect(r.grupos.ocupacion).toBeGreaterThan(0.85);
    for (const p of r.planes.values()) expect(p.segundosQueAvanzan).toBeGreaterThan(0);
  });

  it('los tamaños de grupo se quedan en el piso: al 94% no cabe uno más', () => {
    for (const p of r.planes.values()) {
      expect(p.groupSizes.every((s) => s === 3)).toBe(true);
      expect(p.asegurados).toBe(2);
    }
  });

  it('propone MÁS repesca de la que eligió Cimepa, pero menos que con slots', () => {
    // Cimepa puso 2 en 5ª Fuerza a mano. Medida la capacidad con el modelo de
    // retraso encadenado caben 6, y el cuadro queda lleno sin un solo bye.
    //
    // Sin `jugadores` en este fixture no hay separación de hermanas: con ella
    // el día se alarga y este número baja. Es el mismo plan visto con y sin
    // saber quién juega en dos categorías.
    const p = r.planes.get('5A')!;
    expect(p.segundosQueAvanzan).toBe(6);
    expect(p.clasificados).toBe(16);
    expect(p.bracketSize).toBe(16);
    expect(p.byes).toBe(0);
  });

  it('avisa de que los grupos van al límite', () => {
    expect(r.avisos.some((a) => /límite/i.test(a))).toBe(true);
  });

  it('10 grupos de 3 en 5ª Fuerza', () => {
    const p = r.planes.get('5A')!;
    expect(p.grupos).toBe(10);
    expect(p.groupSizes.every((s) => s === 3)).toBe(true);
  });
});

describe('criterio "quedar segundo debe servir"', () => {
  const r = planTournament(CATEGORIAS_CIMEPA, CIMEPA);

  it('ninguna categoría de Cimepa cae en ratio 0', () => {
    for (const [id, p] of r.planes) {
      expect({ id, ratio: p.ratioSegundos > 0 }).toEqual({ id, ratio: true });
    }
  });

  it('la frase cambia según el ratio', () => {
    expect(r.planes.get('3A')!.fraseSegundos)
      .toBe('Quedar segundo sirve: 6 de 10 segundos avanzan.');
    // 2 de 4: justo en el 0.5 que separa "sirve" de "solo algunos".
    expect(r.planes.get('5F')!.fraseSegundos)
      .toBe('Quedar segundo sirve: 2 de 4 segundos avanzan.');

    // Ninguna categoría de Cimepa queda con "solo avanzan los primeros": el
    // paso 2 gasta el domingo en que quedar segundo sirva.
    //
    // El suelo vuelve a 0.5: todas las categorías llegan a la mitad de sus
    // segundos. Bajó a 0.4 mientras el retraso se modelaba replanificando a 75
    // minutos, que sobreestimaba y comía capacidad; con el retraso encadenado
    // el domingo da para más y nadie baja de la mitad.
    const peor = Math.min(...[...r.planes.values()].map((p) => p.ratioSegundos));
    expect(peor).toBeCloseTo(0.5);
    for (const p of r.planes.values()) expect(p.ratioSegundos).toBeGreaterThan(0);
  });

  it('el piso no repesca a nadie: subir es trabajo del paso 2', () => {
    // Con la capacidad al límite, el piso es lo que queda. Es correcto que
    // deje ratio 0: si no cabe nada más, no cabe.
    const NADA: Capacidad = {
      canchas: 1, minutosPorPartido: 60,
      ventanas: [
        { fecha: '2026-05-09', desde: '08:00', hasta: '22:00' }, // 14 slots
        { fecha: '2026-05-10', desde: '09:00', hasta: '12:00' }, //  3 slots
      ],
    };
    const p = planTournament([{ id: 'a', parejas: 12 }], NADA).planes.get('a')!;
    expect(p.groupSizes).toEqual([3, 3, 3, 3]);
    expect(p.segundosQueAvanzan).toBe(0);
    expect(p.clasificados).toBe(4);
    expect(p.costeEliminacion).toBe(4);   // 3 de cuadro + el 3.er lugar
  });
});

describe('§12 · torneo chico: con capacidad de sobra sube a grupos de 4', () => {
  const CHICO: Capacidad = {
    canchas: 4,
    minutosPorPartido: 60,
    ventanas: [
      { fecha: '2026-05-09', desde: '09:00', hasta: '21:00' }, // 12 h → 48
      { fecha: '2026-05-10', desde: '09:00', hasta: '18:00' }, //  9 h → 36
    ],
  };

  const r = planTournament([{ id: 'u', parejas: 12 }], CHICO);
  const p = r.planes.get('u')!;

  it('elige 3 grupos de 4, no 4 de 3', () => {
    expect(p.groupSizes).toEqual([4, 4, 4]);
    expect(p.asegurados).toBe(3);
    expect(p.costeGrupos).toBe(18);
  });

  it('queda en zona cómoda', () => {
    expect(r.cabe).toBe(true);
    expect(r.grupos.usados).toBe(18);
    expect(r.grupos.presupuesto).toBe(48);
    expect(r.grupos.zona).toBe('comodo');
  });

  it('la preferencia por grupos de 3 no es una regla: es lo que sale cuando aprieta', () => {
    // Mismas 12 parejas, capacidad de Cimepa compartida con 7 categorías más:
    // ahí sí bajan a grupos de 3... salvo que quepa subirlas.
    const solo = planTournament([{ id: 'u', parejas: 12 }], CHICO).planes.get('u')!;
    const conVecinas = planTournament(CATEGORIAS_CIMEPA, CIMEPA).planes.get('5F')!;
    expect(solo.asegurados).toBeGreaterThan(conVecinas.asegurados);
  });
});

describe('§8 · cuando no cabe', () => {
  const APRETADO: Capacidad = {
    canchas: 2,
    minutosPorPartido: 60,
    ventanas: [
      { fecha: '2026-05-09', desde: '09:00', hasta: '13:00' }, // 4 h → 8
      { fecha: '2026-05-10', desde: '09:00', hasta: '13:00' }, // 4 h → 8
    ],
  };

  const r = planTournament(CATEGORIAS_CIMEPA, APRETADO);

  it('lo dice y da las tres salidas', () => {
    expect(r.cabe).toBe(false);
    expect(r.grupos.zona).toBe('no_cabe');
    expect(r.diagnostico).toBeDefined();
    expect(r.diagnostico!.faltanSlots).toBeGreaterThan(0);
    expect(r.diagnostico!.canchasQueFaltan).toBeGreaterThan(0);
    expect(r.diagnostico!.horasQueFaltan).toBeGreaterThan(0);
    expect(r.diagnostico!.parejasQueSobran).toBeGreaterThan(0);
  });

  it('no intenta subir de plan cuando el piso ya no cabe', () => {
    for (const p of r.planes.values()) {
      expect(p.asegurados).toBe(2);
    }
  });
});

describe('§9 · casos límite', () => {
  it('excluye y señala las categorías con menos de 3 parejas', () => {
    const r = planTournament(
      [{ id: 'ok', parejas: 12 }, { id: 'corta', parejas: 2 }],
      CIMEPA,
    );
    expect(r.planes.has('corta')).toBe(false);
    expect(r.avisos.some((a) => /no alcanza para un grupo/.test(a))).toBe(true);
  });

  it('con un solo día avisa y comparte presupuesto', () => {
    const r = planTournament([{ id: 'u', parejas: 12 }], {
      canchas: 4, minutosPorPartido: 60,
      ventanas: [{ fecha: '2026-05-09', desde: '09:00', hasta: '21:00' }],
    });
    expect(r.avisos.some((a) => /un solo día/i.test(a))).toBe(true);
    expect(r.grupos.presupuesto).toBe(r.eliminacion.presupuesto);
    // Ambos costes caen sobre el mismo presupuesto.
    expect(r.grupos.usados).toBe(r.eliminacion.usados);
  });

  it('3, 4 o 5 parejas: un grupo, round robin, final directa', () => {
    for (const n of [3, 4, 5]) {
      const p = planTournament([{ id: 'u', parejas: n }], CIMEPA).planes.get('u')!;
      expect(p.formatType).toBe('round_robin');
      expect(p.groupSizes).toEqual([n]);
      expect(p.bracketSize).toBe(2);
      expect(p.costeEliminacion).toBe(1);
    }
  });

  it('da la hora real cuando el último día es más corto que las rondas', () => {
    // Canchas de sobra pero un último día de hora y media: por muchas canchas
    // que haya, las rondas de una categoría van una tras otra.
    //
    // Antes esto disparaba un aviso aproximado ("necesita al menos N h
    // seguidas", de maxRondas × minutosPorPartido). Ahora el scheduler da la
    // hora exacta, que es lo accionable — y además marca el plan como no cabe,
    // cosa que el aviso viejo no hacía.
    const r = planTournament([{ id: 'u', parejas: 30 }], {
      canchas: 20, minutosPorPartido: 60,
      ventanas: [
        { fecha: '2026-05-09', desde: '08:00', hasta: '22:00' },
        { fecha: '2026-05-10', desde: '09:00', hasta: '10:30' },
      ],
    });
    expect(r.cabe).toBe(false);
    expect(r.ultimoDia!.finRealista).toBe('15:30');
    expect(r.avisos.some((a) => /después del cierre de las 10:30/.test(a))).toBe(true);
  });
});

describe('determinismo', () => {
  it('el mismo torneo da siempre el mismo plan', () => {
    const a = planTournament(CATEGORIAS_CIMEPA, CIMEPA);
    const b = planTournament([...CATEGORIAS_CIMEPA].reverse(), CIMEPA);
    for (const [id, p] of a.planes) {
      expect(b.planes.get(id)!.groupSizes).toEqual(p.groupSizes);
      expect(b.planes.get(id)!.clasificados).toBe(p.clasificados);
    }
  });
});
