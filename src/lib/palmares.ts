/**
 * RALLY · El palmarés: qué has hecho, torneo a torneo
 *
 * ► EL AGUJERO
 *   `EresCampeon` se apaga en cuanto el jugador se inscribe a otro torneo, y
 *   está bien: el dashboard tiene que mirar hacia delante. Su comentario dice
 *   que el trofeo "pasa a vivir donde viven los logros, sus resultados y su
 *   ranking" — y ese sitio NO EXISTÍA. En ninguna pantalla quedaba escrito que
 *   Aldo ganó la Quinta Varonil el 27 de septiembre.
 *
 *   Cada torneo nuevo borraba el anterior. Lo único que sobrevivía eran los
 *   puntos, que son un número sin historia: 660 no dice que fueran de una final
 *   ganada en tres sets.
 *
 * ► UNA LÍNEA POR TORNEO, NO SOLO LOS GANADOS
 *   Un palmarés de solo títulos está vacío para casi todo el mundo, y para el
 *   que gana uno cada tres meses tampoco cuenta la temporada. Llegar a
 *   semifinales de una tercera es un resultado del que se habla.
 *
 *   Los títulos se distinguen solos: llevan trofeo y su línea lo dice.
 *
 * ► LA RONDA SALE DE LOS PARTIDOS, NO DE UNA COLUMNA
 *   `tournament_ranking_points.breakdown` guarda `furthest_round`, pero solo
 *   existe cuando el organizador CIERRA el torneo, y eso puede tardar días.
 *   Durante esos días el campeón vería su torneo sin línea, o peor, sin
 *   aparecer. Los partidos ya dicen dónde llegó desde que se capturó el último.
 *
 *   Los puntos sí salen de ahí, y por eso llegan aparte y pueden faltar: un
 *   torneo sin cerrar se enseña con su ronda y sin puntos, que es exactamente
 *   lo que se sabe de él.
 *
 * Módulo puro: esto decide qué se cuenta y cómo se ordena, y se prueba sin red.
 */

/** Un partido terminado del jugador, con lo justo para situarlo. */
export interface PartidoDelPalmares {
  tournamentId: string;
  /** `matches.stage`: 'group' | 'round_of_32' … 'final' | 'third_place'. */
  stage: string;
  /** Lo ganó él. En un suma 6 es siempre false: no hay ganador. */
  gane: boolean;
}

/** Un torneo en el que jugó, con lo que se enseña de él. */
export interface TorneoDelPalmares {
  tournamentId: string;
  torneo: string;
  categoria: string;
  /** `tournaments.end_date`. Ordena la lista. */
  fin: string | null;
  /** Puntos de ranking que le dio. Null mientras el organizador no lo cierre. */
  puntos: number | null;
}

export interface LineaDePalmares extends TorneoDelPalmares {
  /** 'Campeón', 'Finalista', 'Semifinales'… */
  logro: string;
  /** Es un título: la línea se pinta en oro y con trofeo. */
  esTitulo: boolean;
}

/**
 * Lo lejos que llegó, de más lejos a menos.
 *
 * El 3.er lugar cuenta como semifinales: se juega por haber PERDIDO una
 * semifinal, así que ahí es donde llegó su cuadro.
 */
const PROFUNDIDAD: Record<string, number> = {
  final: 6,
  third_place: 5,
  semi: 5,
  quarter: 4,
  round_of_16: 3,
  round_of_32: 2,
  group: 1,
};

const LOGRO: Record<number, string> = {
  6: 'Finalista',
  5: 'Semifinales',
  4: 'Cuartos de final',
  3: 'Octavos de final',
  2: 'Ronda de 32',
  1: 'Fase de grupos',
};

/**
 * Qué consiguió en un torneo, dados sus partidos.
 *
 * `null` si no jugó ninguno: un torneo al que se inscribió y no llegó a jugar
 * no es una línea de palmarés.
 */
export function logroDelTorneo(
  partidos: readonly PartidoDelPalmares[],
): { logro: string; esTitulo: boolean } | null {
  if (partidos.length === 0) return null;

  const final = partidos.find((p) => p.stage === 'final');
  // CAMPEÓN SE DICE POR LA FINAL GANADA, no por la profundidad: llegar a la
  // final y perderla es el mismo `stage` y no es lo mismo ni de lejos.
  if (final?.gane) return { logro: 'Campeón', esTitulo: true };

  const hondo = Math.max(...partidos.map((p) => PROFUNDIDAD[p.stage] ?? 0));
  const logro = LOGRO[hondo];
  // Un stage que no conocemos no se inventa: antes que enseñar un id nuestro,
  // se trata como lo mínimo cierto — jugó.
  return { logro: logro ?? LOGRO[1], esTitulo: false };
}

/**
 * El palmarés entero, del más reciente al más antiguo.
 *
 * Un torneo sin `fin` cae al final: sin fecha no compite por el sitio de
 * arriba, que es de lo último que pasó.
 */
export function palmares(
  partidos: readonly PartidoDelPalmares[],
  torneos: readonly TorneoDelPalmares[],
): LineaDePalmares[] {
  const porTorneo = new Map<string, PartidoDelPalmares[]>();
  for (const p of partidos) {
    const ya = porTorneo.get(p.tournamentId);
    if (ya) ya.push(p);
    else porTorneo.set(p.tournamentId, [p]);
  }

  return torneos
    .map((t) => {
      const l = logroDelTorneo(porTorneo.get(t.tournamentId) ?? []);
      return l ? { ...t, ...l } : null;
    })
    .filter((x): x is LineaDePalmares => x !== null)
    .sort((a, b) => {
      if (!a.fin) return b.fin ? 1 : 0;
      if (!b.fin) return -1;
      return b.fin.localeCompare(a.fin);
    });
}

/**
 * Cuántos títulos hay en el palmarés. Para la línea de cabecera.
 *
 * Se cuenta aquí y no en la pantalla porque es la misma regla que decide el
 * trofeo de cada fila, y separarlas es cómo acaban discrepando.
 */
export function titulos(lineas: readonly LineaDePalmares[]): number {
  return lineas.filter((l) => l.esTitulo).length;
}
