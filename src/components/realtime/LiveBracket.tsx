/**
 * src/components/realtime/LiveBracket.tsx
 *
 * RALLY · Cuadro eliminatorio en vivo.
 *
 * REGLAS:
 * - Display puro: renderiza matches de fase final ya sembrados por la Edge Function.
 * - NUNCA implementa lógica de siembra ni avance (motor 14 y 19 en Opus).
 * - Se actualiza sin recargar via Supabase Realtime.
 * - Colores y fuentes solo desde design-tokens.ts.
 * - Solo primitivos React Native + ScrollView. Sin div/span/button.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text,
} from 'react-native';
import { color, radius, font } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, categoryChannel } from '@/lib/realtime/channels';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

type MatchStatus = 'scheduled' | 'in_progress' | 'finished';

type BracketStage =
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter'
  | 'semi'
  | 'final'
  | 'third_place';

interface BracketMatch {
  id: string;
  stage: BracketStage;
  roundLabel: string | null;
  status: MatchStatus;
  pairAId: string | null;
  pairBId: string | null;
  pairAName: string | null; // "Jugador1 / Jugador2"
  pairBName: string | null;
  winnerPairId: string | null;
  scheduledAt: string | null;
}

interface LiveBracketProps {
  categoryId: string;
  /** ID del usuario autenticado para resaltar su bracket. */
  currentUserId?: string;
}

// ───────────────────────────────────────────
// Orden de rondas
// ───────────────────────────────────────────

const STAGE_ORDER: BracketStage[] = [
  'round_of_32',
  'round_of_16',
  'quarter',
  'semi',
  'final',
  'third_place',
];

const STAGE_LABEL: Record<BracketStage, string> = {
  round_of_32: 'Octavos (R32)',
  round_of_16: 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semifinal',
  final: 'Final',
  third_place: '3er Lugar',
};

// ───────────────────────────────────────────
// Fetch
// ───────────────────────────────────────────

async function fetchBracketMatches(categoryId: string): Promise<BracketMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    // Sin embed de `pairs → users`: users_select_own solo deja leer la propia
    // fila, así que devolvía null para todos los rivales. Los nombres van por
    // bracket_pairs_public. Ver src/lib/parejas-publicas.ts.
    .select(
      `id, stage, round_label, status, pair_a_id, pair_b_id, winner_pair_id, scheduled_at`
    )
    .eq('category_id', categoryId)
    .neq('stage', 'group')
    .order('id', { ascending: true });

  if (error) throw error;

  const filas = data ?? [];

  // Una sola consulta para los dos lados de todos los partidos: el helper
  // deduplica, y una pareja aparece en varias rondas del mismo cuadro.
  const parejas = await fetchParejasPublicas(
    filas.flatMap((r) => [r.pair_a_id, r.pair_b_id]),
  );

  return filas.map((row) => ({
    id: row.id,
    stage: row.stage as BracketStage,
    roundLabel: row.round_label,
    status: row.status as MatchStatus,
    pairAId: row.pair_a_id,
    pairBId: row.pair_b_id,
    // null, no '—': un hueco del cuadro sin rival asignado todavía NO es lo
    // mismo que un nombre que no se pudo resolver, y MatchCard los pinta
    // distinto (`isPending` mira los ids).
    pairAName: row.pair_a_id ? nombreDePareja(parejas.get(row.pair_a_id)) : null,
    pairBName: row.pair_b_id ? nombreDePareja(parejas.get(row.pair_b_id)) : null,
    winnerPairId: row.winner_pair_id,
    scheduledAt: row.scheduled_at,
  }));
}

// ───────────────────────────────────────────
// Sub-componente: tarjeta de partido
// ───────────────────────────────────────────

