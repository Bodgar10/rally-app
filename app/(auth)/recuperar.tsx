/**
 * RALLY · Recuperar contraseña · y activar cuenta
 *
 * DOS MODOS
 *   Normal: manda el correo de recuperación de Supabase Auth.
 *
 *   `?activar=1`: la cuenta existe pero NUNCA tuvo contraseña — la creó un
 *   organizador. Aquí NO se manda ningún correo: el jugador pone su contraseña
 *   en el momento y entra. El correo era justamente lo que estaba fallando
 *   (spam, dominio mal escrito, Resend caído), así que hacerlo depender de él
 *   otra vez dejaría al jugador en el mismo callejón.
 *
 *   La contraseña la escribe la Edge Function `activate-account` con
 *   service_role — `auth.updateUser` exige sesión, y aquí no la hay todavía —
 *   y el cliente hace signInWithPassword acto seguido.
 *
 * PRELLENADO POR QUERY (?email=…)
 *   Es la pantalla a la que apuntan los correos de alta que manda el
 *   organizador. Se eligió mandar aquí en vez de un enlace con token porque un
 *   token de recuperación caduca en una hora: si el organizador da de alta a 24
 *   personas el miércoles para un torneo del sábado, la mitad de esos enlaces
 *   estarían muertos al abrirlos.
 *
 *   Efecto secundario bueno: cada jugador dispara SU propio correo al hacer
 *   clic, así que los 24 envíos de Supabase se reparten en el tiempo en vez de
 *   salir de golpe contra el límite del SMTP.
 */

import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, inputFontSize } from '@/lib/web-layout';

export default function RecuperarScreen() {
  const router = useRouter();
  // El correo llega del enlace del correo de alta. useState con valor inicial
  // (no useEffect): el parámetro está disponible en el primer render y así el
  // campo nunca parpadea vacío.
  // `activar=1` lo manda el paso 1 del login cuando la cuenta existe pero
  // nunca tuvo contraseña (alta por organizador).
  const { email: emailQuery, activar } = useLocalSearchParams<{ email?: string; activar?: string }>();
  const esActivacion = activar === '1';
  const [email, setEmail]   = useState(
    typeof emailQuery === 'string' ? emailQuery.trim().toLowerCase() : '',
  );
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  /** Modo activación: crea la contraseña y entra, sin pasar por el correo. */
  async function handleActivar() {
    setError(null);
    if (password.length < 8) { setError('Mínimo 8 caracteres.'); return; }

    const limpio = email.trim().toLowerCase();
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/activate-account`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            // Sin sesión: la anon key es lo único que hay que mandar.
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
            Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''}`,
          },
          body: JSON.stringify({ email: limpio, password }),
        },
      );
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.error('[activar] fallo:', { status: res.status, json });
        const codigo = typeof json?.error === 'string' ? json.error : '';
        setLoading(false);
        if (codigo === 'already_active') {
          setError('Esta cuenta ya tiene contraseña. Entra con ella desde el inicio.');
        } else if (codigo === 'not_found') {
          setError('No encontramos una cuenta con ese correo.');
        } else if (codigo === 'weak_password') {
          setError('Mínimo 8 caracteres.');
        } else {
          setError('No pudimos crear tu contraseña. Intenta de nuevo.');
        }
        return;
      }

      // La sesión la abre el SDK con su propio almacenamiento y refresco; la
      // función no devuelve tokens a propósito.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: limpio, password,
      });
      setLoading(false);

      if (signInError) {
        // La contraseña SÍ quedó puesta: mandarlo al login es recuperable.
        setError('Tu contraseña quedó lista, pero no pudimos entrar. Prueba desde el inicio.');
        return;
      }

      router.replace('/(protected)/dashboard');
    } catch {
      setLoading(false);
      setError('Sin conexión con el servidor. Revisa tu internet.');
    }
  }

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
      <View style={styles.flex}>
        <View style={styles.center}>
          <Text style={styles.eyebrow}>RALLY</Text>
          <Text style={styles.title}>Revisa tu correo</Text>
          <Text style={styles.subtitle}>
            Te enviamos un link para restablecer tu contraseña. Puede tardar unos minutos.
          </Text>
          <Pressable style={styles.btnPrimary} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.btnPrimaryText}>Volver al inicio</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // El fondo ónix va en el View EXTERIOR y la columna en el interior. Antes
  // iban juntos: `webContentColumn` limita el ancho, así que el fondo solo
  // pintaba la columna y en escritorio salían franjas grises a los lados.
  return (
    <View style={styles.flex}>
      <View style={styles.center}>
        <Text style={styles.eyebrow}>RALLY</Text>
        <Text style={styles.title}>
          {esActivacion ? 'Crea tu contraseña' : 'Recuperar contraseña'}
        </Text>
        <Text style={styles.subtitle}>
          {esActivacion
            ? 'Tu cuenta ya existe: un organizador te inscribió. Elige una contraseña y entra.'
            : 'Ingresa tu correo y te enviamos un link para cambiarla.'}
        </Text>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, esActivacion && styles.inputInerte]}
            placeholder="tu@correo.com"
            placeholderTextColor={color.muted}
            value={email}
            onChangeText={setEmail}
            editable={!esActivacion}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            selectionColor={color.gold}
            accessibilityLabel="Correo"
          />

          {esActivacion && (
            <TextInput
              style={styles.input}
              placeholder="Contraseña nueva (mín. 8)"
              placeholderTextColor={color.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleActivar}
              selectionColor={color.gold}
              accessibilityLabel="Contraseña nueva"
            />
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
            onPress={esActivacion ? handleActivar : handleRecuperar}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color={color.onGold} />
              : <Text style={styles.btnPrimaryText}>
                  {esActivacion ? 'Crear contraseña y entrar' : 'Enviar link'}
                </Text>
            }
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.linkWrapper}>
            <Text style={styles.linkText}>← Volver</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // El fondo va aquí, a ancho completo. La columna va en `center`.
  flex:   { flex: 1, backgroundColor: color.bg },
  // Sin ScrollView: el helper va aquí, en el View de contenido. Limita el
  // ancho del formulario en monitores anchos ahora que CenteredContainer
  // soltó su maxWidth. El fondo de alrededor lo cubre el propio
  // CenteredContainer, que usa el mismo color.
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4.5], ...webContentColumn },
  inputInerte: { opacity: 0.6 },
  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 4, marginBottom: space[2] },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, letterSpacing: 0.4, marginBottom: space[1], textAlign: 'center' },
  subtitle: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', marginBottom: space[5] },
  form:  { width: '100%', gap: space[3] },
  input: { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, minHeight: touchTarget, paddingHorizontal: space[4], fontFamily: font.body, fontSize: inputFontSize(fontSize.body), color: color.text },
  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },
  btnPrimary: { backgroundColor: color.gold, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold },
  linkWrapper: { alignItems: 'center', paddingVertical: space[2] },
  linkText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },
});
