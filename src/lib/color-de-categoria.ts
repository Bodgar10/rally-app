/**
 * RALLY · Un color por categoría, en la parrilla del día
 *
 * ► PARA QUÉ
 *   Un sábado con tres categorías a la vez son sesenta celdas que dicen "5ª
 *   Mixto", "6ª Varonil", "7ª Varonil". Para saber dónde está cada una hay que
 *   LEER las sesenta.
 *
 *   Con una banda de color por categoría, la forma del día se ve sin leer: si
 *   la 6ª ocupa la mitad derecha del sábado, eso es un bloque de un color. Es
 *   lo que hace cualquier pizarra de club con rotuladores de colores.
 *
 * ► EL COLOR SALE DEL ORDEN, NO DEL NOMBRE
 *   Un hash del id daría colores estables pero podría repetir dos en el mismo
 *   torneo, que es justo el caso en el que el color deja de servir. Con el
 *   orden de las categorías del torneo no se repite ninguno mientras quepan en
 *   la paleta.
 *
 * ► Y NO SON LOS COLORES DE ESTADO
 *   Verde es "terminado" y ámbar es "pendiente" en toda la app. Si una
 *   categoría fuera verde, media parrilla parecería jugada. La paleta de aquí
 *   es suya y no se cruza con esos dos.
 */

/**
 * Ocho tintes legibles sobre el fondo onyx, separados en tono.
 *
 * Ocho porque es lo que cabe en un torneo grande: Cimepa tuvo ocho categorías.
 * A partir de ahí se repiten, y repetir es mejor que inventar un noveno tono
 * que se confunda con otro.
 */
export const COLORES_DE_CATEGORIA: readonly string[] = [
  '#6AA9E0',   // azul
  '#C77DD8',   // violeta
  '#5BC8B0',   // turquesa
  '#E0905C',   // naranja
  '#8E9BE8',   // índigo
  '#D8A0B8',   // rosa
  '#9CC65B',   // lima
  '#6FC3D9',   // cian
];

/**
 * El color de una categoría dentro de su torneo.
 *
 * `orden` son los ids de las categorías tal como las enseña la pantalla. Una
 * categoría que no esté en la lista —un partido de una categoría borrada, o un
 * filtro a medio cargar— cae al primer color en vez de romper: el color es una
 * ayuda, no un dato.
 */
export function colorDeCategoria(
  categoriaId: string,
  orden: readonly string[],
): string {
  const i = orden.indexOf(categoriaId);
  return COLORES_DE_CATEGORIA[(i === -1 ? 0 : i) % COLORES_DE_CATEGORIA.length];
}
