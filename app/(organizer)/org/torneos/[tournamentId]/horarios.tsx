/**
 * RALLY · Horarios del torneo
 *
 * Una franja por día del rango, más la duración que se planifica por partido.
 *
 * EL ORDEN DE LOS DÍAS ES SEMÁNTICO, no de presentación: el planificador
 * reserva todos los días menos el último para la fase de grupos y el último
 * para las eliminatorias. Que sobre tiempo el domingo no ayuda si el sábado va
 * apretado, así que son dos presupuestos independientes.
 *
 * Los días salen de start_date/end_date del torneo: no se inventan aquí. Si el
 * organizador cambia las fechas, esta pantalla vuelve a leerlas y las ventanas
 * que queden fuera del rango dejan de contar.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { parseFechaISO, aFechaISO, formatearConDia } from '@/lib/fechas';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset, inputFontSize } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

interface Ventana {
  dia:   string;   // 'YYYY-MM-DD'
  desde: string;   // 'HH:MM'
  hasta: string;
  /** Sin marcar, el día no se juega y no aporta presupuesto. */
  activo: boolean;
}

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFECTO_DESDE = '09:00';
const DEFECTO_HASTA = '21:00';

/** Los días del rango del torneo, ambos incluidos. */
function diasDelRango(inicio: string, fin: string): string[] {
  const a = parseFechaISO(inicio), b = parseFechaISO(fin);
  if (!a || !b) return [];
  const salida: string[] = [];
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    salida.push(aFechaISO(new Date(d)));
  }
  return salida;
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export default function HorariosScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]       = useState('');
  const [ventanas, setVentanas]   = useState<Ventana[]>([]);
  const [duracion, setDuracion]   = useState('60');
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data: ws }] = await Promise.all([
      // Cast hasta que se aplique la 044 y se corra `npm run types:db`.
      (supabase.from as unknown as (v: string) => {
        select: (c: string) => { eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{ data: {
            name: string; start_date: string; end_date: string; match_minutes: number | null;
          } | null }>;
        } };
      })('tournaments')
        .select('name, start_date, end_date, match_minutes')
        .eq('id', tournamentId).maybeSingle(),
      (supabase.from as unknown as (v: string) => {
        select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: Array<{
          dia: string; desde: string; hasta: string;
        }> | null }> };
      })('tournament_windows')
        .select('dia, desde, hasta')
        .eq('tournament_id', tournamentId),
    ]);

    if (!t) { setCargando(false); return; }

    setNombre(t.name);
    if (t.match_minutes) setDuracion(String(t.match_minutes));

    // Las guardadas mandan; los días sin ventana nacen desmarcados con un
    // horario de partida razonable.
    const guardadas = new Map(
      (ws ?? []).map((w) => [w.dia, { desde: w.desde.slice(0, 5), hasta: w.hasta.slice(0, 5) }]),
    );

    setVentanas(diasDelRango(t.start_date, t.end_date).map((dia) => {
      const g = guardadas.get(dia);
      return {
        dia,
        desde:  g?.desde ?? DEFECTO_DESDE,
        hasta:  g?.hasta ?? DEFECTO_HASTA,
        activo: !!g,
      };
    }));

    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const activas = ventanas.filter((v) => v.activo);

  function problema(): string | null {
    const d = Number(duracion);
    if (!Number.isFinite(d) || d < 30 || d > 180) {
      return 'La duración debe estar entre 30 y 180 minutos.';
    }
    if (activas.length === 0) return 'Marca al menos un día.';
    for (const v of activas) {
      if (!RE_HORA.test(v.desde) || !RE_HORA.test(v.hasta)) {
        return `Revisa las horas del ${formatearConDia(v.dia)}: usa el formato 14:00.`;
      }
      if (minutos(v.hasta) <= minutos(v.desde)) {
        return `El ${formatearConDia(v.dia)} termina antes de empezar.`;
      }
    }
    return null;
  }

  async function guardar() {
    const mal = problema();
    if (mal) { setError(mal); return; }

    setError(null);
    setGuardando(true);

    // Se borra y se reinserta en vez de hacer upsert fila a fila: los días
    // desmarcados TIENEN que desaparecer, y un upsert los dejaría vivos.
    const del = await (supabase.from as unknown as (v: string) => {
      delete: () => { eq: (c: string, v: string) => Promise<{ error: { message?: string } | null }> };
    })('tournament_windows').delete().eq('tournament_id', tournamentId);

    if (del.error) {
      setGuardando(false);
      console.error('[horarios] borrar:', del.error);
      setError('No se pudo guardar. Intenta de nuevo.');
      return;
    }

    const ins = await (supabase.from as unknown as (v: string) => {
      insert: (rows: unknown[]) => Promise<{ error: { message?: string } | null }>;
    })('tournament_windows').insert(
      activas.map((v) => ({
        tournament_id: tournamentId,
        dia:   v.dia,
        desde: `${v.desde}:00`,
        hasta: `${v.hasta}:00`,
      })),
    );

    if (ins.error) {
      setGuardando(false);
      console.error('[horarios] insertar:', ins.error);
      setError('No se pudo guardar. Intenta de nuevo.');
      return;
    }

    const { error: eDur } = await supabase
      .from('tournaments')
      .update({ match_minutes: Number(duracion) } as never)
      .eq('id', tournamentId);

    setGuardando(false);

    if (eDur) {
      console.error('[horarios] duración:', eDur);
      setError('Los horarios se guardaron, pero no la duración del partido.');
      return;
    }
    router.back();
  }

  function editar(dia: string, parche: Partial<Ventana>) {
    setVentanas((prev) => prev.map((v) => (v.dia === dia ? { ...v, ...parche } : v)));
  }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator color={color.gold} /></View>;
  }

  const total = activas.reduce((a, v) => {
    const m = minutos(v.hasta) - minutos(v.desde);
    return a + (m > 0 ? m : 0);
  }, 0);

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.titulo}>Horarios</Text>
        <Text style={s.subtitulo}>
          A qué hora se juega cada día. Marca solo los días que de verdad vas a
          usar.
        </Text>

        <View style={s.lista}>
          {ventanas.map((v, i) => (
            <View key={v.dia} style={[s.dia, !v.activo && s.diaInerte]}>
              <Pressable
                style={s.diaCabecera}
                onPress={() => editar(v.dia, { activo: !v.activo })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: v.activo }}
              >
                <View style={[s.check, v.activo && s.checkMarcado]}>
                  {v.activo && <Text style={s.checkPalomita}>✓</Text>}
                </View>
                <Text style={s.diaNombre}>{formatearConDia(v.dia)}</Text>
                {/* El último día activo es el de eliminatorias: decirlo aquí
                    evita la sorpresa de que el cuadro caiga donde no se espera. */}
                {v.activo && i === ventanas.map((x) => x.activo).lastIndexOf(true) && ventanas.filter((x) => x.activo).length > 1 && (
                  <Text style={s.etiquetaFinal}>eliminatorias</Text>
                )}
              </Pressable>

              {v.activo && (
                <View style={s.horas}>
                  <TextInput
                    style={s.hora}
                    value={v.desde}
                    onChangeText={(x) => editar(v.dia, { desde: x })}
                    placeholder="09:00"
                    placeholderTextColor={color.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    selectionColor={color.gold}
                    accessibilityLabel={`Hora de inicio del ${formatearConDia(v.dia)}`}
                  />
                  <Text style={s.guion}>a</Text>
                  <TextInput
                    style={s.hora}
                    value={v.hasta}
                    onChangeText={(x) => editar(v.dia, { hasta: x })}
                    placeholder="21:00"
                    placeholderTextColor={color.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    selectionColor={color.gold}
                    accessibilityLabel={`Hora de fin del ${formatearConDia(v.dia)}`}
                  />
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={s.campo}>
          <Text style={s.campoEtiqueta}>Minutos por partido</Text>
          <TextInput
            style={s.input}
            value={duracion}
            onChangeText={setDuracion}
            keyboardType="number-pad"
            maxLength={3}
            selectionColor={color.gold}
            accessibilityLabel="Minutos por partido"
          />
          <Text style={s.campoAyuda}>
            Se planifica con este número. En la práctica un partido a dos sets
            con super muerte dura entre 60 y 90 minutos.
          </Text>
        </View>

        {total > 0 && (
          <View style={s.nota}>
            <Text style={s.notaTexto}>
              {Math.round(total / 60)} horas de juego en {activas.length}{' '}
              {activas.length === 1 ? 'día' : 'días'}.
            </Text>
          </View>
        )}

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={guardar}
          disabled={guardando}
          style={({ pressed }) => [s.btn, guardando && s.btnInerte, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          {guardando
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={s.btnTexto}>Guardar</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: color.bg },
  centro:    { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  contenido: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow:   { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  titulo:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  subtitulo: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 21 },

  lista: { gap: space[2] },
  dia: {
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[3],
  },
  diaInerte:   { opacity: 0.55 },
  diaCabecera: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget - 12 },
  diaNombre:   { fontFamily: font.body, fontSize: fontSize.body, color: color.text, flex: 1 },
  etiquetaFinal: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },

  check:         { width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1, borderColor: color.gold, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkMarcado:  { backgroundColor: color.gold },
  checkPalomita: { fontSize: 12, color: color.onGold, fontWeight: '700' },

  horas: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  hora: {
    flex: 1, backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.sm, minHeight: touchTarget, paddingHorizontal: space[3],
    fontFamily: font.body, fontSize: inputFontSize(fontSize.body), color: color.text, textAlign: 'center',
  },
  guion: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  campo:         { gap: space[1], marginTop: space[2] },
  campoEtiqueta: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  campoAyuda:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8, lineHeight: 16 },
  input: {
    backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft,
    borderRadius: radius.md, minHeight: touchTarget, paddingHorizontal: space[4],
    fontFamily: font.body, fontSize: inputFontSize(fontSize.body), color: color.text,
  },

  nota:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3] },
  notaTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 17 },

  error:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btn:       { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  btnInerte: { opacity: 0.7 },
  btnTexto:  { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
});
