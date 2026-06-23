/**
 * RALLY · Detalle de Torneo
 * Stub para Sprint 1 — muestra info básica del torneo.
 * En Sprint 3 se añaden tabla en vivo y cuadro (LiveStandings, LiveBracket).
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase }                          from '@/lib/supabase/client';
import { Card, Badge, SectionLabel, Button } from '@/components/ui';
import { color, font, fontSize, space }      from '@/lib/design-tokens';

interface Tournament {
  id:               string;
  name:             string;
  start_date:       string;
  end_date:         string;
  status:           string;
  registration_fee: number;
  venues:           { name: string; address: string; city: string } | null;
}

export default function TorneoDetailScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router           = useRouter();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('tournaments')
        .select('id, name, start_date, end_date, status, registration_fee, venues(name, address, city)')
        .eq('id', tournamentId)
        .single();
      if (data) setTournament(data as unknown as Tournament);
      setLoading(false);
    }
    load();
  }, [tournamentId]);

  if (loading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator color={color.gold} />
    </View>
  );

  if (!tournament) return (
    <View style={styles.loadingContainer}>
      <Text style={styles.errorText}>Torneo no encontrado.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Back */}
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Torneos</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero info */}
        <View style={styles.heroCard}>
          <View style={styles.accentBar} />
          <Text style={styles.eyebrow}>RALLY</Text>
          <Text style={styles.title}>{tournament.name}</Text>
          <Text style={styles.dates}>
            {new Date(tournament.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
            {' — '}
            {new Date(tournament.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
          {tournament.venues && (
            <Text style={styles.venue}>
              📍 {tournament.venues.name} · {tournament.venues.city}
            </Text>
          )}
          <View style={{ marginTop: space[2] }}>
            <Badge
              label={tournament.status === 'registration_open' ? 'Inscripciones abiertas' : tournament.status}
              type={tournament.status === 'registration_open' ? 'live' : 'muted'}
              dot={tournament.status === 'registration_open'}
            />
          </View>
        </View>

        {/* Inscripción */}
        {tournament.status === 'registration_open' && (
          <>
            <SectionLabel title="Inscripción" />
            <Card variant="standard">
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Cuota por pareja</Text>
                <Text style={styles.feeAmount}>
                  {tournament.registration_fee > 0
                    ? `$${tournament.registration_fee.toLocaleString('es-MX')} MXN`
                    : 'Gratuito'}
                </Text>
              </View>
              <Text style={styles.feeNote}>
                Incluye a los dos jugadores de la pareja.
              </Text>
              <View style={{ marginTop: space[3] }}>
                <Button
                  label="Inscribirme a este torneo"
                  variant="primary"
                  onPress={() => router.push(`/(protected)/inscripcion/${tournament.id}/index`)}
                />
              </View>
            </Card>
          </>
        )}

        {/* Categorías — Sprint 2 */}
        <SectionLabel title="Categorías" />
        <Card variant="standard">
          <Text style={styles.stubText}>
            Las categorías y el cuadro estarán disponibles una vez que el organizador cierre las inscripciones.
          </Text>
        </Card>

        {/* Tabla en vivo — Sprint 3 */}
        <SectionLabel title="Tabla en vivo" />
        <Card variant="standard">
          <Text style={styles.stubText}>
            La tabla en vivo aparecerá aquí cuando el torneo esté en curso.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  errorText:        { fontFamily: font.body, fontSize: fontSize.body, color: color.danger },

  back:     { paddingHorizontal: space[4.5], paddingTop: space[4], paddingBottom: space[2] },
  backText: { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },

  content: { paddingHorizontal: space[4.5], paddingBottom: space[6] * 2, gap: space[3] },

  heroCard: {
    backgroundColor: '#19171A',
    borderWidth:     1,
    borderColor:     color.line,
    borderRadius:    24,
    padding:         space[5],
    overflow:        'hidden',
    gap:             space[1.5],
  },
  accentBar: { height: 3, backgroundColor: color.gold, marginBottom: space[2], marginHorizontal: -space[5], marginTop: -space[5] },
  eyebrow:   { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:     { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  dates:     { fontFamily: font.body, fontSize: fontSize.body, color: color.champagne },
  venue:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  feeRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1] },
  feeLabel:  { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  feeAmount: { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright },
  feeNote:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  stubText: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', paddingVertical: space[3] },
});
