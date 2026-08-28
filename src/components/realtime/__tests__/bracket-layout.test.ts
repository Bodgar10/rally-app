import {
  ORDEN_ETAPAS,
  ETIQUETA_ETAPA,
  agruparPorEtapa,
  etapasActivas,
  estaPendiente,
  textoPendiente,
  type EtapaCuadro,
  type PartidoDeCuadro,
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
