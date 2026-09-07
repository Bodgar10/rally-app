/**
 * RALLY · Quién va primero cuando el usuario es las tres cosas
 *
 * Un mismo usuario puede jugar su torneo, arbitrar otro y organizar un tercero
 * el mismo fin de semana. Es el caso normal en un club chico, no el raro.
 *
 * EL CRITERIO NO ES EL ROL, ES QUIÉN ESTÁ ESPERANDO
 *   Ordenar por rol —"primero jugador, que es la app de jugadores"— produce una
 *   pantalla que le enseña un partido de dentro de dos horas por encima de dos
 *   marcadores que tiene a cuatro personas paradas en la cancha. El orden sale
 *   de a quién le cuesta la espera:
 *
 *     1. ARBITRAR, cuando hay marcadores vencidos. Hay gente parada AHORA por
 *        algo que a él le cuesta treinta segundos, y mientras tanto la tabla de
 *        esa categoría está congelada para todos los que la miran. Es el único
 *        bloque donde la espera es de OTROS y la solución es suya.
 *
 *     2. LO SUYO COMO JUGADOR: la cancha y el próximo partido. Es por lo que
 *        abre la app, pero tiene hora — puede esperar los quince segundos que
 *        cuesta leer el aviso de arriba.
 *
 *     3. ARBITRAR sin nada vencido, y ORGANIZAR. Acceso con contexto, no
 *        urgencia. El organizador va el último de los tres a propósito: su
 *        trabajo es de supervisión y casi siempre delega la captura en el juez,
 *        así que su "3 partidos sin resultado" es el MISMO hecho que el juez ya
 *        tiene arriba, visto desde más lejos.
 *
 * POR QUÉ EL JUEZ Y EL ORGANIZADOR SE DECIDEN POR SEPARADO
 *   Subirlos juntos ataría la posición del organizador a un hecho que no es
 *   suyo. Son dos booleanos independientes, cada uno con su razón.
 *
 * POR QUÉ LA SECCIÓN SE MUEVE Y NO SE QUEDA QUIETA
 *   Una sección que cambia de sitio desorienta, y es un precio real. Se paga
 *   porque la alternativa es peor: dejarla siempre abajo esconde lo urgente
 *   bajo tres tarjetas de jugador, y dejarla siempre arriba le pone el trabajo
 *   del club por delante de su propio partido a alguien que hoy solo viene a
 *   jugar. El sitio fijo solo funciona si el usuario es una cosa sola.
 */

export interface FacetasDelUsuario {
  /** Arbitra algún torneo dentro de la ventana de fechas. */
  esJuez: boolean;
  /** Y además tiene partidos vencidos sin capturar en alguno. */
  juezUrge: boolean;
  /** Es owner de algún organizador con torneos vivos. */
  esOrganizador: boolean;
  /**
   * Tiene contenido de jugador que reclama la parte de arriba: su cancha o su
   * próximo partido. Sale de `bloquesDelDashboard`, que ya decide eso.
   */
  jugadorOcupado: boolean;
}

export interface OrdenDelDashboard {
  /** La sección de arbitrar va encima de lo del jugador. */
  juezArriba: boolean;
  /** La de organizar va encima de lo del jugador. */
  organizadorArriba: boolean;
}

export function ordenDelDashboard({
  esJuez,
  juezUrge,
  esOrganizador,
  jugadorOcupado,
}: FacetasDelUsuario): OrdenDelDashboard {
  return {
    // Sube por urgencia propia, o porque no hay nada de jugador que baje.
    juezArriba: esJuez && (juezUrge || !jugadorOcupado),
    // El organizador NO sube por urgencia: lo suyo es supervisar, y lo que
    // urge de verdad ya está arriba en la tarjeta del juez. Sube solo cuando
    // el hueco está libre, que es el caso con el que se reportó el bug.
    organizadorArriba: esOrganizador && !jugadorOcupado,
  };
}
