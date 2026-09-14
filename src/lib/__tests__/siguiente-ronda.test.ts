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

import { ubicacionTrasGanar, type PartidoDeCuadro } from '../siguiente-ronda';

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

  it('el bye de la primera ronda también te coloca', () => {
    // Sin rival, el ganador es la pareja presente aunque `winner_pair_id` sea
    // null: es el mismo criterio que usa el motor.
    const u = ubicacionTrasGanar(
      [cuarto(0, 'P1', null), cuarto(1, 'P3', 'P4'), cuarto(2, 'P5', 'P6'), cuarto(3, 'P7', 'P8')],
      ['P1'],
    );
    expect(u!.stage).toBe('semi');
    expect(u!.slotIndex).toBe(0);
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
