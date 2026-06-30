/**
 * src/components/realtime/LiveStandings.tsx
 *
 * RALLY · Tabla de posiciones EN VIVO de un grupo.
 *
 * REGLAS:
 * - Lee group_standings ya calculado por el motor 12 vía match-result.
 * - NUNCA recalcula posiciones aquí. Solo renderiza.
 * - Se actualiza sin recargar via Supabase Realtime.
 * - Colores y tipografía exclusivamente desde design-tokens.ts.
 * - Solo primitivos React Native + NativeWind. Sin div/span/button.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, Pressable } from 'react-native';
import { color, radius, font } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, groupChannel } from '@/lib/realtime/channels';

// ───────────────────────────────────────────
// Tipos locales (sin reimportar el engine)
// ───────────────────────────────────────────

type ClinchStatus = 'clinched' | 'alive' | 'eliminated';

interface StandingRow {
  id: string;
  pair_id: string;
  player1_name: string;
  player2_name: string;
  played: number;
  won: number;
  lost: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  points: number;
  position: number;
  clinch_status: ClinchStatus;
}

interface LiveStandingsProps {
  groupId: string;
  /** ID del jugador autenticado para resaltar su fila. */
  currentUserId?: string;
  /** Cuántas parejas pasan de este grupo (para línea de corte visual). */
  advanceCount?: number;
}

// ───────────────────────────────────────────
// Colores semánticos (de design-tokens.ts)
// ───────────────────────────────────────────

const CLINCH_COLORS: Record<ClinchStatus, string> = {
  clinched: color.gold,
  alive: color.alive,
  eliminated: color.danger,
};

const CLINCH_BG: Record<ClinchStatus, string> = {
  clinched: 'rgba(212,175,55,0.12)',
  alive: 'rgba(230,180,80,0.10)',
  eliminated: 'rgba(224,114,111,0.10)',
};

// ───────────────────────────────────────────
// Fetch inicial
// ───────────────────────────────────────────

async function fetchStandings(groupId: string): Promise<StandingRow[]> {
  const { data, error } = await supabase
    .from('group_standings')
    .select(
      `id, pair_id, played, won, lost,
       sets_won, sets_lost, games_won, games_lost,
       points, position, clinch_status,
       pairs:pair_id (
         player1_id,
         player2_id,
         player1:player1_id ( full_name ),
         player2:player2_id ( full_name )
       )`
    )
    .eq('group_id', groupId)
    .order('position', { ascending: true });

  if (error) throw error;

  // Cast via unknown para los embeds de Supabase
  return ((data ?? []) as unknown as Array<{
    id: string;
    pair_id: string;
    played: number;
    won: number;
    lost: number;
    sets_won: number;
    sets_lost: number;
    games_won: number;
    games_lost: number;
    points: number;
    position: number;
    clinch_status: ClinchStatus;
    pairs: {
      player1_id: string;
      player2_id: string;
      player1: { full_name: string };
      player2: { full_name: string };
    };
  }>).map((row) => ({
    id: row.id,
    pair_id: row.pair_id,
    player1_name: row.pairs?.player1?.full_name ?? '—',
    player2_name: row.pairs?.player2?.full_name ?? '—',
    played: row.played,
    won: row.won,
    lost: row.lost,
    sets_won: row.sets_won,
    sets_lost: row.sets_lost,
    games_won: row.games_won,
    games_lost: row.games_lost,
    points: row.points,
    position: row.position,
    clinch_status: row.clinch_status ?? 'alive',
  }));
}

// ───────────────────────────────────────────
// Componente
// ───────────────────────────────────────────

