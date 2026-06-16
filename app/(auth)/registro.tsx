/**
 * RALLY · Pantalla de Registro
 * Campos: correo + contraseña + nombre completo.
 * Acepta T&C antes de poder registrarse (Doc C §5.1).
 * La fila en public.users la crea el trigger de la migración 006.
 * [REUSO PASAS] — lógica de validación y errores portada a RN.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter, Link } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';

// ─── Validación ──────────────────────────────────────────────────────────

function validateFullName(name: string): string | null {
  if (!name.trim()) return 'Tu nombre es obligatorio.';
  if (name.trim().length < 2) return 'Ingresa tu nombre completo.';
  return null;
}

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'El correo es obligatorio.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Ingresa un correo válido.';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'La contraseña es obligatoria.';
  if (password.length < 8) return 'Mínimo 8 caracteres.';
  return null;
}

// Versión de TOS activa (se mantiene en sync con la tabla tos_versions)
const CURRENT_TOS_VERSION = process.env.EXPO_PUBLIC_TOS_VERSION ?? '1.0.0';

// ─── Pantalla ────────────────────────────────────────────────────────────────

export default function RegistroScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleRegistro() {
    setError(null);

    // Validación local
    const nameError     = validateFullName(fullName);
    const emailError    = validateEmail(email);
    const passwordError = validatePassword(password);
    if (nameError)     { setError(nameError);     return; }
    if (emailError)    { setError(emailError);    return; }
    if (passwordError) { setError(passwordError); return; }
    if (!tosAccepted)  { setError('Debes aceptar los Términos y Condiciones para continuar.'); return; }

    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email:    email.trim().toLowerCase(),
      password,
      options: {
        data: {
          // El trigger handle_new_user() (migración 006) lee estos campos
          full_name:   fullName.trim(),
          tos_version: CURRENT_TOS_VERSION,
        },
      },
    });

    setLoading(false);

    if (authError) {
      if (authError.message.includes('already registered')) {
        setError('Este correo ya tiene una cuenta. Usa "Entrar".');
      } else if (authError.message.includes('weak_password')) {
        setError('Elige una contraseña más segura (mínimo 8 caracteres).');
      } else {
        setError('Ocurrió un error. Intenta de nuevo.');
      }
      return;
    }

    // Supabase puede requerir confirmación de correo o entrar directo
    // según la configuración del proyecto. El listener del layout maneja ambos casos.
    router.replace('/(protected)/dashboard');
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>RALLY</Text>
          <Text style={styles.title}>Crea tu cuenta</Text>
          <Text style={styles.subtitle}>Entra al ranking. Gratis.</Text>
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          {/* Nombre completo */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Tu nombre"
              placeholderTextColor={color.muted}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              selectionColor={color.gold}
            />
          </View>

          {/* Email */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.label}>Correo</Text>
            <TextInput
              style={styles.input}
              placeholder="tu@correo.com"
              placeholderTextColor={color.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              selectionColor={color.gold}
            />
          </View>

          {/* Password */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={styles.input}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={color.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleRegistro}
              selectionColor={color.gold}
            />
          </View>

          {/* Checkbox T&C — Doc C §5.1, F28 del checklist */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setTosAccepted(!tosAccepted)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: tosAccepted }}
          >
            <View style={[styles.checkbox, tosAccepted && styles.checkboxChecked]}>
              {tosAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              {'He leído y acepto los '}
              <Link href="/(public)/terminos" asChild>
                <Text style={styles.checkboxLink}>Términos y Condiciones</Text>
              </Link>
              {' y el '}
              <Link href="/(public)/privacidad" asChild>
                <Text style={styles.checkboxLink}>Aviso de Privacidad</Text>
              </Link>
            </Text>
          </Pressable>

          {/* Error */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Botón primario */}
          <Pressable
            style={[styles.btnPrimary, { opacity: !tosAccepted ? 0.4 : 1 }]}
            onPress={handleRegistro}
            disabled={loading || !tosAccepted}
            accessibilityRole="button"
            accessibilityLabel="Crear cuenta"
          >
            {loading
              ? <ActivityIndicator color={color.onGold} />
              : <Text style={styles.btnPrimaryText}>Crear cuenta</Text>
            }
          </Pressable>
        </View>

        {/* Footer — ya tengo cuenta */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes cuenta?</Text>
          <Link href="/(auth)/login" asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.footerLink}>Entrar</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space[4.5],
    paddingVertical: space[6],
  },
  header: { alignItems: 'center', marginBottom: space[6] },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 4, marginBottom: space[2] },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, letterSpacing: 0.4, marginBottom: space[1] },
  subtitle:{ fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center' },
  form: { gap: space[3] },
  fieldWrapper: { gap: space[1] },
  label: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  input: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.md,
    minHeight: touchTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontFamily: font.body,
    fontSize: fontSize.body,
    color: color.text,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    marginTop: space[1],
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: color.gold,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: color.gold },
  checkmark: { fontSize: 12, color: color.onGold, fontWeight: '700' },
  checkboxLabel: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, flex: 1, lineHeight: 18 },
  checkboxLink: { color: color.goldBright, textDecorationLine: 'underline' },
  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },
  btnPrimary: {
    backgroundColor: color.gold,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.goldBright,
    minHeight: touchTarget,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[5],
    marginTop: space[2],
  },
  btnPrimaryPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
  btnDisabledText: { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.muted, letterSpacing: 0.3 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space[1], marginTop: space[5] },
  footerText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  footerLink: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.goldBright },
});
