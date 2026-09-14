/**
 * RALLY · Cuál de sus partidos es EL de ahora
 *
 * EL CASO REAL que lo motiva: semifinal del domingo 6 a las 23:00 (hora del
 * club), sin capturar. El miércoles 9 la app la seguía pintando bajo "Próximo
 * partido" — y si el jugador tenía además un partido del viernes sin cerrar, le
 * enseñaba ESE, porque se tomaba el más antiguo de la lista y no el más
 * cercano al reloj.
 *
 * Las horas van en UTC con la Z explícita; el módulo trabaja con instantes y
 * solo baja a la zona del club (UTC-6) para comparar DÍAS.
 */

import { elegirProximo, momentoDelPartido } from '../proximo-partido';

/** 2026-09-09, 18:00 en Ciudad de México. El miércoles del caso. */
const AHORA = Date.parse('2026-09-10T00:00:00Z');

const partido = (scheduledAt: string | null, status = 'scheduled') => ({ scheduledAt, status });

describe('elegirProximo', () => {
  it('sin candidatos no hay nada que enseñar', () => {
    expect(elegirProximo([], AHORA)).toBeNull();
  });

  it('el más cercano POR DELANTE, no el más antiguo de la lista', () => {
    // EL BUG: el del viernes iba primero por orden ascendente y ganaba siempre.
    const viernes = partido('2026-09-04T18:00:00Z');
    const manana  = partido('2026-09-10T18:00:00Z');
    const pasado  = partido('2026-09-11T18:00:00Z');
    expect(elegirProximo([viernes, manana, pasado], AHORA)).toBe(manana);
  });

  it('lo que se juega AHORA manda sobre cualquier hora escrita', () => {
    const enCurso = partido('2026-09-09T20:00:00Z', 'in_progress');
    const luego   = partido('2026-09-10T18:00:00Z');
    expect(elegirProximo([luego, enCurso], AHORA)).toBe(enCurso);
  });

  it('si no viene ninguno, el más RECIENTE de los que ya pasaron', () => {
    const viernes = partido('2026-09-04T18:00:00Z');
    const domingo = partido('2026-09-07T05:00:00Z');
    expect(elegirProximo([viernes, domingo], AHORA)).toBe(domingo);
  });

  it('un partido justo en el ahora cuenta como que viene', () => {
    const justo = partido(new Date(AHORA).toISOString());
    const antes = partido('2026-09-04T18:00:00Z');
    expect(elegirProximo([antes, justo], AHORA)).toBe(justo);
  });

  it('los que no tienen hora no le ganan a uno que sí la tiene', () => {
    const sinHora = partido(null);
    const pasado  = partido('2026-09-04T18:00:00Z');
    expect(elegirProximo([sinHora, pasado], AHORA)).toBe(pasado);

    const futuro = partido('2026-09-11T18:00:00Z');
    expect(elegirProximo([sinHora, futuro], AHORA)).toBe(futuro);
  });

  it('pero si es lo único que hay, se enseña', () => {
    const sinHora = partido(null);
    expect(elegirProximo([sinHora], AHORA)).toBe(sinHora);
  });

  it('una fecha ilegible no secuestra la elección', () => {
    const roto   = partido('mañana por la tarde');
    const bueno  = partido('2026-09-11T18:00:00Z');
    expect(elegirProximo([roto, bueno], AHORA)).toBe(bueno);
  });

  it('es determinista: el mismo dato elige siempre lo mismo', () => {
    const a = partido('2026-09-11T18:00:00Z');
    const b = partido('2026-09-11T18:00:00Z');
    expect(elegirProximo([a, b], AHORA)).toBe(a);
    expect(elegirProximo([b, a], AHORA)).toBe(b);
  });
});

/**
 * LA FRONTERA ES EL DÍA, NO EL MINUTO.
 *
 * En padel los partidos se corren toda la mañana: el de las 10:00 empieza a las
 * 10:40 y eso es lo normal. Señalarlo sería ruido. Lo que sí es otra cosa es un
 * partido de anteayer sin resultado.
 */
describe('momentoDelPartido', () => {
  it('en curso es en curso, esté donde esté su hora', () => {
    expect(momentoDelPartido(partido('2026-09-04T18:00:00Z', 'in_progress'), AHORA)).toBe('en_curso');
    expect(momentoDelPartido(partido('2026-09-11T18:00:00Z', 'in_progress'), AHORA)).toBe('en_curso');
  });

  it('lo que todavía no ha llegado es próximo', () => {
    expect(momentoDelPartido(partido('2026-09-10T18:00:00Z'), AHORA)).toBe('proximo');
  });

  it('su hora ya pasó pero es HOY: sigue siendo próximo, no un aviso', () => {
    // 2026-09-09 12:00 en el club, con el reloj en las 18:00 del mismo día.
    expect(momentoDelPartido(partido('2026-09-09T18:00:00Z'), AHORA)).toBe('proximo');
  });

  it('el caso real: domingo 23:00 mirado el miércoles, eso ya es atrasado', () => {
    expect(momentoDelPartido(partido('2026-09-07T05:00:00Z'), AHORA)).toBe('atrasado');
  });

  it('sin hora no se afirma que esté atrasado', () => {
    expect(momentoDelPartido(partido(null), AHORA)).toBe('proximo');
  });

  it('una fecha ilegible tampoco: no se acusa con un dato roto', () => {
    expect(momentoDelPartido(partido('ayer'), AHORA)).toBe('proximo');
  });
});
