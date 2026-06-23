/**
 * RALLY · Mi Ranking
 * Muestra los puntos visibles del jugador por división (ranking_points).
 * Glicko-2 oculto en v1 (feature flag ENABLE_GLICKO_UI apagado).
 * Doc A §4.13 — ranking_points: puntos acumulables entre torneos,
 * bien común de la red (cruzan organizadores).
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from 'react-native';

import { supabase }                             from '@/lib/supabase/client';
import { Card, SectionLabel, Badge }            from '@/components/ui';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface RankingRow {
  division: string;
  points:   number;
  position: number | null;
}

const DIVISION_LABELS: Record<string, string> = {
  sexta:    '6ª',
  quinta:   '5ª',
  cuarta:   '4ª',
  tercera:  '3ª',
  segunda:  '2ª',
  primera:  '1ª',
};

// ─── Pantalla ────────────────────────────────────────────────────────────

export default function RankingScreen() {
  const [rows, setRows]       = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Nombre para el saludo
      setUserName(user.user_metadata?.full_name?.split(' ')[0] ?? '');

      // Ranking points del jugador
      const { data } = await supabase
        .from('ranking_points')
        .select('division, points, position')
        .eq('player_id', user.id)
        .order('points', { ascending: false });

      if (data) setRows(data as RankingRow[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <View style={s.loadingContainer}><ActivityIndicator color={color.gold} /></View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>MI RANKING</Text>
          <Text style={s.title}>Temporada 2026</Text>
          <Text style={s.subtitle}>
            Puntos acumulados en toda la red RALLY · Ciudad de México
          </Text>
        </View>

        {/* Sin datos */}
        {rows.length === 0 && (
          <>
            <Card variant="hero">
              <Text style={s.emptyHeroLabel}>SIN PUNTOS AÚN</Text>
              <Text style={s.emptyHeroNumber}>—</Text>
              <Text style={s.emptyHeroSub}>
                Completa tu primer torneo para aparecer en el ranking de la red.
              </Text>
            </Card>
            <View style={s.tipBox}>
              <Text style={s.tipTitle}>¿Cómo funcionan los puntos?</Text>
              <Text style={s.tipBody}>
                Ganas puntos en cada torneo según tu resultado: victorias en grupos, ronda alcanzada en eliminatoria y el tamaño del cuadro. Los puntos se acumulan entre todos los torneos de la red.
              </Text>
            </View>
          </>
        )}

        {/* Rankings por categoría */}
        {rows.length > 0 && (
          <>
            {/* Hero — categoría con más puntos */}
            <Card variant="hero">
              <Text style={s.heroLabel}>
                {DIVISION_LABELS[rows[0].division] ?? rows[0].division} · CDMX
              </Text>
              <Text style={s.heroNumber}>
                {rows[0].position != null ? `#${rows[0].position}` : '—'}
              </Text>
              <Text style={s.heroPoints}>{rows[0].points.toLocaleString('es-MX')} pts</Text>
              <Badge label="Tu mejor categoría" type="gold" />
            </Card>

            {/* Todas las categorías */}
            {rows.length > 1 && (
              <>
                <SectionLabel title="Todas las categorías" />
                <Card variant="standard">
                  {rows.map((row, i) => (
                    <View key={row.division}>
                      {i > 0 && <View style={s.divider} />}
                      <View style={s.rankRow}>
                        <View style={s.rankLeft}>
                          <Text style={s.rankDivision}>
                            {DIVISION_LABELS[row.division] ?? row.division} División
                          </Text>
                          <Text style={s.rankPoints}>
                            {row.points.toLocaleString('es-MX')} puntos
                          </Text>
                        </View>
                        <View style={s.rankRight}>
                          {row.position != null
                            ? <Text style={s.rankPosition}>#{row.position}</Text>
                            : <Text style={s.rankPositionMuted}>—</Text>
                          }
                        </View>
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}
          </>
        )}

        {/* Cómo se calculan */}
        <SectionLabel title="Cómo se calculan" />
        <Card variant="standard">
          {[
            { label: 'Victoria en fase de grupos',  value: '50 pts' },
            { label: 'Clasificar de grupos',         value: '+100 pts' },
            { label: 'Llegar a cuartos',             value: '+250 pts' },
            { label: 'Llegar a semifinal',           value: '+400 pts' },
            { label: 'Llegar a final',               value: '+650 pts' },
            { label: 'Campeón',                      value: '+1,000 pts' },
          ].map((item, i, arr) => (
            <View key={item.label}>
              <View style={s.ruleRow}>
                <Text style={s.ruleLabel}>{item.label}</Text>
                <Text style={s.ruleValue}>{item.value}</Text>
              </View>
              {i < arr.length - 1 && <View style={s.divider} />}
            </View>
          ))}
          <Text style={s.ruleNote}>
            * Los puntos se multiplican por el tamaño del cuadro (×0.7 en cuadros de ≤8 parejas, hasta ×1.5 en cuadros de 33+).
          </Text>
        </Card>

        {/* Nota Glicko oculto */}
        {process.env.EXPO_PUBLIC_ENABLE_GLICKO_UI !== 'true' && (
          <View style={s.glickoNote}>
            <Text style={s.glickoText}>
              🔒 Tu rating de habilidad real (Glicko-2) se calcula internamente desde tu primer torneo. Se mostrará en una próxima actualización.
            </Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:          { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: space[6] * 2, gap: space[3] },

  header:   { marginBottom: space[2] },
  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[1] },
  subtitle: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },

  // Hero vacío
  emptyHeroLabel:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[2] },
  emptyHeroNumber: { fontFamily: font.display, fontSize: 74, color: color.champagne, lineHeight: 74, marginBottom: space[2] },
  emptyHeroSub:    { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },

  // Hero con datos
  heroLabel:   { fontFamily: font.display, fontSize: fontSize.section, color: color.champagne, letterSpacing: 2, marginBottom: space[2] },
  heroNumber:  { fontFamily: font.display, fontSize: 74, color: color.goldBright, lineHeight: 74 },
  heroPoints:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, marginBottom: space[3] },

  // Filas de ranking
  divider:  { height: 1, backgroundColor: color.lineSoft },
  rankRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space[3] },
  rankLeft: { flex: 1 },
  rankDivision: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  rankPoints:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: 2 },
  rankRight:    { alignItems: 'flex-end' },
  rankPosition: { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright },
  rankPositionMuted: { fontFamily: font.display, fontSize: fontSize.metric, color: color.muted },

  // Reglas de puntos
  ruleRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[2.5] },
  ruleLabel: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  ruleValue: { fontFamily: font.display, fontSize: fontSize.body, color: color.goldBright },
  ruleNote:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: space[3], lineHeight: 18 },

  // Tips
  tipBox:   { backgroundColor: color.surface, borderRadius: radius.xl, padding: space[4], borderWidth: 1, borderColor: color.lineSoft },
  tipTitle: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne, marginBottom: space[1] },
  tipBody:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },

  // Glicko note
  glickoNote: { backgroundColor: color.surface2, borderRadius: radius.xl, padding: space[4], borderWidth: 1, borderColor: color.lineSoft },
  glickoText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
});
