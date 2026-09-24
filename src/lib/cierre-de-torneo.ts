/**
 * RALLY · Cuándo se puede cerrar un torneo, y cómo se le dice al organizador
 *
 * ► EL BOTÓN MÁS IRREVERSIBLE DEL PRODUCTO NO COMPROBABA NADA
 *   `finish_tournament` solo mira que el torneo esté `in_progress` y que quien
 *   lo pulsa sea owner. Nada más. Y detrás de esa transición corre el reparto
 *   de puntos de ranking, que se calcula CON LO QUE HAYA CAPTURADO EN ESE
 *   INSTANTE.
 *
 *   Con una final sin capturar, `compute-ranking-points` no la encuentra entre
 *   los partidos resueltos, así que los dos finalistas caen a la rama de "su
 *   ronda más lejana terminada" y se les puntúa como SEMIFINALISTAS. Al campeón
 *   le faltan los puntos de campeón y los de finalista, y eso queda escrito.
 *
 *   En un torneo largo hay una final POR CATEGORÍA y un solo cierre para todas,
 *   así que basta con que una de las ocho vaya retrasada para estropear los
 *   puntos de esa categoría entera.
 *
 * ► Y EL PASO NO SE ANUNCIABA EN NINGUNA PARTE
 *   Vivía en la ZONA DE RIESGO del panel, junto a "Eliminar torneo". El
 *   organizador acaba su domingo, cierra la app y los jugadores se quedan sin
 *   puntos sin que nadie les diga por qué. Por eso aquí no solo se decide si se
 *   puede cerrar: se escribe la frase que hay que enseñarle, con el nombre del
 *   botón y dónde está.
 *
 * ► QUÉ CUENTA COMO "TERMINADA"
 *   Una categoría está lista cuando no le queda ningún partido sin capturar Y
 *   —si acaba en cuadro— su final tiene ganador. Las dos condiciones hacen
 *   falta: sin la primera puede faltar una semifinal; sin la segunda, una
 *   categoría que nunca armó su cuadro tiene todos sus partidos de grupo
 *   terminados y parecería acabada.
 *
 * Módulo puro: la regla se prueba sin pantalla ni base.
 */

/** Lo que hay que saber de una categoría para decidir si ya acabó. */
export interface CategoriaAlCierre {
  /** '5.ª Varonil'. Es lo que se le enseña al organizador. */
  nombre: string;
  /**
   * Acaba en una final. False en un round robin, que se resuelve por tabla y
   * no tiene partido final que esperar.
   */
  conCuadro: boolean;
  /** Partidos suyos sin terminar, de cualquier ronda. */
  sinTerminar: number;
  /** Su final ya tiene ganador. Se ignora si `conCuadro` es false. */
  finalDecidida: boolean;
}

export interface CierreDeTorneo {
  /** Todas las categorías acabaron: cerrar ahora reparte los puntos buenos. */
  listo: boolean;
  /** Las que faltan, por nombre y en el orden en que llegaron. */
  faltan: string[];
  /** Una línea con el estado. Nunca vacía. */
  titular: string;
  /**
   * Qué hay que hacer, dicho entero: el nombre del botón y dónde está.
   *
   * Se dice TAMBIÉN cuando todavía falta algo. El organizador que acaba de
   * capturar la primera de ocho finales tiene que saber desde ya que al final
   * de la tarde hay un paso más, no descubrirlo tres días después cuando un
   * jugador pregunte por sus puntos.
   */
  instruccion: string;
}

/** Cuántos nombres se enumeran antes de resumir. Cuatro ya no se leen. */
const NOMBRES_QUE_CABEN = 3;

/** "A, B y C" · "A, B, C y 2 más". */
function listar(nombres: readonly string[]): string {
  if (nombres.length <= NOMBRES_QUE_CABEN) {
    if (nombres.length === 1) return nombres[0];
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  }
  const resto = nombres.length - NOMBRES_QUE_CABEN;
  return `${nombres.slice(0, NOMBRES_QUE_CABEN).join(', ')} y ${resto} más`;
}

/** ¿Esta categoría ya acabó del todo? */
export function categoriaTerminada(c: CategoriaAlCierre): boolean {
  if (c.sinTerminar > 0) return false;
  return c.conCuadro ? c.finalDecidida : true;
}

/**
 * El estado del cierre, y lo que se le enseña al organizador.
 *
 * `donde` cambia solo la instrucción: en el panel el botón está ahí mismo, y
 * desde la pantalla del exprés está al final de la propia pantalla. Decir "ve
 * al panel" a alguien que ya tiene el botón delante es cómo se aprende a no
 * leer los avisos.
 */
export function cierreDeTorneo(
  categorias: readonly CategoriaAlCierre[],
  donde: 'panel' | 'aqui' = 'panel',
): CierreDeTorneo {
  const faltan = categorias.filter((c) => !categoriaTerminada(c)).map((c) => c.nombre);
  const listo = categorias.length > 0 && faltan.length === 0;

  const dondeEsta = donde === 'aqui'
    ? 'aquí abajo'
    : 'en el panel del torneo';

  const reparte =
    'Ahí es donde se reparten los puntos de ranking de todos los jugadores y se '
    + 'recalculan sus ratings. Hasta entonces nadie los tiene.';

  if (categorias.length === 0) {
    return {
      listo: false,
      faltan: [],
      titular: 'Todavía no hay categorías con partidos',
      instruccion: `Cuando acabe todo hay que pulsar «Terminar torneo» ${dondeEsta}. ${reparte}`,
    };
  }

  if (listo) {
    return {
      listo: true,
      faltan: [],
      titular: categorias.length === 1
        ? 'Ya se jugó todo'
        : `Las ${categorias.length} categorías terminaron`,
      instruccion: `Pulsa «Terminar torneo» ${dondeEsta}. ${reparte}`,
    };
  }

  return {
    listo: false,
    faltan,
    titular: faltan.length === 1
      ? `Falta terminar ${faltan[0]}`
      : `Faltan ${faltan.length} categorías: ${listar(faltan)}`,
    instruccion: `Cuando acaben todas hay que pulsar «Terminar torneo» ${dondeEsta}. ${reparte}`,
  };
}
