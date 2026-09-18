/**
 * RALLY · ¿Este jugador tiene suscripción activa?
 *
 * POR QUÉ ESTÁ EN UN SITIO Y NO EN CADA PANTALLA
 *   La comprobación —"status es 'active' o 'trialing'"— estaba escrita a mano
 *   en cada componente que la necesitaba. Es la misma deriva que ya nos costó
 *   los precios: cuatro copias del mismo dato, y una de ellas se queda vieja
 *   el día que cambie. Con los estados de Stripe es peor, porque añadir uno
 *   ('paused', 'past_due' tratado distinto) obligaría a acordarse de todos.
 *
 * QUÉ CUENTA COMO ACTIVA
 *   'active' y 'trialing'. Nada más. En particular NO 'past_due': el cobro
 *   falló, y mientras Stripe reintenta el jugador conserva el acceso hasta que
 *   la suscripción pase a 'canceled' o 'unpaid' — eso lo decide Stripe con su
 *   propia política, no esta función. Aquí solo se lee el resultado.
 */

export type CicloDePago = 'monthly' | 'annual';

export interface EstadoSuscripcion {
  /** Tiene acceso a lo de pago. */
  activa: boolean;
  ciclo: CicloDePago | null;
  /** Anual activa: la única que perdona la comisión de las inscripciones. */
  esCampeon: boolean;
}

export const SIN_SUSCRIPCION: EstadoSuscripcion = {
  activa: false,
  ciclo: null,
  esCampeon: false,
};

/** Los estados de Stripe que dan acceso. */
const ACTIVOS = ['active', 'trialing'] as const;

export function esActiva(status: string | null | undefined): boolean {
  return !!status && (ACTIVOS as readonly string[]).includes(status);
}

/** Interpreta una fila de `subscriptions`. */
export function estadoDeSuscripcion(
  fila: { status?: string | null; billing_cycle?: string | null } | null | undefined,
): EstadoSuscripcion {
  if (!fila || !esActiva(fila.status)) return SIN_SUSCRIPCION;
  const ciclo = fila.billing_cycle === 'annual' ? 'annual' : fila.billing_cycle === 'monthly' ? 'monthly' : null;
  return { activa: true, ciclo, esCampeon: ciclo === 'annual' };
}