export default function LiveStandings({
  groupId,
  currentUserId,
  advanceCount = 2,
}: LiveStandingsProps) {
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchStandings(groupId);
      setRows(data);
    } catch (e) {
      setError('No se pudo cargar la tabla. Intenta de nuevo.');
      console.error('[LiveStandings] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();

    // Suscripción Realtime a cambios de group_standings del grupo
    const unsub = subscribeToTable<Record<string, unknown>>({
      channelName: groupChannel(groupId),
      table: 'group_standings',
      filter: `group_id=eq.${groupId}`,
      onData: () => {
        // Al recibir cualquier cambio, re-fetch completo para mantener orden y relaciones
        load();
      },
      onError: (e) => {
        console.warn('[LiveStandings] realtime error:', e);
      },
    });

    return unsub;
  }, [groupId, load]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: 16, alignItems: 'center' }}>
        <Text style={{ color: color.danger, fontFamily: font.body, fontSize: 13 }}>{error}</Text>
        <Pressable
          onPress={load}
          style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 16,
            backgroundColor: color.surface, borderRadius: radius.sm }}
          accessibilityRole="button"
          accessibilityLabel="Reintentar cargar tabla"
        >
          <Text style={{ color: color.gold, fontFamily: font.body, fontWeight: '600', fontSize: 13 }}>
            Reintentar
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: color.lineSoft,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: color.lineSoft,
        }}
      >
        <Text style={[styles.headerCell, { flex: 0.35 }]}>#</Text>
        <Text style={[styles.headerCell, { flex: 2 }]}>PAREJA</Text>
        <Text style={[styles.headerCell, { flex: 0.5, textAlign: 'center' }]}>PJ</Text>
        <Text style={[styles.headerCell, { flex: 0.5, textAlign: 'center' }]}>G</Text>
        <Text style={[styles.headerCell, { flex: 0.5, textAlign: 'center' }]}>P</Text>
        <Text style={[styles.headerCell, { flex: 0.6, textAlign: 'center' }]}>SETS</Text>
        <Text style={[styles.headerCell, { flex: 0.7, textAlign: 'right' }]}>PTS</Text>
      </View>

      {/* Filas */}
      {rows.map((row, idx) => {
        const isMe = currentUserId
          ? row.player1_name !== '—' // placeholder — en componente real, cotejar pair_id con pairs del usuario
          : false;
        const isCutoff = idx === advanceCount - 1;
        const clinchColor = CLINCH_COLORS[row.clinch_status];
        const clinchBg = CLINCH_BG[row.clinch_status];
        const setDiff = row.sets_won - row.sets_lost;

        return (
          <React.Fragment key={row.id}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: isMe ? 'rgba(212,175,55,0.07)' : 'transparent',
              }}
            >
              {/* Posición */}
              <View style={{ flex: 0.35, alignItems: 'flex-start' }}>
                <Text
                  style={{
                    fontFamily: font.display,
                    fontSize: 16,
                    fontWeight: '600',
                    color: row.position <= advanceCount ? color.gold : color.muted,
                  }}
                >
                  {row.position}
                </Text>
              </View>

              {/* Pareja + badge clinch */}
              <View style={{ flex: 2 }}>
                <Text
                  style={{
                    fontFamily: font.body,
                    fontSize: 12,
                    fontWeight: '600',
                    color: color.text,
                  }}
                  numberOfLines={1}
                >
                  {row.player1_name} / {row.player2_name}
                </Text>
                {/* Badge de clinch */}
                <View
                  style={{
                    marginTop: 3,
                    alignSelf: 'flex-start',
                    backgroundColor: clinchBg,
                    borderRadius: radius.pill,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.display,
                      fontSize: 9,
                      fontWeight: '500',
                      color: clinchColor,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    {row.clinch_status === 'clinched'
                      ? '✓ Clasificado'
                      : row.clinch_status === 'eliminated'
                      ? 'Eliminado'
                      : 'En juego'}
                  </Text>
                </View>
              </View>

              {/* PJ */}
              <Text style={[styles.dataCell, { flex: 0.5, textAlign: 'center' }]}>
                {row.played}
              </Text>
              {/* G */}
              <Text style={[styles.dataCell, { flex: 0.5, textAlign: 'center', color: color.live }]}>
                {row.won}
              </Text>
              {/* P */}
              <Text style={[styles.dataCell, { flex: 0.5, textAlign: 'center', color: color.danger }]}>
                {row.lost}
              </Text>
              {/* SETS diff */}
              <Text
                style={[
                  styles.dataCell,
                  {
                    flex: 0.6,
                    textAlign: 'center',
                    color: setDiff > 0 ? color.live : setDiff < 0 ? color.danger : color.muted,
                  },
                ]}
              >
                {setDiff > 0 ? `+${setDiff}` : setDiff}
              </Text>
              {/* PTS */}
              <Text
                style={[
                  styles.dataCell,
                  {
                    flex: 0.7,
                    textAlign: 'right',
                    fontFamily: font.display,
                    fontSize: 16,
                    fontWeight: '600',
                    color: color.goldBright,
                  },
                ]}
              >
                {row.points}
              </Text>
            </View>

            {/* Línea de corte visual después de la última pareja que clasifica */}
            {isCutoff && idx < rows.length - 1 && (
              <View
                style={{
                  height: 1.5,
                  backgroundColor: color.gold,
                  opacity: 0.35,
                  marginHorizontal: 14,
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {rows.length === 0 && (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 12 }}>
            Sin partidos jugados aún.
          </Text>
        </View>
      )}
    </View>
  );
}

// ───────────────────────────────────────────
// Estilos internos (sin StyleSheet — NativeWind inline)
// ───────────────────────────────────────────

const styles = {
  headerCell: {
    fontFamily: font.display as string,
    fontSize: 10,
    fontWeight: '500' as const,
    color: color.champagne,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  dataCell: {
    fontFamily: font.body as string,
    fontSize: 12,
    fontWeight: '500' as const,
    color: color.text,
  },
};
