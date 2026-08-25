/**
 * RALLY · Nueva contraseña / Activación de cuenta
 *
 * Recibe el token de recuperación vía deep link y permite poner la contraseña.
 * Es también la pantalla de ACTIVACIÓN de las cuentas que crea un organizador
 * al registrar una pareja a mano: ahí es donde se aceptan los términos, porque
 * al crearlas nadie aceptó nada.
 *
 * CÓMO SABE SI ES UNA CUENTA DE MENOR
 *   El enlace de recuperación deja sesión abierta, así que se puede leer la
 *   propia fila de `public.users` (RLS users_select_own lo permite). La marca
 *   es `parent_email is not null`: esa columna ya significa exactamente "esta
 *   cuenta tiene tutor", así que no hizo falta añadir ninguna.
 *
 *   No se puede falsear desde el cliente: el trigger
 *   users_prevent_guardian_tampering (migración 037) congela parent_email y
 *   parental_consent_* frente a cualquier UPDATE con auth.uid() no nulo. Sin
 *   él, el titular de una cuenta de menor podría borrar la marca o firmarse el
 *   consentimiento a sí mismo.
 *
 *   Y la rama la decide la BASE, no esta pantalla: la RPC
 *   accept_terms_on_activation vuelve a mirar parent_email por su cuenta. Lo
 *   de aquí es solo qué se dibuja.
 */

import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useRouter, Link } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, inputFontSize, bottomInset } from '@/lib/web-layout';

const CURRENT_TOS_VERSION = process.env.EXPO_PUBLIC_TOS_VERSION ?? '1.0.0';

/** undefined = todavía cargando; null = sin sesión o sin fila. */
type Cuenta = { esDeMenor: boolean; nombreJugador: string } | null | undefined;

