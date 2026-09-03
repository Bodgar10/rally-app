// Qué se juega en mi cancha, y cuánto voy a entrar tarde.
//
// EL CASO REAL: partido a las 10:00, se levantó a las 8:30, llegó a las 9:30 y
// jugó a las 10:40. Lo que necesitaba saber no estaba en su categoría, estaba
// en la cancha — y el dato que lo resuelve es cuánto lleva de retraso la cola.
//
// `matches.status` no sirve: el enum tiene 'in_progress' pero nadie lo escribe.
// La detección va por la cola, y estos tests fijan que aguanta el caso que
// rompe la regla ingenua de "el que empezó hace menos de una hora".

import {
  estadoDeCancha, fraseDeRetraso, fraseDeCola, fraseDeTurno,
  type PartidoEnCancha,
} from '@/lib/cancha-ahora';

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

describe('la cola entera, no solo el ocupante', () => {
  // "Cuál se juega ahora" no contesta la pregunta del jugador. Saber que hay
  // DOS partidos por delante en vez de ser el siguiente es la diferencia entre
  // ir saliendo de casa y sentarse otra vez.
  it('cuenta los que faltan antes del mío', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'c',
      partidos: cola(),   // a las 9, 10 y 11; ninguno terminado
      ahora: en('09:10'),
    });
    expect(r.partidosAntesDelMio).toBe(2);
    expect(r.colaAntesDelMio).toEqual(['a', 'b']);
  });

  it('los terminados no cuentan: ya no se espera nada de ellos', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'c',
      partidos: cola({ a: { finished: true, playedAt: T('10:05') } }),
      ahora: en('10:10'),
    });
    expect(r.partidosAntesDelMio).toBe(1);
    expect(r.colaAntesDelMio).toEqual(['b']);
  });

  it('cero cuando soy el siguiente', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'b',
      partidos: cola({ a: { finished: true, playedAt: T('09:55') } }),
      ahora: en('09:58'),
    });
    expect(r.partidosAntesDelMio).toBe(0);
    expect(r.colaAntesDelMio).toEqual([]);
  });

  it('lo que viene DETRÁS del mío no me hace esperar', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'a',   // el mío es el primero de la cancha
      partidos: cola(),
      ahora: en('09:00'),
    });
    expect(r.partidosAntesDelMio).toBe(0);
  });

  it('el partido en curso cuenta como uno por delante', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'b',
      partidos: cola({ a: { enJuego: true } }),
      ahora: en('09:30'),
    });
    expect(r.ocupanteId).toBe('a');
    expect(r.partidosAntesDelMio).toBe(1);
    expect(r.colaAntesDelMio[0]).toBe('a');
  });
});

describe('cómo se dice la cola', () => {
  // "Falta 1 partido antes del tuyo" con uno en curso se leía como "ese MÁS
  // otro": el que se está jugando ya no falta, está pasando.
  it('con el partido en curso como único de delante, se dice por lo que es', () => {
    expect(fraseDeCola(1, true)).toBe('Vas después de este partido.');
  });

  it('uno por delante que aún no empieza SÍ es algo que falta', () => {
    expect(fraseDeCola(1, false)).toBe('Falta 1 partido antes del tuyo.');
  });

  it('de dos en adelante el número informa', () => {
    expect(fraseDeCola(2, true)).toBe('Faltan 2 partidos antes del tuyo.');
    expect(fraseDeCola(3, true)).toBe('Faltan 3 partidos antes del tuyo.');
  });

  // "Faltan 0 partidos" es una forma rara de dar una buena noticia.
  it('sin cola no hay frase de cola: la da fraseDeTurno', () => {
    expect(fraseDeCola(0)).toBeNull();
    expect(fraseDeTurno(0, true)).toMatch(/siguiente/i);
    expect(fraseDeTurno(0, true)).toMatch(/cuando acabe/i);
    expect(fraseDeTurno(0, false)).toMatch(/libre/i);
  });

  it('con cola no se anuncia turno', () => {
    expect(fraseDeTurno(2, true)).toBeNull();
  });
});

// ───────────────────────────────────────────
// Desde cuándo lleva jugándose
// ───────────────────────────────────────────
//
// EL BUG: el contador arrancaba cuando el juez capturaba el primer set, o sea
// unos cuarenta minutos después de que la gente entrara a la pista. La tarjeta
// decía "lleva 0 min" de un partido que llevaba media hora larga.
//
// LA REGLA: un partido empieza cuando se libera la cancha, y la cancha se libera
// cuando el juez cierra el anterior. Es el único instante que la app conoce.
//
//     inicioReal = max(hora prevista, played_at del anterior)

