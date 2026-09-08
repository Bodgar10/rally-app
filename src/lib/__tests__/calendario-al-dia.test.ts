import { estadoDelPlan, fraseDelPlan, type PartidoDelCuadro, type SlotDelPlan } from '@/lib/calendario-al-dia';

const H = (h: string) => `2026-09-06T${h}:00.000Z`;

const p = (over: Partial<PartidoDelCuadro> & { id: string }): PartidoDelCuadro => ({
  categoryId: 'c1', categoria: '5ª Varonil', stage: 'semi', roundLabel: 'semi-01',
  scheduledAt: H('17:00'), pairAId: 'a', pairBId: 'b', status: 'scheduled', ...over,
});

const slot = (i: number, h: string, stage = 'semi'): SlotDelPlan =>
  ({ categoryId: 'c1', stage, slotIndex: i, scheduledAt: H(h) });

describe('cuando todo cuadra, no hay nada que ofrecer', () => {
  it('las dos semis en su hora del plan', () => {
    const e = estadoDelPlan(
      [p({ id: '1', roundLabel: 'semi-01' }), p({ id: '2', roundLabel: 'semi-02' })],
      [slot(0, '17:00'), slot(1, '17:00')],
    );
    expect(e.alDia).toBe(true);
    expect(e.cubiertos).toBe(2);
    expect(fraseDelPlan(e)).toBeNull();
  });
});

describe('lo que sí es un problema', () => {
  it('un partido sin hora con hueco reservado', () => {
    const e = estadoDelPlan(
      [p({ id: '1', roundLabel: 'semi-01', scheduledAt: null }), p({ id: '2', roundLabel: 'semi-02' })],
      [slot(0, '17:00'), slot(1, '17:00')],
    );
    expect(e.alDia).toBe(false);
    expect(e.sinHora).toBe(1);
    expect(e.movidos).toBe(0);
    expect(fraseDelPlan(e)).toBe('1 partido sin hora (5ª Varonil).');
  });

  it('un partido con hora distinta de la del plan', () => {
    const e = estadoDelPlan(
      [p({ id: '1', roundLabel: 'semi-01', scheduledAt: H('19:00') })],
      [slot(0, '17:00')],
    );
    expect(e.movidos).toBe(1);
    expect(fraseDelPlan(e)).toBe('1 movido respecto al plan (5ª Varonil).');
  });

  it('los dos a la vez se cuentan juntos', () => {
    const e = estadoDelPlan(
      [p({ id: '1', roundLabel: 'semi-01', scheduledAt: null }),
       p({ id: '2', roundLabel: 'semi-02', scheduledAt: H('19:00') })],
      [slot(0, '17:00'), slot(1, '17:00')],
    );
    expect(fraseDelPlan(e)).toBe('1 partido sin hora y 1 movido respecto al plan (5ª Varonil).');
  });

  it('el mismo instante en otro huso no es una diferencia', () => {
    const e = estadoDelPlan(
      [p({ id: '1', scheduledAt: '2026-09-06T11:00:00-06:00' })],
      [slot(0, '17:00')],
    );
    expect(e.alDia).toBe(true);
  });
});

describe('lo que NO cuenta como descuadre', () => {
  it('un bye: no ocupa cancha y no tiene hueco', () => {
    const e = estadoDelPlan(
      [p({ id: '1', pairBId: null, scheduledAt: null })],
      [slot(0, '17:00')],
    );
    expect(e.alDia).toBe(true);
    expect(e.cubiertos).toBe(0);
  });

  it('un partido ya jugado: su hora es el registro de lo que pasó', () => {
    const e = estadoDelPlan(
      [p({ id: '1', status: 'finished', scheduledAt: H('19:00') })],
      [slot(0, '17:00')],
    );
    expect(e.alDia).toBe(true);
  });

  it('uno en curso tampoco se toca', () => {
    const e = estadoDelPlan(
      [p({ id: '1', status: 'in_progress', scheduledAt: null })],
      [slot(0, '17:00')],
    );
    expect(e.alDia).toBe(true);
  });

  it('una ronda que el plan no cubre: rehacerlo no la arregla', () => {
    const e = estadoDelPlan(
      [p({ id: '1', stage: 'final', roundLabel: 'final-01', scheduledAt: null })],
      [slot(0, '17:00', 'semi')],
    );
    expect(e.alDia).toBe(true);
    expect(e.cubiertos).toBe(0);
  });

  it('los partidos de grupo no son cosa de este calendario', () => {
    const e = estadoDelPlan(
      [p({ id: '1', stage: 'group', scheduledAt: null })],
      [slot(0, '17:00')],
    );
    expect(e.alDia).toBe(true);
  });
});

describe('varias categorías', () => {
  it('se nombran todas las afectadas, en orden', () => {
    const e = estadoDelPlan(
      [p({ id: '1', scheduledAt: null }),
       p({ id: '2', categoryId: 'c2', categoria: '2ª Varonil', scheduledAt: null })],
      [slot(0, '17:00'), { categoryId: 'c2', stage: 'semi', slotIndex: 0, scheduledAt: H('17:00') }],
    );
    expect(e.categorias).toEqual(['2ª Varonil', '5ª Varonil']);
    expect(e.sinHora).toBe(2);
  });
});
