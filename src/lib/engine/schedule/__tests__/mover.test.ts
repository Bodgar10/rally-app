import { validarMovimiento, type PartidoEnCalendario } from '../mover';

const H = (h: number, m = 0) => h * 60 + m;
const DIA = '2026-09-13';

const p = (
  id: string,
  stage: string,
  jugadores: string[],
  inicioMin: number | null,
  cancha: string | null,
  extra: Partial<PartidoEnCalendario> = {},
): PartidoEnCalendario => ({
  id,
  categoryId: 'cat',
  stage,
  roundLabel: null,
  jugadores,
  dia: inicioMin === null ? null : DIA,
  inicioMin,
  cancha,
  status: 'scheduled',
  sourceMatchIds: null,
  ...extra,
});

const NOMBRES = {
  ana: 'Ana Teresa', beto: 'Beto Ruiz', caro: 'Caro Lima', dani: 'Dani Paz',
  eva: 'Eva Soto', fito: 'Fito Cruz', gabi: 'Gabi Ríos', hugo: 'Hugo Vela',
};

/** El partido que se mueve, sin nada que le estorbe. */
const base = () => [
  p('m1', 'quarter', ['ana', 'beto', 'caro', 'dani'], H(10), 'Cancha 1'),
];

const mover = (partidos: PartidoEnCalendario[], inicioMin: number, cancha: string, matchId = 'm1') =>
  validarMovimiento({
    partidos, nombres: NOMBRES, minutosPorPartido: 60, descansoMinimo: 30,
    movimiento: { matchId, dia: DIA, inicioMin, cancha },
  });

describe('validarMovimiento · el caso fácil', () => {
  it('sin nada alrededor, se puede mover', () => {
    const r = mover(base(), H(12), 'Cancha 4');
    expect(r.ok).toBe(true);
    expect(r.conflictos).toEqual([]);
  });

  it('un partido que no existe se rechaza sin inventar nada', () => {
    const r = mover(base(), H(12), 'Cancha 4', 'nope');
    expect(r.ok).toBe(false);
    expect(r.conflictos[0].motivo).toBe('partido_no_encontrado');
  });

  it('una hora fuera del día se rechaza', () => {
    expect(mover(base(), -30, 'Cancha 1').conflictos[0].motivo).toBe('hora_invalida');
    expect(mover(base(), H(24), 'Cancha 1').conflictos[0].motivo).toBe('hora_invalida');
  });
});

describe('validarMovimiento · la cancha', () => {
  it('no se puede poner encima de otro partido', () => {
    const partidos = [...base(), p('m2', 'semi', ['eva', 'fito', 'gabi', 'hugo'], H(12), 'Cancha 4')];
    const r = mover(partidos, H(12), 'Cancha 4');
    expect(r.ok).toBe(false);
    expect(r.conflictos[0].motivo).toBe('cancha_ocupada');
    expect(r.conflictos[0].matchId).toBe('m2');
    expect(r.conflictos[0].mensaje).toContain('Cancha 4');
  });

  it('solapamiento parcial también cuenta', () => {
    const partidos = [...base(), p('m2', 'semi', ['eva', 'fito', 'gabi', 'hugo'], H(12), 'Cancha 4')];
    expect(mover(partidos, H(12, 30), 'Cancha 4').ok).toBe(false);
    expect(mover(partidos, H(11, 30), 'Cancha 4').ok).toBe(false);
  });

  it('pegado justo después sí cabe: los intervalos son medio abiertos', () => {
    const partidos = [...base(), p('m2', 'semi', ['eva', 'fito', 'gabi', 'hugo'], H(12), 'Cancha 4')];
    expect(mover(partidos, H(13), 'Cancha 4').ok).toBe(true);
    expect(mover(partidos, H(11), 'Cancha 4').ok).toBe(true);
  });

  it('otro día no estorba', () => {
    const otro = p('m2', 'semi', ['eva', 'fito', 'gabi', 'hugo'], H(12), 'Cancha 4');
    otro.dia = '2026-09-12';
    expect(mover([...base(), otro], H(12), 'Cancha 4').ok).toBe(true);
  });
});

