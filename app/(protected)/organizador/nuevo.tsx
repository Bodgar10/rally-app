/**
 * RALLY · Alta de organizador (autoservicio)
 *
 * Vive en (protected) y NO en (organizer) a propósito: el guard de (organizer)
 * exige membresía owner, así que una pantalla de alta ahí se auto-bloquearía
 * — el usuario todavía no es owner, precisamente viene a serlo.
 *
 * El alta la hace la Edge Function `organizer-create`, que invoca la RPC
 * create_organizer (SECURITY DEFINER). No se escribe en `organizers` desde
 * aquí: la RLS lo impide y debe seguir impidiéndolo.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { invalidateOrganizerOwnerCache } from '@/hooks/useIsOrganizerOwner';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset, inputFontSize } from '@/lib/web-layout';
import { fallo } from '@/lib/errores-red';
import BotonVolver from '@/components/ui/BotonVolver';

/**
 * Códigos de la Edge Function / RPC traducidos a algo que un humano entienda.
 * Nunca se enseña el código crudo: `create_failed` o `invalid_name` no le
 * dicen nada a un organizador que solo quiere dar de alta su marca.
 */
const MENSAJE_ERROR: Record<string, string> = {
  invalid_name:           'El nombre debe tener entre 3 y 60 caracteres.',
  invalid_email:          'El correo de contacto no tiene un formato válido.',
  invalid_json:           'No se pudo enviar el formulario. Intenta de nuevo.',
  unauthenticated:        'Tu sesión expiró. Vuelve a entrar para continuar.',
  slug_generation_failed: 'Ya existen demasiadas marcas con ese nombre. Prueba con otro.',
  create_failed:          'No se pudo crear tu marca. Intenta de nuevo en un momento.',
  method_not_allowed:     'No se pudo crear tu marca. Intenta de nuevo en un momento.',
};

const ERROR_GENERICO = 'No se pudo crear tu marca. Intenta de nuevo en un momento.';

