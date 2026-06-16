/**
 * RALLY · Recuperar contraseña
 * Envía el magic link / recovery email vía Supabase Auth.
 */

import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';

export default function RecuperarScreen() {
  const router = useRouter();
  const [email, setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleRecuperar() {
    setError(null);
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ingresa un correo válido.');
      return;
    }
    setLoading(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${process.env.EXPO_PUBLIC_SITE_URL}/(auth)/nueva-contrasena` },
    );
    setLoading(false);
    if (authError) {
      setError('No pudimos enviar el correo. Intenta de nuevo.');
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.eyebrow}>RALLY</Text>
        <Text style={styles.title}>Revisa tu correo</Text>
        <Text style={styles.subtitle}>
          Te enviamos un link para restablecer tu contraseña. Puede tardar unos minutos.
        </Text>
        <Pressable style={styles.btnPrimary} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.btnPrimaryText}>Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.flex, styles.center]}>
      <Text style={styles.eyebrow}>RALLY</Text>
      <Text style={styles.title}>Recuperar contraseña</Text>
      <Text style={styles.subtitle}>Ingresa tu correo y te enviamos un link para cambiarla.</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="tu@correo.com"
          placeholderTextColor={color.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          selectionColor={color.gold}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={handleRecuperar}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={styles.btnPrimaryText}>Enviar link</Text>
          }
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.linkWrapper}>
          <Text style={styles.linkText}>← Volver</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: color.bg },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4.5] },
  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 4, marginBottom: space[2] },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, letterSpacing: 0.4, marginBottom: space[1], textAlign: 'center' },
  subtitle: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', marginBottom: space[5] },
  form:  { width: '100%', gap: space[3] },
  input: { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, minHeight: touchTarget, paddingHorizontal: space[4], fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },
  btnPrimary: { backgroundColor: color.gold, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold },
  linkWrapper: { alignItems: 'center', paddingVertical: space[2] },
  linkText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },
});
