/**
 * RALLY · Leer la suscripción del jugador.
 *
 * Separado de `suscripcion.ts` por lo de siempre: aquel es puro y tiene tests,
 * este toca el cliente de Supabase y arrastra AsyncStorage, que no carga en jest.
 */

import { supabase } from '@/lib/supabase/client';
import { SIN_SUSCRIPCION, estadoDeSuscripcion, type EstadoSuscripcion } from '@/lib/suscripcion';

/** Nunca lanza. Ante la duda, SIN suscripción: se cierra, no se regala. */
export async function leerSuscripcion(userId: string): Promise<EstadoSuscripcion> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('status, billing_cycle')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return SIN_SUSCRIPCION;
    return estadoDeSuscripcion(data);
  } catch {
    return SIN_SUSCRIPCION;
  }
}
