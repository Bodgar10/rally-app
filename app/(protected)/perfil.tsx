/**
 * RALLY · Perfil — Stub (Sprint 4)
 * Se completa con suscripción, cancelación (PROFECO) y
 * datos del jugador en Sprint 4.
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';

export default function PerfilScreen() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>PERFIL</Text>
        <Text style={styles.title}>Tu cuenta</Text>
        <Text style={styles.body}>
          Suscripción, datos y ajustes de tu cuenta estarán aquí en la próxima actualización.
        </Text>

        {/* Cerrar sesión — siempre disponible */}
        <Pressable
          style={({ pressed }) => [styles.btnDanger, pressed && { opacity: 0.85 }]}
          onPress={handleLogout}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
        >
          {loggingOut
            ? <ActivityIndicator color={color.text} />
            : <Text style={styles.btnDangerText}>Cerrar sesión</Text>
          }
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4.5], gap: space[4] },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, textAlign: 'center' },
  body:    { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', lineHeight: 20 },
  btnDanger: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.danger,
    borderRadius: radius.sm,
    minHeight: touchTarget,
    paddingHorizontal: space[5],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[4],
  },
  btnDangerText: { fontFamily: font.body, fontSize: 14, fontWeight: '600', color: color.danger },
});
