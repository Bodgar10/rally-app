// Un color por categoría en la parrilla del día.
//
// Un sábado con tres categorías son sesenta celdas que dicen "5ª Mixto", "6ª
// Varonil", "7ª Varonil". Para saber dónde está cada una hay que leer las
// sesenta. Con una banda de color la forma del día se ve sin leer.

import { colorDeCategoria, COLORES_DE_CATEGORIA } from '@/lib/color-de-categoria';

const ORDEN = ['a', 'b', 'c'];

describe('el color de una categoría', () => {
  it('sale del orden en el torneo, no del nombre', () => {
    expect(colorDeCategoria('a', ORDEN)).toBe(COLORES_DE_CATEGORIA[0]);
    expect(colorDeCategoria('b', ORDEN)).toBe(COLORES_DE_CATEGORIA[1]);
    expect(colorDeCategoria('c', ORDEN)).toBe(COLORES_DE_CATEGORIA[2]);
  });

  // Si se repitieran dos en el mismo torneo, el color dejaría de servir para
  // lo único que sirve: distinguirlas.
  it('no se repite ninguno mientras quepan en la paleta', () => {
    const muchas = Array.from({ length: COLORES_DE_CATEGORIA.length }, (_, i) => `c${i}`);
    const usados = muchas.map((id) => colorDeCategoria(id, muchas));
    expect(new Set(usados).size).toBe(muchas.length);
  });

  it('el mismo id da siempre el mismo color', () => {
    expect(colorDeCategoria('b', ORDEN)).toBe(colorDeCategoria('b', ORDEN));
  });

  // El color es una ayuda, no un dato: un partido de una categoría borrada o
  // un filtro a medio cargar no pueden tirar la parrilla.
  it('una categoría que no está en la lista no rompe', () => {
    expect(colorDeCategoria('fantasma', ORDEN)).toBe(COLORES_DE_CATEGORIA[0]);
    expect(colorDeCategoria('a', [])).toBe(COLORES_DE_CATEGORIA[0]);
  });

  // Verde es "terminado" y ámbar es "pendiente" en toda la app. Una categoría
  // verde haría parecer jugada media parrilla.
  it('la paleta no se cruza con los colores de estado', () => {
    const estados = ['#42D6A4', '#E6B450', '#E0726F'];
    for (const c of COLORES_DE_CATEGORIA) {
      expect(estados).not.toContain(c);
    }
  });
});
