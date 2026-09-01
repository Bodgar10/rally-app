/**
 * RALLY · La cadena de desempate, contada en español de jugador.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *   Al pie de cada grupo había una leyenda que decía: "Si dos parejas empatan,
 *   decide la diferencia de sets y luego la de games." Es falso en el caso que
 *   más se da y peor entender: cuando empatan TRES, lo primero que manda es la
 *   mini-tabla entre ellas, no los sets del grupo. Y la frase estaba impresa
 *   justo debajo de un empate triple que los sets no habían resuelto.
 *
 *   Y faltaba lo otro: la tabla nunca decía POR QUÉ la primera era la primera.
 *   Un orden sin explicación se lee como arbitrario aunque no lo sea.
 *
 *   Las dos cosas son texto, no motor, pero tienen que salir del motor: si la
 *   frase se escribe a mano se desincroniza el día que cambie la cadena. Por
 *   eso aquí se traduce `CriterioDesempate` y nada más.
 */

import type { CriterioDesempate, DesempateAplicado } from '@/lib/engine/standings';

/**
 * La leyenda del pie de tabla. Describe la cadena REAL, en orden, cubriendo el
 * empate de dos y el de tres o más. Sin jerga de motor.
 */
export const LEYENDA_TABLA =
  'Ganar un partido suma 2 puntos; perderlo, 0. ' +
  'Si DOS parejas quedan con los mismos puntos, pasa la que ganó el partido entre ellas. ' +
  'Si son TRES O MÁS, se hace una tabla aparte solo con los partidos entre ellas: primero victorias, luego sets y luego games. ' +
  'Solo si eso tampoco las separa deciden los sets y los games de todo el grupo.';

/** Números en palabra. Más allá de seis empatadas ya no hay grupo que valga. */
const PALABRA = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];
const enPalabra = (n: number) => PALABRA[n] ?? String(n);

/** Cómo se cuenta cada criterio de la cadena. */
const FRASE: Record<Exclude<CriterioDesempate, 'sin_resolver'>, string> = {
  minitabla_puntos:      'por los partidos entre ellas',
  minitabla_sets:        'por los sets entre ellas',
  minitabla_games:       'por los games entre ellas',
  minitabla_games_favor: 'por los games a favor entre ellas',
  sets:                  'por la diferencia de sets de todo el grupo',
  games:                 'por la diferencia de games de todo el grupo',
  games_favor:           'por los games a favor de todo el grupo',
};

/**
 * Una línea corta bajo la tabla: qué empate hubo y qué lo resolvió.
 * Null cuando no hubo empates que explicar.
 *
 * Los empates SIN RESOLVER no salen aquí: esos no se explican, se avisan
 * (`avisoDeEmpateSinResolver`). Decir "se resolvió por…" de algo que no se
 * resolvió sería el mismo problema de antes con otra frase.
 */
export function explicacionDeDesempates(desempates: DesempateAplicado[]): string | null {
  const resueltos = desempates.filter((d) => d.criterio !== 'sin_resolver');
  if (resueltos.length === 0) return null;

  return resueltos
    .map((d) => {
      const n = d.pairIds.length;
      const quienes = n === 2 ? 'dos parejas' : `${enPalabra(n)} parejas`;
      const frase = FRASE[d.criterio as Exclude<CriterioDesempate, 'sin_resolver'>];
      return `Empate a ${d.puntos} ${d.puntos === 1 ? 'punto' : 'puntos'} entre ${quienes}; se resolvió ${frase}.`;
    })
    .join(' ');
}

/**
 * El aviso de arriba de la tabla cuando el reglamento NO resuelve un empate.
 *
 * Se dice entero y sin adornos: el orden que se está viendo salió del orden en
 * que llegaron las filas, no de ningún criterio deportivo, y hace falta un
 * sorteo del organizador. Null si no hay ninguno.
 */
export function avisoDeEmpateSinResolver(desempates: DesempateAplicado[]): string | null {
  const sinResolver = desempates.filter((d) => d.criterio === 'sin_resolver');
  if (sinResolver.length === 0) return null;

  const n = sinResolver[0].pairIds.length;
  const quienes = n === 2 ? 'Dos parejas' : `${enPalabra(n).replace(/^./, (c) => c.toUpperCase())} parejas`;
  return (
    `${quienes} quedaron iguales en TODO: puntos, partidos entre ellas, sets y games. ` +
    'El reglamento no las separa. El orden que ves abajo es provisional y no es deportivo: ' +
    'hace falta un sorteo del organizador para decidirlo.'
  );
}

/** Los pair_id que quedaron empatados sin resolver, para marcarlos en la tabla. */
export function parejasSinResolver(desempates: DesempateAplicado[]): string[] {
  return desempates.filter((d) => d.criterio === 'sin_resolver').flatMap((d) => d.pairIds);
}