export default function NuevoOrganizadorScreen() {
  const router = useRouter();

  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [accepted, setAccepted]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Prellenar el correo de contacto con el de la cuenta: en la práctica es
  // el mismo, y ahorra el campo más tedioso del formulario.
  useEffect(() => {
    async function cargarCorreo() {
      const { data } = await supabase.auth.getUser();
      if (data.user?.email) setEmail(data.user.email);
    }
    cargarCorreo();
  }, []);

  const nombreValido = name.trim().length >= 3 && name.trim().length <= 60;
  const correoValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const puedeEnviar  = nombreValido && correoValido && accepted && !saving;

  async function handleCrear() {
    setError(null);

    // Validación de cortesía para dar feedback inmediato. La de verdad vive en
    // la RPC — ésta solo evita un viaje al servidor para errores obvios.
    if (!nombreValido) { setError(MENSAJE_ERROR.invalid_name);  return; }
    if (!correoValido) { setError(MENSAJE_ERROR.invalid_email); return; }
    if (!accepted)     { setError('Debes aceptar los términos para continuar.'); return; }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError(MENSAJE_ERROR.unauthenticated);
        return;
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/organizer-create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name:          name.trim(),
            contact_email: email.trim(),
          }),
        },
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const codigo = typeof json?.error === 'string' ? json.error : '';
        setError(MENSAJE_ERROR[codigo] ?? ERROR_GENERICO);
        return;
      }

      // El usuario acaba de volverse owner: sin esto, la caché seguiría
      // diciendo `false` y el botón "Organizar" lo devolvería a la landing.
      invalidateOrganizerOwnerCache();

      // `already_existed` no es un error: el usuario ya tenía marca (doble tap,
      // reintento de red, o simplemente volvió aquí). Se entra igual.
      router.replace('/(organizer)/org');
    } catch (e) {
      setError(fallo('organizador-nuevo', e, ERROR_GENERICO));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        <BotonVolver texto="Volver" enScroller />

        <Text style={s.eyebrow}>ORGANIZADOR</Text>
        <Text style={s.title}>Crea tu marca de torneos</Text>
        <Text style={s.subtitle}>
          Arma torneos con tabla en vivo, clasificación automática y cobro de
          inscripciones. Sin Excel y sin perseguir transferencias.
        </Text>

        {/* Nombre de la marca organizadora — NO es la sede (eso son `venues`) */}
        <View style={s.field}>
          <Text style={s.label}>Nombre de tu marca de torneos</Text>
          <TextInput
            style={s.input}
            placeholder="Ej. Mexapadel"
            placeholderTextColor={color.muted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={60}
            returnKeyType="next"
            selectionColor={color.gold}
            accessibilityLabel="Nombre de tu marca de torneos"
          />
          <Text style={s.hint}>
            Así te verán los jugadores en cada torneo que publiques. No es el club
            ni la cancha: la sede la eliges después, al crear cada torneo.
          </Text>
        </View>

        {/* Correo de contacto */}
        <View style={s.field}>
          <Text style={s.label}>Correo de contacto</Text>
          <TextInput
            style={s.input}
            placeholder="tu@correo.com"
            placeholderTextColor={color.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="done"
            onSubmitEditing={handleCrear}
            selectionColor={color.gold}
            accessibilityLabel="Correo de contacto"
          />
          <Text style={s.hint}>Para avisos de inscripciones y pagos.</Text>
        </View>

        {/* Términos — mismo patrón visual que el checkbox de registro.tsx */}
        <Pressable
          style={s.checkboxRow}
          onPress={() => setAccepted(!accepted)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View style={[s.checkbox, accepted && s.checkboxChecked]}>
            {accepted && <Text style={s.checkmark}>✓</Text>}
          </View>
          <Text style={s.checkboxLabel}>
            {'Acepto los '}
            <Link href="/(public)/terminos" asChild>
              <Text style={s.checkboxLink}>Términos y Condiciones</Text>
            </Link>
            {' como organizador y me hago responsable de los torneos que publique.'}
          </Text>
        </Pressable>

        {/* Nota de cobro — evita la sorpresa de no poder cobrar online */}
        <View style={s.noteBox}>
          <Text style={s.noteText}>
            Podrás crear y publicar torneos desde el primer momento, con registro
            manual de parejas. Para cobrar inscripciones en línea tendrás que
            conectar tu cuenta con Stripe — es el siguiente paso.
          </Text>
        </View>

        {error && <Text style={s.errorText}>{error}</Text>}

        <Pressable
          style={[s.btnPrimary, !puedeEnviar && s.btnDisabled]}
          onPress={handleCrear}
          disabled={!puedeEnviar}
          accessibilityRole="button"
          accessibilityLabel="Crear marca"
        >
          {saving
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={[s.btnPrimaryText, !puedeEnviar && s.btnDisabledText]}>Crear marca</Text>
          }
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, letterSpacing: 0.4 },
  subtitle: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 19, marginBottom: space[2] },

  field: { gap: space[1] },
  label: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  input: {
    backgroundColor:   color.surface2,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
    paddingVertical:   space[3],
    fontFamily:        font.body,
    fontSize:          inputFontSize(fontSize.body),
    color:             color.text,
  },
  hint: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.75 },

  checkboxRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], marginTop: space[1] },
  checkbox:        { width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1, borderColor: color.gold, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkboxChecked: { backgroundColor: color.gold },
  checkmark:       { fontSize: 12, color: color.onGold, fontWeight: '700' },
  checkboxLabel:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, flex: 1, lineHeight: 18 },
  checkboxLink:    { color: color.goldBright, textDecorationLine: 'underline' },

  noteBox:  { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3] },
  noteText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  errorText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btnPrimary: {
    backgroundColor: color.gold,
    borderRadius:    radius.sm,
    borderWidth:     1,
    borderColor:     color.goldBright,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       space[2],
  },
  btnDisabled:     { backgroundColor: color.surface2, borderColor: color.line },
  btnPrimaryText:  { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
  btnDisabledText: { color: color.muted },
});
