/**
 * RALLY · En qué orden se enseñan los partidos de un exprés.
 *
 * ► LO CAPTURADO SE APARTA, NO SE ESCONDE
 *   La agenda salía en orden de reloj de punta a punta. En una tarde de 40
 *   partidos eso significa que, a media fase, quien captura tiene que bajar
 *   por encima de veinte marcadores ya anotados para llegar al siguiente que
 *   le falta. Y lo hace con gente delante esperando.
 *
 *   Lo que sube arriba es lo que queda POR HACER. Lo hecho baja, pero sigue
 *   ahí: un marcador mal tecleado se corrige tocándolo, y esconderlo detrás
 *   de un filtro sería cambiar un problema de scroll por uno peor.
 *
 * ► DENTRO DE CADA SECCIÓN, EL RELOJ MANDA
 *   Las dos van en orden de hora, no al revés. Se pensó en poner lo recién
 *   capturado arriba del todo —para corregir un dedazo sin buscarlo— y se
 *   descartó: `matches` no guarda CUÁNDO se capturó, solo cuándo se juega,
 *   así que "lo último" sería una suposición. Un orden que el usuario puede
 *   predecir vale más que uno que acierta a veces.
 *
 * ► LA RONDA SE MANTIENE COMO UNIDAD
 *   "Grupo A · Ronda 2" es como se trabaja en la cancha: se llaman las cuatro
 *   parejas a la vez. La cabecera se repite en las dos secciones si hace
 *   falta, porque una ronda a medio capturar sale partida entre ellas — y eso
 *   es exactamente lo que está pasando en la cancha.
 *
 * Módulo puro: se prueba sin pantalla ni base.
 */

export interface PartidoAgenda {
  id: string;
  /** 'A' | 'B' */
  grupo: string;
  /** 'Ronda 2' */
  ronda: string;
  /** '12:30'. Vacío si todavía no tiene hora. */
  hora: string;
  gamesA: number | null;
  gamesB: number | null;
}

export interface SeccionAgenda<T> {
  /** 'Grupo A · Ronda 2' */
  cabecera: string;
  partidos: T[];
}

export interface AgendaExpres<T> {
  porJugar: SeccionAgenda<T>[];
  capturados: SeccionAgenda<T>[];
  /** Cuántos faltan y cuántos hay, para la línea de resumen. */
  faltan: number;
  total: number;
}

/** Capturado = tiene los dos games. Uno solo sería un dato a medias. */
export function estaCapturado(p: PartidoAgenda): boolean {
  return p.gamesA !== null && p.gamesB !== null;
}

/**
 * Parte la agenda en dos y agrupa cada mitad por ronda.
 *
 * El orden de entrada se respeta dentro de cada grupo: quien llama ya pidió
 * los partidos por `scheduled_at`, y reordenar aquí por la hora en texto
 * rompería en cuanto un torneo cruce la medianoche.
 */
export function agendaExpres<T extends PartidoAgenda>(
  partidos: readonly T[],
): AgendaExpres<T> {
  const agrupar = (lista: T[]): SeccionAgenda<T>[] => {
    const secciones: SeccionAgenda<T>[] = [];
    for (const p of lista) {
      // En el cuadro no hay grupo: la cabecera es la ronda sola ("Cuartos de
      // final"). Poner "Grupo · Cuartos" sería inventar un grupo que no existe.
      const cabecera = p.grupo
        ? `Grupo ${p.grupo} · ${p.ronda}`.trim()
        : p.ronda.trim();
      const ultima = secciones[secciones.length - 1];
      if (ultima && ultima.cabecera === cabecera) ultima.partidos.push(p);
      else secciones.push({ cabecera, partidos: [p] });
    }
    return secciones;
  };

  const pendientes = partidos.filter((p) => !estaCapturado(p));
  const hechos = partidos.filter(estaCapturado);

  return {
    porJugar: agrupar(pendientes),
    capturados: agrupar(hechos),
    faltan: pendientes.length,
    total: partidos.length,
  };
}

// ── BUSCAR UNA PAREJA ───────────────────────────────────────────────────────

/**
 * El texto, sin acentos ni ñ y en minúsculas.
 *
 * ► SIN ESTO EL BUSCADOR NO SIRVE EN ESPAÑOL
 *   Media plantilla se llama Martínez, Gómez, Díaz o Sánchez. Quien teclea en
 *   la cancha —deprisa, con el teléfono en una mano— escribe "martinez", y un
 *   `includes` a secas no lo encuentra. Buscar un nombre que existe y que no
 *   aparezca es peor que no tener buscador: se deja de confiar en él.
 *
 *   `NFD` separa la letra de su tilde y el rango ̀-ͯ borra las
 *   tildes sueltas, así que "Martínez" y "martinez" acaban en el mismo texto.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * ¿Alguno de los nombres contiene lo que se busca?
 *
 * Con la consulta vacía devuelve `true`: un buscador sin escribir nada no
 * filtra nada. Y se parte por espacios, así que "luis torres" encuentra a
 * "Luis Martínez / Manuel Torres" aunque sean dos jugadores distintos de la
 * misma pareja — que es justo como la gente nombra a una pareja.
 */
export function coincide(consulta: string, ...nombres: string[]): boolean {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const heno = normalizar(nombres.join(' '));
  return palabras.every((w) => heno.includes(w));
}
