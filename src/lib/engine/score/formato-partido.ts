/**
 * RALLY · Cómo se juega CADA PARTIDO, en reglas de marcador
 *
 * ► EL BUG
 *   La captura del cuadro de un exprés pedía DOS SETS y ofrecía un tercero. Un
 *   cuarto de exprés es UN SET: se juega, lo gana quien lo gane, y a la
 *   siguiente ronda. El juez veía dos casillas vacías, tecleaba 6-4 y el botón
 *   seguía apagado diciéndole que faltaba el segundo set — un set que nadie iba
 *   a jugar. La pantalla usaba `scoreConfigDelTorneo`, que es la regla del
 *   TORNEO LARGO (mejor de 3 con súper muerte).
 *
 * ► EL FORMATO NO ES DEL TORNEO, ES DE LA ETAPA
 *   En un exprés cada etapa se juega distinto y así está guardado: los grupos a
 *   6 games sin ganador, cuartos y semis a un set, y la final como la eligió el
 *   organizador al crearlo. Está en `expres_etapa.formato` y el trigger de la
 *   migración 088 lo copia a `matches.formato`, así que cada partido lleva
 *   encima cómo se juega — no hay que deducirlo del stage ni preguntarlo aparte.
 *
 * ► EL PUNTO DE ORO NO SE VE EN EL MARCADOR
 *   `set_oro` y `set_star_point` valen lo mismo AQUÍ: los dos son un set a 6
 *   games, y lo que cambia es cómo se resuelve el deuce —un punto en vez de
 *   ventajas—, que no deja rastro en los números. 6-4 es 6-4 con ventajas y con
 *   punto de oro. Se distinguen en el nombre porque el organizador las nombra
 *   distinto por el micrófono, no porque el motor tenga que validarlas distinto.
 *
 * ► LA SÚPER MUERTE SIGUE SALIENDO DEL TORNEO
 *   `dos_sets_oro` sí tiene set decisivo, y a cuántos puntos se juega es un dato
 *   del torneo (`tercer_set_puntos`), no un 10 escondido aquí. Por eso la
 *   función recibe la configuración del torneo como base en vez de fabricarla:
 *   misma regla que `scoreConfigDelTorneo`, ningún default silencioso.
 */

import { DEFAULT_SCORE_CONFIG, type ScoreConfig } from './index.ts';

/** `formato_partido` — el enum de la base (migración 074). */
export type FormatoPartido = 'suma_6' | 'set_oro' | 'dos_sets_oro' | 'set_star_point';

/**
 * Los formatos que se capturan con sets y tienen ganador.
 *
 * SE LLAMABA `FormatoDeCuadro` Y EL NOMBRE SE QUEDÓ CORTO. Nació para el cuadro
 * del exprés, donde era cierto: los grupos iban a suma 6 y solo el cuadro tenía
 * ganador. Padel Hype juega SU FASE DE GRUPOS a un set con punto de oro, así
 * que un partido de grupos también puede ser de estos.
 *
 * Lo que de verdad distingue: `suma_6` no tiene ganador y su tabla se ordena
 * por saldo de games. Todo lo demás se valida con `validateScore`.
 */
export type FormatoConGanador = Exclude<FormatoPartido, 'suma_6'>;

export function esFormatoConGanador(f: string): f is FormatoConGanador {
  return f === 'set_oro' || f === 'set_star_point' || f === 'dos_sets_oro';
}

/**
 * Las reglas de marcador de un partido del cuadro exprés.
 *
 * `base` es la configuración del torneo (`scoreConfigDelTorneo`): de ahí sale a
 * cuántos puntos va la súper muerte, que es lo único que este módulo no sabe.
 *
 * Lanza con `suma_6`: un partido de grupos no tiene ganador y no pasa por
 * `validateScore` — tiene su propio motor (`validarMarcadorSuma6`). Devolver
 * aquí una configuración cualquiera lo dejaría validarse como un partido
 * normal, que es justo el error que este módulo existe para evitar.
 */
export function scoreConfigDeFormato(
  formato: FormatoPartido,
  base: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreConfig {
  switch (formato) {
    case 'set_oro':
    case 'set_star_point':
      // UN SET, y ese set es el decisivo: `bestOf: 1` hace que `validateScore`
      // cierre el partido en cuanto se cierra. 'full' y no 'super' porque se
      // juega a 6 games como cualquier set — la súper muerte no aparece en
      // ninguna etapa de un exprés que no sea la final a dos sets.
      return { ...base, bestOf: 1, deciderFormat: 'full' };
    case 'dos_sets_oro':
      // Dos sets, y si quedan 1-1 el decisivo se juega como diga el torneo.
      return { ...base, bestOf: 3 };
    case 'suma_6':
      throw new Error(
        'scoreConfigDeFormato: un suma 6 no se valida con sets. No tiene ganador ' +
        'y su motor es validarMarcadorSuma6.',
      );
  }
}

/** Cuántos sets se teclean de entrada. Es lo que decide cuántas filas pinta la captura. */
export function setsDeEntrada(cfg: ScoreConfig): number {
  return Math.min(2, cfg.bestOf);
}

/**
 * Las reglas de marcador de UN partido concreto.
 *
 * ► ES LO QUE HACE FALTA EN CADA PANTALLA DE CAPTURA
 *   `matches.formato` puede venir vacío —un torneo largo de los de siempre— o
 *   traer lo que decidió el organizador para esa etapa. Componer las dos cosas
 *   estaba repetido en la pantalla del juez, en la de grupos y en la del
 *   calendario, y tres copias de la misma regla se desincronizan el día que
 *   alguien toque una.
 *
 * `base` es la configuración del torneo (`scoreConfigDelTorneo`): de ahí sale a
 * cuántos puntos va la súper muerte.
 *
 * Un `suma_6` devuelve `base` en vez de reventar: quien llama a esto es una
 * pantalla pintando un partido, no el motor validándolo, y un exprés tiene sus
 * propias pantallas. Reventar aquí tiraría una pantalla entera por un partido
 * que ni siquiera se captura así.
 */
export function scoreConfigDelPartido(
  formato: string | null | undefined,
  base: ScoreConfig,
): ScoreConfig {
  if (!formato || !esFormatoConGanador(formato)) return base;
  return scoreConfigDeFormato(formato, base);
}
