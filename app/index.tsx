/**
 * RALLY · Entrada principal
 * Redirige según el estado de sesión:
 *   - Con sesión activa  → dashboard del jugador
 *   - Sin sesión         → pantalla de login
 *
 * Se ejecuta en el root, antes de cualquier pantalla.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color } from '@/lib/design-tokens';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // Usuario autenticado → dashboard
        router.replace('/(protected)/dashboard');
      } else {
        // Sin sesión → login
        router.replace('/(auth)/login');
      }
    }
    redirect();
  }, []);

  // Pantalla de carga mientras se evalúa la sesión
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={color.gold} size="large" />
    </View>
  );
}
