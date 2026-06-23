/**
 * RALLY · Panel de torneo del organizador
 * Gestión: cambiar status, ver categorías, ir a agregar categorías.
 * Sprint 2: cerrar inscripciones + sugerencia IA de cuadro.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, Badge, SectionLabel }    from '@/components/ui';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

interface Tournament {
  id: string; name: string; start_date: string; end_date: string;
  status: string; registration_fee: number;
}
interface Category {
  id: string; display_name: string; status: string;
}

export default function OrgTournamentScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updating, setUpdating]     = useState(false);

  async function load() {
    const [{ data: t }, { data: cats }] = await Promise.all([
      supabase.from('tournaments').select('id,name,start_date,end_date,status,registration_fee').eq('id', tournamentId).single(),
      supabase.from('categories').select('id,display_name,status').eq('tournament_id', tournamentId).order('division'),
    ]);
    if (t) setTournament(t as Tournament);
    if (cats) setCategories(cats as Category[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tournamentId]);

  async function handleOpenRegistration() {
    setUpdating(true);
    await supabase.from('tournaments').update({ status: 'registration_open' }).eq('id', tournamentId);
    await load();
    setUpdating(false);
  }

  if (loading) return (
    <View style={s.loadingContainer}><ActivityIndicator color={color.gold} /></View>
  );
  if (!tournament) return null;

  const statusColors: Record<string, 'live' | 'alive' | 'muted'> = {
    draft: 'muted', registration_open: 'live', registration_closed: 'alive',
    in_progress: 'alive', finished: 'muted',
  };

  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.replace('/(organizer)/org/index')} style={s.back}>
        <Text style={s.backText}>← Mis torneos</Text>
      </Pressable>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>TORNEO</Text>
        <Text style={s.title}>{tournament.name}</Text>
        <Badge
          label={tournament.status.replace('_', ' ')}
          type={statusColors[tournament.status] ?? 'muted'}
        />

        {/* Acciones según status */}
        {tournament.status === 'draft' && (
          <Card variant="standard">
            <Text style={s.actionHint}>
              Agrega las categorías y luego abre las inscripciones para que los jugadores puedan registrarse.
            </Text>
            <View style={{ marginTop: space[3] }}>
              <Button
                label={updating ? 'Abriendo…' : 'Abrir inscripciones'}
                variant="primary"
                loading={updating}
                onPress={handleOpenRegistration}
              />
            </View>
          </Card>
        )}

        {tournament.status === 'registration_open' && (
          <Card variant="standard">
            <Text style={s.actionHint}>
              Las inscripciones están abiertas. Cuando se complete el cuadro, cierra las inscripciones para generar los grupos. (Sprint 2)
            </Text>
          </Card>
        )}

        {/* Categorías */}
        <SectionLabel
          title="Categorías"
          actionLabel="+ Agregar"
          onAction={() => router.push(`/(organizer)/org/torneos/${tournamentId}/categorias`)}
        />

        {categories.length === 0 && (
          <Card variant="standard">
            <Text style={s.emptyText}>
              No hay categorías aún. Agrega al menos una para abrir inscripciones.
            </Text>
          </Card>
        )}

        {categories.map(cat => (
          <Card key={cat.id} variant="standard">
            <View style={s.catRow}>
              <Text style={s.catName}>{cat.display_name}</Text>
              <Badge label={cat.status} type={cat.status === 'open' ? 'live' : 'muted'} />
            </View>
          </Card>
        ))}

        {/* Acciones futuras (Sprint 2+) */}
        <SectionLabel title="Próximamente" />
        <Card variant="standard">
          {[
            'Ajuste de calendario',
          ].map((item, i) => (
            <Text key={i} style={s.futureItem}>· {item}</Text>
          ))}
        </Card>

        {/* Acciones del torneo — Sprint 2 */}
        <SectionLabel title="Acciones" />
        <TournamentActionButton
          label="Cerrar inscripciones"
          subtitle="Genera el cuadro automáticamente por categoría"
          onPress={() =>
            router.push(`/(organizer)/org/torneos/${tournamentId}/cerrar-inscripciones`)
          }
          variant="primary"
        />
        <TournamentActionButton
          label="Agregar pareja manual"
          subtitle="Inscripción paid_offline (pago recibido fuera de la plataforma)"
          onPress={() =>
            router.push(`/(organizer)/org/torneos/${tournamentId}/agregar-pareja`)
          }
          variant="secondary"
        />

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  back:             { paddingHorizontal: space[4.5], paddingTop: space[4] },
  backText:         { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
  content:          { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: space[6] * 2, gap: space[3] },
  eyebrow:          { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:            { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  actionHint:       { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },
  emptyText:        { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', paddingVertical: space[3] },
  catRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName:          { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, flex: 1 },
  futureItem:       { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, paddingVertical: space[1] },
});

// ─── Subcomponente: botón de acción del panel ───────────────────────────────
function TournamentActionButton({
  label,
  subtitle,
  onPress,
  variant = "secondary",
}: {
  label: string;
  subtitle?: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: variant === "primary" ? color.gold : color.surface,
        borderRadius: radius.xl,
        padding: space[4],
        borderWidth: 1,
        borderColor: variant === "primary" ? "transparent" : color.line,
        gap: 4,
      }}
    >
      <Text
        style={{
          fontFamily: "Oswald",
          fontSize: 15,
          fontWeight: "600",
          color: variant === "primary" ? color.onGold : color.text,
        }}
      >
        {label}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontFamily: "Inter",
            fontSize: 11,
            color: variant === "primary" ? color.onGold : color.muted,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}
