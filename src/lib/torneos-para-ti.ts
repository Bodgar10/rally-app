/**
 * RALLY · En qué orden se le enseñan los torneos a un jugador.
 *
 * ► EL PROBLEMA
 *   El dashboard tenía una tarjeta que decía "Torneos disponibles · Inscríbete
 *   y compite" y llevaba a una lista. Un enlace a una lista no es una lista:
 *   para saber si hay algo para él, el jugador tenía que entrar, leer todos
 *   los torneos, mirar la ciudad de cada uno y comprobar si alguna categoría
 *   era la suya. Tres pantallas para contestar "¿hay algo para mí este fin de
 *   semana?", que es a lo que abre la app.
 *
 * ► EL ORDEN NO ES UNA PREFERENCIA: ES LO QUE DECIDE SI PUEDE IR
 *   Se ordena por lo que descarta antes, de más excluyente a menos:
 *
 *   1. SU ZONA. Un torneo en otra ciudad no es peor: es imposible. Pesa más
 *      que cualquier otra cosa, incluido un Major.
 *   2. SU DIVISIÓN. Un torneo estupendo donde no se juega su categoría no le
 *      sirve tampoco.
 *   3. EL TIER. Entre los que sí puede jugar, el Major primero: reparte el
 *      doble de puntos de ranking y es el que hay que apuntar en el calendario
 *      con tiempo. Luego P1 y luego P2.
 *   4. LA FECHA. A igualdad de todo, lo que se juega antes.
 *
 *   Ese orden es deliberado y se prueba: si el tier pesara más que la zona, la
 *   app abriría con un Major de Monterrey para alguien que juega en CDMX, que
 *   es exactamente la recomendación que enseña a ignorar la sección.
 *
 * ► LO QUE NO ENTRA NO SE ENTIERRA: SE QUEDA FUERA
 *   Un torneo de otra ciudad Y de otra división no baja al final de la lista,
 *   sale de ella. La lista del dashboard es corta a propósito; para verlo todo
 *   está la pantalla de Torneos, que no filtra nada.
 *
 * Módulo puro: la pantalla pinta lo que sale de aquí y esto se prueba sin
 * pantalla ni base.
 */

import type { TierTorneo } from '@/lib/tier-torneo';

export interface TorneoListable {
  id: string;
  nombre: string;
  /** 'YYYY-MM-DD'. */
  inicio: string;
  fin: string;
  /** La ciudad de la sede. Null si el torneo todavía no tiene sede. */
  ciudad: string | null;
  tier: TierTorneo | null;
  /** 'expres' | 'largo' | null. Solo para la etiqueta. */
  modo: string | null;
  /** Las divisiones que se juegan, tal cual vienen de `categories.division`. */
  divisiones: readonly string[];
  cuota: number;
}

export interface TorneoRecomendado extends TorneoListable {
  /** La ciudad coincide con la del jugador. */
  enTuZona: boolean;
  /** Alguna de sus categorías es una división en la que el jugador juega. */
  deTuNivel: boolean;
}

export interface Criterios {
  /** La ciudad donde juega. Null si todavía no se ha inscrito a nada. */
  zona: string | null;
  /** Las divisiones en las que tiene rating. Vacío si es nuevo. */
  divisiones: readonly string[];
}

/** Menor es antes. El orden de `TIER_OPCIONES`, que ya es el de importancia. */
const PESO_TIER: Record<TierTorneo, number> = { major: 0, p1: 1, p2: 2 };

/**
 * Los torneos que le pueden interesar, en el orden en que se le enseñan.
 *
 * ► UN JUGADOR NUEVO LO VE TODO, Y ES LO CORRECTO
 *   Sin zona y sin divisiones no hay nada que filtrar ni con qué ordenar, así
 *   que se devuelven todos por fecha. Es su primera vez: enseñarle una lista
 *   vacía porque "todavía no sabemos dónde juegas" sería cerrarle la puerta
 *   justo en el momento en que venía a entrar.
 */
export function torneosParaTi(
  torneos: readonly TorneoListable[],
  criterios: Criterios,
  limite = 5,
): TorneoRecomendado[] {
  const sabemosZona = criterios.zona !== null;
  const sabemosNivel = criterios.divisiones.length > 0;

  const marcados: TorneoRecomendado[] = torneos.map((t) => ({
    ...t,
    enTuZona: sabemosZona && t.ciudad !== null && t.ciudad === criterios.zona,
    deTuNivel: sabemosNivel && t.divisiones.some((d) => criterios.divisiones.includes(d)),
  }));

  // Lo que no es ni de su zona ni de su nivel sale de la lista corta. Solo
  // cuando SABEMOS las dos cosas: si no, no hay nada que descartar.
  const utiles = sabemosZona && sabemosNivel
    ? marcados.filter((t) => t.enTuZona || t.deTuNivel)
    : marcados;

  return [...utiles].sort(comparar).slice(0, limite);
}

/**
 * El orden, en un solo sitio. Exportado porque la pantalla de Torneos lo usa
 * para la pestaña "disponibles" y no puede tener un orden distinto al del
 * dashboard: la misma lista en dos órdenes se lee como dos listas.
 */
export function comparar(a: TorneoRecomendado, b: TorneoRecomendado): number {
  // 1 · La zona. Lo de fuera de su ciudad no es peor, es inalcanzable.
  if (a.enTuZona !== b.enTuZona) return a.enTuZona ? -1 : 1;
  // 2 · Su división.
  if (a.deTuNivel !== b.deTuNivel) return a.deTuNivel ? -1 : 1;
  // 3 · El tier. Sin tier, al final de su grupo: no sabemos qué reparte.
  const pa = a.tier ? PESO_TIER[a.tier] : 99;
  const pb = b.tier ? PESO_TIER[b.tier] : 99;
  if (pa !== pb) return pa - pb;
  // 4 · La fecha, y el nombre para que el orden sea total y no dependa de
  //     cómo venga la consulta.
  if (a.inicio !== b.inicio) return a.inicio < b.inicio ? -1 : 1;
  return a.nombre.localeCompare(b.nombre, 'es');
}

/**
 * Por qué este torneo está donde está, en tres palabras.
 *
 * Es lo que convierte una lista ordenada en una lista que se entiende: sin
 * esto, el jugador ve un orden y no sabe si es por fecha, por cercanía o por
 * azar — y un orden que no se explica se lee como un orden que no existe.
 */
export function porQueSale(t: TorneoRecomendado): string | null {
  if (t.enTuZona && t.deTuNivel) return 'Por tu zona y tu nivel';
  if (t.enTuZona) return 'Por tu zona';
  if (t.deTuNivel) return 'De tu nivel';
  return null;
}
