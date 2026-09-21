/**
 * RALLY · Entrada principal
 * Redirige según el estado de sesión:
 *   - Con sesión activa  → dashboard del jugador
 *   - Sin sesión, en web → la portada
 *   - Sin sesión, en la app instalada → login
 *
 * Se ejecuta en el root, antes de cualquier pantalla.
 *
 * ► POR QUÉ LA PORTADA SOLO EN WEB
 *   Quien abre rally.app sin cuenta puede no saber todavía qué es esto, y
 *   mandarlo directo a un formulario de contraseña es perderlo en el primer
 *   segundo. La portada le enseña la tabla en vivo, la ficha del rival y el
 *   calendario armado, y de ahí sale al login por su pie.
 *
 *   Quien ya se descargó la app NO necesita que le vendan la app. Ahí la
 *   portada sería un obstáculo entre él y su torneo del domingo, así que en
 *   nativo se sigue yendo al login como siempre.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
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
      } else if (Platform.OS === 'web') {
        // Sin sesión y por la web: la portada. Ver la cabecera.
        router.replace('/(public)/landing');
      } else {
        // Sin sesión en la app instalada → login
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
