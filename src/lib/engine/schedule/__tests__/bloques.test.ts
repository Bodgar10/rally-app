import {
  generarBloques,
  cupoDeBloque,
  bloquesDisponibles,
  partidosDeGrupo,
  carrilesDeGrupo,
  parseHoraBloque,
  formatHoraBloque,
  PAREJAS_POR_GRUPO,
  type EntradaBloques,
  type Bloque,
  type Ocupacion,
} from '../bloques';

/**
 * Sexto Torneo Cimepa. 8 canchas, 60 min por partido.
 * Viernes y sabado son fase de grupos; el domingo es de eliminatorias y no
 * genera bloques.
 */
const CIMEPA: EntradaBloques = {
  canchas: 8,
  minutosPorPartido: 60,
  ventanas: [
    { dia: '2025-11-07', desde: '14:00', hasta: '23:00' },
    { dia: '2025-11-08', desde: '08:00', hasta: '23:00' },
    { dia: '2025-11-09', desde: '08:00', hasta: '20:00' },
  ],
};

const CATEGORIAS = ['2a', '3a', '4a', '5a', '6a', 'mixC', 'mixD', '5fem'];

describe('generarBloques - reticula de Cimepa', () => {
  const r = generarBloques(CIMEPA);

  it('el bloque dura 3 horas con los defaults', () => {
    expect(r.minutosPorBloque).toBe(180);
  });

  it('el viernes genera 3 bloques y no sobra nada', () => {
    const viernes = r.bloques.filter((b) => b.dia === '2025-11-07');
    expect(viernes.map((b) => [b.desde, b.hasta])).toEqual([
      ['14:00', '17:00'],
      ['17:00', '20:00'],
      ['20:00', '23:00'],
    ]);
    expect(r.dias.find((d) => d.dia === '2025-11-07')!.minutosSobrantes).toBe(0);
  });

  it('el sabado genera 5 bloques y no sobra nada', () => {
    const sabado = r.bloques.filter((b) => b.dia === '2025-11-08');
    expect(sabado.map((b) => [b.desde, b.hasta])).toEqual([
      ['08:00', '11:00'],
      ['11:00', '14:00'],
      ['14:00', '17:00'],
      ['17:00', '20:00'],
      ['20:00', '23:00'],
    ]);
    expect(r.dias.find((d) => d.dia === '2025-11-08')!.minutosSobrantes).toBe(0);
  });

  it('el ultimo dia es de eliminatorias y no genera bloques', () => {
    expect(r.diaEliminatorias).toBe('2025-11-09');
    expect(r.bloques.some((b) => b.dia === '2025-11-09')).toBe(false);
    expect(r.dias.find((d) => d.dia === '2025-11-09')).toEqual({
      dia: '2025-11-09',
      bloques: 0,
      minutosSobrantes: 0,
      eliminatorias: true,
    });
  });

  it('son 8 bloques, 64 carriles y 192 parejas de capacidad', () => {
    expect(r.bloques).toHaveLength(8);
    expect(r.capacidadCarriles).toBe(64);
    expect(r.capacidadParejas).toBe(192);
    expect(r.bloques.every((b) => b.carriles === 8)).toBe(true);
  });

  it('las 165 parejas de Cimepa caben, con 27 lugares de holgura', () => {
    const inscritas = 165;
    expect(r.capacidadParejas).toBeGreaterThanOrEqual(inscritas);
    expect(r.capacidadParejas - inscritas).toBe(27);
  });

  it('con la ventana corta a 22:00 no habrian cabido: capacidadParejas lo delata', () => {
    // Las ventanas que sembramos primero cerraban a las 22:00 y daban 144.
    const corto = generarBloques({
      ...CIMEPA,
      ventanas: [
        { dia: '2025-11-07', desde: '14:00', hasta: '22:00' },
        { dia: '2025-11-08', desde: '08:00', hasta: '22:00' },
        CIMEPA.ventanas[2],
      ],
    });
    expect(corto.capacidadParejas).toBe(144);
    expect(corto.capacidadParejas).toBeLessThan(165);
  });
});

