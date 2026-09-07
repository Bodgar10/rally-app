import {
  estaVivo,
  queAtender,
  etiquetaDeEstado,
  ordenarTorneos,
  type TorneoOrganizado,
} from '../torneos-organizador';

const t = (over: Partial<TorneoOrganizado> = {}): TorneoOrganizado => ({
  id: 't1',
  nombre: 'Copa Rally',
  status: 'in_progress',
  inicio: '2026-09-05',
  fin: '2026-09-07',
  categoriasAbiertas: 0,
  partidosSinCapturar: 0,
  ...over,
});

describe('qué torneos le siguen pidiendo algo', () => {
  it.each(['draft', 'registration_open', 'registration_closed', 'in_progress'])(
    '%s sigue vivo', (s) => expect(estaVivo(s)).toBe(true),
  );

  // Un torneo terminado no es trabajo pendiente: se consulta desde el panel.
  it('finished no', () => expect(estaVivo('finished')).toBe(false));
  it('un estado que no conocemos, tampoco', () => expect(estaVivo('cancelado')).toBe(false));
});

describe('qué hay que atender', () => {
  // UNA sola frase, y la que tiene gente esperando delante.
  it('los partidos sin resultado mandan sobre todo lo demás', () => {
    const a = queAtender(t({ partidosSinCapturar: 3, categoriasAbiertas: 2 }));
    expect(a).toEqual({ texto: '3 partidos jugados sin resultado', urge: true });
  });

  it('uno solo va en singular', () => {
    expect(queAtender(t({ partidosSinCapturar: 1 }))?.texto)
      .toBe('1 partido jugado sin resultado');
  });

  // Con el torneo ya arrancado, una categoría sin cerrar es gente que no puede
  // jugar. Antes de arrancar es el trabajo normal de montarlo.
  it('categorías sin cerrar urgen si el torneo ya empezó', () => {
    expect(queAtender(t({ status: 'in_progress', categoriasAbiertas: 2 })))
      .toEqual({ texto: '2 categorías sin cerrar', urge: true });
  });

  it('y no urgen si todavía no empieza', () => {
    expect(queAtender(t({ status: 'registration_open', categoriasAbiertas: 2 })))
      .toEqual({ texto: '2 categorías por cerrar', urge: false });
  });

  it('el borrador se dice, pero sin alarma', () => {
    expect(queAtender(t({ status: 'draft' })))
      .toEqual({ texto: 'Sin publicar', urge: false });
  });

  // Un borrador con categorías abiertas: lo que le falta es publicarlo, no
  // cerrar nada — nadie se ha inscrito todavía.
  it('en borrador, publicar va antes que cerrar categorías', () => {
    expect(queAtender(t({ status: 'draft', categoriasAbiertas: 4 }))?.texto)
      .toBe('Sin publicar');
  });

  // Sin nada que atender la tarjeta se calla. Un "todo en orden" es una línea
  // que se lee y no cambia ninguna decisión.
  it('sin pendientes, nada', () => {
    expect(queAtender(t({ status: 'in_progress' }))).toBeNull();
    expect(queAtender(t({ status: 'registration_open' }))).toBeNull();
  });

  it('nunca usa vocabulario de motor ni español de España', () => {
    const casos = [
      t({ partidosSinCapturar: 2 }), t({ categoriasAbiertas: 1 }),
      t({ status: 'draft' }), t({ status: 'registration_open', categoriasAbiertas: 3 }),
    ];
    for (const caso of casos) {
      const txt = queAtender(caso)?.texto ?? '';
      expect(txt).not.toMatch(/clinch|repesca|seed|bye|bracket/i);
      expect(txt).not.toMatch(/\bvosotros\b|\bvuestr[oa]s?\b/i);
      expect(txt).not.toMatch(/[a-záéíóúñ]+(áis|éis|ís)\b/i);
    }
  });
});

describe('cómo se llama cada estado', () => {
  it('en español y sin nombres de la base', () => {
    expect(etiquetaDeEstado('in_progress')).toBe('En curso');
    expect(etiquetaDeEstado('registration_open')).toBe('Inscripciones abiertas');
    expect(etiquetaDeEstado('draft')).toBe('Borrador');
  });

  // Antes que enseñar `registration_paused` en pantalla, nada.
  it('un estado que no conocemos no se pinta', () => {
    expect(etiquetaDeEstado('lo_que_sea')).toBe('');
  });
});

describe('el orden de la lista', () => {
  it('lo que se está jugando va arriba', () => {
    const lista = [
      t({ id: 'borrador', status: 'draft' }),
      t({ id: 'abierto', status: 'registration_open' }),
      t({ id: 'jugando', status: 'in_progress' }),
      t({ id: 'cerrado', status: 'registration_closed' }),
    ].sort(ordenarTorneos);
    expect(lista.map((x) => x.id)).toEqual(['jugando', 'cerrado', 'abierto', 'borrador']);
  });

  it('a igual estado, el que antes empieza', () => {
    const lista = [
      t({ id: 'tarde', inicio: '2026-10-01' }),
      t({ id: 'pronto', inicio: '2026-09-01' }),
    ].sort(ordenarTorneos);
    expect(lista.map((x) => x.id)).toEqual(['pronto', 'tarde']);
  });

  // Un torneo sin fechas no compite por la atención de nadie.
  it('los que no tienen fecha caen al final de su grupo', () => {
    const lista = [
      t({ id: 'sinFecha', inicio: null }),
      t({ id: 'conFecha', inicio: '2026-12-01' }),
    ].sort(ordenarTorneos);
    expect(lista.map((x) => x.id)).toEqual(['conFecha', 'sinFecha']);
  });
});
