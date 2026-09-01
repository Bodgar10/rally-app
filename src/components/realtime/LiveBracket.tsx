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
import { horaDeTorneo } from '@/lib/fechas';
import {
  ORDEN_ETAPAS,
  ETIQUETA_ETAPA,
  agruparPorEtapa,
  etapasActivas,
  estaPendiente,
  textoPendiente,
  type EtapaCuadro,
} from './bracket-layout';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

type MatchStatus = 'scheduled' | 'in_progress' | 'finished';

type BracketStage = EtapaCuadro;

export interface BracketMatch {
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
  /** 'Cancha 3'. Opcional: el cuadro del jugador no lo trae. */
  courtLabel?: string | null;
}

interface LiveBracketProps {
  categoryId: string;
  /** ID del usuario autenticado para resaltar su bracket. */
  currentUserId?: string;
  /**
   * Partidos ya resueltos por quien llama. Si se pasa, el componente NO
   * consulta la base ni se suscribe a Realtime: pinta lo que le den.
   *
   * Existe para el calendario del organizador, que necesita mezclar `matches`
   * (las rondas ya materializadas) con `match_schedule` (las que todavía no
   * tienen fila, porque el cuadro se genera ronda a ronda). Ese cruce no lo
   * puede hacer una consulta por category_id.
   *
   * Sin la prop, el comportamiento es exactamente el de siempre — es la rama
   * que usa la pantalla del jugador.
   */
  partidos?: BracketMatch[];
  /** Mensaje cuando no hay nada que pintar. */
  vacio?: string;
}

// ───────────────────────────────────────────
// Orden de rondas
// ───────────────────────────────────────────

// El orden, las etiquetas y el criterio de "pendiente" viven en
// bracket-layout.ts: es la parte testeable, y el proyecto no puede montar
// tests de render. Aquí solo se reexportan los nombres que ya usaba el archivo.
const STAGE_ORDER = ORDEN_ETAPAS;
const STAGE_LABEL = ETIQUETA_ETAPA;

// ───────────────────────────────────────────
// Fetch
// ───────────────────────────────────────────

async function fetchBracketMatches(categoryId: string): Promise<BracketMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    // Sin embed de `pairs → users`: users_select_own solo deja leer la propia
    // fila, así que devolvía null para todos los rivales. Los nombres van por
    // bracket_pairs_public. Ver src/lib/parejas-publicas.ts.
    // `court_label` no se pedía y por eso el cuadro solo decía la hora: el
    // campo existe en `matches` desde siempre y `BracketMatch` ya lo tenía
    // declarado, pero nadie lo traía. En un torneo con ocho canchas, saber a
    // qué hora juegas sin saber dónde no sirve de mucho.
    .select(
      `id, stage, round_label, status, pair_a_id, pair_b_id, winner_pair_id, scheduled_at, court_label`
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
    courtLabel: row.court_label,
  }));
}

// ───────────────────────────────────────────
// Cuándo y dónde
// ───────────────────────────────────────────

/**
 * La línea de estado de una tarjeta: "14:00 · Cancha 3".
 *
 * Iban en DOS líneas —la hora arriba, la cancha debajo en 9px— y la cancha ni
 * siquiera llegaba, porque la consulta no la pedía. Juntas y con el mismo
 * separador que las tarjetas de la fase de grupos: es el mismo dato en la misma
 * app, y leerlo de dos formas distintas obliga a aprenderlo dos veces.
 *
 * La hora sale de `horaDeTorneo`, NUNCA de `toLocaleTimeString`: los
 * `scheduled_at` son timestamptz y el navegador del jugador puede estar en otra
 * zona que el club. Sin eso, el mismo partido se anuncia a horas distintas
 * según quién mire.
 *
 * TERMINADO NO LLEVA CANCHA. Ya se jugó: dónde fue no le sirve a nadie y le
 * quita sitio al resultado. En vivo SÍ, que es justo cuando alguien la busca.
 */
function cuandoYDonde(match: BracketMatch, isLive: boolean, isDone: boolean): string {
  if (isDone) return '✓ Finalizado';

  const cuando = isLive
    ? '🟢 En vivo'
    : match.scheduledAt
      ? horaDeTorneo(match.scheduledAt)
      : 'Por programar';

  return match.courtLabel ? `${cuando} · ${match.courtLabel}` : cuando;
}

// ───────────────────────────────────────────
// Sub-componente: tarjeta de partido
// ───────────────────────────────────────────

function MatchCard({
  match,
  currentUserId,
  primeraRonda = false,
}: {
  primeraRonda?: boolean;
  match: BracketMatch;
  currentUserId?: string;
}) {
  const isLive = match.status === 'in_progress';
  const isDone = match.status === 'finished';
  const isPending = estaPendiente(match);
  // "(Por definir)" no explicaba nada. Ahora dice de donde saldra la pareja:
  // la primera ronda se alimenta de los grupos, las demas de la anterior.
  const pendiente = textoPendiente(match.stage, primeraRonda);

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
          {match.pairAName ?? pendiente}
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
          {match.pairBName ?? pendiente}
          {pairBWon ? ' 🏆' : ''}
        </Text>
      </View>

      {/* Footer: hora o estado, y la cancha si se sabe */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
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
          {cuandoYDonde(match, isLive, isDone)}
        </Text>
      </View>
    </View>
  );
}

// ───────────────────────────────────────────
// Componente principal
// ───────────────────────────────────────────

export default function LiveBracket({
  categoryId, currentUserId, partidos, vacio,
}: LiveBracketProps) {
  const inyectado = partidos !== undefined;

  const [matchesByStage, setMatchesByStage] = useState<
    Partial<Record<BracketStage, BracketMatch[]>>
  >({});
  const [loading, setLoading] = useState(!inyectado);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const all = await fetchBracketMatches(categoryId);
      setMatchesByStage(agruparPorEtapa(all));
    } catch (e) {
      setError('No se pudo cargar el cuadro.');
      console.error('[LiveBracket] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    // Con partidos inyectados no se consulta ni se suscribe: los datos son de
    // quien llama, y abrir un canal por categoría en una vista con ocho tabs
    // costaría ocho suscripciones para nada.
    if (inyectado) return;

    load();

    const unsub = subscribeToTable<Record<string, unknown>>({
      channelName: categoryChannel(categoryId),
      table: 'matches',
      filter: `category_id=eq.${categoryId}`,
      onData: () => load(),
      onError: (e) => console.warn('[LiveBracket] realtime error:', e),
    });

    return unsub;
  }, [categoryId, load, inyectado]);

  const porEtapa = inyectado ? agruparPorEtapa(partidos!) : matchesByStage;

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

  const activeStages = etapasActivas(porEtapa);
  // La primera columna del cuadro es la que se alimenta de los grupos; las
  // demás salen de la ronda anterior. Lo necesita el texto de los pendientes.
  const primeraEtapa = activeStages[0];

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
          {vacio ?? 'El cuadro eliminatorio aún no está disponible.'}
        </Text>
        {!vacio && (
          <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 11, marginTop: 4 }}>
            Se generará al cerrar la fase de grupos.
          </Text>
        )}
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
              {(porEtapa[stage] ?? []).map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  currentUserId={currentUserId}
                  primeraRonda={stage === primeraEtapa}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