describe('generarBloques - reglas de la ventana', () => {
  it('descarta el bloque que no cabe entero y reporta los minutos sobrantes', () => {
    const r = generarBloques({
      canchas: 4,
      minutosPorPartido: 60,
      ventanas: [{ dia: '2026-03-01', desde: '09:00', hasta: '13:30' }],
    });
    expect(r.bloques.map((b) => b.desde)).toEqual(['09:00']);
    expect(r.dias[0].minutosSobrantes).toBe(90);
    expect(r.avisos.some((a) => a.includes('Sobran 90 min'))).toBe(true);
  });

  it('con una sola ventana si genera bloques y lo avisa', () => {
    const r = generarBloques({
      canchas: 6,
      minutosPorPartido: 60,
      ventanas: [{ dia: '2026-03-01', desde: '08:00', hasta: '20:00' }],
    });
    expect(r.diaEliminatorias).toBeNull();
    expect(r.bloques).toHaveLength(4);
    expect(r.capacidadParejas).toBe(72);
    expect(r.avisos.some((a) => a.includes('Ventana unica'))).toBe(true);
  });

  it('respeta minutosPorPartido y partidosPorGrupo', () => {
    const r = generarBloques({
      canchas: 3,
      minutosPorPartido: 45,
      partidosPorGrupo: 6, // grupo de 4 parejas
      ventanas: [{ dia: '2026-03-01', desde: '10:00', hasta: '19:00' }],
    });
    expect(r.minutosPorBloque).toBe(270);
    expect(r.bloques.map((b) => [b.desde, b.hasta])).toEqual([
      ['10:00', '14:30'],
      ['14:30', '19:00'],
    ]);
    expect(r.dias[0].minutosSobrantes).toBe(0);
  });

  it('una ventana que no alcanza para un bloque entero da 0 bloques y avisa', () => {
    const r = generarBloques({
      canchas: 8,
      minutosPorPartido: 60,
      ventanas: [
        { dia: '2026-03-01', desde: '18:00', hasta: '20:00' },
        { dia: '2026-03-02', desde: '08:00', hasta: '20:00' },
      ],
    });
    expect(r.bloques).toHaveLength(0);
    expect(r.diaEliminatorias).toBe('2026-03-02');
    expect(r.avisos.some((a) => a.includes('no alcanza para un bloque'))).toBe(true);
  });

  it('sin ventanas devuelve reticula vacia', () => {
    const r = generarBloques({ canchas: 8, minutosPorPartido: 60, ventanas: [] });
    expect(r.bloques).toEqual([]);
    expect(r.capacidadParejas).toBe(0);
    expect(r.avisos).toHaveLength(1);
  });

  it('rechaza entradas imposibles', () => {
    expect(() =>
      generarBloques({ canchas: 0, minutosPorPartido: 60, ventanas: [] }),
    ).toThrow(/canchas/);
    expect(() =>
      generarBloques({ canchas: 8, minutosPorPartido: 0, ventanas: [] }),
    ).toThrow(/minutosPorPartido/);
    expect(() =>
      generarBloques({
        canchas: 8,
        minutosPorPartido: 60,
        ventanas: [{ dia: '01/03/2026', desde: '08:00', hasta: '20:00' }],
      }),
    ).toThrow(/Dia invalido/);
  });
});

describe('generarBloques - determinismo e ids', () => {
  it('el id es `${dia}-${desde}` y es estable', () => {
    const r = generarBloques(CIMEPA);
    expect(r.bloques.map((b) => b.id)).toEqual([
      '2025-11-07-14:00',
      '2025-11-07-17:00',
      '2025-11-07-20:00',
      '2025-11-08-08:00',
      '2025-11-08-11:00',
      '2025-11-08-14:00',
      '2025-11-08-17:00',
      '2025-11-08-20:00',
    ]);
  });

  it('misma entrada -> misma salida', () => {
    expect(generarBloques(CIMEPA)).toEqual(generarBloques(CIMEPA));
  });

  it('el orden de las ventanas de entrada no cambia la salida', () => {
    const revuelto: EntradaBloques = {
      ...CIMEPA,
      ventanas: [CIMEPA.ventanas[2], CIMEPA.ventanas[1], CIMEPA.ventanas[0]],
    };
    expect(generarBloques(revuelto).bloques).toEqual(generarBloques(CIMEPA).bloques);
  });
});