describe('validarMovimiento · los cuatro jugadores', () => {
  it('nadie juega en dos canchas a la vez, y se dice quién', () => {
    const partidos = [...base(), p('m2', 'semi', ['ana', 'eva', 'fito', 'gabi'], H(12), 'Cancha 7')];
    const r = mover(partidos, H(12), 'Cancha 4');
    expect(r.ok).toBe(false);
    expect(r.conflictos[0].motivo).toBe('jugador_ocupado');
    expect(r.conflictos[0].mensaje).toContain('Ana Teresa');
    expect(r.conflictos[0].mensaje).toContain('semifinal');
  });

  it('el caso del enunciado: acaba de terminar su cuarto', () => {
    // m2 va de 11:00 a 12:00; mover m1 a las 12:10 deja 10 minutos.
    const partidos = [
      p('m1', 'semi', ['ana', 'beto', 'caro', 'dani'], H(15), 'Cancha 1'),
      p('m2', 'quarter', ['ana', 'eva', 'fito', 'gabi'], H(11), 'Cancha 7'),
    ];
    const r = mover(partidos, H(12, 10), 'Cancha 4');
    expect(r.ok).toBe(false);
    expect(r.conflictos[0].motivo).toBe('descanso_insuficiente');
    expect(r.conflictos[0].mensaje).toContain('Ana Teresa');
    expect(r.conflictos[0].mensaje).toContain('cuarto');
    expect(r.conflictos[0].mensaje).toContain('10 minutos');
  });

  it('a los 30 minutos justos ya se puede', () => {
    const partidos = [
      p('m1', 'semi', ['ana', 'beto', 'caro', 'dani'], H(15), 'Cancha 1'),
      p('m2', 'quarter', ['ana', 'eva', 'fito', 'gabi'], H(11), 'Cancha 7'),
    ];
    expect(mover(partidos, H(12, 29), 'Cancha 4').ok).toBe(false);
    expect(mover(partidos, H(12, 30), 'Cancha 4').ok).toBe(true);
  });

  it('el descanso vale hacia adelante: no dejar sin aire al siguiente', () => {
    const partidos = [
      p('m1', 'quarter', ['ana', 'beto', 'caro', 'dani'], H(8), 'Cancha 1'),
      p('m2', 'semi', ['ana', 'eva', 'fito', 'gabi'], H(14), 'Cancha 7'),
    ];
    // Moverlo a las 13:00 lo deja terminando a las 14:00, encima de la semi.
    const r = mover(partidos, H(12, 45), 'Cancha 4');
    expect(r.ok).toBe(false);
    expect(r.conflictos[0].motivo).toBe('descanso_insuficiente');
    expect(r.conflictos[0].mensaje).toContain('después');
  });

  it('cuando son varios, se nombra a uno y se cuentan los demás', () => {
    const partidos = [
      p('m1', 'semi', ['ana', 'beto', 'caro', 'dani'], H(15), 'Cancha 1'),
      p('m2', 'quarter', ['ana', 'beto', 'fito', 'gabi'], H(11), 'Cancha 7'),
    ];
    const r = mover(partidos, H(12), 'Cancha 4');
    expect(r.conflictos[0].mensaje).toMatch(/y 1 más/);
  });

  it('sin nombre no se inventa uno', () => {
    const partidos = [
      p('m1', 'semi', ['zzz', 'beto', 'caro', 'dani'], H(15), 'Cancha 1'),
      p('m2', 'quarter', ['zzz', 'fito', 'gabi', 'hugo'], H(11), 'Cancha 7'),
    ];
    const r = validarMovimiento({
      partidos, minutosPorPartido: 60, descansoMinimo: 30,
      movimiento: { matchId: 'm1', dia: DIA, inicioMin: H(12), cancha: 'Cancha 4' },
    });
    expect(r.conflictos[0].mensaje).toContain('Un jugador');
  });
});

