/**
 * RALLY · Las dos fases de un torneo, con un solo nombre
 *
 * POR QUÉ EXISTE
 *   Tres pantallas parten su contenido por fase —la categoría del jugador, los
 *   grupos del organizador y la lista del juez— y cada una lo llamaba a su
 *   manera: `SectionLabel title="Fase de grupos"`, un rótulo "FASE" con chips
 *   `['grupos', 'Fase de grupos']`, y un `stage !== 'group'` a pelo. La misma
 *   idea escrita tres veces se desincroniza a la primera: basta que alguien
 *   escriba "Cuadro" en una y "Eliminatorias" en otra para que el jugador crea
 *   que son cosas distintas.
 *
 * LO QUE NO SE UNIFICA, Y POR QUÉ
 *   El juez tiene una opción MÁS —"Todas"— y eso no es una inconsistencia: su
 *   pantalla es una LISTA con filtros, y una lista sí puede enseñar las dos
 *   fases a la vez. Las otras dos son PESTAÑAS sobre secciones, y una sección
 *   no puede estar en dos sitios. Forzar "Todas" allí obligaría a inventar una
 *   vista mezclada que nadie pidió; quitársela al juez le quitaría la única
 *   forma de ver su torneo entero.
 *
 *   Lo que sí comparten es el vocabulario, que es donde estaba el riesgo.
 */

/** Las dos fases, tal como las nombra el producto. */
export type FaseTorneo = 'grupos' | 'eliminatorias';

export const ETIQUETA_FASE: Record<FaseTorneo, string> = {
  grupos: 'Fase de grupos',
  eliminatorias: 'Eliminatorias',
};

/**
 * ¿A qué fase pertenece un partido?
 *
 * `matches.stage` es 'group' o una ronda del cuadro ('quarter', 'semi'…), así
 * que la pregunta se reduce a una comparación — pero escrita UNA vez, y no
 * repartida como `stage !== 'group'` por tres archivos.
 */
export function faseDeStage(stage: string): FaseTorneo {
  return stage === 'group' ? 'grupos' : 'eliminatorias';
}

/**
 * Las pestañas a pintar, dado lo que el torneo tiene de verdad.
 *
 * Una sola pestaña no es una pestaña: si la categoría es solo round robin o
 * solo cuadro, no hay nada que elegir y devolver una lista de uno pondría un
 * control que no controla nada. En ese caso sale vacío y quien llama pinta el
 * contenido sin selector.
 */
export function pestanasDeFase(
  hayGrupos: boolean,
  hayCuadro: boolean,
): Array<{ id: FaseTorneo; etiqueta: string }> {
  if (!hayGrupos || !hayCuadro) return [];
  return [
    { id: 'grupos', etiqueta: ETIQUETA_FASE.grupos },
    { id: 'eliminatorias', etiqueta: ETIQUETA_FASE.eliminatorias },
  ];
}

/**
 * Con qué fase se abre la pantalla.
 *
 * Grupos si existen: el torneo se juega en ese orden, y quien entra antes de
 * las eliminatorias viene a ver su tabla. Cuando solo hay cuadro, el cuadro.
 */
export function faseInicial(hayGrupos: boolean): FaseTorneo {
  return hayGrupos ? 'grupos' : 'eliminatorias';
}
