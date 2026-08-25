/**
 * RALLY · Sede del torneo
 *
 * Destino de la fila "Sede". Permite CAMBIAR la sede de un torneo existente,
 * no solo asignarla la primera vez: el caso real es un club que cancela y
 * obliga a mover el torneo a otra cancha.
 *
 * Reutiliza VenuePicker, así que también se puede dar de alta una sede nueva
 * aquí mismo — que es justo lo que hace falta cuando la sede de reemplazo
 * todavía no está en el catálogo.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import VenuePicker, { type Venue } from '@/components/organizer/VenuePicker';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

export default function SedeTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]     = useState('');
  const [venues, setVenues]     = useState<Venue[]>([]);
  const [elegida, setElegida]   = useState<Venue | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data: lista }] = await Promise.all([
      supabase
        .from('tournaments')
        .select('name, venue_id, venues:venue_id(id, name, city, name_normalized)')
        .eq('id', tournamentId)
        .single(),
      supabase
        .from('venues')
        .select('id, name, city, name_normalized')
        .order('name'),
    ]);

    if (t) {
      const fila = t as unknown as { name: string; venue_id: string | null; venues: Venue | null };
      setNombre(fila.name);
      setElegida(fila.venues);
      setOriginal(fila.venue_id);
    }
    if (lista) setVenues(lista as Venue[]);
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const hayCambios   = (elegida?.id ?? null) !== original;
  const puedeGuardar = elegida !== null && hayCambios && !guardando;

  async function guardar() {
    if (!puedeGuardar || !elegida) return;
    setError(null);
    setGuardando(true);

    const { error: dbError } = await supabase
      .from('tournaments')
      .update({ venue_id: elegida.id })
      .eq('id', tournamentId);

    setGuardando(false);

    if (dbError) {
      setError('No se pudo guardar la sede. Intenta de nuevo.');
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
        <Text style={s.title}>Sede del torneo</Text>
        <Text style={s.ayuda}>
          Dónde se juega. Si el club cambia, elige otra sede o da de alta una
          nueva aquí mismo — los jugadores verán la actualizada.
        </Text>

        <VenuePicker
          venues={venues}
          selectedVenue={elegida}
          onSelect={setElegida}
          onCreated={(v) => setVenues((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)))}
        />

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
          accessibilityLabel="Guardar sede"
          accessibilityState={{ disabled: !puedeGuardar }}
        >
          {guardando
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={[s.btnTexto, !puedeGuardar && s.btnTextoInactivo]}>
                {hayCambios ? 'Guardar sede' : 'Sin cambios'}
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
  error:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

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
