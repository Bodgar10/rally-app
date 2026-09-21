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
 *
 * INMUTABLE DESDE 'registration_closed'
 *   El tier fija el multiplicador de los puntos de ranking, y esos puntos
 *   se le anuncian al jugador en la pantalla de inscripción. Cambiarlo a
 *   mitad de torneo cambia retroactivamente lo prometido, así que en
 *   cuanto el torneo deja 'draft'/'registration_open' la pantalla pasa a
 *   solo lectura: ni las tarjetas son pulsables ni hay botón de guardar.
 *   La 073 impone lo mismo en la base con un trigger — esta pantalla es
 *   cortesía de UI, no la única guardia.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useVolver } from '@/hooks/useVolver';

import { supabase } from '@/lib/supabase/client';
import { TIER_OPCIONES, TIER_EXPRES, type TierTorneo } from '@/lib/tier-torneo';
import SelectorDeTier from '@/components/organizer/SelectorDeTier';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { bottomInset, webContentColumn } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

/** Mismos estados que `esDraft`/`esAbierto` en el panel del torneo. */
const EDITABLE_EN: readonly string[] = ['draft', 'registration_open'];

export default function TierTorneoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const volver = useVolver();

  const [nombre, setNombre]     = useState('');
  const [status, setStatus]     = useState<string | null>(null);
  /** Un exprés tiene el tier fijado por lo que es: una tarde. Ver TIER_EXPRES. */
  const [esExpres, setEsExpres] = useState(false);
  const [tier, setTier]         = useState<TierTorneo | null>(null);
  const [original, setOriginal] = useState<TierTorneo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data: t } = await supabase
      .from('tournaments')
      .select('name, tier, status, modo')
      .eq('id', tournamentId)
      .maybeSingle();

    if (t) {
      const fila = t as { name: string; tier: string | null; status: string; modo: string | null };
      setNombre(fila.name);
      setStatus(fila.status);
      setEsExpres(fila.modo === 'expres');
      const valor = (fila.tier as TierTorneo | null) ?? null;
      setTier(valor);
      setOriginal(valor);
    }
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  /**
   * Dos motivos distintos para no poder tocarlo, y cada uno dice lo suyo:
   *   · Inscripciones cerradas — los puntos ya se anunciaron.
   *   · Es un exprés — no cabe en ningún tier que no sea P2. Ver TIER_EXPRES.
   */
  const bloqueado = esExpres || (status !== null && !EDITABLE_EN.includes(status));

  const hayCambios  = tier !== original;
  const puedeGuardar = !bloqueado && !!tier && hayCambios && !guardando;

  async function guardar() {
    if (bloqueado) return;
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

        {bloqueado && (
          <View style={s.aviso}>
            <Text style={s.avisoTexto}>
              {esExpres
                ? 'Un exprés dura una tarde, así que siempre es P2. Major pide '
                  + '3+ días y 24 parejas por categoría, y P1 dos días y 12: '
                  + 'ninguno cabe en una tarde.'
                : 'El tier no se puede cambiar una vez cerradas las inscripciones: '
                  + 'los puntos de ranking ya se anunciaron a los jugadores.'}
            </Text>
          </View>
        )}

        {/* El mismo control que al crear el torneo. Bloqueado, las opciones
            que NO están elegidas se apagan: la elegida se sigue leyendo. */}
        <SelectorDeTier
          valor={esExpres ? TIER_EXPRES : tier}
          onChange={setTier}
          deshabilitados={
            bloqueado
              ? TIER_OPCIONES
                  .map((o) => o.valor)
                  .filter((v) => v !== (esExpres ? TIER_EXPRES : tier))
              : []
          }
        />

        {error && <Text style={s.error}>{error}</Text>}

        {!bloqueado && (
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
        )}
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

  aviso:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3] },
  avisoTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 17 },


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
