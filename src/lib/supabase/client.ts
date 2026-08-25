/**
 * RALLY · Cliente Supabase para Expo (iOS + Android + Web)
 *
 * - En nativo (iOS/Android): usa AsyncStorage para persistir la sesión.
 * - En web: usa el storage por defecto de Supabase (localStorage).
 * - Las claves EXPO_PUBLIC_* son seguras de exponer en el bundle.
 * - NUNCA importar SUPABASE_SERVICE_ROLE_KEY aquí; esa clave vive
 *   solo en las Edge Functions.
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    '[RALLY] Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno.',
  );
}

/**
 * Cliente TIPADO contra el esquema real de la base.
 *
 * `database.types.ts` lo genera `npm run types:db` con
 * `supabase gen types typescript`. Tiparlo aquí convierte en error de
 * COMPILACIÓN lo que antes solo salía en runtime: mandar una columna que no
 * existe en un insert, filtrar por un campo inexistente, u ordenar por uno mal
 * escrito. Es lo que habría cazado el bug de `tournament_judges.organizer_id`
 * y el de `assigned_at`, que rompieron dos pantallas sin que typecheck ni los
 * tests dijeran nada.
 *
 * Si tocas el esquema, REGENERA los tipos. Si no, mienten igual que mentían
 * las migraciones.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnon, {
  auth: {
    /**
     * En nativo usamos AsyncStorage para que la sesión sobreviva
     * al cierre de la app. En web el cliente de Supabase usa
     * localStorage por defecto; no lo sobreescribimos.
     */
    storage: Platform.OS !== 'web' ? AsyncStorage : undefined,

    /**
     * autoRefreshToken: renueva el JWT antes de que expire.
     * persistSession: guarda la sesión en el storage elegido arriba.
     * detectSessionInUrl: necesario en web para el callback de OAuth
     * y magic links; en nativo los deep links se manejan aparte.
     */
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export type SupabaseClient = typeof supabase;
