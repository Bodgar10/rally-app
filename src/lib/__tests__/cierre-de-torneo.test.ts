// Cuándo se puede cerrar un torneo.
//
// EL RIESGO: `finish_tournament` no comprueba nada, y detrás corre el reparto
// de puntos con lo que haya capturado. Con una final sin capturar los dos
// finalistas se puntúan como semifinalistas, y eso queda escrito.

import {
  cierreDeTorneo, categoriaTerminada, type CategoriaAlCierre,
} from '@/lib/cierre-de-torneo';

const cat = (nombre: string, over: Partial<CategoriaAlCierre> = {}): CategoriaAlCierre => ({
  nombre, conCuadro: true, sinTerminar: 0, finalDecidida: true, ...over,
});

describe('cuándo una categoría ya acabó', () => {
  it('sin partidos pendientes y con la final decidida', () => {
    expect(categoriaTerminada(cat('5.ª Varonil'))).toBe(true);
  });

  it('un partido sin capturar la deja abierta, sea de la ronda que sea', () => {
    expect(categoriaTerminada(cat('5.ª Varonil', { sinTerminar: 1 }))).toBe(false);
  });

  // EL CASO CARO: la final está creada y sin jugar.
  it('sin final decidida no está terminada', () => {
    expect(categoriaTerminada(cat('5.ª Varonil', { finalDecidida: false }))).toBe(false);
  });

  // EL CASO QUE SE ESCAPABA: cuadro sin armar. Todos los partidos de grupo
  // terminados, ninguno pendiente, y la categoría ni empezó las eliminatorias.
  it('con los grupos jugados pero el cuadro sin armar, tampoco', () => {
    expect(categoriaTerminada(cat('5.ª Varonil', { sinTerminar: 0, finalDecidida: false })))
      .toBe(false);
  });

  // Un round robin se resuelve por tabla: no hay final que esperar.
  it('un round robin acaba cuando se juega su último partido', () => {
    expect(categoriaTerminada(cat('3.ª Mixto', { conCuadro: false, finalDecidida: false })))
      .toBe(true);
  });
});

describe('el estado del cierre de un torneo largo', () => {
  it('con las ocho terminadas, listo', () => {
    const r = cierreDeTorneo(Array.from({ length: 8 }, (_, i) => cat(`Cat ${i}`)));
    expect(r.listo).toBe(true);
    expect(r.faltan).toEqual([]);
    expect(r.titular).toBe('Las 8 categorías terminaron');
  });

  // Basta UNA de las ocho para estropear los puntos de esa categoría entera.
  it('una sola sin acabar lo bloquea, y se dice cuál', () => {
    const r = cierreDeTorneo([
      cat('5.ª Varonil'), cat('3.ª Mixto', { finalDecidida: false }), cat('6.ª Femenil'),
    ]);
    expect(r.listo).toBe(false);
    expect(r.faltan).toEqual(['3.ª Mixto']);
    expect(r.titular).toBe('Falta terminar 3.ª Mixto');
  });

  it('varias se enumeran', () => {
    const r = cierreDeTorneo([
      cat('A', { sinTerminar: 2 }), cat('B'), cat('C', { finalDecidida: false }),
    ]);
    expect(r.faltan).toEqual(['A', 'C']);
    expect(r.titular).toBe('Faltan 2 categorías: A y C');
  });

  // Cuatro nombres en una línea ya no se leen.
  it('a partir de cuatro se resume', () => {
    const r = cierreDeTorneo(
      ['A', 'B', 'C', 'D', 'E'].map((n) => cat(n, { sinTerminar: 1 })),
    );
    expect(r.titular).toBe('Faltan 5 categorías: A, B, C y 2 más');
  });

  it('un torneo sin categorías no está listo para cerrar', () => {
    expect(cierreDeTorneo([]).listo).toBe(false);
  });

  it('con una sola categoría no se dice "las 1 categorías"', () => {
    expect(cierreDeTorneo([cat('5.ª Varonil')]).titular).toBe('Ya se jugó todo');
  });
});

describe('lo que se le dice al organizador', () => {
  // El paso se anuncia AUNQUE falte algo: quien captura la primera de ocho
  // finales tiene que saber ya que al final de la tarde hay un paso más.
  it('la instrucción sale siempre, falte o no', () => {
    const faltando = cierreDeTorneo([cat('A', { sinTerminar: 1 })]);
    expect(faltando.instruccion).toContain('Terminar torneo');
    expect(faltando.instruccion).toMatch(/puntos de ranking/i);
  });

  it('dice dónde está el botón, y no manda al panel a quien ya lo tiene delante', () => {
    expect(cierreDeTorneo([cat('A')], 'panel').instruccion).toContain('panel del torneo');
    expect(cierreDeTorneo([cat('A')], 'aqui').instruccion).toContain('aquí abajo');
    expect(cierreDeTorneo([cat('A')], 'aqui').instruccion).not.toContain('panel del torneo');
  });
});
