/**
 * RALLY · Leer y guardar el lado y la mano.
 *
 * Separado de `lado-y-mano.ts` por lo de siempre: aquel es puro y tiene tests,
 * este toca el cliente de Supabase y arrastra AsyncStorage, que no carga en jest.
 *
 * ► LOS CASTS SON TEMPORALES Y VIVEN SOLO AQUÍ.
 *   `users.mano` llega con la migración 081, y `database.types.ts` se genera
 *   del proyecto REMOTO: hasta que se ejecute, esa columna no existe para
 *   TypeScript. Una puerta con cast, no un cast por pantalla — al correr
 *   `npm run types:db` se limpia de un sitio.
 */

import { supabase } from '@/lib/supabase/client';
import type { Lado, Mano, PerfilDeJuego, PreguntaId } from '@/lib/lado-y-mano';
import { COLUMNA_DE } from '@/lib/lado-y-mano';

const VACIO: PerfilDeJuego = { lado: null, mano: null };

/** Nunca lanza. Sin perfil, la tarjeta pregunta lo primero, que es inofensivo. */
export async function leerPerfilDeJuego(userId: string): Promise<PerfilDeJuego> {
  try {
    const consulta = supabase.from('users').select('preferred_side, mano' as never) as unknown as {
      eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> };
    };
    const { data } = await consulta.eq('id', userId).maybeSingle();
    const fila = data as { preferred_side?: Lado | null; mano?: Mano | null } | null;
    return { lado: fila?.preferred_side ?? null, mano: fila?.mano ?? null };
  } catch {
    return VACIO;
  }
}

/**
 * Guarda una respuesta. Devuelve si se pudo.
 *
 * Si falla NO se reintenta ni se avisa: la tarjeta simplemente no desaparece y
 * la pregunta vuelve a salir luego. Un error aquí no merece interrumpir a
 * nadie — no estaba haciendo una tarea, estaba contestando de paso.
 */
export async function guardarRespuesta(
  userId: string,
  pregunta: PreguntaId,
  valor: string,
): Promise<boolean> {
  try {
    const tabla = supabase.from('users') as unknown as {
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    };
    const { error } = await tabla.update({ [COLUMNA_DE[pregunta]]: valor }).eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}
