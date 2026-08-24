/**
 * RALLY · Fechas del torneo
 *
 * Destino de la fila "Fechas" del panel. Patrón de fila de ajuste: se abre,
 * se guarda aquí, y se vuelve.
 *
 * `bloquearPasado` va en FALSE: esto es EDITAR un torneo que ya existe, y el
 * organizador puede estar corrigiendo las fechas de uno ya jugado. Al CREAR
 * (org/torneos/nuevo.tsx) sí se bloquea el pasado, porque programar un torneo
 * hacia atrás no tiene sentido.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase }        from '@/lib/supabase/client';
import CalendarioRango     from '@/components/ui/CalendarioRango';
import { rangoCompleto, type RangoSeleccion } from '@/lib/rango-fechas';
import { formatearRango }  from '@/lib/fechas';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';

export default function FechasTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]   = useState('');
  const [rango, setRango]     = useState<RangoSeleccion>({ inicio: null, fin: null });
  const [original, setOriginal] = useState<RangoSeleccion>({ inicio: null, fin: null });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('tournaments')
        .select('name, start_date, end_date')
        .eq('id', tournamentId)
        .single();

      if (data) {
        const t = data as { name: string; start_date: string; end_date: string };
        setNombre(t.name);
        const r = { inicio: t.start_date, fin: t.end_date };
        setRango(r);
        setOriginal(r);
      }
      setCargando(false);
    }
    cargar();
  }, [tournamentId]);

  const hayCambios =
    rango.inicio !== original.inicio || rango.fin !== original.fin;
  const puedeGuardar = rangoCompleto(rango) && hayCambios && !guardando;

  async function guardar() {
    // El type guard además de la comprobación de UI: `puedeGuardar` es un
    // booleano y TypeScript no propaga el narrowing a través de él.
    if (!puedeGuardar || !rangoCompleto(rango)) return;
    setError(null);
    setGuardando(true);

    const { error: dbError } = await supabase
      .from('tournaments')
      .update({ start_date: rango.inicio, end_date: rango.fin })
      .eq('id', tournamentId);

    setGuardando(false);

    if (dbError) {
      setError('No se pudieron guardar las fechas. Intenta de nuevo.');
      return;
    }
    router.back();
  }

  if (cargando) {
    return (
      <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button">
        <Text style={s.backText} numberOfLines={1}>← {nombre || 'Torneo'}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.title}>Fechas del torneo</Text>
        <Text style={s.ayuda}>
          Toca el día de inicio y luego el de cierre. Si el torneo es de un solo
          día, toca el mismo dos veces.
        </Text>

        <CalendarioRango
          valor={rango}
          onChange={setRango}
          bloquearPasado={false}
        />

        {/* Solo cuando el rango está completo: antes no hay nada que resumir */}
        {rangoCompleto(rango) && (
          <Text style={s.resumen}>{formatearRango(rango.inicio, rango.fin)}</Text>
        )}

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
          accessibilityLabel="Guardar fechas"
          accessibilityState={{ disabled: !puedeGuardar }}
        >
          {guardando
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={[s.btnTexto, !puedeGuardar && s.btnTextoInactivo]}>
                {hayCambios ? 'Guardar fechas' : 'Sin cambios'}
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
  back:     { paddingHorizontal: space[4.5], paddingTop: space[4] },
  backText: { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: space[6] * 2, gap: space[3] },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  ayuda:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[1] },

  resumen: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne, textAlign: 'center' },
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
