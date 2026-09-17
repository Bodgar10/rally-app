// src/lib/engine/expres/reglas.ts
// Constantes y tipos del TORNEO EXPRÉS. Determinista. Módulo aparte.
//
// EXPRÉS NO ES UN MODO DEL TORNEO LARGO
//
//   Vive en su propia carpeta a propósito. Los motores de `format`,
//   `standings`, `score` y `schedule` llevan 1360 tests y un torneo real de
//   165 parejas encima; un `if (esExpres)` dentro de cualquiera de ellos pone
//   ese historial a jugarse cada vez que se toca el modo nuevo. Aquí no se
//   importa nada de esos motores, y ellos no importan nada de aquí.
//
// QUÉ ES UN EXPRÉS
//
//   Una tarde, una categoría, dos grupos que se turnan las canchas. Cada
//   pareja juega el MISMO número de partidos contra ALGUNOS rivales de su
//   grupo —no contra todos— y los partidos son a SUMA 6: seis games, sin
//   ganador del partido. La tabla se ordena por balance de games.

/** Identificador de grupo. Siempre dos, siempre estos. */
export type GrupoId = 'A' | 'B';

/**
 * Partidos que juega cada pareja. CINCO, y no es un parámetro cualquiera.
 *
 * ► ES LA PROMESA AL JUGADOR, NO UNA CALIBRACIÓN.
 *   5 partidos × 30 minutos = 2 h 30 de pádel. Eso es lo que el organizador
 *   anuncia y lo que el jugador viene a jugar. Bajarlo a 4 no "optimiza el
 *   horario": vende otro producto.
 *
 * ► Y ES LO QUE HACE HONESTA LA TABLA.
 *   Como no hay ganador del partido, el orden sale del balance de games. Ese
 *   balance solo es comparable si todas las parejas han tenido los mismos
 *   games en juego. Con una jugando 5 partidos y otra 6, los balances se
 *   comparan contra escalas distintas y la tabla miente.
 */
export const PARTIDOS_POR_PAREJA = 5;

/**
 * Clasifican 4 por grupo → 8 → cuartos exactos.
 *
 * Sin repescados y sin comparar entre grupos: cada grupo se resuelve solo.
 * Por eso el exprés NO necesita el `bestExtraQualifiers` que `computeClinch`
 * exige en los torneos largos — ahí la carrera de mejores segundos cruza
 * grupos; aquí no existe.
 */
export const CLASIFICAN_POR_GRUPO = 4;

/** Siempre cuartos → semis → final. El cuadro no depende del cupo. */
export const CLASIFICADOS = CLASIFICAN_POR_GRUPO * 2;

/**
 * Parejas mínimas por grupo.
 *
 * Pasan 4, así que con 5 el grupo sería "eliminamos a una". Y con 5 parejas
 * solo hay 4 rivales posibles: no caben 5 partidos sin repetir a alguien.
 */
export const GRUPO_MINIMO = 6;

/**
 * Cupo mínimo del torneo: 12 (6+6).
 *
 * Con exactamente 12 el grupo de 6 juega los 5 partidos contra sus 5 rivales,
 * o sea round robin completo. Funciona y la tabla es correcta, pero ahí el
 * formato no ahorra nada. El punto dulce es 16: grupos de 8 donde juegas 5 de
 * tus 7 rivales y clasifica justo la mitad.
 */
export const CUPO_MINIMO = GRUPO_MINIMO * 2;

/**
 * Minutos a los que se PLANIFICA un partido de grupo.
 *
 * Un suma 6 se juega en 30 y puede irse a 45, igual que
 * `Capacidad.minutosPorPartido` del planner de torneos largos significa "se
 * planifica a esto aunque dure más". No es una predicción: es el número con el
 * que se arma el horario.
 */
export const MINUTOS_PARTIDO_GRUPO = 30;

/** Un partido de la fase de grupos de un exprés. */
export interface PartidoExpres {
  /**
   * Referencia estable y legible: 'A-R3-P2' = grupo A, ronda 3, segundo
   * partido de esa ronda.
   *
   * No es el id de base de datos —ese lo pone Postgres— sino la clave
   * determinista del fixture. Sirve para que insertar el mismo fixture dos
   * veces sea detectable, y para leer un test sin descifrar UUIDs.
   */
  ref: string;
  grupo: GrupoId;
  /** 1..partidosPorPareja. */
  ronda: number;
  /** Franja de juego dentro del torneo, 1..(2 × partidosPorPareja). */
  orden: number;
  /**
   * Las dos parejas.
   *
   * EL ORDEN NO SIGNIFICA NADA. En pádel no hay local ni visitante; aquí es
   * simplemente el orden del sorteo dentro del grupo, fijado para que el
   * fixture sea reproducible carácter por carácter.
   */
  pairAId: string;
  pairBId: string;
}

/** Un grupo con su sorteo y sus rondas. */
export interface GrupoExpres {
  grupo: GrupoId;
  /** Parejas del grupo, en el orden que salió del sorteo. */
  pairIds: string[];
  /** `rondas[i]` son los partidos simultáneos de la ronda i+1. */
  rondas: PartidoExpres[][];
}

/**
 * Una franja de juego: un grupo entero jugando una ronda.
 *
 * Mientras un grupo juega, el otro descansa. Como los dos grupos tienen el
 * mismo número de rondas, la alternancia sale perfecta y sin huecos:
 * A1, B1, A2, B2, … Sin horas: aquí solo está el ORDEN. Las horas son del
 * planificador.
 */
export interface FranjaExpres {
  orden: number;
  grupo: GrupoId;
  ronda: number;
  partidos: PartidoExpres[];
}

export interface FixtureExpres {
  cupo: number;
  partidosPorPareja: number;
  clasificanPorGrupo: number;
  grupos: GrupoExpres[];
  /** Las 2×K franjas en orden de juego. */
  franjas: FranjaExpres[];
  /** Todos los partidos, planos, en orden de juego. */
  partidos: PartidoExpres[];
  /**
   * Canchas para meter una ronda entera en una franja: el grupo más grande
   * partido por dos.
   *
   * Con menos, la ronda se parte en tandas y la tarde se alarga en
   * proporción. Quien decide si eso cabe es el planificador, no este motor.
   */
  canchasNecesarias: number;
  /** Partidos totales de la fase de grupos. */
  totalPartidos: number;
}
