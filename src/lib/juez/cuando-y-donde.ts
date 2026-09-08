/**
 * RALLY · Cuándo y dónde se juega un partido, para la lista del juez
 *
 * LA ESCENA
 *   Un jugador se acerca al juez y le pregunta en qué cancha le toca. El juez
 *   filtra por categoría y grupo, encuentra el nombre… y la tarjeta le decía la
 *   hora y nada más. Justo lo que le preguntaron era lo que faltaba.
 *
 *   Es la pantalla que se consulta CON ALGUIEN DELANTE ESPERANDO, así que lo
 *   que no esté en la tarjeta es una pregunta que el juez no puede contestar.
 *
 * LO QUE FALTABA, Y LO QUE FALTABA ADEMÁS
 *   · LA CANCHA. `matches.court_label`, que ni siquiera se pedía en la consulta.
 *   · EL DÍA. La lista pintaba "14:00" a secas en un torneo de tres días: un
 *     partido del domingo se leía igual que uno de hoy. Se dice solo cuando NO
 *     es hoy, porque en la jornada en curso el día es ruido en todas las filas.
 *
 * NADA SE DEJA EN BLANCO
 *   Un hueco no se distingue de "no lo miré". Sin cancha asignada se dice, y el
 *   juez sabe que la respuesta es "todavía no se sabe" en vez de seguir
 *   buscando.
 *
 * Módulo puro: la zona horaria la resuelve `@/lib/fechas` antes de llegar aquí,
 * y esto solo compone. Así se prueba sin relojes.
 */

export interface CuandoYDonde {
  /** 'HH:MM' ya en zona del torneo. Vacío si el partido no tiene hora. */
  hora: string;
  /**
   * 'dom 6, 14:00' ya en zona del torneo, para cuando el partido NO es de hoy.
   * Vacío si es hoy o si no hay hora.
   */
  diaYHora: string;
  /** `matches.court_label`. Null cuando el organizador no la ha asignado. */
  cancha: string | null;
}

/** '14:00 · Cancha 3' · 'dom 6, 14:00 · Sin cancha' · 'Sin hora ni cancha'. */
export function cuandoYDonde({ hora, diaYHora, cancha }: CuandoYDonde): string {
  const cuando = diaYHora || hora;
  const donde = cancha?.trim();

  // Las dos cosas ausentes se dicen juntas: "Sin hora · Sin cancha" se lee como
  // dos avisos y es uno solo — ese partido todavía no está programado.
  if (!cuando && !donde) return 'Sin hora ni cancha';
  if (!cuando) return `Sin hora · ${donde}`;
  return `${cuando} · ${donde || 'Sin cancha'}`;
}
