/**
 * RALLY · Login en dos pasos
 *
 * PRIMERO EL CORREO, DESPUÉS LO QUE TOQUE
 *   El formulario de siempre (correo + contraseña juntos) dejaba fuera al
 *   jugador que un organizador dio de alta y al que nunca le llegó el correo:
 *   tiene cuenta pero no tiene contraseña, así que "Entrar" le decía
 *   "incorrectos" y "Crear cuenta" le decía que el correo ya existe. Sin
 *   salida.
 *
 *   Ahora el paso 1 pregunta a `auth_email_status` (migración 043) y reparte:
 *     not_found         → registro, con el correo prellenado
 *     needs_activation  → a poner contraseña por primera vez
 *     has_password      → contraseña, el login de siempre
 *
 * Estilo: Doc D §2 (negro/oro), §8.11 (inputs), §8.1 (botones).
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
import { inputFontSize, webContentColumn } from '@/lib/web-layout';

// ─── Validación (lógica de Pasas, portada) ──────────────────────────────────

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'El correo es obligatorio.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Ingresa un correo válido.';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'La contraseña es obligatoria.';
  if (password.length < 6) return 'Mínimo 6 caracteres.';
  return null;
}

// ─── Pantalla ────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();

  const [paso, setPaso]         = useState<'correo' | 'password'>('correo');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  /** Paso 1: resolver qué le toca a este correo. */
  async function handleContinuar() {
    setError(null);
    const emailError = validateEmail(email);
    if (emailError) { setError(emailError); return; }

    const limpio = email.trim().toLowerCase();
    setLoading(true);
    const { data, error: rpcError } = await supabase
      .rpc('auth_email_status', { p_email: limpio });
    setLoading(false);

    if (rpcError) {
      console.error('[login] auth_email_status:', {
        code: rpcError.code, message: rpcError.message, details: rpcError.details,
      });
      // Si el estado no se puede resolver, se cae al login de siempre en vez
      // de dejar al usuario atascado en el paso 1.
      setPaso('password');
      return;
    }

    if (data === 'not_found') {
      router.push({ pathname: '/(auth)/registro', params: { email: limpio } });
      return;
    }

    if (data === 'needs_activation') {
      // Tiene cuenta pero nunca puso contraseña. Pedírsela sería pedirle algo
      // que no existe: se le manda a crearla.
      router.push({ pathname: '/(auth)/recuperar', params: { email: limpio, activar: '1' } });
      return;
    }

    setPaso('password');
  }

  async function handleLogin() {
    setError(null);

    // Validación local
    const emailError    = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError)    { setError(emailError);    return; }
    if (passwordError) { setError(passwordError); return; }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    });
    setLoading(false);

    if (authError) {
      // Mensajes amigables (patrón de Pasas)
      if (authError.message.includes('Invalid login credentials')) {
        setError('Correo o contraseña incorrectos.');
      } else if (authError.message.includes('Email not confirmed')) {
        setError('Confirma tu correo antes de entrar. Revisa tu bandeja.');
      } else {
        setError('Ocurrió un error. Intenta de nuevo.');
      }
      return;
    }

    // Éxito — el listener de onAuthStateChange en el layout redirige automáticamente
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
          <Text style={styles.title}>Bienvenido</Text>
          <Text style={styles.subtitle}>
            {paso === 'correo'
              ? 'Escribe tu correo para continuar'
              : 'Escribe tu contraseña'}
          </Text>
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          {/* Email — editable en el paso 1, solo lectura en el 2 */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.label}>Correo</Text>
            <TextInput
              style={[styles.input, paso === 'password' && styles.inputInerte]}
              placeholder="tu@correo.com"
              placeholderTextColor={color.muted}
              value={email}
              onChangeText={setEmail}
              editable={paso === 'correo'}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={paso === 'correo' ? handleContinuar : undefined}
              selectionColor={color.gold}
              accessibilityLabel="Correo"
            />
            {paso === 'password' && (
              <Pressable
                onPress={() => { setPaso('correo'); setPassword(''); setError(null); }}
                style={styles.linkWrapper}
                accessibilityRole="button"
              >
                <Text style={styles.linkText}>Usar otro correo</Text>
              </Pressable>
            )}
          </View>

          {/* Password — solo en el paso 2 */}
          {paso === 'password' && (
            <View style={styles.fieldWrapper}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={color.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                selectionColor={color.gold}
                accessibilityLabel="Contraseña"
              />
            </View>
          )}

          {/* Error */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Botón primario — grad-gold (Doc D §8.1) */}
          <Pressable
            style={[styles.btnPrimary]}
            onPress={paso === 'correo' ? handleContinuar : handleLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={paso === 'correo' ? 'Continuar' : 'Entrar'}
          >
            {loading
              ? <ActivityIndicator color={color.onGold} />
              : <Text style={styles.btnPrimaryText}>
                  {paso === 'correo' ? 'Continuar' : 'Entrar'}
                </Text>
            }
          </Pressable>

          {/* Recuperar contraseña — solo tiene sentido cuando hay una */}
          {paso === 'password' && (
            <Link href={{ pathname: '/(auth)/recuperar', params: { email: email.trim().toLowerCase() } }} asChild>
              <Pressable style={styles.linkWrapper} accessibilityRole="link">
                <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
              </Pressable>
            </Link>
          )}
        </View>

        {/* Footer — registro. En el paso 1 sobra: si el correo no existe, el
            propio "Continuar" lleva al registro con el correo ya puesto. */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Primera vez en RALLY?</Text>
          <Link href="/(auth)/registro" asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.footerLink}>Crea tu cuenta</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Estilos (solo tokens de design-tokens — cero hex literales) ─────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: color.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space[4.5],  // 18px — Doc D §4
    paddingVertical: space[6],
    ...webContentColumn,
  },
  header: {
    alignItems: 'center',
    marginBottom: space[6],
  },
  eyebrow: {
    fontFamily: font.display,
    fontSize: fontSize.eyebrow,
    color: color.gold,
    letterSpacing: 4,
    marginBottom: space[2],
  },
  title: {
    fontFamily: font.display,
    fontSize: fontSize.screenH1,
    color: color.text,
    letterSpacing: 0.4,
    marginBottom: space[1],
  },
  subtitle: {
    fontFamily: font.body,
    fontSize: fontSize.body,
    color: color.muted,
    textAlign: 'center',
  },
  form: {
    gap: space[3],
  },
  fieldWrapper: {
    gap: space[1],
  },
  label: {
    fontFamily: font.body,
    fontSize: fontSize.caption,
    color: color.champagne,
    letterSpacing: 0.3,
  },
  input: {
    // Doc D §8.11 — Inputs
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.md,
    minHeight: touchTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontFamily: font.body,
    fontSize: inputFontSize(fontSize.body),
    color: color.text,
  },
  // Paso 2: el correo ya está decidido. Se atenúa en vez de ocultarse, para
  // que se vea con qué cuenta se está entrando.
  inputInerte: { opacity: 0.6, borderColor: color.lineSoft },
  errorText: {
    fontFamily: font.body,
    fontSize: fontSize.caption,
    color: color.danger,
    textAlign: 'center',
  },
  btnPrimary: {
    // Doc D §8.1 — Botón primario (gold)
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
  btnPrimaryPressed: {
    opacity: 0.85,
  },
  btnPrimaryText: {
    fontFamily: font.body,
    fontSize: 15,
    fontWeight: '600',
    color: color.onGold,
    letterSpacing: 0.3,
  },
  linkWrapper: {
    alignItems: 'center',
    paddingVertical: space[2],
  },
  linkText: {
    fontFamily: font.body,
    fontSize: fontSize.caption,
    color: color.gold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[1],
    marginTop: space[5],
  },
  footerText: {
    fontFamily: font.body,
    fontSize: fontSize.caption,
    color: color.muted,
  },
  footerLink: {
    fontFamily: font.body,
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: color.goldBright,
  },
});