describe('validarMovimiento · la ronda anterior', () => {
  const cuadro = (extra: Partial<PartidoEnCalendario> = {}) => [
    p('q1', 'quarter', ['ana', 'beto', 'eva', 'fito'], H(10), 'Cancha 1'),
    p('q2', 'quarter', ['caro', 'dani', 'gabi', 'hugo'], H(10), 'Cancha 2'),
    p('s1', 'semi', ['ana', 'beto', 'caro', 'dani'], H(14), 'Cancha 1',
      { sourceMatchIds: ['q1', 'q2'], ...extra }),
  ];

  it('no se puede jugar la semi antes de que acaben los cuartos', () => {
    const r = mover(cuadro(), H(10, 30), 'Cancha 5', 's1');
    expect(r.ok).toBe(false);
    expect(r.conflictos.some((c) => c.motivo === 'ronda_previa_despues')).toBe(true);
  });

  it('con el descanso de por medio, sí', () => {
    // Cuartos 10:00-11:00, más 30 de descanso: la semi puede a las 11:30.
    expect(mover(cuadro(), H(11, 30), 'Cancha 5', 's1').ok).toBe(true);
    expect(mover(cuadro(), H(11, 15), 'Cancha 5', 's1').ok).toBe(false);
  });

  it('un cuarto sin hora bloquea, y lo dice', () => {
    const c = cuadro();
    c[0] = p('q1', 'quarter', ['ana', 'beto', 'eva', 'fito'], null, null);
    const r = mover(c, H(18), 'Cancha 5', 's1');
    expect(r.ok).toBe(false);
    const x = r.conflictos.find((k) => k.motivo === 'ronda_previa_sin_hora')!;
    expect(x.mensaje).toContain('todavía no tiene hora');
  });

  it('un cuarto YA JUGADO no bloquea aunque no tenga hora', () => {
    const c = cuadro();
    c[0] = p('q1', 'quarter', ['ana', 'beto', 'eva', 'fito'], null, null, { status: 'finished' });
    c[1] = p('q2', 'quarter', ['caro', 'dani', 'gabi', 'hugo'], null, null, { status: 'finished' });
    expect(mover(c, H(9), 'Cancha 5', 's1').ok).toBe(true);
  });

  it('sin source_match_ids cae a la ronda anterior de la categoría', () => {
    // Cuadros sembrados antes de la migración 049.
    const c = cuadro();
    c[2] = p('s1', 'semi', ['ana', 'beto', 'caro', 'dani'], H(14), 'Cancha 1');
    const r = mover(c, H(10, 30), 'Cancha 5', 's1');
    expect(r.ok).toBe(false);
    expect(r.conflictos.some((k) => k.motivo === 'ronda_previa_despues')).toBe(true);
  });

  it('un partido de grupos no mira rondas anteriores', () => {
    const partidos = [
      p('g1', 'group', ['ana', 'beto', 'caro', 'dani'], H(10), 'Cancha 1'),
      p('g2', 'group', ['eva', 'fito', 'gabi', 'hugo'], H(10), 'Cancha 2'),
    ];
    expect(mover(partidos, H(8), 'Cancha 5', 'g1').ok).toBe(true);
  });

  it('el 3.er lugar sale de las semifinales', () => {
    const partidos = [
      p('s1', 'semi', ['ana', 'beto', 'eva', 'fito'], H(14), 'Cancha 1'),
      p('s2', 'semi', ['caro', 'dani', 'gabi', 'hugo'], H(14), 'Cancha 2'),
      p('t1', 'third_place', ['beto', 'fito', 'dani', 'hugo'], H(17), 'Cancha 1'),
    ];
    expect(mover(partidos, H(14, 30), 'Cancha 5', 't1').ok).toBe(false);
    expect(mover(partidos, H(15, 30), 'Cancha 5', 't1').ok).toBe(true);
  });
});

describe('validarMovimiento · los junta todos', () => {
  it('devuelve los dos conflictos, no el primero', () => {
    // La cancha ocupada Y un jugador que viene de jugar.
    //
    // Los dos estorbos son de OTRA categoría a propósito: si fueran de la suya,
    // al no tener source_match_ids contarían además como su ronda previa y el
    // test dejaría de aislar lo que dice aislar. Una pareja en dos categorías
    // es justo el caso real de las hermanadas.
    const otraCat = { categoryId: 'otra' };
    const partidos = [
      p('m1', 'semi', ['ana', 'beto', 'caro', 'dani'], H(15), 'Cancha 1',
        { sourceMatchIds: [] }),
      p('m2', 'quarter', ['ana', 'eva', 'fito', 'gabi'], H(11), 'Cancha 7', otraCat),
      p('m3', 'quarter', ['zzz', 'yyy', 'xxx', 'www'], H(12), 'Cancha 4', otraCat),
    ];
    const r = mover(partidos, H(12), 'Cancha 4');
    expect(r.ok).toBe(false);
    const motivos = r.conflictos.map((c) => c.motivo).sort();
    expect(motivos).toEqual(['cancha_ocupada', 'descanso_insuficiente']);
  });

  it('es determinista y no muta la entrada', () => {
    const partidos = [
      p('m1', 'semi', ['ana', 'beto', 'caro', 'dani'], H(15), 'Cancha 1'),
      p('m2', 'quarter', ['ana', 'eva', 'fito', 'gabi'], H(11), 'Cancha 7'),
    ];
    const copia = JSON.parse(JSON.stringify(partidos));
    const a = mover(partidos, H(12), 'Cancha 4');
    const b = mover(partidos, H(12), 'Cancha 4');
    expect(a).toEqual(b);
    expect(partidos).toEqual(copia);
  });

  it('moverlo a donde ya está no choca consigo mismo', () => {
    const partidos = base();
    expect(mover(partidos, H(10), 'Cancha 1').ok).toBe(true);
  });
});
