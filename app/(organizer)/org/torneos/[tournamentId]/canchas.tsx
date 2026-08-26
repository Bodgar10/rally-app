/**
 * RALLY · Canchas del torneo
 *
 * POR QUÉ VA EN EL TORNEO Y NO EN LA SEDE
 *   Un club con 6 canchas puede cederle 3 al organizador, o 8 un fin de semana
 *   y 4 el siguiente. La capacidad es del EVENTO, no del lugar.
 *
 * Es la mitad del dato que necesita el planificador; la otra son las ventanas
 * horarias. Sin las dos, el motor no puede decir si el torneo cabe y cae a
 * decidir categoría por categoría mirando solo el número de parejas.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

const MIN = 1;
const MAX = 30;   // mismo rango que el CHECK de la migración 044

export default function CanchasScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]     = useState('');
  const [canchas, setCanchas]   = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // Cast hasta que se aplique la 044 y se corra `npm run types:db`.
    const { data } = await (supabase.from as unknown as (v: string) => {
      select: (c: string) => { eq: (c: string, v: string) => {
        maybeSingle: () => Promise<{ data: { name: string; courts: number | null } | null }>;
      } };
    })('tournaments')
      .select('name, courts')
      .eq('id', tournamentId)
      .maybeSingle();

    if (data) {
      setNombre(data.name);
      setCanchas(data.courts);
    }
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  async function guardar() {
    if (canchas === null) return;
    setError(null);
    setGuardando(true);

    const { error: e } = await supabase
      .from('tournaments')
      .update({ courts: canchas } as never)
      .eq('id', tournamentId);

    setGuardando(false);

    if (e) {
      console.error('[canchas] guardar:', { code: e.code, message: e.message, details: e.details });
      setError('No se pudo guardar. Intenta de nuevo.');
      return;
    }
    router.back();
  }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator color={color.gold} /></View>;
  }

  const valor = canchas ?? 4;   // 4 es lo típico de un club chico, solo como punto de partida

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.contenido}>
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.titulo}>Canchas</Text>
        <Text style={s.subtitulo}>
          Cuántas canchas vas a usar en este torneo. No las que tiene el club:
          las que de verdad tendrás disponibles.
        </Text>

        <View style={s.stepper}>
          <Pressable
            onPress={() => setCanchas(Math.max(MIN, valor - 1))}
            disabled={valor <= MIN}
            style={({ pressed }) => [s.paso, valor <= MIN && s.pasoInerte, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Una cancha menos"
          >
            <Text style={s.pasoTexto}>−</Text>
          </Pressable>

          <View style={s.cifraCaja}>
            <Text style={s.cifra}>{valor}</Text>
            <Text style={s.cifraNota}>{valor === 1 ? 'cancha' : 'canchas'}</Text>
          </View>

          <Pressable
            onPress={() => setCanchas(Math.min(MAX, valor + 1))}
            disabled={valor >= MAX}
            style={({ pressed }) => [s.paso, valor >= MAX && s.pasoInerte, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Una cancha más"
          >
            <Text style={s.pasoTexto}>+</Text>
          </Pressable>
        </View>

        <View style={s.nota}>
          <Text style={s.notaTexto}>
            Con esto y los horarios calculamos cuántos partidos caben y te
            avisamos si el torneo no entra en los días que tienes.
          </Text>
        </View>

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

  stepper:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[4], marginVertical: space[4] },
  paso: {
    width: 56, height: 56, borderRadius: radius.md,
    borderWidth: 1, borderColor: color.line, backgroundColor: color.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  pasoInerte: { opacity: 0.35 },
  pasoTexto:  { fontFamily: font.display, fontSize: 28, color: color.gold },

  cifraCaja: { flex: 1, alignItems: 'center' },
  cifra:     { fontFamily: font.display, fontSize: 56, color: color.goldBright },
  cifraNota: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  nota:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3] },
  notaTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  error:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btn:       { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  btnInerte: { opacity: 0.7 },
  btnTexto:  { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
});
