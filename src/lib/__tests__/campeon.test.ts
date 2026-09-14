/**
 * RALLY · Ganaste el torneo
 *
 * Las dos decisiones que no puede tomar el componente: cuál de los campeonatos
 * manda, y hasta cuándo sigue siendo noticia. Las dos son de producto y las dos
 * se pueden equivocar en silencio, así que se fijan aquí.
 */

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

import { campeonatoQueManda, SIGUE_SIENDO_NOTICIA, type FinalGanada } from '../campeon';

const final = (division: string, categoria: string): FinalGanada => ({
  matchId: `f-${division}`,
  categoryId: `c-${division}`,
  tournamentId: 't1',
  division,
  categoria,
  miPairId: 'P1',
});

describe('un solo campeonato a la vez', () => {
  it('sin finales ganadas no hay trofeo', () => {
    expect(campeonatoQueManda([])).toBeNull();
  });

  it('con una, esa', () => {
    expect(campeonatoQueManda([final('quinta', '5ª Varonil')])!.categoria).toBe('5ª Varonil');
  });

  it('con dos manda la división MÁS ALTA, no la primera que llegó', () => {
    // Ganar la primera pesa más que ganar la sexta, y dos trofeos en la misma
    // pantalla se estorban.
    const elegido = campeonatoQueManda([final('sexta', '6ª Mixto'), final('segunda', '2ª Varonil')]);
    expect(elegido!.categoria).toBe('2ª Varonil');
  });

  it('el orden de las divisiones es el del motor de rating, de sexta a primera', () => {
    const todas = ['sexta', 'quinta', 'cuarta', 'tercera', 'segunda', 'primera'];
    // Sea cual sea el orden de llegada, gana 'primera'.
    expect(campeonatoQueManda(todas.map((d) => final(d, d)))!.division).toBe('primera');
    expect(campeonatoQueManda([...todas].reverse().map((d) => final(d, d)))!.division).toBe('primera');
  });

  it('una división que no conocemos no le gana a una que sí', () => {
    const elegido = campeonatoQueManda([final('septima', '7ª'), final('sexta', '6ª')]);
    expect(elegido!.division).toBe('sexta');
  });

  it('es determinista: el mismo dato elige siempre lo mismo', () => {
    const a = final('quinta', 'A');
    const b = final('quinta', 'B');
    expect(campeonatoQueManda([a, b])!.categoria).toBe('A');
    expect(campeonatoQueManda([b, a])!.categoria).toBe('B');
  });
});

/**
 * HASTA CUÁNDO SE ENSEÑA
 *
 * No es efímera como `YaEstasEnLaSiguiente`: anuncia algo que YA pasó. Pero
 * tampoco es para siempre — el dashboard tiene que mirar hacia delante en
 * cuanto hay otro torneo. Y es lo que evita que se pise con `MyNextMatch`.
 */
describe('hasta cuándo sigue siendo noticia', () => {
  const GANADO = '2026-09-04';

  it('sin otros torneos, se queda', () => {
    expect(SIGUE_SIENDO_NOTICIA(GANADO, [])).toBe(true);
  });

  it('un torneo POSTERIOR que sigue vivo la jubila', () => {
    // Es justo cuando MyNextMatch vuelve a tener algo que decir.
    expect(SIGUE_SIENDO_NOTICIA(GANADO, [{ status: 'in_progress', inicio: '2026-09-18' }])).toBe(false);
  });

  it('y uno que empieza el MISMO día también', () => {
    expect(SIGUE_SIENDO_NOTICIA(GANADO, [{ status: 'published', inicio: GANADO }])).toBe(false);
  });

  it('pero un torneo VIEJO a medias no jubila un campeonato de ayer', () => {
    // Se compara por fecha de inicio a propósito: un torneo anterior sin cerrar
    // es papeleo pendiente del organizador, no algo que el jugador vaya a jugar.
    expect(SIGUE_SIENDO_NOTICIA(GANADO, [{ status: 'in_progress', inicio: '2026-07-01' }])).toBe(true);
  });

  it('ni uno posterior que ya terminó', () => {
    expect(SIGUE_SIENDO_NOTICIA(GANADO, [{ status: 'finished', inicio: '2026-09-18' }])).toBe(true);
  });

  it('sin fechas no se afirma que sea viejo: manda el torneo vivo', () => {
    // Sin fecha con la que comparar, cualquier torneo sin terminar cuenta.
    expect(SIGUE_SIENDO_NOTICIA(null, [{ status: 'in_progress', inicio: null }])).toBe(false);
    expect(SIGUE_SIENDO_NOTICIA(GANADO, [{ status: 'in_progress', inicio: null }])).toBe(false);
  });

  it('basta UNO vivo entre varios terminados', () => {
    expect(SIGUE_SIENDO_NOTICIA(GANADO, [
      { status: 'finished', inicio: '2026-09-18' },
      { status: 'finished', inicio: '2026-10-01' },
      { status: 'published', inicio: '2026-10-15' },
    ])).toBe(false);
  });
});
