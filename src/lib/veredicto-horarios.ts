/**
 * RALLY · Qué le pasó de verdad a los horarios al cerrar
 *
 * EL BUG QUE CIERRA
 *   La pantalla miraba `res.ok` de los dos schedulers y tiraba el cuerpo. Y
 *   `schedule-groups` respondía 200 mientras ningún UPDATE de Postgres fallara
 *   — aunque el motor hubiera saltado 54 de los 55 grupos, porque un grupo que
 *   no cabe sale en `sinProgramar` y no genera ni un UPDATE. Resultado: el
 *   organizador leía "Horarios generados" sobre un torneo sin programar, y se
 *   enteraba el día del torneo.
 *
 *   Ahora las dos funciones devuelven un `ok` que significa "todos los partidos
 *   tienen hora" más la lista de lo que quedó fuera. Esto lo traduce.
 *
 * LAS TRES RESPUESTAS NO SON LA MISMA
 *   · `fallo`      — no llegó a programar. Suelen faltar canchas o las ventanas
 *                    horarias del torneo. Se arregla REINTENTANDO.
 *   · `incompleto` — programó, pero hay grupos que no caben. Reintentar da
 *                    exactamente el mismo resultado: hace falta que el
 *                    organizador cambie algo (abrir una cancha, mover a alguien
 *                    de bloque, alargar el día).
 *   · `ok`         — todos tienen hora.
 *
 *   Mezclar las dos primeras es lo que hacía la pantalla antes, y llevaba a
 *   pulsar "Reintentar" contra un bloque sobrevendido hasta rendirse.
 *
 * Vive aquí y no en la pantalla para poder probarlo: es la función que decide
 * qué ve el organizador después de cerrar su torneo.
 */

/**
 * Un grupo que quedó sin hora, ya traducido para leerlo.
 *
 * El motor devuelve un `motivo` tipado (`bloque_sobrevendido`,
 * `sin_bloque`, …) y la Edge Function le añade el `queHacer`. Los dos llegan
 * hasta aquí: el motivo NO se enseña —es vocabulario del motor— y el `queHacer`
 * sí, porque un bloque sobrevendido no es un fallo del sistema, es una decisión
 * que el organizador tiene que tomar.
 */
export interface GrupoSinHora {
  categoria: string | null;
  grupo: string;
  queHacer: string | null;
}

export type EstadoHorarios =
  | { t: 'no_intentado' }              // quedan categorías abiertas
  | { t: 'ok' }
  /**
   * Programó, pero no del todo. Es DISTINTO de 'fallo': los horarios se
   * calcularon y la mayoría del torneo tiene hora; lo que falta son grupos
   * concretos, con un motivo concreto y algo que hacer al respecto.
   */
  | { t: 'incompleto'; partidosSinHora: number; grupos: GrupoSinHora[]; categoriasSaltadas: string[] }
  | { t: 'fallo'; grupos: boolean; eliminatorias: boolean }
  | { t: 'reintentando' };

/**
 * El veredicto de los dos schedulers, leyendo EL CUERPO.
 *
 * ANTES SE MIRABA SOLO EL STATUS HTTP y se tiraba todo lo demás. Como
 * `schedule-groups` respondía 200 mientras ningún UPDATE fallara —aunque
 * hubiera saltado 54 de 55 grupos—, la pantalla pintaba "Horarios generados"
 * sobre un torneo sin programar. Ahora las dos funciones devuelven un `ok` que
 * significa "todos tienen hora" y la lista de lo que quedó fuera; esto lo
 * traduce a algo que se pueda leer y actuar.
 *
 * Se distingue NO PROGRAMÓ de PROGRAMÓ A MEDIAS: la primera se arregla
 * reintentando (suelen faltar canchas u horarios del torneo); la segunda no
 * —reintentar da el mismo resultado— y necesita que el organizador cambie algo.
 */
export function leerVeredicto(h: unknown): EstadoHorarios {
  const x = h as {
    intentado?: boolean;
    grupos?: { ok?: boolean; detalle?: unknown } | null;
    eliminatorias?: { ok?: boolean; detalle?: unknown } | null;
  } | null | undefined;

  if (!x?.intentado) return { t: 'no_intentado' };

  const dg = (x.grupos?.detalle ?? null) as {
    ok?: boolean; partidosSinHora?: number;
    gruposAfectados?: Array<{ categoria: string | null; grupo: string; queHacer: string | null }>;
  } | null;
  const dk = (x.eliminatorias?.detalle ?? null) as {
    ok?: boolean; categoriasSaltadas?: Array<{ categoria: string }>;
  } | null;

  // "No llegó a programar": ni siquiera hay cuerpo con veredicto. Es el caso
  // que se arregla reintentando.
  const gruposRespondio = typeof dg?.ok === 'boolean';
  const koRespondio = typeof dk?.ok === 'boolean';
  if (!gruposRespondio || !koRespondio) {
    return { t: 'fallo', grupos: x.grupos?.ok === true, eliminatorias: x.eliminatorias?.ok === true };
  }

  if (dg.ok === true && dk.ok === true) return { t: 'ok' };

  return {
    t: 'incompleto',
    partidosSinHora: dg.partidosSinHora ?? 0,
    grupos: (dg.gruposAfectados ?? []).map((g) => ({
      categoria: g.categoria, grupo: g.grupo, queHacer: g.queHacer,
    })),
    categoriasSaltadas: (dk.categoriasSaltadas ?? []).map((c) => c.categoria),
  };
}
