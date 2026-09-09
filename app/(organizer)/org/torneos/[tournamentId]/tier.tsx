/**
 * RALLY · Tier del torneo
 *
 * Destino de la fila "Tier". Determina el multiplicador de puntos de
 * ranking que reparte el torneo — ver `src/lib/tier-torneo.ts` y el motor
 * (`src/lib/engine/ranking-points`), que lo exige y truena sin él.
 *
 * SIN VALOR POR DEFECTO EN EL SELECTOR
 *   Un torneo creado antes de que esta pantalla existiera puede tener el
 *   campo vacío (la 068 lo dejó nullable). Se muestra tal cual — "Sin
 *   elegir" — en vez de asumir uno: asumir es exactamente lo que
 *   `compute-ranking-points` se niega a hacer.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useVolver } from '@/hooks/useVolver';

import { supabase } from '@/lib/supabase/client';
import { TIER_OPCIONES, type TierTorneo } from '@/lib/tier-torneo';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { bottomInset, webContentColumn } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

export default function TierTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const volver = useVolver();

  const [nombre, setNombre]     = useState('');
  const [tier, setTier]         = useState<TierTorneo | null>(null);
  const [original, setOriginal] = useState<TierTorneo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data: t } = await supabase
      .from('tournaments')
      .select('name, tier')
      .eq('id', tournamentId)
      .maybeSingle();

    if (t) {
      const fila = t as { name: string; tier: string | null };
      setNombre(fila.name);
      const valor = (fila.tier as TierTorneo | null) ?? null;
      setTier(valor);
      setOriginal(valor);
    }
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const hayCambios  = tier !== original;
  const puedeGuardar = !!tier && hayCambios && !guardando;

  async function guardar() {
    if (!tier) { setError('Elige el tier del torneo.'); return; }
    setError(null);
    setGuardando(true);

    const { error: dbError } = await supabase
      .from('tournaments')
      .update({ tier })
      .eq('id', tournamentId);

    setGuardando(false);

    if (dbError) {
      setError('No se pudo guardar el tier. Intenta de nuevo.');
      return;
    }
    volver();
  }

  if (cargando) {
    return <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.title}>Tier del torneo</Text>
        <Text style={s.ayuda}>
          El mínimo de parejas se mide por categoría: si una categoría no lo
          alcanza, esa categoría reparte puntos del tier de abajo — el resto
          del torneo no se ve afectado.
        </Text>

        <View style={s.opciones}>
          {TIER_OPCIONES.map((o) => (
            <Pressable
              key={o.valor}
              onPress={() => setTier(o.valor)}
              style={[s.opcion, tier === o.valor && s.opcionElegida]}
              accessibilityRole="radio"
              accessibilityState={{ selected: tier === o.valor }}
              accessibilityLabel={o.titulo}
            >
              <Text style={[s.opcionTitulo, tier === o.valor && s.opcionTituloElegida]}>{o.titulo}</Text>
              <Text style={s.opcionSub}>{o.sub}</Text>
            </Pressable>
          ))}
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
          accessibilityLabel="Guardar tier"
          accessibilityState={{ disabled: !puedeGuardar }}
        >
          {guardando
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={[s.btnTexto, !puedeGuardar && s.btnTextoInactivo]}>
                {hayCambios ? 'Guardar' : 'Sin cambios'}
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
  ayuda:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  opciones:  { gap: space[2] },
  opcion:    { borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], gap: space[1] },
  opcionElegida: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.10)' },
  opcionTitulo:  { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  opcionTituloElegida: { color: color.gold },
  opcionSub:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

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
