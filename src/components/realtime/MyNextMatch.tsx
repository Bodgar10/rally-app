/**
 * src/components/realtime/MyNextMatch.tsx
 *
 * RALLY · Próximo partido del jugador autenticado, en tiempo real.
 *
 * REGLAS:
 * - Lee `matches` filtrando por pair_ids del usuario. Solo muestra.
 * - Se actualiza sin recargar si cambia el calendario (scheduled_at).
 * - Colores y fuentes solo desde design-tokens.ts.
 * - Solo primitivos React Native. Sin div/span/button/window.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import ComoLlegar from '@/components/tournament/ComoLlegar';
import Icon from '@/components/ui/Icon';
import { color, radius, font } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, pairChannel, combineUnsubs } from '@/lib/realtime/channels';
import { fetchParejasPublicas } from '@/lib/parejas-publicas';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

interface NextMatch {
  matchId: string;
  tournamentName: string;
  categoryName: string;
  roundLabel: string | null;
  stage: string;
  scheduledAt: string | null;
  rivalPlayer1: string;
  rivalPlayer2: string;
  courtName: string | null;
  /** Sede del torneo, para el botón "Cómo llegar". Null si el torneo no tiene. */
  venue: { name: string; address: string | null; city: string | null } | null;
  status: 'scheduled' | 'in_progress' | 'finished';
}

interface MyNextMatchProps {
  /** IDs de todas las parejas del usuario autenticado (en todos sus torneos activos). */
  pairIds: string[];
}

// ───────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────

function formatScheduledAt(iso: string | null): string {
  if (!iso) return 'Por definir';
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    group: 'Fase de grupos',
    round_of_32: 'Ronda de 32',
    round_of_16: 'Octavos',
    quarter: 'Cuartos de final',
    semi: 'Semifinal',
    final: 'Final',
    third_place: '3er lugar',
  };
  return map[stage] ?? stage;
}

// ───────────────────────────────────────────
// Fetch
// ───────────────────────────────────────────

async function fetchNextMatch(pairIds: string[]): Promise<NextMatch | null> {
  if (pairIds.length === 0) return null;

  // Buscar el próximo partido NO terminado donde el usuario es pair_a o pair_b.
  // NOTA: matches no tiene court_id ni tabla courts; la cancha es court_label (texto libre).
  //
  // Los embeds de `tournaments` y `categories` SÍ se quedan: sus RLS
  // (tournaments_select, categories_select) dejan leerlos a cualquier
  // autenticado. El que se fue es el de la pareja rival, que pasaba por
  // users_select_own y devolvía null. Ver src/lib/parejas-publicas.ts.
  const { data: asA, error: errA } = await supabase
    .from('matches')
    .select(
      `id, stage, round_label, scheduled_at, status, court_label,
       pair_b_id,
       tournaments:tournament_id ( name, venues:venue_id ( name, address, city ) ),
       categories:category_id ( display_name )`
    )
    .in('pair_a_id', pairIds)
    .neq('status', 'finished')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(1);

  const { data: asB, error: errB } = await supabase
    .from('matches')
    .select(
      `id, stage, round_label, scheduled_at, status, court_label,
       pair_a_id,
       tournaments:tournament_id ( name, venues:venue_id ( name, address, city ) ),
       categories:category_id ( display_name )`
    )
    .in('pair_b_id', pairIds)
    .neq('status', 'finished')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(1);

  if (errA || errB) {
    console.error('[MyNextMatch] fetch error', errA ?? errB);
    return null;
  }

  // Elegir el más próximo entre los dos resultados
  const candidates: NextMatch[] = [];

  // Los dos rivales posibles se resuelven de una vez, antes de decidir cuál
  // de los dos partidos es el más próximo.
  const rivales = await fetchParejasPublicas([
    (asA?.[0] as { pair_b_id?: string } | undefined)?.pair_b_id,
    (asB?.[0] as { pair_a_id?: string } | undefined)?.pair_a_id,
  ]);

  if (asA && asA.length > 0) {
    const row = asA[0] as unknown as {
      id: string; stage: string; round_label: string | null;
      scheduled_at: string | null; status: string; court_label: string | null;
      pair_b_id: string | null;
      tournaments: { name: string; venues: { name: string; address: string | null; city: string | null } | null };
      categories: { display_name: string };
    };
    const rival = row.pair_b_id ? rivales.get(row.pair_b_id) : undefined;
    candidates.push({
      matchId: row.id,
      tournamentName: row.tournaments?.name ?? '—',
      categoryName: row.categories?.display_name ?? '—',
      roundLabel: row.round_label,
      stage: row.stage,
      scheduledAt: row.scheduled_at,
      rivalPlayer1: rival?.player1_name ?? '—',
      rivalPlayer2: rival?.player2_name ?? '—',
      courtName: row.court_label ?? null,
      venue: row.tournaments?.venues ?? null,
      status: row.status as NextMatch['status'],
    });
  }

  if (asB && asB.length > 0) {
    const row = asB[0] as unknown as {
      id: string; stage: string; round_label: string | null;
      scheduled_at: string | null; status: string; court_label: string | null;
      pair_a_id: string | null;
      tournaments: { name: string; venues: { name: string; address: string | null; city: string | null } | null };
      categories: { display_name: string };
    };
    const rival = row.pair_a_id ? rivales.get(row.pair_a_id) : undefined;
    candidates.push({
      matchId: row.id,
      tournamentName: row.tournaments?.name ?? '—',
      categoryName: row.categories?.display_name ?? '—',
      roundLabel: row.round_label,
      stage: row.stage,
      scheduledAt: row.scheduled_at,
      rivalPlayer1: rival?.player1_name ?? '—',
      rivalPlayer2: rival?.player2_name ?? '—',
      courtName: row.court_label ?? null,
      venue: row.tournaments?.venues ?? null,
      status: row.status as NextMatch['status'],
    });
  }

  if (candidates.length === 0) return null;

  // Ordenar por scheduled_at para elegir el más próximo
  candidates.sort((a, b) => {
    if (!a.scheduledAt) return 1;
    if (!b.scheduledAt) return -1;
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
  });

  return candidates[0];
}