function MatchCard({
  match,
  currentUserId,
}: {
  match: BracketMatch;
  currentUserId?: string;
}) {
  const isLive = match.status === 'in_progress';
  const isDone = match.status === 'finished';
  const isPending = !match.pairAId || !match.pairBId;

  const pairAWon = isDone && match.winnerPairId === match.pairAId;
  const pairBWon = isDone && match.winnerPairId === match.pairBId;

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: isLive ? color.gold : color.lineSoft,
        width: 180,
        overflow: 'hidden',
      }}
    >
      {/* Barra de acento si está en vivo */}
      {isLive && (
        <View style={{ height: 2.5, backgroundColor: color.gold }} />
      )}

      {/* Pareja A */}
      <View
        style={{
          padding: 10,
          borderBottomWidth: 1,
          borderBottomColor: color.lineSoft,
          backgroundColor: pairAWon ? 'rgba(212,175,55,0.08)' : 'transparent',
        }}
      >
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 11,
            fontWeight: pairAWon ? '600' : '400',
            color: pairAWon ? color.goldBright : isPending && !match.pairAId ? color.muted : color.text,
          }}
          numberOfLines={2}
        >
          {match.pairAName ?? '(Por definir)'}
          {pairAWon ? ' 🏆' : ''}
        </Text>
      </View>

      {/* Pareja B */}
      <View
        style={{
          padding: 10,
          backgroundColor: pairBWon ? 'rgba(212,175,55,0.08)' : 'transparent',
        }}
      >
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 11,
            fontWeight: pairBWon ? '600' : '400',
            color: pairBWon ? color.goldBright : isPending && !match.pairBId ? color.muted : color.text,
          }}
          numberOfLines={2}
        >
          {match.pairBName ?? '(Por definir)'}
          {pairBWon ? ' 🏆' : ''}
        </Text>
      </View>

      {/* Footer: hora o estado */}
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderTopWidth: 1,
          borderTopColor: color.lineSoft,
          backgroundColor: color.surface2,
        }}
      >
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 9,
            color: isLive ? color.live : isDone ? color.muted : color.alive,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          {isLive
            ? '🟢 En vivo'
            : isDone
            ? '✓ Finalizado'
            : match.scheduledAt
            ? new Date(match.scheduledAt).toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Por programar'}
        </Text>
      </View>
    </View>
  );
}

// ───────────────────────────────────────────
// Componente principal
// ───────────────────────────────────────────

export default function LiveBracket({ categoryId, currentUserId }: LiveBracketProps) {
  const [matchesByStage, setMatchesByStage] = useState<
    Partial<Record<BracketStage, BracketMatch[]>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const all = await fetchBracketMatches(categoryId);

      // Agrupar por stage
      const grouped: Partial<Record<BracketStage, BracketMatch[]>> = {};
      for (const m of all) {
        if (!grouped[m.stage]) grouped[m.stage] = [];
        grouped[m.stage]!.push(m);
      }
      setMatchesByStage(grouped);
    } catch (e) {
      setError('No se pudo cargar el cuadro.');
      console.error('[LiveBracket] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    load();

    const unsub = subscribeToTable<Record<string, unknown>>({
      channelName: categoryChannel(categoryId),
      table: 'matches',
      filter: `category_id=eq.${categoryId}`,
      onData: () => load(),
      onError: (e) => console.warn('[LiveBracket] realtime error:', e),
    });

    return unsub;
  }, [categoryId, load]);

  if (loading) {
    return (
      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: 16, alignItems: 'center' }}>
        <Text style={{ color: color.danger, fontFamily: font.body, fontSize: 13 }}>{error}</Text>
      </View>
    );
  }

  const activeStages = STAGE_ORDER.filter((s) => (matchesByStage[s]?.length ?? 0) > 0);

  if (activeStages.length === 0) {
    return (
      <View
        style={{
          backgroundColor: color.surface,
          borderRadius: radius.xl,
          padding: 20,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: color.lineSoft,
        }}
      >
        <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 13 }}>
          El cuadro eliminatorio aún no está disponible.
        </Text>
        <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 11, marginTop: 4 }}>
          Se generará al cerrar la fase de grupos.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 24, padding: 16, alignItems: 'flex-start' }}>
        {activeStages.map((stage) => (
          <View key={stage} style={{ alignItems: 'center' }}>
            {/* Label de ronda */}
            <Text
              style={{
                fontFamily: font.display,
                fontSize: 10,
                fontWeight: '500',
                color: color.champagne,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 10,
              }}
            >
              {STAGE_LABEL[stage]}
            </Text>

            {/* Tarjetas de la ronda */}
            <View style={{ gap: 12 }}>
              {(matchesByStage[stage] ?? []).map((m) => (
                <MatchCard key={m.id} match={m} currentUserId={currentUserId} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
