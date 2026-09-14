/**
 * RALLY · Dónde estás en cuanto ganas
 *
 * EL CASO: gana los cuartos, su semifinal no existe todavía como fila en
 * `matches` porque el cuadro avanza con la ronda COMPLETA, y la app se queda
 * muda. Lo que se prueba aquí es que el hueco al que entra sale del MOTOR
 * —`advanceBracket`, el mismo que lo decidirá de verdad— y no de una cuenta
 * paralela que podría discrepar y prometerle una cancha que no es la suya.
 *
 * Y lo otro que se prueba es que se apaga sola: en cuanto nace el partido de
 * verdad, esto devuelve `null` y manda `MyNextMatch`. Las dos tarjetas a la vez
 * serían la misma cosa dicha dos veces.
 */

// El módulo también sabe LEER de la base, y el cliente de Supabase arrastra
// AsyncStorage, que fuera de la app no existe. Aquí se prueba el criterio del
// cuadro, que es puro: el cliente se sustituye por un hueco para que el import
// no encienda medio React Native.
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

import {
  comoLlegaste, deDondeSaleElRival, nivelDeRonda, nombreDeLaRonda,
  textoDelRival, ubicacionTrasGanar,
  type PartidoDeCuadro,
} from '../siguiente-ronda';

/** Un cuarto de final del cuadro, con su etiqueta ordenable. */
function cuarto(
  i: number,
  a: string | null,
  b: string | null,
  ganador: string | null = null,
): PartidoDeCuadro {
  return {
    id: `q${i}`,
    stage: 'quarter',
    roundLabel: `quarter-0${i + 1}`,
    pairAId: a,
    pairBId: b,
    winnerPairId: ganador,
  };
}

/** Los cuatro cuartos: solo el primero está jugado y lo gana P1. */
const CUARTOS: PartidoDeCuadro[] = [
  cuarto(0, 'P1', 'P2', 'P1'),
  cuarto(1, 'P3', 'P4'),
  cuarto(2, 'P5', 'P6'),
  cuarto(3, 'P7', 'P8'),
];

/**
 * UN BYE COMO LO CREA LA BASE (migración 045): nace `status='finished'` con
 * `winner_pair_id` = la pareja presente y el otro lado en null. Nadie jugó.
 *
 * Es la forma que sale por la PRIMERA rama de `ganadorDe` —la del ganador ya
 * escrito—, no por las de "la pareja presente". Durante un tiempo los tests
 * solo cubrían esas segundas, que en producción no ocurren.
 */
const BYE_REAL: PartidoDeCuadro = {
  id: 'q0',
  stage: 'quarter',
  roundLabel: 'quarter-01',
  pairAId: 'P1',
  pairBId: null,
  winnerPairId: 'P1',
};

