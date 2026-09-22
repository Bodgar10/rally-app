/**
 * RALLY · "Campeón se paga solo", contado en pesos y en español.
 *
 * POR QUÉ HACE FALTA CONTARLO Y NO SOLO DESCONTARLO
 *   El descuento de Campeón son $48 por torneo. Visto suelto, $48 no impresiona
 *   a nadie y no renueva ninguna suscripción. Visto acumulado —"llevas $570 de
 *   $990 recuperados"— es otra cosa: es una barra que sube, una meta que se
 *   alcanza, y en diciembre es el argumento de renovación.
 *
 *   Los mismos $48 son también el mejor argumento de venta que existe, pero
 *   solo en un sitio: el checkout de alguien que NO es Campeón, en el momento
 *   exacto en que está pagando de más.
 *
 * EL TOPE NO SE ESCONDE
 *   Se le perdona comisión hasta cubrir lo que pagó, y ni un peso más. Eso no
 *   es letra chica que haya que disimular: es la promesa entera. "Juega lo
 *   suficiente y sale gratis" solo se puede decir si existe un punto donde
 *   sale gratis, y ese punto es el tope.
 */

import { pesos, TOPE_DESCUENTO } from '@/lib/precios-suscripcion';

/** Lo que devuelve la RPC `ahorro_campeon` (migración 079). */
export interface AhorroCampeon {
  es_campeon: boolean;
  ahorrado: number;
  tope: number;
  restante: number;
  periodo_fin: string | null;
}

export const SIN_CAMPEON: AhorroCampeon = {
  es_campeon: false,
  ahorrado: 0,
  tope: 0,
  restante: 0,
  periodo_fin: null,
};

/** Comisión de RALLY. Gemelo de `organizers.application_fee_percent`. */
export const COMISION_PCT = 5;

/** Lo que Campeón le perdonaría a este importe. */
export function descuentoDe(importe: number): number {
  return Math.round((COMISION_PCT / 100) * importe);
}

/** 0 a 1. Cuánto de su suscripción lleva recuperado. */
export function progresoDelTope(a: AhorroCampeon): number {
  if (!a.es_campeon || a.tope <= 0) return 0;
  return Math.min(a.ahorrado / a.tope, 1);
}

export function topeAlcanzado(a: AhorroCampeon): boolean {
  return a.es_campeon && a.restante <= 0;
}

/**
 * El contador del perfil.
 *
 * Tres estados y ni uno más: todavía no ahorró nada, va en camino, o ya la
 * recuperó. El tercero es el que hay que celebrar — es literalmente el momento
 * en que la suscripción se volvió gratis.
 */
export function textoDelContador(a: AhorroCampeon): string | null {
  if (!a.es_campeon) return null;
  if (a.ahorrado <= 0) {
    return `Tus inscripciones no pagan comisión. Recuperas hasta ${pesos(a.tope)} este año.`;
  }
  if (topeAlcanzado(a)) {
    return `Ya recuperaste los ${pesos(a.tope)} de tu suscripción. Este año Campeón te salió gratis.`;
  }
  return `Llevas ${pesos(a.ahorrado)} ahorrados de ${pesos(a.tope)}.`;
}

/** La línea de debajo: qué falta para que salga gratis. */
export function textoDeLoQueFalta(a: AhorroCampeon, cuotaTipica = 950): string | null {
  if (!a.es_campeon || topeAlcanzado(a)) return null;
  const porTorneo = descuentoDe(cuotaTipica);
  if (porTorneo <= 0) return null;
  const faltan = Math.ceil(a.restante / porTorneo);
  return faltan === 1
    ? 'Con un torneo más, tu suscripción se paga sola.'
    : `Con ${faltan} torneos más, tu suscripción se paga sola.`;
}

/**
 * Lo que se enseña al Campeón EN EL MOMENTO DE PAGAR una inscripción.
 *
 * `ahorro` es el descuento REAL ya aplicado, que puede ser menor que el 5% si
 * el tope quedaba a medias, y cero si ya lo agotó. Se dice la verdad en los
 * tres casos: disimular el tope aquí es exactamente donde se rompe la
 * confianza, porque el jugador está mirando el importe.
 */
export function textoEnElPago(base: number, ahorro: number): string {
  if (ahorro <= 0) {
    return `Ya recuperaste tu suscripción este año, así que esta inscripción va al precio normal.`;
  }
  if (ahorro < descuentoDe(base)) {
    return `Ahorras ${pesos(ahorro)} — lo que te quedaba de tu suscripción. A partir de aquí, precio normal.`;
  }
  return `Ahorras ${pesos(ahorro)}: tu comisión la cubre Padel Crown.`;
}

/**
 * Lo que se le enseña al que NO es Campeón, en su checkout.
 *
 * Es el único sitio donde el 5% convence, porque es el único momento en que le
 * duele. Una vez por compra y sin insistir: repetirlo lo convierte en ruido.
 */
export function textoDeLoQueSePierde(base: number): string {
  const ahorro = descuentoDe(base);
  return `Con Campeón pagarías ${pesos(base - ahorro)} en vez de ${pesos(base)}.`;
}

/** Cuántos torneos hacen falta para que Campeón se pague solo. Para el marketing. */
export function torneosParaQueSePague(cuotaTipica = 950): number {
  return Math.ceil(TOPE_DESCUENTO / descuentoDe(cuotaTipica));
}
