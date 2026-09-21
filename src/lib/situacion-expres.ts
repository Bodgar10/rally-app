/**
 * RALLY · "¿Voy a cuartos?", contado para un exprés.
 *
 * ► POR QUÉ NO SIRVE EL MOTOR DE `futuro`
 *   El análisis del torneo largo decide que el jugador no ha empezado con
 *   esta línea:
 *
 *       if (!mios.some((m) => m.played && m.winnerPairId != null))
 *
 *   En un exprés `winnerPairId` es SIEMPRE null: un suma 6 no tiene ganador.
 *   Así que daba 'sin_empezar' pasara lo que pasara, y el jugador leía
 *   "Todavía no has jugado" en la misma tarjeta que, dos líneas más abajo,
 *   decía "Vas 1.º de tu grupo con 1 partido jugado".
 *
 *   No es una línea que se pueda parchear. Todo ese motor razona sobre
 *   victorias y puntos: enumera escenarios con una máscara de bits de DOS
 *   salidas por partido —ganas o pierdes— y la suma 6 tiene SIETE. Por eso el
 *   exprés tiene su propio `computeClinchExpres` desde el principio; lo que
 *   faltaba era traducirlo a palabras.
 *
 * ► LO QUE SE LE DICE, Y EN QUÉ ORDEN
 *   Primero si está dentro, fuera o pendiente, que es a lo que abre la app. Y
 *   luego el porqué en números: su saldo, su puesto y cuántos partidos le
 *   quedan. Nunca una posición sin haber jugado: con todo a cero el puesto es
 *   del sorteo, no suyo.
 *
 * Módulo puro: se prueba sin pantalla ni base.
 */

import type { EstadoClinchExpres } from '@/lib/engine/expres';
import { textoDeBalance } from '@/lib/expres-texto';

export interface EntradaSituacionExpres {
  estado: EstadoClinchExpres;
  /** Su saldo de games ahora mismo. */
  balance: number;
  /** Puesto en su grupo, 1-based. */
  posicion: number;
  /** Partidos suyos ya capturados. */
  jugados: number;
  /** Partidos suyos que faltan. */
  pendientes: number;
  /** Cuántas pasan de cada grupo. */
  clasifican: number;
  /** La respuesta salió de cotas: puede pecar de prudente. */
  aproximado?: boolean;
}

export interface SituacionExpres {
  titular: string;
  detalle: string;
  /** Para el color de la tarjeta. */
  tono: 'dentro' | 'vivo' | 'fuera' | 'espera';
  /** La línea de números. Null si todavía no ha jugado nada. */
  numeros: string | null;
}

export function situacionExpres(e: EntradaSituacionExpres): SituacionExpres {
  const { estado, balance, posicion, jugados, pendientes, clasifican } = e;

  // Sin partidos propios no hay puesto que contar: con todo a cero el orden
  // es el del sorteo. Decirle "vas 1.º" sería presentar el azar como mérito.
  const numeros = jugados === 0
    ? null
    : `Vas ${posicion}.º de tu grupo con ${textoDeBalance(balance)} de saldo`
      + ` en ${jugados} ${jugados === 1 ? 'partido' : 'partidos'}.`;

  if (jugados === 0) {
    return {
      titular: 'Tu torneo todavía no empieza',
      detalle: pendientes > 0
        ? `Juegas ${pendientes} ${pendientes === 1 ? 'partido' : 'partidos'}. `
          + `Pasan a cuartos las ${clasifican} primeras de tu grupo.`
        : 'En cuanto se sortee el calendario, aquí sale a qué hora juegas.',
      tono: 'espera',
      numeros: null,
    };
  }

  if (estado === 'clinched') {
    return {
      titular: 'Ya estás en cuartos',
      detalle: pendientes > 0
        ? `Te quedan ${pendientes} ${pendientes === 1 ? 'partido' : 'partidos'}, `
          + 'pero tu sitio ya no depende de ellos.'
        : 'Terminaste la fase de grupos dentro.',
      tono: 'dentro',
      numeros,
    };
  }

  if (estado === 'eliminated') {
    return {
      titular: 'Fuera de cuartos',
      // Sin consuelo de oficina: se dice lo que pasó y se sigue. Lo que de
      // verdad quiere ver quien acaba de quedar fuera son sus resultados, y
      // están justo debajo.
      detalle: pendientes > 0
        ? `Te quedan ${pendientes} ${pendientes === 1 ? 'partido' : 'partidos'} por jugar: `
          + 'ya no cambian tu clasificación, pero sí el saldo con el que cierras.'
        : 'No alcanzaste el corte esta vez. Gracias por jugar.',
      tono: 'fuera',
      numeros,
    };
  }

  // alive
  return {
    titular: 'Todavía puedes entrar',
    detalle: pendientes === 0
      ? 'Terminaste tus partidos. Ahora depende de cómo cierren las demás.'
      : `Te quedan ${pendientes} ${pendientes === 1 ? 'partido' : 'partidos'}. `
        + `Cada game cuenta: pasan las ${clasifican} de mejor saldo.`
        + (e.aproximado ? ' (El cálculo es prudente: podría irte mejor.)' : ''),
    tono: 'vivo',
    numeros,
  };
}
