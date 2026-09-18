/**
 * app/(organizer)/org/torneos/[tournamentId]/prioridad.tsx
 *
 * RALLY · Cuánta ventaja tienen los suscriptores al inscribirse.
 *
 * POR QUÉ LO DECIDE EL ORGANIZADOR Y NO NOSOTROS
 *   Un exprés de 16 cupos que se llena en horas necesita la ventana; un torneo
 *   largo de 120 parejas que tarda semanas en llenarse, no — y ponérsela solo
 *   enfadaría a los socios sin beneficiar a nadie. El club sabe cuál de los dos
 *   tiene. Por eso el valor por defecto es SIN prioridad.
 *
 * LA VENTANA SE CUENTA DESDE QUE SE GUARDA
 *   No desde que se abren las inscripciones, porque son dos momentos distintos
 *   y confundirlos daría una ventana ya vencida. Se guarda `now() + horas`, que
 *   es lo que el organizador acaba de decidir.
 *
 * SE PUEDE QUITAR
 *   Mientras la ventana siga abierta, volver a "sin prioridad" la cancela y
 *   todos pueden entrar. Un organizador que se equivocó de número no tiene que
 *   esperar 48 horas a que caduque su error.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { Card, SectionLabel } from '@/components/ui';
import BotonVolver from '@/components/ui/BotonVolver';
import { cuandoAbre } from '@/lib/prioridad-inscripcion';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

const OPCIONES = [
  { horas: 0, titulo: 'Sin prioridad', sub: 'Todos se inscriben desde que abres' },
  { horas: 24, titulo: '24 horas', sub: 'Un día de ventaja para los suscriptores' },
  { horas: 48, titulo: '48 horas', sub: 'Dos días. Lo habitual en un exprés que se llena' },
  { horas: 72, titulo: '72 horas', sub: 'Tres días, para torneos muy demandados' },
] as const;

export default function PrioridadScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [hasta, setHasta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!tournamentId) return;
    setCargando(true);
    const { data } = await supabase
      .from('tournaments')
      .select('prioridad_hasta')
      .eq('id', tournamentId)
      .maybeSingle();
    setHasta(data?.prioridad_hasta ?? null);
    setCargando(false);
  }, [tournamentId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar(horas: number) {
    setGuardando(true);
    setError(null);
    const valor = horas === 0 ? null : new Date(Date.now() + horas * 3600000).toISOString();
    const { error: e } = await supabase
      .from('tournaments')
      .update({ prioridad_hasta: valor })
      .eq('id', tournamentId!);
    if (e) setError(e.message ?? 'No se pudo guardar.');
    else await cargar();
    setGuardando(false);
  }

  const ahora = new Date();
  const abre = hasta ? new Date(hasta) : null;
  const vigente = !!abre && abre.getTime() > ahora.getTime();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />
        <Text style={s.h1}>Prioridad de inscripción</Text>
        <Text style={s.bajada}>
          Durante la ventana, solo los suscriptores pueden inscribirse. Pasada esa hora, abre para
          todos. Tú y tu equipo pueden registrar parejas a mano en cualquier momento.
        </Text>

        {cargando && <ActivityIndicator color={color.gold} />}

        {!cargando && (
          <>
            <View style={[s.estado, vigente ? s.estadoOn : s.estadoOff]}>
              <Text style={[s.estadoTexto, vigente && s.estadoTextoOn]}>
                {vigente && abre
                  ? `Ventana abierta. Las inscripciones abren para todos ${cuandoAbre(abre, ahora)}.`
                  : 'Sin prioridad: cualquiera puede inscribirse desde que abres las inscripciones.'}
              </Text>
            </View>

            <SectionLabel title="Cuánta ventaja les das" />
            <Card>
              {OPCIONES.map((o) => (
                <Pressable
                  key={o.horas}
                  onPress={() => void guardar(o.horas)}
                  disabled={guardando}
                  accessibilityRole="button"
                  style={[s.opcion, o.horas === 0 && !vigente && s.opcionActiva]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.opcionTitulo}>{o.titulo}</Text>
                    <Text style={s.opcionSub}>{o.sub}</Text>
                  </View>
                  {guardando && <ActivityIndicator color={color.gold} />}
                </Pressable>
              ))}
            </Card>

            <Text style={s.nota}>
              La cuenta empieza cuando guardas, no cuando abres las inscripciones. Si te
              equivocas de número, vuelve a "sin prioridad" y se cancela.
            </Text>

            {error && (
              <View style={s.error}>
                <Text style={s.errorTexto}>{error}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  cont: {
    paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: bottomInset,
    gap: space[3], ...webContentColumn,
  },
  h1: {
    color: color.champagne, fontFamily: font.display, fontSize: fontSize.screenH1,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  bajada: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },

  estado: { padding: space[3], borderRadius: radius.sm, borderWidth: 1 },
  estadoOn: { borderColor: 'rgba(66,214,164,0.32)', backgroundColor: 'rgba(66,214,164,0.10)' },
  estadoOff: { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  estadoTexto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
  estadoTextoOn: { color: color.live },

  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    minHeight: touchTarget + 8, paddingVertical: space[2],
    borderTopWidth: 1, borderTopColor: color.lineSoft,
  },
  opcionActiva: { opacity: 0.6 },
  opcionTitulo: { color: color.text, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },
  opcionSub: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute },

  nota: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17 },
  error: {
    padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1, borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body },
});
