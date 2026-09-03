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
import { fechaHoraDeTorneo } from '@/lib/fechas';

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
  /**
   * Lo que va del partido: '6-2', '6-2 3-1'. Null si no hay sets capturados.
   *
   * EL JUGADOR QUE ESTÁ JUGANDO NO VEÍA SU PROPIO MARCADOR. La tarjeta decía
   * "En curso" y nada más, con el 6-2 ya guardado en `match_sets` — el dato
   * estaba y no salía. Es de lo primero que se mira al salir de la pista.
   */
  marcador: string | null;
}

interface MyNextMatchProps {
  /** IDs de todas las parejas del usuario autenticado (en todos sus torneos activos). */
  pairIds: string[];
  /**
   * Qué pintar cuando el usuario TIENE parejas pero todavía no hay partido
   * programado. Sin esto el componente decía "No tienes partidos próximos" a
   * alguien inscrito en un torneo que empieza en días: cierto y a la vez
   * inútil. Quien lo monta sabe de qué torneo se trata, así que aporta el
   * bloque; aquí solo se sabe que no hay partido.
   */
  sinPartidoAun?: React.ReactNode;
}

// ───────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────

function formatScheduledAt(iso: string | null): string {
  // En la zona del CLUB, no en la del dispositivo: un jugador que mire la app
  // desde otro huso —o con el móvil mal configurado— tiene que leer la hora a
  // la que se juega, no la que marca su reloj.
  return fechaHoraDeTorneo(iso) || 'Por definir';
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
  /** `soyA` es de trabajo: de qué lado juega el usuario, para orientar el
      marcador. No sale a la interfaz. */
  const candidates: Array<Omit<NextMatch, 'marcador'> & { soyA: boolean }> = [];

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
      soyA: true,
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
      soyA: false,
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

  const elegido = candidates[0];

  // Los sets, solo del partido que se va a pintar: una consulta más, y solo
  // cuando hay algo que pintar. Se piden SIEMPRE y no solo si está 'in_progress'
  // porque un partido con sets y todavía en 'scheduled' —el juez anotó el
  // primer set y el estado va un paso por detrás— también tiene marcador.
  const { data: sets } = await supabase
    .from('match_sets')
    .select('set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b')
    .eq('match_id', elegido.matchId);

  return { ...elegido, marcador: marcadorParcial(sets ?? [], elegido.soyA) };
}

/**
 * '6-2' · '6-2 3-1' — lo que va del partido, no un resultado final.
 *
 * Desde el punto de vista de quien mira: su marcador primero, aunque en la base
 * su pareja sea `pair_b`. Leer "2-6" cuando vas ganando 6-2 es peor que no ver
 * nada.
 */
function marcadorParcial(
  sets: Array<{
    set_number: number; games_a: number; games_b: number;
    is_super_tiebreak: boolean; tiebreak_a: number | null; tiebreak_b: number | null;
  }>,
  soyA: boolean,
): string | null {
  if (sets.length === 0) return null;
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((st) => {
      const [x, y] = st.is_super_tiebreak && st.tiebreak_a != null && st.tiebreak_b != null
        ? [st.tiebreak_a, st.tiebreak_b]
        : [st.games_a, st.games_b];
      const par = soyA ? `${x}-${y}` : `${y}-${x}`;
      return st.is_super_tiebreak ? `[${par}]` : par;
    })
    .join(' ');
}

// ───────────────────────────────────────────
// Componente
// ───────────────────────────────────────────

export default function MyNextMatch({ pairIds, sinPartidoAun }: MyNextMatchProps) {
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

  /**
   * Y a los SETS del partido que se está pintando.
   *
   * Los canales de arriba escuchan `matches`, y anotar un set no toca esa tabla:
   * escribe en `match_sets`. Sin esto, el 6-2 aparecía al abrir la app pero el
   * segundo set no llegaba nunca — el jugador tendría que recargar justo cuando
   * está mirando el teléfono entre juegos.
   *
   * Va en su propio efecto y depende del `matchId`: montarlo con los otros
   * obligaría a cerrar y reabrir los tres canales cada vez que cambia el
   * marcador.
   */
  useEffect(() => {
    if (!match?.matchId) return;
    return subscribeToTable<Record<string, unknown>>({
      channelName: `match:${match.matchId}:sets`,
      table: 'match_sets',
      filter: `match_id=eq.${match.matchId}`,
      onData: () => load(),
    });
  }, [match?.matchId, load]);

  if (loading) {
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (!match) {
    if (sinPartidoAun) return <>{sinPartidoAun}</>;
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

      {/* EL MARCADOR DE TU PROPIO PARTIDO.
          Estaba en `match_sets` y no salía a ninguna pantalla del jugador: la
          tarjeta decía "En curso" y se callaba el 6-2. Va aquí arriba, en
          grande, porque es lo primero que se mira al salir de la pista — y
          orientado a su favor: "6-2" si va ganando, no "2-6" porque en la base
          su pareja sea `pair_b`. */}
      {match.marcador && (
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 24,
            fontWeight: '600',
            color: color.goldBright,
            marginBottom: 6,
          }}
        >
          {match.marcador}
        </Text>
      )}

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
