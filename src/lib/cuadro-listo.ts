/**
 * ¿QUÉ CATEGORÍA PUEDE YA DEFINIR SU CUADRO?
 *
 * ► POR QUÉ ESTO VIVE EN EL CALENDARIO
 *   Sembrar el cuadro está en la pantalla de Grupos, que es donde se mira la
 *   tabla antes de fijar los cruces. Pero el sábado por la tarde el organizador
 *   NO está en Grupos: está en el calendario anotando marcadores, uno detrás de
 *   otro. Cuando cae el último partido de una categoría, lo que tiene delante
 *   es la parrilla, y si para seguir el torneo hay que acordarse de ir a otra
 *   pantalla, el torneo se para ahí.
 *
 *   El cálculo es el mismo en los dos sitios, así que vive aquí y no en una
 *   pantalla: el día que cambie —un tercer lugar, una repesca— cambia una vez.
 *
 * ► NO SE SIEMBRA SOLO, Y ES A PROPÓSITO
 *   Sembrar fija los cruces de la fase final y es un punto de no retorno:
 *   deshacerlo obliga a borrar partidos. El organizador tiene derecho a mirar
 *   la tabla antes. Lo que no tiene sentido es que además tenga que BUSCAR
 *   dónde se hace.
 *
 * Módulo puro: sin red ni base.
 */

/** Un partido, con lo justo para saber si su categoría ya terminó grupos. */
export interface PartidoParaCuadro {
  categoryId: string;
  /** 'group' o cualquier etapa de eliminatorias. */
  stage: string;
  status: string;
}

export interface CategoriaListaParaCuadro {
  id: string;
  /** Partidos de grupo que jugó. Para poder decir "los 18 de 5ª Mixto". */
  partidosDeGrupo: number;
}

/**
 * Las categorías cuyos grupos están TODOS jugados y que aún no tienen cuadro.
 *
 * Tres condiciones, y las tres hacen falta:
 *   · tiene partidos de grupo —si no, no hay fase de grupos que terminar;
 *   · ninguno sin terminar —uno a medias y los cruces saldrían mal;
 *   · ninguna fila de eliminatorias todavía —si ya la hay, está sembrada.
 *
 * El orden es por id para que la lista no baile entre recargas.
 */
export function categoriasListasParaCuadro(
  partidos: readonly PartidoParaCuadro[],
): CategoriaListaParaCuadro[] {
  const grupos = new Map<string, { total: number; jugados: number }>();
  const conCuadro = new Set<string>();

  for (const p of partidos) {
    if (p.stage !== 'group') { conCuadro.add(p.categoryId); continue; }
    const ya = grupos.get(p.categoryId) ?? { total: 0, jugados: 0 };
    ya.total += 1;
    if (p.status === 'finished') ya.jugados += 1;
    grupos.set(p.categoryId, ya);
  }

  return [...grupos.entries()]
    .filter(([id, g]) => g.total > 0 && g.jugados === g.total && !conCuadro.has(id))
    .map(([id, g]) => ({ id, partidosDeGrupo: g.total }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Cuánto le falta a una categoría para poder definir su cuadro.
 *
 * Null cuando ya puede o cuando ni siquiera tiene grupos: el aviso solo es
 * útil mientras falta algo que se pueda contar.
 */
export function faltanParaCuadro(
  partidos: readonly PartidoParaCuadro[],
  categoryId: string,
): number | null {
  const suyos = partidos.filter((p) => p.categoryId === categoryId && p.stage === 'group');
  if (suyos.length === 0) return null;
  const faltan = suyos.filter((p) => p.status !== 'finished').length;
  return faltan === 0 ? null : faltan;
}
