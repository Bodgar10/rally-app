// Qué se juega en mi cancha, y cuánto voy a entrar tarde.
//
// EL CASO REAL: partido a las 10:00, se levantó a las 8:30, llegó a las 9:30 y
// jugó a las 10:40. Lo que necesitaba saber no estaba en su categoría, estaba
// en la cancha — y el dato que lo resuelve es cuánto lleva de retraso la cola.
//
// `matches.status` no sirve: el enum tiene 'in_progress' pero nadie lo escribe.
// La detección va por la cola, y estos tests fijan que aguanta el caso que
// rompe la regla ingenua de "el que empezó hace menos de una hora".

import { estadoDeCancha, fraseDeRetraso, type PartidoEnCancha } from '@/lib/cancha-ahora';

const T = (hhmm: string) => `2026-09-05T${hhmm}:00-06:00`;
const en = (hhmm: string) => Date.parse(T(hhmm));

/** Tres partidos seguidos en la misma cancha, a las 9, 10 y 11. */
const cola = (over: Partial<Record<'a' | 'b' | 'c', Partial<PartidoEnCancha>>> = {}): PartidoEnCancha[] => [
  { id: 'a', scheduledAt: T('09:00'), playedAt: null, finished: false, ...over.a },
  { id: 'b', scheduledAt: T('10:00'), playedAt: null, finished: false, ...over.b },
  { id: 'c', scheduledAt: T('11:00'), playedAt: null, finished: false, ...over.c },
];

const base = { miMatchId: 'b', minutosPorPartido: 60 };

describe('quién ocupa la cancha', () => {
  it('el primero sin terminar, aunque su hora ya pasó hace rato', () => {
    // 'a' empezó a las 9:00 y a las 10:15 sigue sin capturarse: lleva 75
    // minutos y SIGUE ocupando. Es el caso que rompe "menos de una hora".
    const r = estadoDeCancha({ ...base, partidos: cola(), ahora: en('10:15') });
    expect(r.ocupanteId).toBe('a');
    expect(r.ocupanteLleva).toBe(75);
  });

  it('si el anterior ya terminó, ocupa el siguiente', () => {
    const r = estadoDeCancha({
      ...base,
      partidos: cola({ a: { finished: true, playedAt: T('10:05') } }),
      ahora: en('10:20'),
    });
    expect(r.ocupanteId).toBe('b');
    // Entró a las 10:05, no a las 10:00: la cancha no estaba libre antes.
    expect(r.ocupanteDesde).toBe(new Date(en('10:05')).toISOString());
    expect(r.ocupanteLleva).toBe(15);
  });

  it('antes de que empiece el primero, la cancha está libre', () => {
    const r = estadoDeCancha({ ...base, partidos: cola(), ahora: en('08:30') });
    expect(r.ocupanteId).toBeNull();
    expect(r.ocupanteLleva).toBe(0);
  });

  it('sin partidos con hora no hay cola', () => {
    const r = estadoDeCancha({
      ...base, ahora: en('10:00'),
      partidos: [{ id: 'x', scheduledAt: null, playedAt: null, finished: false }],
    });
    expect(r.ocupanteId).toBeNull();
    expect(r.miInicioEstimado).toBeNull();
  });
});