describe('cupoDeBloque', () => {
  const bloque: Bloque = {
    id: '2025-11-08-08:00',
    dia: '2025-11-08',
    desde: '08:00',
    hasta: '11:00',
    carriles: 8,
  };

  it('bloque vacio: todos los carriles disponibles', () => {
    expect(cupoDeBloque(bloque, {}, '5a')).toBe(24);
    expect(cupoDeBloque(bloque, undefined, '5a')).toBe(24);
  });

  it('7 parejas de 5a en 8 carriles: 2 de hueco propio mas 5 carriles libres', () => {
    // 7 parejas -> ceil(7/3) = 3 carriles usados, 9 lugares, 2 huecos propios.
    expect(cupoDeBloque(bloque, { '5a': 7 }, '5a')).toBe(2 + 5 * 3);
  });

  it('los huecos de otra categoria no sirven', () => {
    // 5a ocupa 3 carriles con 7 parejas; le sobran 2 huecos que son solo suyos.
    expect(cupoDeBloque(bloque, { '5a': 7 }, '3a')).toBe(5 * 3);
  });

  it('categoria ausente y 0 carriles libres: cupo 0 aunque sobren huecos ajenos', () => {
    const ocup = Object.fromEntries(CATEGORIAS.map((c) => [c, 1])); // 8 carriles, 16 huecos ajenos
    expect(cupoDeBloque(bloque, ocup, '2a')).toBe(2);
    expect(cupoDeBloque(bloque, ocup, 'nueva')).toBe(0);
  });

  it('carril propio exacto: sin hueco propio, solo carriles nuevos', () => {
    expect(cupoDeBloque(bloque, { '5a': 3 }, '5a')).toBe(0 + 7 * 3);
    expect(cupoDeBloque(bloque, { '5a': 9 }, '5a')).toBe(0 + 5 * 3);
  });

  it('bloque lleno con carriles exactos: cupo 0 para todos', () => {
    const ocup = Object.fromEntries(CATEGORIAS.map((c) => [c, 3])); // 8 carriles llenos
    for (const c of [...CATEGORIAS, 'nueva']) {
      expect(cupoDeBloque(bloque, ocup, c)).toBe(0);
    }
  });

  it('sobreventa: no devuelve negativos y conserva el hueco propio', () => {
    const ocup = Object.fromEntries(CATEGORIAS.map((c) => [c, 4])); // 8 x 2 = 16 carriles
    expect(cupoDeBloque(bloque, ocup, '5a')).toBe(2);
    expect(cupoDeBloque(bloque, ocup, 'nueva')).toBe(0);
  });

  it('ignora categorias con 0 parejas', () => {
    expect(cupoDeBloque(bloque, { '5a': 0, '3a': 0 }, '5a')).toBe(24);
  });

  it('respeta un tamano de grupo distinto', () => {
    // Grupos de 4: 7 parejas -> 2 grupos -> 2 x 2 = 4 carriles usados.
    // Hueco propio: (4 - 7%4) % 4 = 1. Libres: 8 - 4 = 4 -> 2 grupos de 4.
    const g4 = { parejasPorGrupo: { '5a': 4 } };
    expect(cupoDeBloque(bloque, { '5a': 7 }, '5a', g4)).toBe(1 + 2 * 4);
  });
});

// ---------------------------------------------------------------------------
// El arreglo: los grupos que no son de 3
// ---------------------------------------------------------------------------