// ───────────────────────────────────────────
// Componente
// ───────────────────────────────────────────

export default function MyNextMatch({ pairIds }: MyNextMatchProps) {
  const [match, setMatch] = useState<NextMatch | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const next = await fetchNextMatch(pairIds);
    setMatch(next);
    setLoading(false);
  }, [pairIds]);

  useEffect(() => {
    load();

    // Suscribir a cambios de matches para CADA pair_id del usuario
    // (Supabase Realtime no acepta filtros `in`, se requiere un canal por pareja)
    const unsubs = pairIds.map((pid) =>
      subscribeToTable<Record<string, unknown>>({
        channelName: pairChannel(pid),
        table: 'matches',
        filter: `pair_a_id=eq.${pid}`,
        onData: () => load(),
      })
    );

    // También escuchar cuando el usuario es pair_b
    // Usamos canales con sufijo diferente para evitar colisiones
    const unsubsB = pairIds.map((pid) =>
      subscribeToTable<Record<string, unknown>>({
        channelName: `${pairChannel(pid)}_b`,
        table: 'matches',
        filter: `pair_b_id=eq.${pid}`,
        onData: () => load(),
      })
    );

    return combineUnsubs(...unsubs, ...unsubsB);
  }, [pairIds, load]);

  if (loading) {
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (!match) {
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
          No tienes partidos próximos.
        </Text>
      </View>
    );
  }

  const isLive = match.status === 'in_progress';

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.xl2,
        padding: 18,
        borderWidth: 1,
        borderColor: isLive ? color.gold : color.lineSoft,
        // Barra de acento superior dorada en partidos en vivo
        overflow: 'hidden',
      }}
    >
      {/* Barra de acento superior */}
      {isLive && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: color.gold,
          }}
        />
      )}

      {/* Eyebrow */}
      <Text
        style={{
          fontFamily: font.display,
          fontSize: 10,
          fontWeight: '500',
          color: color.champagne,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginBottom: 6,
          marginTop: isLive ? 6 : 0,
        }}
      >
        {isLive ? '🟢 En curso' : 'Próximo partido'}
      </Text>

      {/* Torneo + categoría */}
      <Text
        style={{
          fontFamily: font.display,
          fontSize: 17,
          fontWeight: '600',
          color: color.text,
          marginBottom: 2,
        }}
      >
        {match.tournamentName}
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 12,
          color: color.muted,
          marginBottom: 12,
        }}
      >
        {match.categoryName} · {stageLabel(match.stage)}
        {match.roundLabel ? ` · ${match.roundLabel}` : ''}
      </Text>

      {/* Rival */}
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 11,
          color: color.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: 4,
        }}
      >
        vs
      </Text>
      <Text
        style={{
          fontFamily: font.display,
          fontSize: 15,
          fontWeight: '600',
          color: color.text,
          marginBottom: 12,
        }}
      >
        {match.rivalPlayer1} / {match.rivalPlayer2}
      </Text>

      {/* Hora + Cancha */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            backgroundColor: color.surface2,
            borderRadius: radius.sm,
            paddingHorizontal: 10,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {/* Ícono de trazo en vez de 🕐: el emoji lo dibuja cada plataforma
              con su color, así que ignoraba color.text. */}
          <Icon name="clock" size={13} color={color.text} />
          <Text style={{ fontFamily: font.body, fontSize: 12, color: color.text }}>
            {formatScheduledAt(match.scheduledAt)}
          </Text>
        </View>
        {match.courtName && (
          <View
            style={{
              backgroundColor: color.surface2,
              borderRadius: radius.sm,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Text style={{ fontFamily: font.body, fontSize: 12, color: color.text }}>
              🎾 {match.courtName}
            </Text>
          </View>
        )}

        {/* El momento de verdad: "juego en 40 min, ¿dónde es?" */}
        <ComoLlegar venue={match.venue} variant="compact" />
      </View>
    </View>
  );
}
