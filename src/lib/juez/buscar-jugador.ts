/**
 * RALLY · Buscar un jugador en la lista del juez
 *
 * LA ESCENA, OTRA VEZ
 *   Un jugador se acerca y pregunta cuándo le toca. El juez tenía filtros por
 *   categoría y grupo, que sirven cuando ya sabe dónde está esa pareja — pero
 *   la pregunta llega al revés: llega un nombre. Con sesenta partidos, escribir
 *   "ramos" es más rápido que dos filtros y un barrido con el dedo.
 *
 * CÓMO BUSCA
 *   · SIN TILDES Y SIN MAYÚSCULAS. Quien teclea con alguien delante no pone
 *     acentos, y "perez" tiene que encontrar a Pérez.
 *   · POR TROZOS, EN CUALQUIER ORDEN. "ramos luis" encuentra a "Aldo Ramos /
 *     Luis Pérez" aunque no estén así de seguidos: cada palabra tiene que
 *     aparecer en algún sitio de la pareja, no todas juntas.
 *   · EN LAS DOS PAREJAS. El juez no sabe de qué lado está quien pregunta.
 *
 * Módulo puro: la pantalla le pasa los dos nombres ya compuestos.
 */

/** Sin tildes, en minúsculas y con los espacios colapsados. */
export function normalizar(t: string): string {
  return t
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿Este partido responde a lo que el juez escribió?
 *
 * Con la búsqueda vacía responde que sí: no filtrar es el estado normal de la
 * pantalla, y devolver `false` dejaría la lista en blanco hasta escribir algo.
 */
export function coincideJugador(
  nombres: { parejaA: string; parejaB: string },
  consulta: string,
): boolean {
  const trozos = normalizar(consulta).split(' ').filter(Boolean);
  if (trozos.length === 0) return true;

  const donde = `${normalizar(nombres.parejaA)} ${normalizar(nombres.parejaB)}`;
  return trozos.every((t) => donde.includes(t));
}
