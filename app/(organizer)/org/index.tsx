/**
 * RALLY · Home del Organizador
 * Lista los torneos del organizador con acceso rápido a gestión.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, Badge, SectionLabel }    from '@/components/ui';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

interface OrgTournament {
  id:         string;
  name:       string;
  start_date: string;
  status:     string;
}

export default function OrgHomeScreen() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<OrgTournament[]>([]);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [orgName, setOrgName]         = useState('');
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Obtener primera membresía owner
      const { data: membership } = await supabase
        .from('organizer_members')
        .select('organizer_id, organizers(name)')
        .eq('user_id', user.id)
        .eq('member_role', 'owner')
        .single();

      if (!membership) { setLoading(false); return; }

      const orgId = membership.organizer_id;
      setOrganizerId(orgId);
      setOrgName((membership.organizers as any)?.name ?? '');

      const { data: t } = await supabase
        .from('tournaments')
        .select('id, name, start_date, status')
        .eq('organizer_id', orgId)
        .order('start_date', { ascending: false });

      if (t) setTournaments(t as OrgTournament[]);
      setLoading(false);
    }
    load();
  }, []);

  const statusLabel = (s: string) => ({
    draft:                 { label: 'Borrador',               type: 'muted'  as const },
    registration_open:     { label: 'Inscripciones abiertas', type: 'live'   as const },
    registration_closed:   { label: 'Inscripciones cerradas', type: 'alive'  as const },
    in_progress:           { label: 'En curso',               type: 'alive'  as const },
    finished:              { label: 'Finalizado',             type: 'muted'  as const },
  }[s] ?? { label: s, type: 'muted' as const });

  if (loading) return (
    <View style={s.loadingContainer}><ActivityIndicator color={color.gold} /></View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.replace('/(protected)/dashboard')} style={s.backRow}>
            <Text style={s.backText}>← Modo Jugador</Text>
          </Pressable>
          <Text style={s.eyebrow}>ORGANIZADOR</Text>
          <Text style={s.title}>{orgName || 'Mi organización'}</Text>
        </View>

        {/* Nuevo torneo */}
        <Button
          label="+ Crear nuevo torneo"
          variant="primary"
          onPress={() => router.push('/(organizer)/org/torneos/nuevo')}
        />

        {/* Lista de torneos */}
        <SectionLabel title="Mis torneos" />

        {tournaments.length === 0 && (
          <Card variant="standard">
            <Text style={s.emptyText}>
              Aún no has creado ningún torneo. Crea el primero para comenzar.
            </Text>
          </Card>
        )}

        {tournaments.map(t => {
          const st = statusLabel(t.status);
          return (
            <Pressable
              key={t.id}
              onPress={() => router.push(`/(organizer)/org/torneos/${t.id}`)}
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            >
              <Card variant="standard">
                <View style={s.tRow}>
                  <View style={s.tLeft}>
                    <Text style={s.tName}>{t.name}</Text>
                    <Text style={s.tDate}>
                      {new Date(t.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <Badge label={st.label} type={st.type} />
                </View>
              </Card>
            </Pressable>
          );
        })}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:          { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: space[6] * 2, gap: space[3] },
  header:           { marginBottom: space[2] },
  backRow:          { marginBottom: space[3] },
  backText:         { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
  eyebrow:          { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:            { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  emptyText:        { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', paddingVertical: space[3] },
  tRow:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  tLeft:            { flex: 1 },
  tName:            { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, marginBottom: 2 },
  tDate:            { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
});
