/**
 * app/(judge)/juez/[tournamentId].tsx
 *
 * RALLY · Pantalla de captura de resultados para un torneo.
 * Lista de partidos pendientes → seleccionar → ScoreCapture → match-result.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  Text,
  View,
  Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { color, font, radius } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import ScoreCapture from '@/components/judge/ScoreCapture';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

interface PendingMatch {
  id: string;
  stage: string;
  roundLabel: string | null;
  status: string;
  pairAId: string;
  pairBId: string;
  pairAName: string;
  pairBName: string;
  categoryName: string;
  scheduledAt: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  group: 'Grupos',
  round_of_32: 'R32',
  round_of_16: 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semi',
  final: 'Final',
  third_place: '3er lugar',
};

// ───────────────────────────────────────────
// Fetch partidos pendientes
// ───────────────────────────────────────────

async function fetchPendingMatches(tournamentId: string): Promise<PendingMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `id, stage, round_label, status, pair_a_id, pair_b_id, scheduled_at,
       categories:category_id ( display_name ),
       pair_a:pair_a_id (
         player1:player1_id ( full_name ),
         player2:player2_id ( full_name )
       ),
       pair_b:pair_b_id (
         player1:player1_id ( full_name ),
         player2:player2_id ( full_name )
       )`
    )
    .eq('tournament_id', tournamentId)
    .neq('status', 'finished')
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('[JudgeTournament] fetch error:', error);
    return [];
  }

  return ((data ?? []) as unknown as Array<{
    id: string; stage: string; round_label: string | null;
    status: string; pair_a_id: string; pair_b_id: string;
    scheduled_at: string | null;
    categories: { display_name: string };
    pair_a: { player1: { full_name: string }; player2: { full_name: string } };
    pair_b: { player1: { full_name: string }; player2: { full_name: string } };
  }>).map((row) => ({
    id: row.id,
    stage: row.stage,
    roundLabel: row.round_label,
    status: row.status,
    pairAId: row.pair_a_id,
    pairBId: row.pair_b_id,
    pairAName: `${row.pair_a?.player1?.full_name ?? '?'} / ${row.pair_a?.player2?.full_name ?? '?'}`,
    pairBName: `${row.pair_b?.player1?.full_name ?? '?'} / ${row.pair_b?.player2?.full_name ?? '?'}`,
    categoryName: row.categories?.display_name ?? '—',
    scheduledAt: row.scheduled_at,
  }));
}

// ───────────────────────────────────────────
// Pantalla
// ───────────────────────────────────────────

export default function JudgeTournamentScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const [matches, setMatches] = useState<PendingMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<PendingMatch | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    const data = await fetchPendingMatches(tournamentId);
    setMatches(data);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  function handleSuccess() {
    if (selectedMatch) setSuccessId(selectedMatch.id);
    setSelectedMatch(null);
    load(); // refrescar lista
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      {/* Header */}
      {/* Cabecera fuera del FlatList: no hereda la columna centrada del
          contentContainerStyle, así que la aporta ella misma. Sin esto, el
          "← Volver" y el título se pegan al borde izquierdo en escritorio. */}
      <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, ...webContentColumn }}>
        <Pressable
          onPress={() => router.back()}
          style={{ padding: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={{ color: color.gold, fontFamily: font.body, fontSize: 15 }}>← Volver</Text>
        </Pressable>
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 18,
            fontWeight: '600',
            color: color.text,
            flex: 1,
          }}
          numberOfLines={1}
        >
          Partidos pendientes
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.gold} />
        </View>
      ) : matches.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: color.live, fontFamily: font.display, fontSize: 20, fontWeight: '600', marginBottom: 8 }}>
            ✓ Todo al día
          </Text>
          <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 13, textAlign: 'center' }}>
            No hay partidos pendientes de captura en este torneo.
          </Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: bottomInset, ...webContentColumn }}
          renderItem={({ item }) => {
            const isDone = successId === item.id;
            return (
              <Pressable
                onPress={() => setSelectedMatch(item)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? color.surface2 : color.surface,
                  borderRadius: radius.xl,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: item.status === 'in_progress' ? color.line : color.lineSoft,
                  opacity: isDone ? 0.5 : 1,
                })}
                accessibilityRole="button"
                accessibilityLabel={`Partido: ${item.pairAName} vs ${item.pairBName}`}
                disabled={isDone}
              >
                {/* Stage badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View
                    style={{
                      backgroundColor: color.surface2,
                      borderRadius: radius.pill,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ fontFamily: font.display, fontSize: 10, color: color.champagne, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {STAGE_LABEL[item.stage] ?? item.stage}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted }}>
                    {item.categoryName}
                  </Text>
                </View>

                {/* Parejas */}
                <Text style={{ fontFamily: font.display, fontSize: 14, fontWeight: '600', color: color.text, marginBottom: 2 }}>
                  {item.pairAName}
                </Text>
                <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted, marginBottom: 2 }}>vs</Text>
                <Text style={{ fontFamily: font.display, fontSize: 14, fontWeight: '600', color: color.text, marginBottom: 8 }}>
                  {item.pairBName}
                </Text>

                {/* Hora + acción */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted }}>
                    {item.scheduledAt
                      ? new Date(item.scheduledAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                      : 'Sin hora asignada'}
                  </Text>
                  <Text style={{ fontFamily: font.body, fontSize: 12, color: color.gold, fontWeight: '600' }}>
                    Capturar resultado →
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Modal de captura */}
      <Modal
        visible={!!selectedMatch}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedMatch(null)}
      >
        {selectedMatch && (
          <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
            {/* Header del modal */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: color.lineSoft,
              }}
            >
              <Text style={{ fontFamily: font.display, fontSize: 17, fontWeight: '600', color: color.text }}>
                Capturar resultado
              </Text>
              <Pressable
                onPress={() => setSelectedMatch(null)}
                style={{ padding: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 15 }}>✕</Text>
              </Pressable>
            </View>

            {/* Nombres del partido */}
            <View style={{ paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.lineSoft }}>
              <Text style={{ fontFamily: font.body, fontSize: 12, color: color.muted, marginBottom: 6 }}>
                {selectedMatch.categoryName} · {STAGE_LABEL[selectedMatch.stage] ?? selectedMatch.stage}
              </Text>
              <Text style={{ fontFamily: font.display, fontSize: 15, fontWeight: '600', color: color.text }}>
                {selectedMatch.pairAName}
              </Text>
              <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted, marginVertical: 2 }}>vs</Text>
              <Text style={{ fontFamily: font.display, fontSize: 15, fontWeight: '600', color: color.text }}>
                {selectedMatch.pairBName}
              </Text>
            </View>

            {/* ScoreCapture */}
            <View style={{ flex: 1, padding: 18 }}>
              <ScoreCapture
                matchId={selectedMatch.id}
                pairAId={selectedMatch.pairAId}
                pairBId={selectedMatch.pairBId}
                pairAName={selectedMatch.pairAName}
                pairBName={selectedMatch.pairBName}
                onSuccess={handleSuccess}
              />
            </View>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}