describe('coste de un grupo en carriles', () => {
  it('partidos de un round robin', () => {
    expect(partidosDeGrupo(2)).toBe(1);
    expect(partidosDeGrupo(3)).toBe(3);
    expect(partidosDeGrupo(4)).toBe(6);
    expect(partidosDeGrupo(5)).toBe(10);
  });

  it('un grupo de 4 son 6 partidos: DOS carriles, no uno', () => {
    expect(carrilesDeGrupo(3)).toBe(1);
    expect(carrilesDeGrupo(4)).toBe(2);
    expect(carrilesDeGrupo(5)).toBe(4);
  });

  it('un grupo de 2 ocupa un carril entero: el carril no se parte', () => {
    expect(carrilesDeGrupo(2)).toBe(1);
  });

  it('una categoria sin parejas no cuesta nada', () => {
    expect(carrilesDeGrupo(0)).toBe(0);
  });

  it('con carriles mas largos caben grupos mas grandes', () => {
    // Un carril de 6 partidos (bloque de 6 h) aloja un grupo de 4 entero.
    expect(carrilesDeGrupo(4, 6)).toBe(1);
    expect(carrilesDeGrupo(5, 6)).toBe(2);
  });
});

describe('cupoDeBloque con una categoria de grupos de 4', () => {
  const bloque: Bloque = {
    id: '2025-11-08-08:00', dia: '2025-11-08', desde: '08:00', hasta: '11:00',
    carriles: 8,
  };

  // 8 parejas -> computeFormat da [4,4]. Es el caso que anunciaba capacidad
  // inexistente: 8 carriles NO son 24 lugares si los grupos son de 4.
  const G4 = { parejasPorGrupo: { MxA: 4 } };

  it('el bloque vacio ofrece 16 lugares, no 24', () => {
    expect(cupoDeBloque(bloque, {}, 'MxA', G4)).toBe(16);   // 4 grupos x 4
    // Sin la opcion volveria a mentir. Se deja escrito para que se vea la
    // diferencia que introduce el dato.
    expect(cupoDeBloque(bloque, {}, 'MxA')).toBe(24);
  });

  it('llenarlo consume dos carriles por grupo', () => {
    expect(cupoDeBloque(bloque, { MxA: 4 }, 'MxA', G4)).toBe(12);   // 3 grupos mas
    expect(cupoDeBloque(bloque, { MxA: 8 }, 'MxA', G4)).toBe(8);
    expect(cupoDeBloque(bloque, { MxA: 12 }, 'MxA', G4)).toBe(4);
    expect(cupoDeBloque(bloque, { MxA: 16 }, 'MxA', G4)).toBe(0);   // 8 carriles
  });

  it('el hueco de un grupo a medias sigue siendo solo suyo', () => {
    // 5 parejas -> 2 grupos (4 y 1) -> 4 carriles. Hueco propio: 3.
    expect(cupoDeBloque(bloque, { MxA: 5 }, 'MxA', G4)).toBe(3 + 2 * 4);
    // Otra categoria no puede usar esos 3 huecos: solo le quedan 4 carriles.
    expect(cupoDeBloque(bloque, { MxA: 5 }, 'F5', G4)).toBe(4 * 3);
  });

  it('categorias con tamanos distintos en el mismo bloque', () => {
    // MxA de 4 (2 carriles por grupo) y F5 de 3 (1 carril por grupo).
    const mixto = { parejasPorGrupo: { MxA: 4, F5: 3 } };
    // MxA: 8 parejas = 2 grupos = 4 carriles. F5: 6 parejas = 2 grupos = 2.
    // Usados 6, libres 2.
    expect(cupoDeBloque(bloque, { MxA: 8, F5: 6 }, 'F5', mixto)).toBe(2 * 3);
    // A MxA solo le cabe UN grupo mas: necesita 2 carriles de los 2 libres.
    expect(cupoDeBloque(bloque, { MxA: 8, F5: 6 }, 'MxA', mixto)).toBe(1 * 4);
  });

  it('un tamano invalido cae al default en vez de reventar el render', () => {
    for (const malo of [0, 1, -3, 2.5, NaN]) {
      expect(cupoDeBloque(bloque, {}, 'MxA', { parejasPorGrupo: { MxA: malo } })).toBe(24);
    }
  });

  it('bloquesDisponibles arrastra el tamano de grupo', () => {
    const bloques = [bloque, { ...bloque, id: '2025-11-08-11:00', desde: '11:00', hasta: '14:00' }];
    const d = bloquesDisponibles(bloques, {}, 'MxA', G4);
    expect(d.map((b) => b.cupo)).toEqual([16, 16]);
  });
});

