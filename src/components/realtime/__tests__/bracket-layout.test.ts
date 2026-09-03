import {
  fusionarConElPlan,
  ORDEN_ETAPAS,
  ETIQUETA_ETAPA,
  agruparPorEtapa,
  etapasActivas,
  estaPendiente,
  textoPendiente,
  type EtapaCuadro,
  type PartidoDeCuadro,
  columnasDelCuadro,
  type PartidoFusionable,
  type SlotPlanificado,
} from '../bracket-layout';

const p = (stage: EtapaCuadro, a: string | null = 'a', b: string | null = 'b'): PartidoDeCuadro =>
  ({ stage, pairAId: a, pairBId: b });

describe('orden del cuadro (no-regresión de LiveBracket)', () => {
  it('las rondas van de la mas grande a la final', () => {
    expect(ORDEN_ETAPAS).toEqual([
      'round_of_32', 'round_of_16', 'quarter', 'semi', 'final', 'third_place',
    ]);
  });

  it('cada etapa tiene su etiqueta', () => {
    for (const e of ORDEN_ETAPAS) {
      expect(typeof ETIQUETA_ETAPA[e]).toBe('string');
      expect(ETIQUETA_ETAPA[e].length).toBeGreaterThan(0);
    }
    // Las dos que se confunden con facilidad.
    expect(ETIQUETA_ETAPA.round_of_16).toBe('Octavos');
    expect(ETIQUETA_ETAPA.round_of_32).toBe('Octavos (R32)');
  });
});

describe('agrupación por ronda', () => {
  it('reparte y conserva el orden de entrada', () => {
    const r = agruparPorEtapa([
      p('quarter'), p('semi'), p('quarter'), p('final'),
    ]);
    expect(r.quarter).toHaveLength(2);
    expect(r.semi).toHaveLength(1);
    expect(r.final).toHaveLength(1);
    expect(r.round_of_16).toBeUndefined();
  });

  it('con lista vacía no inventa rondas', () => {
    expect(agruparPorEtapa([])).toEqual({});
  });
});

describe('rondas que se pintan', () => {
  it('solo las que tienen partidos, en orden de cuadro', () => {
    // Un cuadro de 8: cuartos, semis y final. Sin ronda de 32 ni de 16.
    const porEtapa = agruparPorEtapa([
      p('final'), p('quarter'), p('semi'), p('quarter'),
    ]);
    expect(etapasActivas(porEtapa)).toEqual(['quarter', 'semi', 'final']);
  });

  it('el tercer lugar va al final, no entre semis y final', () => {
    const porEtapa = agruparPorEtapa([p('third_place'), p('final'), p('semi')]);
    expect(etapasActivas(porEtapa)).toEqual(['semi', 'final', 'third_place']);
  });

  it('sin partidos no hay columnas', () => {
    expect(etapasActivas({})).toEqual([]);
  });
});

describe('huecos pendientes', () => {
  it('falta cualquiera de los dos lados', () => {
    expect(estaPendiente(p('quarter', 'a', 'b'))).toBe(false);
    expect(estaPendiente(p('quarter', 'a', null))).toBe(true);
    expect(estaPendiente(p('quarter', null, 'b'))).toBe(true);
    expect(estaPendiente(p('quarter', null, null))).toBe(true);
  });

  it('el texto dice de dónde saldrá la pareja', () => {
    expect(textoPendiente('round_of_16', true)).toBe('Se define en la fase de grupos');
    expect(textoPendiente('quarter', false)).toBe('Se define en la ronda anterior');
    expect(textoPendiente('third_place', false)).toBe('Se define en semifinales');
  });
});

// ───────────────────────────────────────────
// El cuadro entero, no solo lo ya jugado
// ───────────────────────────────────────────
//
// EL CASO REAL: la 6.ª Varonil se pintaba con una sola columna, CUARTOS.
// `generate-bracket` materializa ronda a ronda —hasta que no se juegan los
// cuartos no se sabe quién juega las semis—, y `etapasActivas` filtraba las
// rondas sin partidos. Un cuadro que no enseña hacia dónde va no sirve.

describe('columnasDelCuadro', () => {
  const p = (stage: EtapaCuadro, n: number) =>
    Array.from({ length: n }, () => ({ stage, pairAId: 'a', pairBId: 'b' }));

  it('con solo cuartos materializados, deduce semis y final', () => {
    const cols = columnasDelCuadro({ quarter: p('quarter', 4) });
    expect(cols.map((c) => c.etapa)).toEqual(['quarter', 'semi', 'final']);
    expect(cols.map((c) => c.partidos.length)).toEqual([4, 0, 0]);
    // 4 cuartos → 2 semis → 1 final. Se divide por dos, no se consulta.
    expect(cols.map((c) => c.huecos)).toEqual([0, 2, 1]);
  });

  it('arranca donde arranca el cuadro: octavos da cuatro columnas', () => {
    const cols = columnasDelCuadro({ round_of_16: p('round_of_16', 8) });
    expect(cols.map((c) => c.etapa)).toEqual(['round_of_16', 'quarter', 'semi', 'final']);
    expect(cols.map((c) => c.huecos)).toEqual([0, 4, 2, 1]);
  });

  it('una ronda a medias solo cuenta los huecos que faltan', () => {
    const cols = columnasDelCuadro({ quarter: p('quarter', 4), semi: p('semi', 1) });
    const semi = cols.find((c) => c.etapa === 'semi')!;
    expect(semi.partidos).toHaveLength(1);
    expect(semi.huecos).toBe(1);
  });

  it('el cuadro completo no tiene huecos', () => {
    const cols = columnasDelCuadro({
      quarter: p('quarter', 4), semi: p('semi', 2), final: p('final', 1),
    });
    expect(cols.every((c) => c.huecos === 0)).toBe(true);
  });

  it('una final directa es una sola columna', () => {
    const cols = columnasDelCuadro({ final: p('final', 1) });
    expect(cols.map((c) => c.etapa)).toEqual(['final']);
    expect(cols[0].huecos).toBe(0);
  });

  // Es opcional por torneo: un cuadro sin 3.er lugar no debe mostrarlo, y uno
  // con él lo enseña al final, como en el papel.
  it('el 3.er lugar no se inventa, pero se respeta si existe', () => {
    expect(columnasDelCuadro({ quarter: p('quarter', 4) })
      .some((c) => c.etapa === 'third_place')).toBe(false);

    const conTercero = columnasDelCuadro({
      quarter: p('quarter', 4), third_place: p('third_place', 1),
    });
    expect(conTercero[conTercero.length - 1].etapa).toBe('third_place');
  });

  it('sin partidos no hay cuadro que pintar', () => {
    expect(columnasDelCuadro({})).toEqual([]);
  });
});

