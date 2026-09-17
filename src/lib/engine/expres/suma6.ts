// src/lib/engine/expres/suma6.ts
// El marcador de SUMA 6. Determinista. No importa nada de ../score.
//
// QUÉ ES UN SUMA 6
//
//   Seis games. El resultado puede ser 6-0, 5-1, 4-2 o 3-3 (y sus espejos).
//   Y no hay ganador del partido: sumas los games que ganaste y restas los que
//   te hicieron. Un 3-3 es sumar 3 y restar 3, no es "un empate" que haya que
//   contar en ninguna columna.
//
// POR QUÉ NO SE REUTILIZA ../score
//
//   `clasificarSet` clasifica un marcador POR SUS NÚMEROS y ahí un 5-1 no es
//   nada: no es un set normal —esos terminan en 6 o en 7— ni una súper muerte
//   —esas empiezan en 10—. Devolvería null y `validateScore` lo rechazaría,
//   con razón: para un torneo largo un 5-1 ES un marcador imposible.
//
//   Meter aquí un modo nuevo obligaría a que ese motor supiera en qué torneo
//   está. Son 6 games contra un sistema de sets: no es el mismo problema con
//   una constante distinta, es otro problema. Vive aparte.

/** Games que se juegan en un partido de grupo del exprés. Seis, siempre. */
export const GAMES_POR_PARTIDO = 6;

/** Un marcador de suma 6 ya capturado. */
export interface MarcadorSuma6 {
  gamesA: number;
  gamesB: number;
}

/**
 * Los únicos siete marcadores que existen.
 *
 * Se expone para la pantalla del juez: en vez de dos campos numéricos donde se
 * puede teclear un 7-2, son siete botones. Un marcador imposible que no se
 * puede ni escribir no hay que validarlo después.
 */
export const MARCADORES_SUMA6: readonly MarcadorSuma6[] = [
  { gamesA: 6, gamesB: 0 },
  { gamesA: 5, gamesB: 1 },
  { gamesA: 4, gamesB: 2 },
  { gamesA: 3, gamesB: 3 },
  { gamesA: 2, gamesB: 4 },
  { gamesA: 1, gamesB: 5 },
  { gamesA: 0, gamesB: 6 },
] as const;

/**
 * Errores de un marcador de suma 6. Array vacío = válido.
 *
 * Devuelve los motivos en vez de un booleano porque quien lo llama es la
 * captura, y "marcador inválido" no le dice al juez qué corregir.
 */
export function validarMarcadorSuma6(gamesA: unknown, gamesB: unknown): string[] {
  const errores: string[] = [];
  const entero = (v: unknown, lado: string): number | null => {
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      errores.push(`Los games de ${lado} deben ser un número entero; llegó ${JSON.stringify(v)}.`);
      return null;
    }
    if (v < 0 || v > GAMES_POR_PARTIDO) {
      errores.push(`Los games de ${lado} van de 0 a ${GAMES_POR_PARTIDO}; llegó ${v}.`);
      return null;
    }
    return v;
  };

  const a = entero(gamesA, 'la pareja A');
  const b = entero(gamesB, 'la pareja B');
  if (a === null || b === null) return errores;

  if (a + b !== GAMES_POR_PARTIDO) {
    errores.push(
      `Un partido de suma ${GAMES_POR_PARTIDO} son ${GAMES_POR_PARTIDO} games ` +
        `exactos y ${a}-${b} suma ${a + b}. Los marcadores posibles son ` +
        `6-0, 5-1, 4-2, 3-3, 2-4, 1-5 y 0-6.`,
    );
  }
  return errores;
}

/** ¿Es uno de los siete marcadores posibles? */
export function esMarcadorSuma6(gamesA: unknown, gamesB: unknown): boolean {
  return validarMarcadorSuma6(gamesA, gamesB).length === 0;
}

/**
 * Games en juego de una pareja que ha disputado `partidos` partidos.
 *
 * ► ESTE NÚMERO ES LA RAZÓN DE QUE LA TABLA SEA HONESTA, y también el motivo
 *   de que la cadena de desempate sea tan corta. Ver `computeTablaExpres`.
 */
export function gamesEnJuego(partidos: number): number {
  return partidos * GAMES_POR_PARTIDO;
}
