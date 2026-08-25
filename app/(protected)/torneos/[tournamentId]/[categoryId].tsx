/**
 * RALLY · Cuadro de una categoría (vista del jugador y del público)
 *
 * POR QUÉ ES POR CATEGORÍA Y NO POR TORNEO
 *   Desde la migración 035 el cierre es por categoría: un torneo puede tener la
 *   5ª Mixta cerrada con su cuadro generado y la 4ª Femenil todavía admitiendo
 *   inscripciones. Una sola pantalla "cuadro del torneo" tendría que mezclar
 *   ambas cosas.
 *
 * EL CUADRO ES PÚBLICO
 *   En un torneo real el papel está colgado en la pared del club. Las políticas
 *   de la migración 040 abren matches, group_standings, groups y match_sets a
 *   cualquiera; la identidad va por `bracket_pairs_public` (039), que publica
 *   nombre y foto y nada más.
 *
 * GRUPOS Y ELIMINATORIAS SE APILAN, NO SON PESTAÑAS
 *   En un torneo real el papel de grupos sigue colgado cuando ya empezaron los
 *   cuartos, porque es donde ves cómo llegó cada quien. `format_type` decide
 *   qué bloques existen, no una pestaña que el usuario tenga que descubrir.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { SectionLabel, Badge } from '@/components/ui';
import BotonVolver from '@/components/ui/BotonVolver';
import LiveStandings from '@/components/realtime/LiveStandings';
import LiveBracket from '@/components/realtime/LiveBracket';
import MyNextMatch from '@/components/realtime/MyNextMatch';
import { color, font, fontSize, space } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

interface Cabecera {
  categoria:   string;
  torneo:      string;
  estado:      'open' | 'closed' | 'seeded' | 'in_progress' | 'finished';
  formato:     'groups_then_knockout' | 'round_robin' | 'knockout_only' | null;
  avanzan:     number;
}

/** `name` en inglés porque es la columna tal cual: 'Grupo A', 'Grupo B'. */
interface Grupo {
  id:   string;
  name: string;
}

export default function CuadroCategoriaScreen() {
  const { tournamentId, categoryId } = useLocalSearchParams<{
    tournamentId: string; categoryId: string;
  }>();

  const [cabecera, setCabecera] = useState<Cabecera | null>(null);
  const [grupos, setGrupos]     = useState<Grupo[]>([]);
  const [misParejas, setMisParejas] = useState<string[]>([]);
  const [userId, setUserId]     = useState<string | undefined>(undefined);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id);

    const [{ data: cat }, { data: gs }, { data: parejas }] = await Promise.all([
      supabase
        .from('categories')
        .select('display_name, status, format_type, advance_per_group, tournaments:tournament_id ( name )')
        .eq('id', categoryId)
        .maybeSingle(),
      supabase
        .from('groups')
        .select('id, name')
        .eq('category_id', categoryId)
        .order('name'),
      // Las parejas del usuario EN ESTA CATEGORÍA. Si no juega aquí, el bloque
      // de "mi próximo partido" simplemente no se monta — que es lo que le pasa
      // a quien llega por el link de WhatsApp.
      user
        ? supabase
            .from('pairs')
            .select('id')
            .eq('category_id', categoryId)
            .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        : Promise.resolve({ data: null }),
    ]);

    if (cat) {
      const t = cat.tournaments as unknown as { name: string } | null;
      setCabecera({
        categoria: cat.display_name,
        torneo:    t?.name ?? '',
        estado:    cat.status,
        formato:   cat.format_type,
        // Sin plan de formato, 2 es el default del motor. Solo pinta la línea
        // de corte de la tabla, así que equivocarse no rompe nada.
        avanzan:   cat.advance_per_group ?? 2,
      });
    }

    setGrupos(gs ?? []);
    setMisParejas((parejas ?? []).map((p) => p.id));
    setCargando(false);
  }, [categoryId]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) {
    return (
      <View style={s.centro}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (!cabecera) {
    return (
      <SafeAreaView style={s.safe}>
        <BotonVolver texto="Torneo" />
        <View style={s.centro}>
          <Text style={s.error}>Categoría no encontrada.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const enCurso   = cabecera.estado === 'in_progress';
  const terminada = cabecera.estado === 'finished';

  // `format_type` decide qué bloques existen. Null se trata como el formato por
  // defecto del proyecto (grupos + eliminatorias): es lo que genera el motor
  // cuando el organizador no eligió nada.
  const hayGrupos = cabecera.formato !== 'knockout_only';
  const hayCuadro = cabecera.formato !== 'round_robin';

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto="Torneo" />

      <ScrollView contentContainerStyle={s.contenido} showsVerticalScrollIndicator={false}>

        <View style={s.cabecera}>
          <Text style={s.eyebrow}>{cabecera.torneo.toUpperCase()}</Text>
          <View style={s.tituloFila}>
            <Text style={s.titulo}>{cabecera.categoria}</Text>
            <Badge
              label={terminada ? 'Finalizada' : enCurso ? 'En curso' : 'Cuadro armado'}
              type={enCurso ? 'live' : 'muted'}
              dot={enCurso}
            />
          </View>
        </View>

        {/* Arriba del todo y solo si juegas: es lo único accionable de la
            pantalla. Para el visitante que llega por el link no existe, y la
            pantalla arranca directamente en la tabla — que es lo que vino a
            ver. */}
        {misParejas.length > 0 && (
          <View style={s.bloque}>
            <MyNextMatch pairIds={misParejas} />
          </View>
        )}

        {hayGrupos && grupos.length > 0 && (
          <View style={s.bloque}>
            <SectionLabel title="Fase de grupos" />
            {grupos.map((g) => (
              <View key={g.id} style={s.grupo}>
                <Text style={s.grupoNombre}>{g.name}</Text>
                <LiveStandings
                  groupId={g.id}
                  currentUserId={userId}
                  advanceCount={cabecera.avanzan}
                />
              </View>
            ))}
          </View>
        )}

        {hayCuadro && (
          <View style={s.bloque}>
            <SectionLabel title="Eliminatorias" />
            <LiveBracket categoryId={categoryId} currentUserId={userId} />
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: color.bg },
  centro:    { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  error:     { fontFamily: font.body, fontSize: fontSize.body, color: color.danger },

  contenido: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[4], ...webContentColumn },

  cabecera:   { gap: space[1] },
  eyebrow:    { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  titulo:     { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, flex: 1 },

  bloque:      { gap: space[2] },
  grupo:       { gap: space[1], marginBottom: space[3] },
  grupoNombre: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
});
