/**
 * RALLY · Eliminar torneo
 *
 * Pantalla propia y no un modal: borrar arrastra en cascada categorías,
 * parejas, grupos, partidos y REGISTROS DE PAGO. Merece una pantalla que
 * enumere lo que se pierde, no un diálogo de dos botones.
 *
 * CASCADA REAL (migración 001 + 003):
 *   tournaments → categories → pairs → registrations
 *                            → groups
 *                            → matches → match_sets
 *
 * `registrations` guarda `stripe_payment_intent_id`, los montos del split y los
 * datos de CFDI. Borrarlas NO devuelve el dinero: el cargo sigue en Stripe y
 * RALLY pierde el rastro para conciliar o facturar. Por eso, si hay pagos en
 * línea, esta pantalla NO deja borrar y manda a cancelar por soporte.
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

export default function EliminarTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]         = useState('');
  const [categorias, setCategorias] = useState(0);
  const [parejas, setParejas]       = useState(0);
  const [pagadas, setPagadas]       = useState(0);
  const [cargando, setCargando]     = useState(true);
  const [confirmacion, setConfirmacion] = useState('');
  const [borrando, setBorrando]     = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { count: cats }, { count: prs }, { count: pgs }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase.from('categories').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
      supabase.from('pairs').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
      supabase.from('pairs').select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId).eq('payment_status', 'paid_online'),
    ]);

    if (t) setNombre((t as { name: string }).name);
    setCategorias(cats ?? 0);
    setParejas(prs ?? 0);
    setPagadas(pgs ?? 0);
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  // Confirmación explícita: escribir el nombre. Un botón rojo se pulsa sin
  // leer; teclear el nombre obliga a mirar cuál se está borrando.
  const textoOk    = confirmacion.trim().toLowerCase() === nombre.trim().toLowerCase();
  const hayPagos   = pagadas > 0;
  const puedeBorrar = textoOk && !hayPagos && !borrando;

  async function borrar() {
    if (!puedeBorrar) return;
    setError(null);
    setBorrando(true);

    const { error: dbError } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);

    setBorrando(false);

    if (dbError) {
      setError('No se pudo eliminar el torneo. Intenta de nuevo.');
      return;
    }
    router.replace('/(organizer)/org');
  }

  if (cargando) {
    return <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>ZONA DE RIESGO</Text>
        <Text style={s.title}>Eliminar torneo</Text>
        <Text style={s.ayuda}>
          Esta acción no se puede deshacer. Se borra el torneo y todo lo que
          cuelga de él.
        </Text>

        {/* Qué se pierde */}
        <View style={s.perdida}>
          <Text style={s.perdidaTitulo}>Se eliminará</Text>
          {[
            { que: 'El torneo',      cuanto: nombre },
            { que: 'Categorías',     cuanto: categorias === 0 ? 'Ninguna' : String(categorias) },
            { que: 'Parejas inscritas', cuanto: parejas === 0 ? 'Ninguna' : String(parejas) },
            { que: 'Grupos, cuadros y resultados', cuanto: 'Todos' },
          ].map((f) => (
            <View key={f.que} style={s.perdidaFila}>
              <Text style={s.perdidaQue}>{f.que}</Text>
              <Text style={s.perdidaCuanto} numberOfLines={1}>{f.cuanto}</Text>
            </View>
          ))}
        </View>

        {/* Bloqueo por pagos en línea */}
        {hayPagos ? (
          <View style={s.bloqueo}>
            <Text style={s.bloqueoTitulo}>No se puede eliminar</Text>
            <Text style={s.bloqueoCuerpo}>
              Hay {pagadas} {pagadas === 1 ? 'pareja que pagó' : 'parejas que pagaron'} en
              línea. Borrar el torneo destruiría el registro de esos pagos, pero
              el dinero seguiría cobrado en Stripe — quedarías sin forma de
              conciliarlo ni de facturarlo.
              {'\n\n'}
              Escríbenos a hola@rallypadel.mx para cancelar el torneo y procesar
              las devoluciones.
            </Text>
          </View>
        ) : (
          <>
            {parejas > 0 && (
              <View style={s.aviso}>
                <Text style={s.avisoTexto}>
                  Hay {parejas} {parejas === 1 ? 'pareja inscrita' : 'parejas inscritas'} sin
                  pago en línea. Se perderán sus inscripciones y no se les avisa
                  automáticamente.
                </Text>
              </View>
            )}

            <View style={s.campo}>
              <Text style={s.label}>Escribe el nombre del torneo para confirmar</Text>
              <TextInput
                style={s.input}
                value={confirmacion}
                onChangeText={setConfirmacion}
                placeholder={nombre}
                placeholderTextColor={color.muted}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={color.danger}
                accessibilityLabel="Nombre del torneo para confirmar"
              />
            </View>

            {error && <Text style={s.error}>{error}</Text>}

            <Pressable
              onPress={borrar}
              disabled={!puedeBorrar}
              style={({ pressed }) => [
                s.btnBorrar,
                !puedeBorrar && s.btnInactivo,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Eliminar torneo definitivamente"
              accessibilityState={{ disabled: !puedeBorrar }}
            >
              {borrando
                ? <ActivityIndicator color={color.bg} />
                : <Text style={[s.btnBorrarTexto, !puedeBorrar && s.btnTextoInactivo]}>
                    Eliminar definitivamente
                  </Text>
              }
            </Pressable>
          </>
        )}

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.btnCancelar, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={s.btnCancelarTexto}>Cancelar y volver</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  cargando: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.danger, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  ayuda:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[1] },

  perdida:       { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[4], gap: space[2] },
  perdidaTitulo: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2, marginBottom: space[1] },
  perdidaFila:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  perdidaQue:    { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, flex: 1, minWidth: 0 },
  perdidaCuanto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.text, flexShrink: 1, textAlign: 'right' },

  bloqueo:       { backgroundColor: 'rgba(224,114,111,0.10)', borderWidth: 1, borderColor: color.danger, borderRadius: radius.md, padding: space[4], gap: space[2] },
  bloqueoTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, fontWeight: '600', color: color.danger },
  bloqueoCuerpo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  aviso:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.alive, borderRadius: radius.md, padding: space[3] },
  avisoTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 18 },

  campo: { gap: space[1] },
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
  error: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btnBorrar: {
    backgroundColor: color.danger,
    borderRadius:    radius.sm,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       space[1],
  },
  btnInactivo:      { backgroundColor: color.surface2 },
  btnBorrarTexto:   { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.bg, letterSpacing: 0.3 },
  btnTextoInactivo: { color: color.muted },

  btnCancelar:      { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[1] },
  btnCancelarTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
});
