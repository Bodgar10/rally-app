/**
 * RALLY · Las divisiones, en un solo sitio.
 *
 * ► POR QUÉ ESTE MÓDULO EXISTE
 *   La lista estaba escrita cuatro veces: en el alta de categorías, en el alta
 *   del exprés, en el ranking y en `nivel-jugador`. Cada una con su orden y su
 *   formato. Añadir la séptima (migración 084) obligaba a acertar en las
 *   cuatro, y olvidar una no rompía la compilación: solo dejaba una pantalla
 *   sin la división nueva, que es el fallo más caro porque nadie lo ve hasta
 *   que un organizador no encuentra su categoría.
 *
 * ► Y LA EXHAUSTIVIDAD AQUÍ SÍ SE COMPRUEBA
 *   La lista de `categorias.tsx` llevaba un `satisfies ReadonlyArray<{ valor:
 *   Division }>` y un comentario prometiendo que "deja de compilar hasta que
 *   se actualice". No era verdad: `satisfies` comprueba que cada elemento
 *   encaje en el tipo, no que estén TODOS. Quitar una división compilaba sin
 *   una queja.
 *
 *   `COMPLETA` de abajo sí lo comprueba de verdad, con un tipo que solo es
 *   satisfacible si están las siete. Añadir un valor al enum y regenerar los
 *   tipos rompe la compilación aquí, en un archivo, y no en silencio en cuatro
 *   pantallas.
 *
 * ORDEN
 *   De MENOR a MAYOR, igual que el enum de Postgres y que `DEFAULT_BANDS`:
 *   séptima es la entrada y primera la más alta. Las pantallas que quieran
 *   enseñarlas al revés usan `DIVISIONES_DESC`, que se deriva de esta.
 */

import type { Division } from '@/lib/engine/types';

/**
 * De menor a mayor. Gemelo del orden de `DEFAULT_BANDS` y del enum
 * `public.division`, que Postgres ordena por posición de declaración.
 */
export const DIVISIONES = [
  'septima', 'sexta', 'quinta', 'cuarta', 'tercera', 'segunda', 'primera',
] as const satisfies readonly Division[];

/** De mayor a menor. Es como se enseñan en los formularios: 1ª arriba. */
export const DIVISIONES_DESC: readonly Division[] = [...DIVISIONES].reverse();

/** El nombre largo. "Tercera Varonil". */
export const NOMBRE_DIVISION: Record<Division, string> = {
  primera: 'Primera',
  segunda: 'Segunda',
  tercera: 'Tercera',
  cuarta:  'Cuarta',
  quinta:  'Quinta',
  sexta:   'Sexta',
  septima: 'Séptima',
};

/** El chip de un formulario y la columna de una tabla. "3ª". */
export const ETIQUETA_DIVISION: Record<Division, string> = {
  primera: '1ª',
  segunda: '2ª',
  tercera: '3ª',
  cuarta:  '4ª',
  quinta:  '5ª',
  sexta:   '6ª',
  septima: '7ª',
};

/**
 * LA COMPROBACIÓN DE VERDAD.
 *
 * Solo compila si `DIVISIONES` contiene las siete: si falta una, su clave
 * sobrevive en el `Exclude` y el tipo deja de ser `never`. No cuesta nada en
 * tiempo de ejecución — es un tipo, no un valor.
 *
 * ► DEPENDE DE QUE `DIVISIONES` NO LLEVE ANOTACIÓN DE TIPO, Y ESO ES FRÁGIL
 *   Con `const DIVISIONES: readonly Division[] = [...]` esto compila SIEMPRE:
 *   la anotación ensancha la tupla a `Division[]`, `(typeof DIVISIONES)[number]`
 *   vuelve a ser `Division` y el `Exclude` da `never` pase lo que pase. Es
 *   exactamente el fallo que tenía el `satisfies` de `categorias.tsx`, y lo
 *   cometí aquí otra vez antes de comprobarlo.
 *
 *   Por eso la lista usa `as const satisfies` y NO dos puntos: `satisfies`
 *   valida cada elemento sin perder los literales. Si alguien le pone una
 *   anotación, esta comprobación se apaga en silencio.
 */
type FaltanEnLaLista = Exclude<Division, (typeof DIVISIONES)[number]>;
const COMPLETA: FaltanEnLaLista extends never ? true : false = true;
void COMPLETA;

/** Dónde cae una división en la escalera. -1 si no es una de las nuestras. */
export function escalonDe(division: Division | string): number {
  return DIVISIONES.indexOf(division as Division);
}
