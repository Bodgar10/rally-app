/**
 * Las canchas de un torneo, agrupadas por sede.
 *
 * ► LA PIEZA QUE LE FALTABA AL RESTO
 *   `generarBloques` ya sabe trabajar por sede y `repartirPorBloque` ya respeta
 *   la sede de cada pareja. Pero los siete sitios que los llaman seguían
 *   pasando `canchas: 5` — un numero, sin decir donde estan. Esto traduce las
 *   filas de `tournament_courts` a lo que esos motores esperan, y lo hace en un
 *   solo sitio para que los siete den la misma respuesta.
 *
 * ► LAS ELIMINATORIAS SE JUEGAN EN LA SEDE DEL TORNEO
 *   Mundo Padel reparte los grupos entre Narvarte y Alberca Olimpica, y juega
 *   TODO el cuadro en Alberca. Eso no necesita una columna nueva: el torneo ya
 *   tiene `venue_id`, y esa es su sede — la que sale en el cartel y en la ficha.
 *   Las canchas de otras sucursales son satelites que prestan canchas para la
 *   fase de grupos.
 *
 *   Derivarlo asi en vez de preguntarlo evita el estado imposible de siempre:
 *   una sede de eliminatorias que no tiene ni una cancha en el torneo.
 *
 * ► UNA CANCHA SIN SEDE ES DE LA SEDE DEL TORNEO
 *   `tournament_courts.venue_id` es nulable a proposito: un club de una sola
 *   sede no tiene por que repetirla en cada cancha, y asi puede mudarse sin
 *   reescribirlas. Null se resuelve aqui, una vez.
 *
 * Modulo puro: sin red ni base. La consulta la hace cada lado.
 */

import type { SedeConCanchas } from './bloques.ts';

/** Una fila de `tournament_courts`, con lo justo. */
export interface CanchaDeTorneo {
  nombre: string;
  orden: number;
  /** `venue_id`. Null = la sede del torneo. */
  venueId: string | null;
}

/** Como se llama cada sede, para poder pintarla. */
export type NombresDeSede = Record<string, string>;

/** Clave interna de la sede del torneo cuando la cancha no dice ninguna. */
const PRINCIPAL = '\u0000principal';

/**
 * Las sedes del torneo con sus canchas, LA PRINCIPAL PRIMERO.
 *
 * El orden importa: es el que ve la pareja al elegir bloque, y la sede del
 * torneo es la que reconoce — es la del cartel. Las demas van detras por su
 * nombre, que es estable entre cargas.
 *
 * Con una sola sede devuelve una entrada de id null, que es exactamente lo que
 * `generarBloques` trata como "torneo normal": misma salida que antes de que
 * las canchas tuvieran nombre.
 */
export function sedesDelTorneo(
  canchas: readonly CanchaDeTorneo[],
  /** `tournaments.venue_id`. Null si el torneo no tiene sede capturada. */
  sedePrincipal: string | null,
  nombres: NombresDeSede = {},
): SedeConCanchas[] {
  const porSede = new Map<string, CanchaDeTorneo[]>();
  for (const c of canchas) {
    // Una cancha sin sede, o con la del torneo, van al mismo sitio: son la
    // misma sede dicha de dos formas.
    const clave = c.venueId === null || c.venueId === sedePrincipal
      ? PRINCIPAL
      : c.venueId;
    const ya = porSede.get(clave);
    if (ya) ya.push(c);
    else porSede.set(clave, [c]);
  }

  const satelites = [...porSede.keys()]
    .filter((k) => k !== PRINCIPAL)
    .sort((a, b) => (nombres[a] ?? a).localeCompare(nombres[b] ?? b));

  const orden = porSede.has(PRINCIPAL) ? [PRINCIPAL, ...satelites] : satelites;

  return orden.map((clave) => ({
    // UNA SOLA SEDE = SIN SEDE. Devolver un id aqui prefijaria los ids de
    // bloque de todos los torneos de siempre, y esos ids estan guardados en
    // `pair_block_choices`: invalidaria la eleccion de cada pareja inscrita.
    id: clave === PRINCIPAL
      ? (orden.length === 1 ? null : (sedePrincipal ?? PRINCIPAL))
      : clave,
    nombre: clave === PRINCIPAL
      ? (orden.length === 1 ? null : (sedePrincipal ? nombres[sedePrincipal] ?? null : null))
      : nombres[clave] ?? null,
    canchas: porSede.get(clave)!.length,
  }));
}

/**
 * Las canchas de UNA sede, en orden.
 *
 * Es lo que traduce el carril que devuelve el planificador —1, 2, 3— al nombre
 * que lee el jugador. Sin esto el partido dice "Cancha 4" y hay una Cancha 4 en
 * cada sucursal.
 */
export function canchasDeSede(
  canchas: readonly CanchaDeTorneo[],
  sedeId: string | null,
  sedePrincipal: string | null,
): CanchaDeTorneo[] {
  const esDeLaSede = (c: CanchaDeTorneo) => {
    const suya = c.venueId ?? sedePrincipal;
    // `sedeId` null = el torneo no distingue sedes: todas valen.
    return sedeId === null ? true : suya === sedeId;
  };
  return canchas.filter(esDeLaSede).sort((a, b) => a.orden - b.orden);
}

/**
 * El nombre de la cancha numero `carril` de una sede, 1-based.
 *
 * `null` cuando esa sede no tiene tantas canchas — que es un fallo de
 * planificacion, no una etiqueta que inventar. Quien llama decide si avisa o
 * cae a 'Cancha N', pero no se finge un nombre que no existe.
 */
export function nombreDeCancha(
  canchas: readonly CanchaDeTorneo[],
  sedeId: string | null,
  sedePrincipal: string | null,
  carril: number,
): string | null {
  const suyas = canchasDeSede(canchas, sedeId, sedePrincipal);
  return suyas[carril - 1]?.nombre ?? null;
}