// ───────────────────────────────────────────
// El cuadro ANTES de que exista
// ───────────────────────────────────────────
//
// La pestaña de eliminatorias decía "aún no está disponible" cuando lo que no
// se sabía era QUIÉN juega: la hora y la cancha de todas las rondas están en
// `match_schedule` desde que se programa el torneo. Es el dato que el jugador
// necesita el viernes por la noche.

describe('fusionarConElPlan', () => {
  // Tipado explícito: sin él, TS infiere `roundLabel: null` de la celda y
  // `roundLabel: string` del partido real, y el genérico no puede unificarlos.
  type Celda = PartidoFusionable;

  const celda = (s: SlotPlanificado): Celda => ({
    id: `plan:${s.stage}:${s.slotIndex}`,
    stage: s.stage,
    roundLabel: null,
    pairAId: null,
    pairBId: null,
    scheduledAt: s.scheduledAt,
    courtLabel: s.courtLabel,
  });

  const slot = (stage: EtapaCuadro, slotIndex: number, hora: string, cancha: string): SlotPlanificado =>
    ({ stage, slotIndex, scheduledAt: hora, courtLabel: cancha });

  it('sin ningún partido, el cuadro entero sale del plan', () => {
    const r = fusionarConElPlan<Celda>([], [
      slot('quarter', 0, '2026-09-06T10:00:00Z', 'Cancha 3'),
      slot('quarter', 1, '2026-09-06T10:00:00Z', 'Cancha 4'),
      slot('semi', 0, '2026-09-06T12:00:00Z', 'Cancha 3'),
      slot('final', 0, '2026-09-06T14:00:00Z', 'Cancha 1'),
    ], celda);

    expect(r).toHaveLength(4);
    // El dato que el jugador se desvelaba sin saber.
    const octavos = r.find((x) => x.stage === 'quarter')!;
    expect(octavos.scheduledAt).toBe('2026-09-06T10:00:00Z');
    expect(octavos.courtLabel).toBe('Cancha 3');
    // Sin parejas: no se sabe quién, y no se finge.
    expect(r.every((x) => x.pairAId === null && x.pairBId === null)).toBe(true);
  });

  // Los partidos reales mandan: ahí es donde queda un cambio hecho a mano.
  it('el plan NO pisa un partido que ya existe', () => {
    const real: Celda = {
      id: 'q1', stage: 'quarter', roundLabel: 'R01',
      pairAId: 'a', pairBId: 'b',
      scheduledAt: '2026-09-06T11:30:00Z', courtLabel: 'Cancha 8',
    };
    const r = fusionarConElPlan([real], [
      slot('quarter', 0, '2026-09-06T10:00:00Z', 'Cancha 3'),
    ], celda);

    expect(r).toHaveLength(1);
    expect(r[0].scheduledAt).toBe('2026-09-06T11:30:00Z');   // el movido a mano
    expect(r[0].courtLabel).toBe('Cancha 8');
  });

  it('rellena solo lo que falta de una ronda a medias', () => {
    const real: Celda = {
      id: 'q1', stage: 'quarter', roundLabel: 'R01',
      pairAId: 'a', pairBId: 'b', scheduledAt: null, courtLabel: null,
    };
    const r = fusionarConElPlan([real], [
      slot('quarter', 0, '2026-09-06T10:00:00Z', 'Cancha 3'),
      slot('quarter', 1, '2026-09-06T10:00:00Z', 'Cancha 4'),
    ], celda);

    expect(r).toHaveLength(2);
    expect(r.filter((x) => x.pairAId === null)).toHaveLength(1);
  });

  it('con cuartos jugados, las semis del plan siguen apareciendo', () => {
    const cuartos: Celda[] = Array.from({ length: 4 }, (_, i) => ({
      id: `q${i}`, stage: 'quarter', roundLabel: `R0${i + 1}`,
      pairAId: 'a', pairBId: 'b', scheduledAt: null, courtLabel: null,
    }));
    const r = fusionarConElPlan(cuartos, [
      ...Array.from({ length: 4 }, (_, i) => slot('quarter', i, '2026-09-06T10:00:00Z', `Cancha ${i + 1}`)),
      slot('semi', 0, '2026-09-06T12:00:00Z', 'Cancha 1'),
      slot('semi', 1, '2026-09-06T12:00:00Z', 'Cancha 2'),
    ], celda);

    expect(r.filter((x) => x.stage === 'semi')).toHaveLength(2);
    expect(r.filter((x) => x.stage === 'quarter')).toHaveLength(4);
  });

  it('sin plan no se inventa nada', () => {
    expect(fusionarConElPlan<Celda>([], [], celda)).toEqual([]);
  });
});
