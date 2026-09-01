/**
 * RALLY · Cuándo avisar al jugador
 *
 * La parte de las notificaciones que se puede decidir HOY, sin push configurado:
 * QUÉ CAMBIO merece un aviso. El transporte vive en `@/native/push` y por ahora
 * escribe en consola; esto de aquí no depende de él.
 *
 * SE COMPARA EL ANTES CON EL AHORA, no se mira el estado suelto.
 *   "Estás clasificado" no es una noticia; PASAR a estar clasificado sí. La
 *   diferencia importa porque el componente relee sus datos en cada evento de
 *   Realtime, y sin comparar dispararía el mismo aviso una y otra vez mientras
 *   la pantalla siga abierta.
 *
 * NO SE AVISA DE LA PRIMERA CARGA.
 *   Abrir la app no es que haya pasado algo. Sin esto, el jugador que abre el
 *   domingo por la mañana recibiría de golpe las notificaciones de todo lo que
 *   pasó el sábado mientras dormía.
 *
 * Módulo puro y aparte para poder probarlo: mandar un aviso de más a las once
 * de la noche es un fallo que no se descubre en desarrollo.
 */

import type { ClinchStatus } from './situacion-jugador';
import type { MomentoDeAviso } from '@/native/push';

/** Lo que se compara entre dos lecturas. */
export interface EstadoDelJugador {
  estado: ClinchStatus;
  /** ISO del próximo partido, o null si todavía no tiene hora. */
  proximaHora: string | null;
  /** Cuántos partidos suyos están terminados. */
  jugadosTerminados: number;
  /**
   * Su cancha con otro partido EN JUEGO ahora mismo, o null.
   *
   * Solo se avisa al PASAR de libre a ocupada: mientras siga ocupada no hay
   * nada nuevo que contar, y repetirlo cada vez que llega un evento de Realtime
   * sería el altavoz que esta app viene a apagar.
   */
  canchaOcupada?: string | null;
}

/**
 * Qué avisos dispara pasar de `antes` a `ahora`.
 *
 * `antes` null = primera carga: no se avisa de nada (ver la cabecera).
 */
export function avisosPorCambio(
  antes: EstadoDelJugador | null,
  ahora: EstadoDelJugador,
): MomentoDeAviso[] {
  if (!antes) return [];

  const avisos: MomentoDeAviso[] = [];

  // Un partido más terminado: alguien capturó un resultado suyo.
  if (ahora.jugadosTerminados > antes.jugadosTerminados) {
    avisos.push('resultado_capturado');
  }

  // Pasar a clasificado. Solo la transición HACIA `clinched`: seguir estándolo
  // no es noticia, y volver atrás no pasa —el clinch no se deshace— pero si
  // pasara tampoco habría que celebrarlo.
  if (antes.estado !== 'clinched' && ahora.estado === 'clinched') {
    avisos.push('pasaste_de_fase');
  }

  // De no tener hora a tenerla. ESTE ES EL DE LA NOCHE DEL SÁBADO: es la
  // diferencia entre poner el despertador a las siete por si acaso y dormir
  // sabiendo que juegas a las once.
  //
  // Un cambio de hora a OTRA hora no entra aquí: eso es una reprogramación, y
  // merece su propio aviso con otro texto. Se hará cuando exista.
  if (antes.proximaHora === null && ahora.proximaHora !== null) {
    avisos.push('ya_hay_horario');
  }

  // Alguien empezó a jugar en su cancha: es el turno de antes del suyo.
  if (!antes.canchaOcupada && ahora.canchaOcupada) {
    avisos.push('cancha_por_liberarse');
  }

  return avisos;
}
