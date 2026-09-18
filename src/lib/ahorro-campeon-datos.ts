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
 * Nunca lanza. Un contador que revienta el perfil no compensa: si algo falla
 * se devuelve "no eres Campeón" y la pantalla no enseña el bloque.
 */
export async function leerAhorroCampeon(userId: string): Promise<AhorroCampeon> {
  try {
    const { data, error } = await supabase.rpc('ahorro_campeon', { p_user: userId });
    if (error || !data) return SIN_CAMPEON;
    // El cast se queda: la función devuelve `jsonb` y el generador lo tipa como
    // `Json`, que es correcto — Postgres no sabe qué forma tiene ese objeto. La
    // forma la define AhorroCampeon y la garantiza la propia función (079), que
    // construye siempre las mismas cinco claves.
    return data as unknown as AhorroCampeon;
  } catch {
    return SIN_CAMPEON;
  }
}
