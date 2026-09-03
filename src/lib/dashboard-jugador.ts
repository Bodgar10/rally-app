/**
 * RALLY · Qué bloques tienen sentido en el dashboard del jugador
 *
 * EL BUG QUE LO MOTIVA
 *   Un jugador de 5.ª Varonil que ya había jugado sus dos partidos de grupo veía
 *   bajo MI PRÓXIMO PARTIDO:
 *
 *     "YA ESTÁS INSCRITO · Empieza mañana · Tu horario se publica cuando el
 *      organizador cierra las inscripciones y arma el cuadro."
 *
 *   Falso de arriba abajo: el horario ya se publicó, ya jugó, y sus resultados
 *   estaban más abajo EN LA MISMA PANTALLA. La tarjeta se pintaba solo por estar
 *   inscrito en un torneo que no ha terminado, sin mirar si había calendario.
 *
 * LA REGLA: CADA BLOQUE RESPONDE UNA PREGUNTA, Y SOLO SI TIENE RESPUESTA
 *   · "Empieza mañana" contesta ¿qué va a pasar?, y solo sirve mientras NO haya
 *     calendario. En cuanto hay horario publicado sobra, haya jugado o no.
 *   · "Mi próximo partido" contesta ¿cuándo juego?, y solo si queda alguno.
 *   · "En mi cancha" contesta ¿me va a tocar tarde?, que sin próximo partido no
 *     tiene sentido: no hay cancha que vigilar.
 *
 *   Cuando ya jugó todo y espera el desenlace, ninguna de las tres tiene
 *   respuesta — y la pregunta la contesta la tarjeta de situación ("sigues vivo
 *   como mejor segundo, faltan 3 grupos"). Así que se quedan fuera, sin dejar
 *   hueco y sin nada por encima que la contradiga.
 *
 * Módulo puro y aparte para poder probarlo: son cuatro booleanos, pero decidirlos
 * mal es lo que produjo una pantalla que se contradecía a sí misma.
 */

/** Lo que hay que saber de los partidos del jugador para decidir. */
export interface ResumenDePartidos {
  /**
   * Partidos suyos con hora publicada (`scheduled_at`).
   *
   * Es la señal de "ya hay calendario". No vale contar partidos a secas: al
   * cerrar la categoría se crean las filas de la fase de grupos ANTES de que se
   * programe el torneo, y en ese hueco "Empieza mañana" sigue siendo cierto.
   */
  conHorario: number;
  /** Partidos suyos que todavía no han terminado. */
  pendientes: number;
}

export interface BloquesDelDashboard {
  /** La tarjeta "Ya estás inscrito · Empieza mañana". */
  torneoPorEmpezar: boolean;
  /** La sección MI PRÓXIMO PARTIDO, etiqueta incluida. */
  proximoPartido: boolean;
  /** La tarjeta EN TU CANCHA. */
  enMiCancha: boolean;
}

/**
 * Qué se pinta, dado lo que el jugador tiene.
 *
 * `inscrito` = tiene alguna pareja en un torneo que no ha terminado. Sin eso no
 * hay nada que enseñar: el dashboard cae a su estado de "inscríbete a un torneo".
 */
export function bloquesDelDashboard(
  inscrito: boolean,
  { conHorario, pendientes }: ResumenDePartidos,
): BloquesDelDashboard {
  if (!inscrito) {
    // La sección SÍ se pinta: para quien no está inscrito, "¿cuándo juego?"
    // tiene respuesta —"no estás inscrito, mira los torneos"— y ahí vive esa
    // llamada a la acción. Lo que no hay es cancha ni torneo por empezar.
    return { torneoPorEmpezar: false, proximoPartido: true, enMiCancha: false };
  }

  // Sin una sola hora publicada, el torneo está por empezar de verdad.
  const sinCalendario = conHorario === 0;
  const quedaAlgoPorJugar = pendientes > 0;

  return {
    torneoPorEmpezar: sinCalendario,
    // La sección existe si hay un partido que enseñar, o si hay que explicar
    // que todavía no lo hay. Si ya jugó todo, NI UNA COSA NI LA OTRA: se va
    // entera, etiqueta incluida, y la respuesta la da la tarjeta de situación.
    proximoPartido: quedaAlgoPorJugar || sinCalendario,
    // Sin próximo partido no hay cancha que vigilar.
    enMiCancha: quedaAlgoPorJugar,
  };
}
