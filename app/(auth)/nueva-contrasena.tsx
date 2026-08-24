/**
 * RALLY · Nueva contraseña
 * Recibe el token de recuperación vía deep link y permite
 * al usuario establecer una nueva contraseña.
 */

import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { inputFontSize } from '@/lib/web-layout';

export default function NuevaContrasenaScreen() {
  const router = useRouter();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  async function handleCambiar() {
    setError(null);
    if (password.length < 8)       { setError('Mínimo 8 caracteres.');     return; }
    if (password !== confirm)      { setError('Las contraseñas no coinciden.'); return; }

    setLoading(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (authError) { setError('No se pudo actualizar la contraseña. Solicita un nuevo link.'); return; }
    setSuccess(true);
  }

  if (success) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.eyebrow}>RALLY</Text>
        <Text style={styles.title}>¡Contraseña actualizada!</Text>
        <Pressable style={styles.btnPrimary} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.btnPrimaryText}>Entrar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.flex, styles.center]}>
      <Text style={styles.eyebrow}>RALLY</Text>
      <Text style={styles.title}>Nueva contraseña</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Nueva contraseña (mín. 8)"
          placeholderTextColor={color.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          selectionColor={color.gold}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirmar contraseña"
          placeholderTextColor={color.muted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleCambiar}
          selectionColor={color.gold}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={handleCambiar}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={color.onGold} /> : <Text style={styles.btnPrimaryText}>Cambiar contraseña</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: color.bg },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4.5] },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 4, marginBottom: space[2] },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, letterSpacing: 0.4, marginBottom: space[5], textAlign: 'center' },
  form:    { width: '100%', gap: space[3] },
  input:   { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, minHeight: touchTarget, paddingHorizontal: space[4], fontFamily: font.body, fontSize: inputFontSize(fontSize.body), color: color.text },
  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },
  btnPrimary: { backgroundColor: color.gold, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold },
});