export default function NuevaContrasenaScreen() {
  const router = useRouter();
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [nombreTutor, setNombreTutor] = useState('');
  const [aceptado, setAceptado]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);
  const [cuenta, setCuenta]         = useState<Cuenta>(undefined);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (vivo) setCuenta(null); return; }

      const { data } = await supabase
        .from('users')
        .select('parent_email, full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (!vivo) return;
      setCuenta(data
        ? { esDeMenor: data.parent_email !== null, nombreJugador: data.full_name }
        : null);
    })();
    return () => { vivo = false; };
  }, []);

  const esDeMenor  = cuenta?.esDeMenor === true;
  const tutorListo = !esDeMenor || (nombreTutor.trim().length >= 3 && aceptado);

  async function handleCambiar() {
    setError(null);
    if (password.length < 8)  { setError('Mínimo 8 caracteres.');            return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.');   return; }
    if (esDeMenor && nombreTutor.trim().length < 3) {
      setError('Escribe tu nombre completo como tutor.');
      return;
    }
    if (esDeMenor && !aceptado) {
      setError('Debes aceptar los términos como tutor para continuar.');
      return;
    }

    setLoading(true);

    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) {
      setLoading(false);
      setError('No se pudo actualizar la contraseña. Solicita un nuevo link.');
      return;
    }

    // La aceptación va DESPUÉS de la contraseña: si esto falla, la contraseña
    // ya quedó puesta y el usuario puede entrar. Al revés dejaría un
    // consentimiento firmado por alguien que nunca completó la activación.
    // La RPC es de la migración 037 y todavía no está en los tipos generados.
    // El cast se acota al nombre y a los argumentos, no al cliente entero: en
    // cuanto se aplique la migración y se corra `npm run types:db`, se borra.
    const { error: rpcError } = await (supabase.rpc as unknown as (
      fn: string,
      args: { p_tos_version: string; p_parent_name: string | null },
    ) => Promise<{ error: { code?: string; message?: string; details?: string } | null }>)(
      'accept_terms_on_activation',
      {
        p_tos_version: CURRENT_TOS_VERSION,
        p_parent_name: esDeMenor ? nombreTutor.trim() : null,
      },
    );

    setLoading(false);

    if (rpcError) {
      console.error('[activacion] accept_terms_on_activation:', {
        code: rpcError.code, message: rpcError.message, details: rpcError.details,
      });
      setError('Tu contraseña quedó guardada, pero no pudimos registrar la aceptación de términos. Entra y vuelve a intentarlo.');
      return;
    }

    setSuccess(true);
  }

  if (cuenta === undefined) {
    return (
      <View style={[s.flex, s.center]}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (success) {
    return (
      <View style={[s.flex, s.center]}>
        <Text style={s.eyebrow}>RALLY</Text>
        <Text style={s.title}>
          {esDeMenor ? 'Cuenta activada' : '¡Contraseña actualizada!'}
        </Text>
        {esDeMenor && (
          <Text style={s.subtitulo}>
            Ya puedes entrar y seguir los partidos de {cuenta?.nombreJugador}.
          </Text>
        )}
        <Pressable style={s.btnPrimary} onPress={() => router.replace('/(auth)/login')}>
          <Text style={s.btnPrimaryText}>Entrar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[s.contenido, s.center]} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>RALLY</Text>
      <Text style={s.title}>
        {esDeMenor ? 'Activa la cuenta' : 'Nueva contraseña'}
      </Text>

      {esDeMenor && (
        <View style={s.avisoTutor}>
          <Text style={s.avisoTutorTitulo}>Cuenta de un jugador menor de edad</Text>
          <Text style={s.avisoTutorTexto}>
            Esta cuenta es de{' '}
            <Text style={s.negrita}>{cuenta?.nombreJugador}</Text>, y queda a tu
            nombre como padre, madre o tutor. Tú pones la contraseña y tú
            aceptas los términos.
          </Text>
        </View>
      )}

      <View style={s.form}>
        <TextInput
          style={s.input}
          placeholder="Nueva contraseña (mín. 8)"
          placeholderTextColor={color.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          selectionColor={color.gold}
          accessibilityLabel="Nueva contraseña"
        />
        <TextInput
          style={s.input}
          placeholder="Confirmar contraseña"
          placeholderTextColor={color.muted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          returnKeyType={esDeMenor ? 'next' : 'done'}
          onSubmitEditing={esDeMenor ? undefined : handleCambiar}
          selectionColor={color.gold}
          accessibilityLabel="Confirmar contraseña"
        />

        {esDeMenor && (
          <>
            <TextInput
              style={s.input}
              placeholder="Tu nombre completo (tutor)"
              placeholderTextColor={color.muted}
              value={nombreTutor}
              onChangeText={setNombreTutor}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleCambiar}
              selectionColor={color.gold}
              accessibilityLabel="Tu nombre completo como tutor"
            />

            <Pressable
              style={s.checkRow}
              onPress={() => setAceptado(!aceptado)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: aceptado }}
            >
              <View style={[s.check, aceptado && s.checkMarcado]}>
                {aceptado && <Text style={s.checkPalomita}>✓</Text>}
              </View>
              <Text style={s.checkLabel}>
                {'Soy el padre, madre o tutor de '}
                <Text style={s.negrita}>{cuenta?.nombreJugador}</Text>
                {', autorizo su participación y acepto los '}
                <Link href="/(public)/terminos" asChild>
                  <Text style={s.checkLink}>Términos y Condiciones</Text>
                </Link>
                {' en su nombre.'}
              </Text>
            </Pressable>
          </>
        )}

        {error && <Text style={s.errorText}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            s.btnPrimary,
            (loading || !tutorListo) && s.btnInactivo,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleCambiar}
          disabled={loading || !tutorListo}
        >
          {loading
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={[s.btnPrimaryText, !tutorListo && s.btnTextoInactivo]}>
                {esDeMenor ? 'Activar cuenta' : 'Cambiar contraseña'}
              </Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  // Sin ScrollView el helper iba en el View de contenido. Ahora hay scroller
  // porque la rama de tutor añade dos campos y una casilla que no caben en
  // pantallas cortas con el teclado abierto.
  contenido: { flexGrow: 1, backgroundColor: color.bg, paddingBottom: bottomInset },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4.5], ...webContentColumn },

  eyebrow:    { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 4, marginBottom: space[2] },
  title:      { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, letterSpacing: 0.4, marginBottom: space[4], textAlign: 'center' },
  subtitulo:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', marginBottom: space[4], lineHeight: 21 },

  avisoTutor:       { width: '100%', backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.md, padding: space[4], gap: space[1], marginBottom: space[4] },
  avisoTutorTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  avisoTutorTexto:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  negrita:          { color: color.text, fontWeight: '600' },

  form:  { width: '100%', gap: space[3] },
  input: { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, minHeight: touchTarget, paddingHorizontal: space[4], fontFamily: font.body, fontSize: inputFontSize(fontSize.body), color: color.text },

  checkRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  check:         { width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1, borderColor: color.gold, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkMarcado:  { backgroundColor: color.gold },
  checkPalomita: { fontSize: 12, color: color.onGold, fontWeight: '700' },
  checkLabel:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, flex: 1, lineHeight: 18 },
  checkLink:     { color: color.goldBright, textDecorationLine: 'underline' },

  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btnPrimary:       { backgroundColor: color.gold, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText:   { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold },
  btnInactivo:      { backgroundColor: color.surface2 },
  btnTextoInactivo: { color: color.muted },
});