describe('desde cuándo lleva jugándose el ocupante', () => {
  it('el primero de la cola cuenta desde su hora prevista', () => {
    // Nadie delante: no hay `played_at` anterior que mande.
    const r = estadoDeCancha({
      ...base, miMatchId: 'b',
      partidos: [
        { id: 'a', scheduledAt: T('09:00'), playedAt: null, finished: false, enJuego: true },
        { id: 'b', scheduledAt: T('10:00'), playedAt: null, finished: false },
      ],
      ahora: en('09:40'),
    });
    expect(r.ocupanteId).toBe('a');
    expect(r.ocupanteDesde).toBe(new Date(en('09:00')).toISOString());
    expect(r.ocupanteLleva).toBe(40);
  });

  // EL CASO DEL BUG, con el ejemplo de la Cancha 1: cuando el juez da por
  // concluido el de 3.ª Fuerza, a partir de ESE momento corre el de 5.ª.
  it('cuando el anterior acaba tarde, manda el fin del anterior', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'mio',
      partidos: [
        // 3.ª Fuerza: era a las 9, el juez lo cerró a las 10:20.
        { id: 'tercera', scheduledAt: T('09:00'), playedAt: T('10:20'), finished: true },
        // 5.ª Fuerza: era a las 10, pero no pudo entrar hasta las 10:20.
        { id: 'quinta', scheduledAt: T('10:00'), playedAt: null, finished: false, enJuego: true },
        { id: 'mio', scheduledAt: T('11:00'), playedAt: null, finished: false },
      ],
      ahora: en('11:00'),
    });
    expect(r.ocupanteId).toBe('quinta');
    // No desde las 10:00 —exageraría el tiempo jugado— sino desde las 10:20.
    expect(r.ocupanteDesde).toBe(new Date(en('10:20')).toISOString());
    expect(r.ocupanteLleva).toBe(40);
  });

  it('cuando el anterior acaba pronto, manda la hora prevista', () => {
    // La gente no entra a la cancha media hora antes.
    const r = estadoDeCancha({
      ...base, miMatchId: 'mio',
      partidos: [
        { id: 'antes', scheduledAt: T('09:00'), playedAt: T('09:30'), finished: true },
        { id: 'ocupa', scheduledAt: T('10:00'), playedAt: null, finished: false, enJuego: true },
        { id: 'mio', scheduledAt: T('11:00'), playedAt: null, finished: false },
      ],
      ahora: en('10:25'),
    });
    expect(r.ocupanteDesde).toBe(new Date(en('10:00')).toISOString());
    expect(r.ocupanteLleva).toBe(25);
  });

  // El bug tal como se veía: el juez captura el primer set y el contador se
  // reinicia. Ahora `in_progress` decide QUIÉN ocupa, no desde cuándo.
  it('capturar el primer set NO reinicia el reloj', () => {
    const partidos: PartidoEnCancha[] = [
      { id: 'antes', scheduledAt: T('09:00'), playedAt: T('10:00'), finished: true },
      { id: 'ocupa', scheduledAt: T('10:00'), playedAt: null, finished: false },
    ];
    const ahora = en('10:40');

    // Antes de capturar nada: 'scheduled', deducido por la cola.
    const sinCaptura = estadoDeCancha({ ...base, miMatchId: 'x', partidos, ahora });
    // Justo después de capturar el primer set: pasa a 'in_progress'.
    const conCaptura = estadoDeCancha({
      ...base, miMatchId: 'x', ahora,
      partidos: [partidos[0], { ...partidos[1], enJuego: true }],
    });

    expect(sinCaptura.ocupanteLleva).toBe(40);
    // La misma cifra: capturar no cambia cuándo empezó el partido.
    expect(conCaptura.ocupanteLleva).toBe(40);
    expect(conCaptura.ocupanteDesde).toBe(sinCaptura.ocupanteDesde);
  });

  it('nunca un número negativo', () => {
    // En juego antes de su hora y sin nadie delante: el clamp lo deja en 0.
    const r = estadoDeCancha({
      ...base, miMatchId: 'x',
      partidos: [{ id: 'ocupa', scheduledAt: T('11:00'), playedAt: null, finished: false, enJuego: true }],
      ahora: en('10:50'),
    });
    expect(r.ocupanteId).toBe('ocupa');
    expect(r.ocupanteLleva).toBe(0);
    expect(r.ocupanteLleva).toBeGreaterThanOrEqual(0);
  });

  // Las tres cifras de la tarjeta salen del mismo `inicioReal`.
  it('el reloj, el retraso y la hora de entrada cuentan la misma historia', () => {
    const r = estadoDeCancha({
      ...base, miMatchId: 'mio',
      partidos: [
        { id: 'antes', scheduledAt: T('09:00'), playedAt: T('10:20'), finished: true },
        { id: 'mio', scheduledAt: T('10:00'), playedAt: null, finished: false, enJuego: true },
      ],
      ahora: en('11:00'),
    });
    // Empezó a las 10:20 (cuando se liberó la cancha), no a las 10:00.
    expect(r.ocupanteDesde).toBe(new Date(en('10:20')).toISOString());
    expect(r.ocupanteLleva).toBe(40);
    // Y mi entrada estimada y mi retraso salen del MISMO instante.
    expect(r.miInicioEstimado).toBe(new Date(en('10:20')).toISOString());
    expect(r.miRetraso).toBe(20);
  });
});
