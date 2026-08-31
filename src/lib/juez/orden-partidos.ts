/**
 * RALLY · Orden de la lista de partidos del juez
 *
 * EL PROBLEMA
 *   La lista ordenaba solo por `scheduled_at`. Los partidos de fase de grupos
 *   NO tienen hora —el scheduler de grupos no existe— así que los 165 del
 *   torneo llegaban con la clave en NULL y PostgREST los devolvía en un orden
 *   que no está definido y puede cambiar entre consultas. Un juez buscando un
 *   partido concreto scrolleaba 165 tarjetas iguales, y podían no estar dos
 *   veces en el mismo sitio.
 *
 * LA REGLA
 *   1. Los que TIENEN hora van primero, en orden cronológico. Cuando exista el
 *      scheduler de grupos, esa es la vista útil y manda.
 *   2. Los que no la tienen van después, ordenados categoría → grupo → ronda.
 *      Es el orden en el que se juegan de verdad: un grupo es un bloque de
 *      partidos consecutivos en una cancha.
 *   3. El id desempata al final. Sin esto el orden no sería total y dos
 *      partidos empatados podrían intercambiarse entre cargas.
 *
 * Lógica pura para poder fijarla con tests: el determinismo es el punto.
 */

export interface PartidoOrdenable {
  id: string;
  categoryName: string;
  groupName: string | null;
  roundLabel: string | null;
  scheduledAt: string | null;
}

/** Compara como lo haría una persona: "Grupo 10" detrás de "Grupo 9". */
const cmpNatural = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

/**
 * Orden estable y total. No muta la entrada.
 */
export function ordenarPartidos<T extends PartidoOrdenable>(partidos: T[]): T[] {
  return [...partidos].sort((a, b) => {
    // 1. Con hora antes que sin hora, y entre ellos por hora.
    const ha = a.scheduledAt;
    const hb = b.scheduledAt;
    if (ha && !hb) return -1;
    if (!ha && hb) return 1;
    if (ha && hb && ha !== hb) return ha < hb ? -1 : 1;

    // 2. Categoría → grupo → ronda.
    const c = cmpNatural(a.categoryName, b.categoryName);
    if (c !== 0) return c;

    // Sin grupo (eliminatorias) después de los grupos de la misma categoría.
    if (a.groupName && !b.groupName) return -1;
    if (!a.groupName && b.groupName) return 1;
    if (a.groupName && b.groupName) {
      const g = cmpNatural(a.groupName, b.groupName);
      if (g !== 0) return g;
    }

    const r = cmpNatural(a.roundLabel ?? '', b.roundLabel ?? '');
    if (r !== 0) return r;

    // 3. Desempate final: sin esto el orden no sería total.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
