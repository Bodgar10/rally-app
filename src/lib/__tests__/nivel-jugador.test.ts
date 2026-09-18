// src/lib/__tests__/nivel-jugador.test.ts
import {
  RD_FIABLE,
  areaDeCurva,
  pathDeCurva,
  RD_INICIAL,
  curvaDeRating,
  nivelDelJugador,
  numeroVisible,
  resumenDeProgreso,
  textoDeCambio,
  textoDeNivel,
  textoDeSiguientePaso,
} from '@/lib/nivel-jugador';

describe('cuándo el número significa algo', () => {
  it('un jugador nuevo NO tiene nivel: 1500/350 es el valor de fábrica', () => {
    // Enseñar ese 1500 como nivel es inventar una precisión que no existe, y
    // el jugador lo descubre en cuanto pierde contra alguien "de su nivel".
    const n = nivelDelJugador(1500, RD_INICIAL, 0);
    expect(n.fiable).toBe(false);
    expect(numeroVisible(n)).toBeNull();
    expect(textoDeNivel(n)).toBe('Todavía te estamos midiendo');
  });

  it('con la incertidumbre baja, el número sale', () => {
    const n = nivelDelJugador(1612, 68, 30);
    expect(n.fiable).toBe(true);
    expect(numeroVisible(n)).toBe(1612);
  });

  it('el umbral es el MISMO que usa el motor para promover', () => {
    expect(RD_FIABLE).toBe(100);
    expect(nivelDelJugador(1600, 99, 20).fiable).toBe(true);
    expect(nivelDelJugador(1600, 100, 20).fiable).toBe(false);
  });
});

describe('la división, que es el idioma del jugador', () => {
  it.each([
    [1350, 'sexta', 'quinta'],
    [1450, 'quinta', 'cuarta'],
    [1612, 'cuarta', 'tercera'],
    [1750, 'tercera', 'segunda'],
    [1900, 'segunda', 'primera'],
  ])('rating %i → %s, y arriba %s', (rating, division, siguiente) => {
    const n = nivelDelJugador(rating, 60, 40);
    expect(n.division).toBe(division);
    expect(n.siguiente).toBe(siguiente);
  });

  it('en primera ya no hay a dónde subir', () => {
    const n = nivelDelJugador(2100, 60, 40);
    expect(n.division).toBe('primera');
    expect(n.siguiente).toBeNull();
    expect(n.paraSubir).toBeNull();
    expect(textoDeSiguientePaso(n)).toMatch(/lo más alto/);
  });

  it('dice cuántos puntos le faltan, que es lo que motiva', () => {
    const n = nivelDelJugador(1612, 60, 40);
    expect(n.paraSubir).toBe(88); // 1700 es el piso de tercera
    expect(textoDeSiguientePaso(n)).toBe('Te faltan 88 puntos para tercera.');
  });
});

describe('qué se le dice a quien todavía no tiene nivel', () => {
  it('sin partidos, lo invita a jugar', () => {
    expect(textoDeSiguientePaso(nivelDelJugador(1500, 350, 0))).toMatch(/tu primer torneo/);
  });

  it('con partidos, cuenta cuántos lleva en vez de dar un número falso', () => {
    expect(textoDeSiguientePaso(nivelDelJugador(1520, 180, 1))).toMatch(/Llevas un partido/);
    expect(textoDeSiguientePaso(nivelDelJugador(1520, 180, 7))).toMatch(/Llevas 7 partidos/);
  });
});

describe('la curva', () => {
  const h = [
    { rating_after: 1500, played_at: '2026-03-01T10:00:00Z' },
    { rating_after: 1540, played_at: '2026-03-01T12:00:00Z' },
    { rating_after: 1590, played_at: '2026-06-14T10:00:00Z' },
    { rating_after: 1575, played_at: '2026-06-14T12:00:00Z' },
  ];

  it('ordena por fecha, no por el orden en que llegó de la base', () => {
    const curva = curvaDeRating([...h].reverse());
    expect(curva.map((p) => p.rating)).toEqual([1500, 1540, 1590, 1575]);
  });

  it('es por PARTIDO y no por día: dentro de un torneo se mueve', () => {
    expect(curvaDeRating(h)).toHaveLength(4);
  });

  it('descarta filas sin fecha o sin número en vez de pintar un hueco', () => {
    const sucio = [...h, { rating_after: NaN, played_at: '2026-07-01T10:00:00Z' }];
    expect(curvaDeRating(sucio)).toHaveLength(4);
  });
});