describe('ubicacionTrasGanar', () => {
  it('te coloca en el hueco que dice el motor, con la ronda a medias', () => {
    const u = ubicacionTrasGanar(CUARTOS, ['P1']);
    expect(u).not.toBeNull();
    expect(u!.stage).toBe('semi');
    // q0 y q1 alimentan la semi 0: es el emparejamiento de `advanceBracket`.
    expect(u!.slotIndex).toBe(0);
    expect(u!.rivalDesdeMatchId).toBe('q1');
    expect(u!.miPairId).toBe('P1');
    expect(u!.desdeMatchId).toBe('q0');
  });

  it('el hueco 1 sale de la segunda mitad del cuadro, no del orden de llegada', () => {
    const u = ubicacionTrasGanar(
      [cuarto(0, 'P1', 'P2'), cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6', 'P5'), cuarto(3, 'P7', 'P8')],
      ['P5'],
    );
    expect(u!.slotIndex).toBe(1);
    expect(u!.rivalDesdeMatchId).toBe('q3');
  });

  it('el orden del cuadro es el de la etiqueta, no el de las filas', () => {
    // La misma ronda llegando desordenada de la base: el resultado no cambia.
    const desordenados = [CUARTOS[2], CUARTOS[0], CUARTOS[3], CUARTOS[1]];
    const u = ubicacionTrasGanar(desordenados, ['P1']);
    expect(u!.slotIndex).toBe(0);
    expect(u!.rivalDesdeMatchId).toBe('q1');
  });

  it('el que perdió no está en ninguna parte', () => {
    expect(ubicacionTrasGanar(CUARTOS, ['P2'])).toBeNull();
  });

  it('el que todavía no ha jugado tampoco', () => {
    expect(ubicacionTrasGanar(CUARTOS, ['P7'])).toBeNull();
  });

  // CAMBIO 3: las dos tarjetas no se pintan a la vez.
  it('se calla en cuanto su partido de la ronda siguiente ya existe', () => {
    const conSemis: PartidoDeCuadro[] = [
      ...CUARTOS.map((q, i) => (i === 0 ? q : { ...q, winnerPairId: q.pairAId })),
      { id: 's0', stage: 'semi', roundLabel: 'semi-01', pairAId: 'P1', pairBId: 'P3', winnerPairId: null },
      { id: 's1', stage: 'semi', roundLabel: 'semi-02', pairAId: 'P5', pairBId: 'P7', winnerPairId: null },
    ];
    expect(ubicacionTrasGanar(conSemis, ['P1'])).toBeNull();
  });

  // ── LOS BYES ──────────────────────────────────────────────────────────
  // En este torneo hay 12. Son la mitad del cuadro de alguien, no un caso raro.
  //
  // Y TIENEN DOS FORMAS, no una. La que la base produce de verdad (migración
  // 045) nace `status='finished'` CON `winner_pair_id` puesto; la otra —sin
  // ganador escrito— es el respaldo defensivo que también sabe leer el motor.
  // Se prueban las dos: durante un tiempo solo estuvo cubierta la que no
  // existe en producción.

  it('el bye REAL te coloca: terminado, con ganador, y un lado en null', () => {
    const u = ubicacionTrasGanar([BYE_REAL, cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6'), cuarto(3, 'P7', 'P8')], ['P1']);
    expect(u!.stage).toBe('semi');
    expect(u!.slotIndex).toBe(0);
    expect(u!.miPairId).toBe('P1');
    expect(u!.rivalDesdeMatchId).toBe('q1');
  });

  it('el bye real por el lado B: `pair_a_id` en null y el ganador en B', () => {
    const porB: PartidoDeCuadro = {
      id: 'q0', stage: 'quarter', roundLabel: 'quarter-01',
      pairAId: null, pairBId: 'P1', winnerPairId: 'P1',
    };
    const u = ubicacionTrasGanar([porB, cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6'), cuarto(3, 'P7', 'P8')], ['P1']);
    expect(u!.slotIndex).toBe(0);
    expect(u!.miPairId).toBe('P1');
  });

  it('el bye SIN ganador escrito también: la pareja presente es la que pasa', () => {
    const u = ubicacionTrasGanar(
      [cuarto(0, 'P1', null), cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6'), cuarto(3, 'P7', 'P8')],
      ['P1'],
    );
    expect(u!.stage).toBe('semi');
    expect(u!.slotIndex).toBe(0);
  });

  // CAMBIO 2: ganar y pasar no se anuncian igual.
  it('marca `fueBye` para que la tarjeta no felicite a quien no jugó', () => {
    expect(ubicacionTrasGanar([BYE_REAL, cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6'), cuarto(3, 'P7', 'P8')], ['P1'])!.fueBye)
      .toBe(true);
    expect(ubicacionTrasGanar(
      [cuarto(0, 'P1', null), cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6'), cuarto(3, 'P7', 'P8')], ['P1'],
    )!.fueBye).toBe(true);
    // Y el partido de verdad no se marca: ahí sí ganó.
    expect(ubicacionTrasGanar(CUARTOS, ['P1'])!.fueBye).toBe(false);
  });

  it('el bye del rival no te coloca a ti', () => {
    // El hueco es del que pasa, no del que mira. Con `P3` no hay nada que decir.
    expect(ubicacionTrasGanar([BYE_REAL, cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6'), cuarto(3, 'P7', 'P8')], ['P3']))
      .toBeNull();
  });

  it('manda la ronda más avanzada cuando ganó varias', () => {
    const octavos: PartidoDeCuadro[] = Array.from({ length: 8 }, (_, i) => ({
      id: `o${i}`,
      stage: 'round_of_16',
      roundLabel: `round_of_16-0${i + 1}`,
      pairAId: `P${i * 2 + 1}`,
      pairBId: `P${i * 2 + 2}`,
      winnerPairId: `P${i * 2 + 1}`,
    }));
    const u = ubicacionTrasGanar([...octavos, ...CUARTOS], ['P1']);
    expect(u!.stage).toBe('semi');
    expect(u!.desdeMatchId).toBe('q0');
  });

  it('ganar la final no te deja en ninguna ronda siguiente', () => {
    const final: PartidoDeCuadro[] = [
      { id: 'f0', stage: 'final', roundLabel: 'final-01', pairAId: 'P1', pairBId: 'P5', winnerPairId: 'P1' },
    ];
    expect(ubicacionTrasGanar(final, ['P1'])).toBeNull();
  });

  it('ganar el 3.er lugar tampoco: no alimenta nada', () => {
    const tercero: PartidoDeCuadro[] = [
      { id: 't0', stage: 'third_place', roundLabel: 'third_place-1', pairAId: 'P3', pairBId: 'P7', winnerPairId: 'P3' },
    ];
    expect(ubicacionTrasGanar(tercero, ['P3'])).toBeNull();
  });

  it('una ronda impar o incompleta no se inventa: null', () => {
    expect(ubicacionTrasGanar([cuarto(0, 'P1', 'P2', 'P1')], ['P1'])).toBeNull();
    expect(ubicacionTrasGanar([...CUARTOS, cuarto(4, 'P9', 'P10')], ['P1'])).toBeNull();
  });

  it('las semifinales llevan a la final', () => {
    const semis: PartidoDeCuadro[] = [
      { id: 's0', stage: 'semi', roundLabel: 'semi-01', pairAId: 'P1', pairBId: 'P3', winnerPairId: 'P1' },
      { id: 's1', stage: 'semi', roundLabel: 'semi-02', pairAId: 'P5', pairBId: 'P7', winnerPairId: null },
    ];
    const u = ubicacionTrasGanar(semis, ['P1']);
    expect(u!.stage).toBe('final');
    expect(u!.slotIndex).toBe(0);
    expect(u!.rivalDesdeMatchId).toBe('s1');
  });
});

/**
 * CAMBIO 1 · CONTRA QUIÉN
 *
 * El partido del que sale su rival puede estar ya decidido —un bye, o un
 * partido terminado— y eso NO es una incógnita. Exigir las dos parejas para
 * decir algo mandaba ese dato cierto a "Rival por definir", que es exactamente
 * lo que esta tarjeta existe para no hacer.
 */
describe('de dónde sale su rival', () => {
  /** Los nombres que la vista sí resuelve. Lo que no esté, no se puede afirmar. */
  const guia = (dir: Record<string, string>) => (id: string) => dir[id] ?? null;

  const NOMBRES = guia({
    P3: 'Gerardo Ortiz / Héctor Pérez',
    P4: 'Ana Ruiz / Marta Gil',
  });

  it('un hermano BYE da un rival con nombre, no un "por definir"', () => {
    // La forma real: terminado, con ganador, y el otro lado en null.
    const hermanoBye: PartidoDeCuadro = {
      id: 'q1', stage: 'quarter', roundLabel: 'quarter-02',
      pairAId: 'P3', pairBId: null, winnerPairId: 'P3',
    };
    const r = deDondeSaleElRival(hermanoBye, NOMBRES);
    expect(r).toEqual({ tipo: 'decidido', pareja: 'Gerardo Ortiz / Héctor Pérez' });
    expect(textoDelRival(r)).toBe('Contra Gerardo Ortiz / Héctor Pérez');
  });

  it('y el bye sin ganador escrito, igual: la pareja presente es el rival', () => {
    const sinGanador: PartidoDeCuadro = {
      id: 'q1', stage: 'quarter', roundLabel: 'quarter-02',
      pairAId: 'P3', pairBId: null, winnerPairId: null,
    };
    expect(textoDelRival(deDondeSaleElRival(sinGanador, NOMBRES)))
      .toBe('Contra Gerardo Ortiz / Héctor Pérez');
  });

  it('un hermano ya TERMINADO también: se nombra al que ganó', () => {
    const jugado: PartidoDeCuadro = {
      id: 'q1', stage: 'quarter', roundLabel: 'quarter-02',
      pairAId: 'P3', pairBId: 'P4', winnerPairId: 'P4',
    };
    expect(textoDelRival(deDondeSaleElRival(jugado, NOMBRES)))
      .toBe('Contra Ana Ruiz / Marta Gil');
  });

  it('solo cuando sigue en juego se dice "el ganador de"', () => {
    const enJuego: PartidoDeCuadro = {
      id: 'q1', stage: 'quarter', roundLabel: 'quarter-02',
      pairAId: 'P3', pairBId: 'P4', winnerPairId: null,
    };
    expect(deDondeSaleElRival(enJuego, NOMBRES)).toEqual({
      tipo: 'pendiente',
      parejaA: 'Gerardo Ortiz / Héctor Pérez',
      parejaB: 'Ana Ruiz / Marta Gil',
    });
    expect(textoDelRival(deDondeSaleElRival(enJuego, NOMBRES)))
      .toBe('Contra el ganador de Gerardo Ortiz / Héctor Pérez vs Ana Ruiz / Marta Gil');
  });

  it('sin las DOS parejas no se afirma media frase', () => {
    const aMedias: PartidoDeCuadro = {
      id: 'q1', stage: 'quarter', roundLabel: 'quarter-02',
      pairAId: 'P3', pairBId: 'P9', winnerPairId: null,
    };
    expect(deDondeSaleElRival(aMedias, NOMBRES)).toBeNull();
    expect(textoDelRival(null)).toBe('Rival por definir');
  });

  it('un nombre que la vista no resuelve no se pinta como "Contra —"', () => {
    const decididoSinNombre: PartidoDeCuadro = {
      id: 'q1', stage: 'quarter', roundLabel: 'quarter-02',
      pairAId: 'P9', pairBId: null, winnerPairId: 'P9',
    };
    expect(deDondeSaleElRival(decididoSinNombre, NOMBRES)).toBeNull();
  });

  it('sin partido del que salir, no hay nada que decir', () => {
    expect(deDondeSaleElRival(null, NOMBRES)).toBeNull();
  });
});

/** CAMBIO 2 · a un bye no se le ganó nada: nadie jugó. */
describe('cómo llegaste', () => {
  it('distingue el partido ganado del pase directo', () => {
    expect(comoLlegaste(false)).toBe('Ganaste');
    expect(comoLlegaste(true)).toBe('Pasas sin jugar');
  });

  it('y lo que decide cuál es `fueBye`, que sale del cuadro', () => {
    const conBye = ubicacionTrasGanar(
      [BYE_REAL, cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6'), cuarto(3, 'P7', 'P8')], ['P1'],
    );
    expect(comoLlegaste(conBye!.fueBye)).toBe('Pasas sin jugar');
    expect(comoLlegaste(ubicacionTrasGanar(CUARTOS, ['P1'])!.fueBye)).toBe('Ganaste');
  });
});

/**
 * CUÁNTO PESA LA RONDA
 *
 * La tarjeta se veía igual en la ronda de 32 que en la final. El nivel es lo
 * que la hace crecer, y sale del CUADRO —qué tan lejos has llegado—, no de una
 * decisión de píxeles: por eso se prueba aquí y no en el componente.
 */
describe('nivel de la ronda', () => {
  it('sube con la ronda, y la final es el techo', () => {
    expect(nivelDeRonda('round_of_32')).toBe(1);
    expect(nivelDeRonda('round_of_16')).toBe(1);
    expect(nivelDeRonda('quarter')).toBe(2);
    expect(nivelDeRonda('semi')).toBe(3);
    expect(nivelDeRonda('final')).toBe(4);
  });

  it('nunca baja al avanzar: cada ronda pesa al menos lo que la anterior', () => {
    const camino = ['round_of_32', 'round_of_16', 'quarter', 'semi', 'final'] as const;
    const niveles = camino.map(nivelDeRonda);
    expect(niveles).toEqual([...niveles].sort((a, b) => a - b));
  });

  // EL NIVEL SALE DE DONDE ENTRA, NO DE LO QUE GANÓ. Ganar cuartos te pone en
  // semifinales: nivel 3, no 2.
  it('ganar cuartos te da el nivel de SEMIFINALES', () => {
    const u = ubicacionTrasGanar(CUARTOS, ['P1']);
    expect(u!.stage).toBe('semi');
    expect(nivelDeRonda(u!.stage)).toBe(3);
  });

  it('y ganar una semifinal, el de la final', () => {
    const semis: PartidoDeCuadro[] = [
      { id: 's0', stage: 'semi', roundLabel: 'semi-01', pairAId: 'P1', pairBId: 'P3', winnerPairId: 'P1' },
      { id: 's1', stage: 'semi', roundLabel: 'semi-02', pairAId: 'P5', pairBId: 'P7', winnerPairId: null },
    ];
    expect(nivelDeRonda(ubicacionTrasGanar(semis, ['P1'])!.stage)).toBe(4);
  });
});

describe('la ronda sola, para el titular', () => {
  it('es el nombre sin preposición, listo para ir en grande', () => {
    expect(nombreDeLaRonda('semi')).toBe('Semifinales');
    expect(nombreDeLaRonda('final')).toBe('La final');
    expect(nombreDeLaRonda('quarter')).toBe('Cuartos de final');
    expect(nombreDeLaRonda('round_of_16')).toBe('Octavos');
    expect(nombreDeLaRonda('round_of_32')).toBe('Ronda de 32');
  });

  it('cabe en una línea: el titular grande no puede empujar la hora fuera', () => {
    // El titular va en mayúsculas y en display condensada. Por encima de ~18
    // caracteres deja de caber en un móvil estrecho a 42px.
    for (const stage of ['round_of_32', 'round_of_16', 'quarter', 'semi', 'final'] as const) {
      expect(nombreDeLaRonda(stage).length).toBeLessThanOrEqual(18);
    }
  });

  it('"Estás en" + la ronda sola vuelve a decir la frase entera', () => {
    // Las dos líneas del titular partido tienen que leerse como una oración.
    expect(`Estás en ${nombreDeLaRonda('semi').toLowerCase()}`).toBe('Estás en semifinales');
    expect(`Estás en ${nombreDeLaRonda('final').toLowerCase()}`).toBe('Estás en la final');
  });
});
