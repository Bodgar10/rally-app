/**
 * RALLY · Leer y guardar el lado y la mano.
 *
 * Separado de `lado-y-mano.ts` por lo de siempre: aquel es puro y tiene tests,
 * este toca el cliente de Supabase y arrastra AsyncStorage, que no carga en jest.
 */

import { supabase } from '@/lib/supabase/client';
import type { Lado, Mano, PerfilDeJuego, PreguntaId } from '@/lib/lado-y-mano';

const VACIO: PerfilDeJuego = { lado: null, mano: null };

/** Nunca lanza. Sin perfil, la tarjeta pregunta lo primero, que es inofensivo. */
export async function leerPerfilDeJuego(userId: string): Promise<PerfilDeJuego> {
  try {
    const { data } = await supabase
      .from('users')
      .select('preferred_side, mano')
      .eq('id', userId)
      .maybeSingle();
    return { lado: data?.preferred_side ?? null, mano: data?.mano ?? null };
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
    // Explícito y no con una clave dinámica: así el tipo de `users` comprueba
    // que el valor cabe en la columna. Con `{ [columna]: valor }` TypeScript no
    // puede, y un 'zurdo' escrito en `preferred_side` pasaría sin más.
    const parche =
      pregunta === 'lado'
        ? { preferred_side: valor as Lado }
        : { mano: valor as Mano };

    const { error } = await supabase.from('users').update(parche).eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}
