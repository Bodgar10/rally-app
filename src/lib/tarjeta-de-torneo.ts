/**
 * RALLY · Lo que comparten las dos facetas de trabajo del dashboard
 *
 * El organizador y el juez resultaron ser la misma tarjeta con distinto
 * contenido: un torneo, sus fechas, y UNA cosa que atender. Lo que cambia es
 * quién la calcula y qué dice; lo que no cambia son las reglas.
 *
 * LAS REGLAS, ESCRITAS UNA VEZ
 *
 *   1. UN SOLO PENDIENTE, y el que tiene gente esperando delante. Se puede
 *      tener a la vez un partido sin capturar y tres categorías sin cerrar;
 *      enumerar las dos convierte la tarjeta en un informe y se deja de leer.
 *
 *   2. SIN PENDIENTES, SILENCIO. Un "todo en orden" es una línea que se lee y
 *      no cambia ninguna decisión. La tarjeta se queda con el nombre y las
 *      fechas, que siguen siendo el acceso.
 *
 *   3. `urge` NO ES "IMPORTANTE", ES "HAY ALGUIEN PARADO". Pinta el aviso en
 *      oro y sube la sección por encima de lo del jugador. Si todo urgiera,
 *      nada urgiría: se reserva para lo que tiene a otra persona esperando
 *      ahora mismo, no para el trabajo que toca hacer algún día.
 */

/** La única cosa que se dice de un torneo, además del nombre y las fechas. */
export interface AvisoDeTorneo {
  texto: string;
  /** `true` = hay gente esperando ahora mismo. Ver la regla 3. */
  urge: boolean;
}
