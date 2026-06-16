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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    '[RALLY] Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
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
