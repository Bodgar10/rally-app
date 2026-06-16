/**
 * RALLY · OAuth / Magic Link Callback
 * Recibe el deep link de retorno de Supabase Auth (OAuth o magic link).
 * En web, Supabase detecta el token en la URL automáticamente.
 * En nativo, el deep link llega vía expo-linking.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color } from '@/lib/design-tokens';

export default function CallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    // Supabase detecta automáticamente el token en la URL (web)
    // y en AsyncStorage (nativo tras deep link).
    // Esperamos un momento y verificamos la sesión.
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace('/(protected)/dashboard');
      } else {
        router.replace('/(auth)/login');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.flex}>
      <ActivityIndicator color={color.gold} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
});
