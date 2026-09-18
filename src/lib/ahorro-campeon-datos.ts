/**
 * RALLY · Leer el ahorro de Campeón de la base.
 *
 * ESTÁ SEPARADO DE `ahorro-campeon.ts` A PROPÓSITO
 *   Aquel archivo son funciones puras —cuentas y textos— y tiene sus tests.
 *   Este toca el cliente de Supabase, que arrastra AsyncStorage y no carga en
 *   jest sin montar medio React Native. Mezclarlos dejó sin poder ejecutarse
 *   el test de los textos, que es justo lo que más falta probar: los números
 *   que ve el jugador en su perfil.
 *
 *   Regla del proyecto, y esta vez me la salté yo: la lógica y el vocabulario
 *   viven en la lib con tests; el acceso a datos, aparte.
 */

import { supabase } from '@/lib/supabase/client';
import { SIN_CAMPEON, type AhorroCampeon } from '@/lib/ahorro-campeon';

/**
 * Lee el ahorro del periodo desde la RPC `ahorro_campeon` (migración 079).
 *
 * ► EL CAST ES TEMPORAL Y VIVE SOLO AQUÍ.
 *   `database.types.ts` se genera del proyecto REMOTO, así que hasta que la
 *   079 se ejecute en Supabase la función no existe para TypeScript. En vez de
 *   repartir un cast por cada pantalla, hay uno solo en esta puerta: al correr
 *   `npm run types:db` se borra de un sitio y ya.
 *
 * Nunca lanza. Un contador que revienta el perfil no compensa: si algo falla
 * se devuelve "no eres Campeón" y la pantalla no enseña el bloque.
 */
export async function leerAhorroCampeon(userId: string): Promise<AhorroCampeon> {
  try {
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc('ahorro_campeon', { p_user: userId });
    if (error || !data) return SIN_CAMPEON;
    return data as AhorroCampeon;
  } catch {
    return SIN_CAMPEON;
  }
}
