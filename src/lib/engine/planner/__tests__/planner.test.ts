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
    { fecha: '2026-03-13', desde: '14:00', hasta: '22:00' }, //  8 h → 64
    { fecha: '2026-03-14', desde: '08:00', hasta: '22:00' }, // 14 h → 112
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
    expect(r.grupos.presupuesto).toBe(176);       // 64 + 112
    expect(r.eliminacion.presupuesto).toBe(96);   // 12 h × 8
  });

  it('una ventana con hora final menor o igual a la inicial no aporta minutos', () => {
    expect(minutosDeVentana({ fecha: 'x', desde: '20:00', hasta: '08:00' })).toBe(0);
  });
});

describe('candidatos (§5)', () => {
  it('N=30 genera las tres particiones de la spec con su coste', () => {
    const c = candidatos({ id: 'x', parejas: 30 });

    const diezDeTres = c.find((p) => p.groupSizes.every((s) => s === 3) && p.Q === 16)!;
    expect(diezDeTres.grupos).toBe(10);
    expect(diezDeTres.costeGrupos).toBe(30);
    expect(diezDeTres.asegurados).toBe(2);
    expect(diezDeTres.costeEliminacion).toBe(15);

    const seisDeCinco = c.find((p) => p.groupSizes.every((s) => s === 5))!;
    expect(seisDeCinco.grupos).toBe(6);
    expect(seisDeCinco.costeGrupos).toBe(60);
    expect(seisDeCinco.asegurados).toBe(4);
    expect(seisDeCinco.Q).toBe(8);
    expect(seisDeCinco.costeEliminacion).toBe(7);
  });

  it('nunca propone grupos de menos de 3 (R1)', () => {
    for (const n of [6, 7, 11, 13, 17, 23, 29, 31]) {
      for (const p of candidatos({ id: 'x', parejas: n })) {
        expect(Math.min(...p.groupSizes)).toBeGreaterThanOrEqual(3);
        expect(p.asegurados).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('el cuadro es siempre potencia de 2 (R3): no hay byes', () => {
    for (let n = 3; n <= 40; n++) {
      for (const p of candidatos({ id: 'x', parejas: n })) {
        expect(Math.log2(p.Q) % 1).toBe(0);
        expect(p.advancePerGroup * p.grupos + p.repescados).toBe(p.Q);
      }
    }
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
    expect(r.cabe).toBe(true);
    expect(r.grupos.usados).toBe(165);
    expect(Math.round(r.grupos.ocupacion * 100)).toBe(94);
    expect(r.grupos.zona).toBe('limite');
  });

  it('las eliminatorias quedan ajustadas', () => {
    expect(r.eliminacion.usados).toBe(76);
    expect(Math.round(r.eliminacion.ocupacion * 100)).toBe(79);
    expect(r.eliminacion.zona).toBe('ajustado');
  });

  it('el piso ES el plan: al 94% ninguna categoría puede subir', () => {
    for (const p of r.planes.values()) {
      expect(p.groupSizes.every((s) => s === 3)).toBe(true);
      expect(p.asegurados).toBe(2);
    }
  });

  it('avisa de que los grupos van al límite', () => {
    expect(r.avisos.some((a) => /límite/i.test(a))).toBe(true);
  });

  it('reproduce los 6 mejores segundos de 5ª Fuerza', () => {
    // 10 grupos de 3 dan 10 primeros, que no llenan un cuadro de 16: se
    // repescan 6 segundos. Es lo que Cimepa hizo a mano.
    const p = r.planes.get('5A')!;
    expect(p.grupos).toBe(10);
    expect(p.Q).toBe(16);
    expect(p.advancePerGroup).toBe(1);
    expect(p.segundosQueAvanzan).toBe(6);
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
    // 12 parejas → 4 grupos, Q=8, pasan 2 por grupo: todos los segundos.
    expect(r.planes.get('5F')!.fraseSegundos).toBe('Todos los segundos avanzan.');
    // 30 parejas → 6 de 10 segundos.
    expect(r.planes.get('3A')!.fraseSegundos)
      .toBe('Quedar segundo sirve: 6 de 10 segundos avanzan.');
    // 21 parejas → 7 grupos, Q=8: solo 1 repescado.
    expect(r.planes.get('2A')!.fraseSegundos)
      .toBe('Solo 1 de 7 segundos avanzan. Quien pierda el primer partido tiene poco margen.');
  });

  it('el PISO con 4 grupos prefiere el cuadro de 8 al de 4, aunque cueste más', () => {
    // Q=4 sería más barato (3 partidos contra 7) pero dejaría ratio 0: quien
    // pierde el primer partido de su grupo ya no avanza.
    //
    // Capacidad justa a propósito: con holgura el paso 2 subiría a grupos de 4
    // y dejaría de probar el piso, que es lo que este test fija.
    const JUSTA: Capacidad = {
      canchas: 1, minutosPorPartido: 60,
      ventanas: [
        { fecha: '2026-05-09', desde: '08:00', hasta: '22:00' }, // 14 slots
        { fecha: '2026-05-10', desde: '09:00', hasta: '17:00' }, //  8 slots
      ],
    };
    const p = planTournament([{ id: 'a', parejas: 12 }], JUSTA).planes.get('a')!;
    expect(p.groupSizes).toEqual([3, 3, 3, 3]);   // el piso, sin subir
    expect(p.Q).toBe(8);
    expect(p.advancePerGroup).toBe(2);
    expect(p.ratioSegundos).toBe(1);
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
      expect(p.Q).toBe(2);
      expect(p.costeEliminacion).toBe(1);
    }
  });

  it('avisa del camino crítico cuando el último día es más corto que las rondas', () => {
    // Canchas de sobra pero un último día de hora y media: por muchas canchas
    // que haya, las rondas de una categoría van una tras otra.
    const r = planTournament([{ id: 'u', parejas: 30 }], {
      canchas: 20, minutosPorPartido: 60,
      ventanas: [
        { fecha: '2026-05-09', desde: '08:00', hasta: '22:00' },
        { fecha: '2026-05-10', desde: '09:00', hasta: '10:30' },
      ],
    });
    expect(r.avisos.some((a) => /una tras otra/.test(a))).toBe(true);
  });
});

describe('determinismo', () => {
  it('el mismo torneo da siempre el mismo plan', () => {
    const a = planTournament(CATEGORIAS_CIMEPA, CIMEPA);
    const b = planTournament([...CATEGORIAS_CIMEPA].reverse(), CIMEPA);
    for (const [id, p] of a.planes) {
      expect(b.planes.get(id)!.groupSizes).toEqual(p.groupSizes);
      expect(b.planes.get(id)!.Q).toBe(p.Q);
    }
  });
});
