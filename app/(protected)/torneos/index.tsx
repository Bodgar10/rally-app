/**
 * RALLY · Mis Torneos
 * Lista torneos disponibles + inscritos.
 * Lee de public.tournaments (RLS: lectura autenticada).
 * Doc D §8.2 tarjetas, §8.4 badges, §8.5 segmented control.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, Badge, SectionLabel }    from '@/components/ui';
import { formatearRango }                       from '@/lib/fechas';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

type TournamentStatus = 'draft' | 'registration_open' | 'registration_closed' | 'in_progress' | 'finished';

interface Tournament {
  id:               string;
  name:             string;
  start_date:       string;
  end_date:         string;
  status:           TournamentStatus;
  registration_fee: number;
  venues:           { name: string; city: string } | null;
}

type Tab = 'disponibles' | 'inscritos';

function statusBadge(status: TournamentStatus) {
  switch (status) {
    case 'registration_open':   return { label: 'Inscripciones abiertas', type: 'live'   as const };
    case 'registration_closed': return { label: 'Inscripciones cerradas', type: 'muted'  as const };
    case 'in_progress':         return { label: 'En curso',               type: 'alive'  as const };
    case 'finished':            return { label: 'Finalizado',             type: 'muted'  as const };
    default:                    return { label: 'Borrador',               type: 'muted'  as const };
  }
}

export default function TorneosScreen() {
  const router = useRouter();
  const [tab, setTab]               = useState<Tab>('disponibles');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, start_date, end_date, status, registration_fee, venues(name, city)')
        .order('start_date', { ascending: true });

      if (!error && data) setTournaments(data as unknown as Tournament[]);
      setLoading(false);
    }
    load();
  }, []);

  const available = tournaments.filter(t =>
    ['registration_open', 'in_progress'].includes(t.status)
  );
  const list = tab === 'disponibles' ? available : [];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>RALLY</Text>
        <Text style={styles.title}>Torneos</Text>
      </View>

      {/* Segmented control — Doc D §8.5 */}
      <View style={styles.segmentWrapper}>
        <View style={styles.segment}>
          {(['disponibles', 'inscritos'] as Tab[]).map(t => (
            <Pressable
              key={t}
              style={[styles.segTab, tab === t && styles.segTabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.segLabel, tab === t && styles.segLabelActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading
        ? <View style={styles.center}><ActivityIndicator color={color.gold} /></View>
        : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {list.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {tab === 'disponibles'
                    ? 'No hay torneos disponibles por ahora.'
                    : 'Aún no estás inscrito en ningún torneo.'}
                </Text>
              </View>
            )}

            {list.map(t => {
              const badge = statusBadge(t.status);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => router.push(`/(protected)/torneos/${t.id}`)}
                  style={({ pressed }) => [styles.cardPress, pressed && { opacity: 0.8 }]}
                >
                  <Card variant="standard">
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t.name}</Text>
                      <Badge label={badge.label} type={badge.type} />
                    </View>
                    <Text style={styles.cardSub}>
                      {t.venues?.name ?? 'Sede por confirmar'} · {t.venues?.city ?? 'CDMX'}
                    </Text>
                    <View style={styles.cardMeta}>
                      <Text style={styles.metaText}>
                        {formatearRango(t.start_date, t.end_date)}
                      </Text>
                      <Text style={styles.metaFee}>
                        {t.registration_fee > 0
                          ? `$${t.registration_fee.toLocaleString('es-MX')} MXN`
                          : 'Gratuito'}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </ScrollView>
        )
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: space[2], ...webContentColumn },
  eyebrow:{ fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:  { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },

  segmentWrapper: { paddingHorizontal: space[4.5], marginBottom: space[3], ...webContentColumn },
  segment: {
    flexDirection:   'row',
    backgroundColor: color.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     color.lineSoft,
    padding:         4,
  },
  segTab:       { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm - 2 },
  segTabActive: { backgroundColor: color.gold },
  segLabel:     { fontFamily: font.body, fontSize: 13, fontWeight: '500', color: color.muted },
  segLabelActive:{ color: color.onGold, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  empty:     { alignItems: 'center', paddingVertical: space[6] },
  emptyText: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center' },

  cardPress:   {},
  cardHeader:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[2], marginBottom: space[1.5] },
  cardTitle:   { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, flex: 1 },
  cardSub:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginBottom: space[2] },
  cardMeta:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space[1] },
  metaText:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  metaFee:     { fontFamily: font.display, fontSize: fontSize.body, color: color.goldBright },
});