describe('bloquesDisponibles', () => {
  const { bloques } = generarBloques(CIMEPA);

  it('sin ocupacion, todos los bloques con cupo lleno', () => {
    const d = bloquesDisponibles(bloques, {}, '5a');
    expect(d).toHaveLength(8);
    expect(d.every((b) => b.cupo === 24)).toBe(true);
    expect(d[0].id).toBe('2025-11-07-14:00');
  });

  it('oculta los bloques agotados para esa categoria', () => {
    const lleno = Object.fromEntries(CATEGORIAS.map((c) => [c, 3]));
    const ocupacion: Ocupacion = {
      '2025-11-07-14:00': lleno,
      '2025-11-08-08:00': { '5a': 7 },
    };
    const d = bloquesDisponibles(bloques, ocupacion, '5a');
    expect(d.map((b) => b.id)).toEqual([
      '2025-11-07-17:00',
      '2025-11-07-20:00',
      '2025-11-08-08:00',
      '2025-11-08-11:00',
      '2025-11-08-14:00',
      '2025-11-08-17:00',
      '2025-11-08-20:00',
    ]);
    expect(d.find((b) => b.id === '2025-11-08-08:00')!.cupo).toBe(17);
  });

  it('un bloque agotado para una categoria puede seguir abierto para otra', () => {
    const ocupacion: Ocupacion = {
      // 7 carriles ajenos + 2 parejas de 5a = 8 carriles usados, 0 libres.
      '2025-11-07-14:00': { '2a': 3, '3a': 3, '4a': 3, '6a': 3, mixC: 3, mixD: 3, '5fem': 3, '5a': 2 },
    };
    const paraQuinta = bloquesDisponibles(bloques, ocupacion, '5a');
    const paraTercera = bloquesDisponibles(bloques, ocupacion, '3a');
    expect(paraQuinta.find((b) => b.id === '2025-11-07-14:00')!.cupo).toBe(1);
    expect(paraTercera.some((b) => b.id === '2025-11-07-14:00')).toBe(false);
  });

  it('conserva el orden de los bloques y es determinista', () => {
    const ocupacion: Ocupacion = { '2025-11-08-11:00': { '5a': 4 } };
    const a = bloquesDisponibles(bloques, ocupacion, '5a');
    const b = bloquesDisponibles(bloques, ocupacion, '5a');
    expect(a).toEqual(b);
    expect(a.map((x) => x.id)).toEqual(bloques.map((x) => x.id));
  });

  it('no muta los bloques de entrada', () => {
    const copia = JSON.parse(JSON.stringify(bloques));
    bloquesDisponibles(bloques, {}, '5a');
    expect(bloques).toEqual(copia);
  });
});

describe('helpers de hora', () => {
  it('van y vienen', () => {
    expect(parseHoraBloque('08:00')).toBe(480);
    expect(parseHoraBloque('14:30')).toBe(870);
    expect(formatHoraBloque(870)).toBe('14:30');
    expect(formatHoraBloque(480)).toBe('08:00');
    expect(PAREJAS_POR_GRUPO).toBe(3);
  });

  it('rechaza horas invalidas', () => {
    expect(() => parseHoraBloque('25:00')).toThrow();
    expect(() => parseHoraBloque('8h')).toThrow();
  });
});
