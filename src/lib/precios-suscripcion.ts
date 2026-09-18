/**
 * RALLY · Los precios de la suscripción, en UN solo sitio.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *   El precio estaba escrito a mano en cuatro pantallas: la de planes, la caja
 *   de consentimiento PROFECO, la hoja de beneficios y el flujo de
 *   cancelación. Cuatro copias del mismo número es cuatro sitios donde se
 *   puede quedar viejo — y uno de ellos es el texto legal que el jugador
 *   acepta antes de que Stripe le cobre. Si ahí dice $1,900 y el cargo es de
 *   $990, el consentimiento no vale.
 *
 * Y LOS PRECIOS ESTABAN MAL
 *   $149 al mes son $1,788 al año, y el anual costaba $1,900: pagar por
 *   adelantado salía $112 MÁS CARO. Nadie lo veía porque la constante que lo
 *   calculaba no se pintaba en pantalla, pero el precio lo estaba igual.
 *
 * LA REGLA NUEVA: EL ANUAL SON DIEZ MESES
 *   $129 × 12 = $1,548 contra $990: más de cuatro meses gratis. Hay un test
 *   que impide volver a publicar un anual que cueste más que doce mensuales.
 */

export type CicloDePago = 'monthly' | 'annual';

export interface PrecioSuscripcion {
  ciclo: CicloDePago;
  /** Nombre comercial del plan. */
  plan: 'Pro' | 'Campeón';
  /** Pesos mexicanos, sin centavos. */
  precio: number;
  /** '$129' — ya formateado, para no repetir el formateo en cada pantalla. */
  etiqueta: string;
  /** 'mes' | 'año'. */
  periodo: string;
  /** 'cada mes' | 'cada año'. Para el texto de renovación (PROFECO). */
  renovacion: string;
}

export const PRECIOS: Record<CicloDePago, PrecioSuscripcion> = {
  monthly: {
    ciclo: 'monthly',
    plan: 'Pro',
    precio: 129,
    etiqueta: '$129',
    periodo: 'mes',
    renovacion: 'cada mes',
  },
  annual: {
    ciclo: 'annual',
    plan: 'Campeón',
    precio: 990,
    etiqueta: '$990',
    periodo: 'año',
    renovacion: 'cada año',
  },
} as const;

/** Lo que cuesta un año pagando mes a mes. */
export const ANUAL_SI_PAGA_MENSUAL = PRECIOS.monthly.precio * 12;

/** Lo que se ahorra de verdad pagando el año por adelantado. */
export const AHORRO_ANUAL = ANUAL_SI_PAGA_MENSUAL - PRECIOS.annual.precio;

/** A cuánto le sale el mes si paga el año. */
export const EQUIVALENTE_MENSUAL = Math.round(PRECIOS.annual.precio / 12);

/** Cuántos de los doce meses le salen gratis. */
export const MESES_GRATIS = Math.floor(AHORRO_ANUAL / PRECIOS.monthly.precio);

/**
 * El tope de descuento de un Campeón: lo que pagó por su suscripción.
 *
 * Es el mismo número que la migración 079 guarda en `subscriptions.precio_mxn`
 * cuando Stripe cobra la factura. Aquí sirve para los textos ANTES de que
 * exista la suscripción —"recupera tus $990"—; una vez suscrito, el número
 * bueno es el de la base, porque respeta el precio al que se dio de alta.
 */
export const TOPE_DESCUENTO = PRECIOS.annual.precio;

/** '$1,548'. Separador de miles, sin centavos. */
export function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}
