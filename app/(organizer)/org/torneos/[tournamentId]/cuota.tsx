/**
 * RALLY · Cuota de inscripción
 *
 * Destino de la fila "Cuota". El campo se DESHABILITA si el organizador no
 * tiene Connect activo.
 *
 * Por qué se bloquea en vez de dejar escribir: `checkout-tournament` rechaza
 * el cobro con 409 `organizer_not_ready` cuando `connect_status !== 'active'`.
 * Si aquí se pudiera poner una cuota sin Connect, el torneo se publicaría con
 * precio, el jugador se inscribiría, su pareja nacería en `pending`, y el pago
 * fallaría — dejándolo inscrito y sin pagar, sin salida. Vale más impedirlo
 * aquí que explicarlo después.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { bottomInset, inputFontSize, webContentColumn } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

export default function CuotaTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]     = useState('');
  const [cuota, setCuota]       = useState('');
  const [original, setOriginal] = useState('');
  const [puedeCobrar, setPuedeCobrar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data: t } = await supabase
      .from('tournaments')
      .select('name, registration_fee, organizer_id')
      .eq('id', tournamentId)
      .single();

    if (t) {
      const fila = t as { name: string; registration_fee: number; organizer_id: string };
      setNombre(fila.name);
      const valor = fila.registration_fee > 0 ? String(fila.registration_fee) : '';
      setCuota(valor);
      setOriginal(valor);

      const { data: org } = await supabase
        .from('organizers')
        .select('connect_status')
        .eq('id', fila.organizer_id)
        .maybeSingle();
      setPuedeCobrar((org as { connect_status: string } | null)?.connect_status === 'active');
    }
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const monto      = Number(cuota.replace(/[^0-9.]/g, '')) || 0;
  const hayCambios = cuota.trim() !== original.trim();
  const valido     = monto >= 0 && monto < 1_000_000;
  const puedeGuardar = puedeCobrar && hayCambios && valido && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    setError(null);
    setGuardando(true);

    const { error: dbError } = await supabase
      .from('tournaments')
      .update({ registration_fee: monto })
      .eq('id', tournamentId);

    setGuardando(false);

    if (dbError) {
      setError('No se pudo guardar la cuota. Intenta de nuevo.');
      return;
    }
    router.back();
  }

  if (cargando) {
    return <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.title}>Cuota de inscripción</Text>
        <Text style={s.ayuda}>
          Lo que paga cada pareja. Se cobra una sola vez e incluye a los dos
          jugadores.
        </Text>

        {!puedeCobrar && (
          <View style={s.aviso}>
            <Text style={s.avisoTitulo}>Todavía no puedes cobrar en línea</Text>
            <Text style={s.avisoCuerpo}>
              Para poner una cuota necesitas conectar tu cuenta con Stripe. Sin
              eso, el torneo se queda gratuito y registras a las parejas a mano
              cuando te paguen por fuera.
            </Text>
            <Pressable
              onPress={() => router.push('/(organizer)/org/onboarding-connect')}
              style={({ pressed }) => [s.avisoBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Conectar pagos con Stripe"
            >
              <Text style={s.avisoBtnTexto}>Conectar pagos →</Text>
            </Pressable>
          </View>
        )}

        <View style={s.campo}>
          <Text style={[s.label, !puedeCobrar && s.labelInerte]}>Cuota por pareja (MXN)</Text>
          <View style={[s.inputFila, !puedeCobrar && s.inputInerte]}>
            <Text style={[s.signo, !puedeCobrar && s.signoInerte]}>$</Text>
            <TextInput
              style={[s.input, !puedeCobrar && s.inputTextoInerte]}
              value={puedeCobrar ? cuota : '0'}
              onChangeText={setCuota}
              editable={puedeCobrar}
              placeholder="0"
              placeholderTextColor={color.muted}
              keyboardType="numeric"
              selectionColor={color.gold}
              accessibilityLabel="Cuota por pareja en pesos"
            />
          </View>
          <Text style={s.hint}>
            {puedeCobrar
              ? 'Deja 0 si el torneo es gratuito. RALLY cobra 5% solo cuando tú cobras.'
              : 'El campo se habilita en cuanto Stripe verifique tu cuenta.'}
          </Text>
        </View>

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={guardar}
          disabled={!puedeGuardar}
          style={({ pressed }) => [
            s.btnDorado,
            !puedeGuardar && s.btnInactivo,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Guardar cuota"
          accessibilityState={{ disabled: !puedeGuardar }}
        >
          {guardando
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={[s.btnTexto, !puedeGuardar && s.btnTextoInactivo]}>
                {hayCambios ? 'Guardar cuota' : 'Sin cambios'}
              </Text>
          }
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  cargando: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  ayuda:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[1] },

  aviso:       { backgroundColor: color.surface, borderWidth: 1, borderColor: color.alive, borderRadius: radius.md, padding: space[4], gap: space[2] },
  avisoTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.alive },
  avisoCuerpo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  avisoBtn:    { alignSelf: 'flex-start', minHeight: touchTarget, justifyContent: 'center' },
  avisoBtnTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.gold },

  campo:      { gap: space[1] },
  label:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  labelInerte:{ color: color.muted },
  inputFila: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   color.surface2,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
  },
  inputInerte: { opacity: 0.5 },
  signo:       { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright, marginRight: space[2] },
  signoInerte: { color: color.muted },
  input: {
    flex:       1,
    fontFamily: font.body,
    fontSize:   inputFontSize(fontSize.body),
    color:      color.text,
    paddingVertical: space[3],
  },
  inputTextoInerte: { color: color.muted },
  hint:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8, lineHeight: 17 },
  error: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btnDorado: {
    backgroundColor: color.gold,
    borderWidth:     1,
    borderColor:     color.goldBright,
    borderRadius:    radius.sm,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       space[2],
  },
  btnInactivo:      { backgroundColor: color.surface2, borderColor: color.line },
  btnTexto:         { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
  btnTextoInactivo: { color: color.muted },
});