describe('el resumen del progreso', () => {
  const curva = curvaDeRating([
    { rating_after: 1500, played_at: '2026-03-01T10:00:00Z' },
    { rating_after: 1540, played_at: '2026-03-01T12:00:00Z' },
    { rating_after: 1620, played_at: '2026-06-14T10:00:00Z' },
    { rating_after: 1590, played_at: '2026-06-14T12:00:00Z' },
  ]);

  it('cuánto ha subido en total, su techo, y qué hizo el último torneo', () => {
    const r = resumenDeProgreso(curva)!;
    expect(r.delta).toBe(90); // 1590 − 1500
    expect(r.techo).toBe(1620); // llegó más alto de lo que acabó
    expect(r.ultimoTorneo).toBe(50); // del 1540 con el que llegó al 1590 final
  });

  it('con un solo partido no hay progreso que contar', () => {
    expect(resumenDeProgreso(curva.slice(0, 1))).toBeNull();
  });
});

describe('textoDeCambio', () => {
  it.each([
    [24, '+24'],
    [0, 'sin cambios'],
    [-12, '−12'],
  ])('%i → "%s"', (d, esperado) => expect(textoDeCambio(d)).toBe(esperado));

  it('usa el menos de verdad, no el guion', () => {
    expect(textoDeCambio(-12)).not.toContain('-');
  });
});

describe('el dibujo de la curva', () => {
  const punto = (rating: number, dia: string) => ({ fecha: `2026-0${dia}T10:00:00Z`, rating });

  it('con menos de dos puntos no dibuja: una raya plana fingiría una historia', () => {
    expect(pathDeCurva([])).toBeNull();
    expect(pathDeCurva([punto(1500, '3-01')])).toBeNull();
    expect(areaDeCurva([punto(1500, '3-01')])).toBeNull();
  });

  it('el primer punto abre con M y el resto con L', () => {
    const d = pathDeCurva([punto(1500, '3-01'), punto(1600, '4-01'), punto(1550, '5-01')])!;
    expect(d.startsWith('M')).toBe(true);
    expect(d.split(' ').filter((c) => c.startsWith('L'))).toHaveLength(2);
  });

  it('el eje Y va invertido: más rating, más ARRIBA (menos y en SVG)', () => {
    const d = pathDeCurva([punto(1500, '3-01'), punto(1700, '4-01')])!;
    const ys = d.split(' ').map((c) => Number(c.slice(1).split(',')[1]));
    expect(ys[1]).toBeLessThan(ys[0]);
  });

  it('ocupa el alto disponible de borde a borde', () => {
    const d = pathDeCurva([punto(1400, '3-01'), punto(1800, '4-01')], 100, 50)!;
    const ys = d.split(' ').map((c) => Number(c.slice(1).split(',')[1]));
    expect(Math.max(...ys)).toBe(46); // el mínimo, abajo, con su margen
    expect(Math.min(...ys)).toBe(4); // el máximo, arriba
  });

  it('el eje X va de 0 al ancho completo', () => {
    const d = pathDeCurva([punto(1500, '3-01'), punto(1600, '4-01'), punto(1550, '5-01')], 300)!;
    const xs = d.split(' ').map((c) => Number(c.slice(1).split(',')[0]));
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(300);
  });

  it('SIN MOVIMIENTO NO DIVIDE ENTRE CERO: queda plana', () => {
    // Un jugador que empató todo tiene rango 0. Sin este caso, la y sería NaN
    // o Infinity y el SVG no pintaría nada, sin decir por qué.
    const d = pathDeCurva([punto(1500, '3-01'), punto(1500, '4-01')])!;
    const ys = d.split(' ').map((c) => Number(c.slice(1).split(',')[1]));
    expect(ys.every(Number.isFinite)).toBe(true);
    expect(ys[0]).toBe(ys[1]);
  });

  it('el área cierra contra el suelo para poder rellenarla', () => {
    const a = areaDeCurva([punto(1500, '3-01'), punto(1600, '4-01')], 300, 72)!;
    expect(a.endsWith('L300,72 L0,72 Z')).toBe(true);
  });
});