describe('cuánto voy a entrar tarde', () => {
  // El caso real, reproducido: su partido era a las 10:00 y jugó a las 10:40.
  it('el retraso del de delante se propaga al mío', () => {
    const r = estadoDeCancha({
      ...base,
      // 'a' era a las 9, se alargó y se capturó a las 10:40.
      partidos: cola({ a: { finished: true, playedAt: T('10:40') } }),
      ahora: en('10:00'),
    });
    expect(r.miInicioEstimado).toBe(new Date(en('10:40')).toISOString());
    expect(r.miRetraso).toBe(40);
  });

  it('en hora, retraso cero', () => {
    const r = estadoDeCancha({
      ...base,
      partidos: cola({ a: { finished: true, playedAt: T('09:55') } }),
      ahora: en('09:58'),
    });
    expect(r.miRetraso).toBe(0);
    expect(r.miInicioEstimado).toBe(new Date(en('10:00')).toISOString());
  });

  // Con el de delante todavía en juego, lo antes que entro es cuando acabe.
  it('un partido que se alarga empuja el mío aunque no se haya capturado', () => {
    const r = estadoDeCancha({ ...base, partidos: cola(), ahora: en('10:30') });
    expect(r.ocupanteId).toBe('a');
    // 'a' lleva 90 min; mi hora estimada ya no puede ser las 10:00.
    expect(Date.parse(r.miInicioEstimado!)).toBeGreaterThanOrEqual(en('10:30'));
    expect(r.miRetraso).toBeGreaterThanOrEqual(30);
  });

  it('el retraso se acumula a lo largo del día', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'c',
      partidos: cola({
        a: { finished: true, playedAt: T('10:20') },
        b: { finished: true, playedAt: T('11:30') },
      }),
      ahora: en('11:35'),
    });
    expect(r.miInicioEstimado).toBe(new Date(en('11:30')).toISOString());
    expect(r.miRetraso).toBe(30);
  });

  // Un `played_at` anterior al inicio dejaría la cola corriendo hacia atrás.
  it('un played_at incoherente no adelanta la cola', () => {
    const r = estadoDeCancha({
      ...base,
      partidos: cola({ a: { finished: true, playedAt: T('08:00') } }),
      ahora: en('10:00'),
    });
    expect(r.miRetraso).toBe(0);
  });
});

describe('cómo se dice el retraso', () => {
  // Por debajo de 10 min es puntualidad en un torneo real. Anunciarlo entrenaría
  // a ignorar el aviso justo antes del día en que sean cuarenta.
  it('no se menciona un retraso pequeño', () => {
    expect(fraseDeRetraso(0)).toBeNull();
    expect(fraseDeRetraso(9)).toBeNull();
  });

  it('en minutos hasta la hora', () => {
    expect(fraseDeRetraso(25)).toBe('Tu cancha lleva 25 minutos de retraso.');
  });

  it('en horas cuando pasa de una', () => {
    expect(fraseDeRetraso(60)).toBe('Tu cancha lleva 1 hora de retraso.');
    expect(fraseDeRetraso(95)).toBe('Tu cancha lleva 1 hora y 35 minutos de retraso.');
    expect(fraseDeRetraso(120)).toBe('Tu cancha lleva 2 horas de retraso.');
  });
});

describe('un partido EN JUEGO ocupa la cancha', () => {
  // `in_progress` no lo escribía nadie cuando se hizo este módulo: un partido
  // iba de 'scheduled' a 'finished' de golpe. Con la captura set a set sí se
  // escribe, y es una señal directa en vez de una deducción.
  it('ocupa aunque su hora todavía no haya llegado', () => {
    const r = estadoDeCancha({
      ...base,
      partidos: [
        { id: 'a', scheduledAt: T('09:00'), playedAt: T('09:50'), finished: true },
        // Arrancó antes de las 10:00 porque el de delante acabó pronto.
        { id: 'b', scheduledAt: T('10:00'), playedAt: null, finished: false, enJuego: true },
      ],
      ahora: en('09:55'),
    });
    expect(r.ocupanteId).toBe('b');
    // Y no dice "lleva -5 min": cuenta desde que de verdad se está jugando.
    expect(r.ocupanteLleva).toBeGreaterThanOrEqual(0);
  });

  it('el caso del bug: 15:00 en juego, a las 15:30 la cancha NO está libre', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'enJuego',
      partidos: [
        { id: 'enJuego', scheduledAt: T('15:00'), playedAt: null, finished: false, enJuego: true },
      ],
      ahora: en('15:30'),
    });
    expect(r.ocupanteId).toBe('enJuego');
    expect(r.ocupanteLleva).toBe(30);
  });

  it('un partido en juego empuja a los de detrás', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'b',
      partidos: [
        { id: 'a', scheduledAt: T('09:00'), playedAt: null, finished: false, enJuego: true },
        { id: 'b', scheduledAt: T('10:00'), playedAt: null, finished: false },
      ],
      ahora: en('10:30'),
    });
    expect(r.ocupanteId).toBe('a');
    expect(r.miRetraso).toBeGreaterThanOrEqual(30);
  });
});
