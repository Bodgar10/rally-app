/**
 * RALLY · Dónde se parte la tabla del ranking.
 *
 * ► EL PROBLEMA
 *   La pantalla trae el top de la división y, si el jugador no está dentro,
 *   le añade su fila AL FINAL. Eso ya estaba bien pensado —verse es lo que
 *   hace querer subir— pero se pintaba pegada a la última del top, sin nada
 *   que dijera que en medio hay un hueco.
 *
 *   El resultado es que quien va 340.º ve su fila justo debajo de la 50.ª y
 *   la lee como si fuera la 51.ª. El número está ahí, pero un número no
 *   compite con lo que dice la posición en la lista.
 *
 * ► LA SOLUCIÓN ES DECIR EL HUECO, NO DISIMULARLO
 *   Entre las dos filas va un corte con cuántos hay en medio. Es lo que hace
 *   cualquier ranking con mucha gente, y convierte el salto en información:
 *   "te faltan 289 para entrar al top 50" se entiende de un vistazo.
 *
 * ► SE DECIDE AQUÍ Y NO EN LA PANTALLA
 *   Es una regla con casos raros —el jugador justo después del corte, el que
 *   sí está en el top, la lista vacía— y cada uno se equivoca de una forma
 *   distinta. Como función pura se fijan con tests; dentro del `map` de la
 *   pantalla, no.
 */

export interface FilaDeRanking {
  player_id: string;
  position: number;
  is_me: boolean;
}

export interface TrozoDeTabla<T> {
  fila: T;
  /**
   * Cuántos jugadores quedan ENTRE la fila anterior y esta.
   *
   * 0 cuando son consecutivas. Mayor que 0 solo en el salto, y es lo que la
   * pantalla pinta como "· · · 289 jugadores más".
   */
  saltoAntes: number;
}

/**
 * Marca dónde hay un hueco en la tabla.
 *
 * No reordena ni filtra: la lista llega ya ordenada por posición desde la
 * base, y tocar el orden aquí sería decidir dos veces lo mismo.
 */
export function conCortes<T extends FilaDeRanking>(filas: readonly T[]): TrozoDeTabla<T>[] {
  return filas.map((fila, i) => {
    if (i === 0) return { fila, saltoAntes: 0 };
    const anterior = filas[i - 1];
    // Posiciones no numeradas o desordenadas: no se inventa un salto.
    const hueco = fila.position - anterior.position - 1;
    return { fila, saltoAntes: hueco > 0 ? hueco : 0 };
  });
}

/**
 * "289 jugadores más" / "1 jugador más".
 *
 * Devuelve null sin salto, para que la pantalla no tenga que comprobarlo
 * otra vez antes de pintar.
 */
export function textoDelSalto(saltoAntes: number): string | null {
  if (saltoAntes <= 0) return null;
  return saltoAntes === 1 ? '1 jugador más' : `${saltoAntes.toLocaleString('es-MX')} jugadores más`;
}
