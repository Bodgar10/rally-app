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
import { RankingBadge } from '@/components/tournament/RankingBadge';
import { color, radius, font } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, pairChannel, combineUnsubs } from '@/lib/realtime/channels';
import { fetchParejasPublicas } from '@/lib/parejas-publicas';
import { fechaHoraDeTorneo } from '@/lib/fechas';
import {
  puntosGarantizados, rondaMasLejanaAlcanzada,
  type PuntosGarantizados, type EstadoParaPuntos,
} from '@/lib/puntos-garantizados';
import { fetchCabezaDeSerie } from '@/lib/cabeza-de-serie';
import type { Tier } from '@/lib/engine/ranking-points';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

/**
 * Qué cabeza de serie es la pareja rival en su categoría (suma de puntos de
 * ranking de sus dos jugadores, ver `@/lib/cabeza-de-serie`) y la posición
 * individual de cada uno. `null` en `jugador*Posicion` cuando ese jugador no
 * tiene fila en `ranking_public` — no es un "#—", es no tener número.
 */
interface RankingRival {
  cabezaDeSerie: number;
  jugador1Posicion: number | null;
  jugador2Posicion: number | null;
}

interface NextMatch {
  matchId: string;
  tournamentName: string;
  categoryName: string;
  stage: string;
  scheduledAt: string | null;
  rivalPlayer1: string;
  rivalPlayer2: string;
  /**
   * IDs de los dos jugadores rivales. `''` cuando no se pudo resolver la
   * pareja rival (mismo caso en que `rivalPlayer1`/`rivalPlayer2` caen a
   * '—'). Vienen de `bracket_pairs_public` vía `fetchParejasPublicas`, que
   * ya los trae — antes se descartaban al copiar solo los nombres.
   */
  rivalPlayer1Id: string;
  rivalPlayer2Id: string;
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
  /**
   * Puntos de ranking garantizados con este torneo hasta ahora, y lo que
   * sumaría si gana este partido. `null` si falta algún dato para
   * calcularlo (ver `@/lib/puntos-garantizados`) — ahí no se pinta nada.
   */
  puntos: PuntosGarantizados | null;
  /**
   * Cabeza de serie del rival y posición individual de sus dos jugadores.
   * `null` cuando `fetchCabezaDeSerie` no pudo calcular un orden real (sin
   * rival conocido, o toda la categoría empatada en 0 puntos — el caso de
   * hoy, con `ranking_points` vacía) — ahí no se pinta nada.
   */
  rankingRival: RankingRival | null;
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
  // Un stage que no conocemos NO se pinta crudo: preferimos decir menos a
  // enseñarle 'round_of_64' a alguien. Quien llama omite la parte vacía.
  return map[stage] ?? '';
}

/** "Luis Flores #3" · sin posición, solo "Luis Flores". Nunca un "#—". */
function nombreConPosicion(nombre: string, posicion: number | null): string {
  return posicion !== null ? `${nombre} #${posicion}` : nombre;
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
  //
  // `category_id`, `pair_a_id`/`pair_b_id` (los dos, no solo el rival) y el
  // `tier` del torneo se agregan para poder calcular los puntos de ranking
  // garantizados (ver `@/lib/puntos-garantizados`) sin otra consulta aparte
  // por el torneo.
  const { data: asA, error: errA } = await supabase
    .from('matches')
    .select(
      `id, stage, scheduled_at, status, court_label, category_id,
       pair_a_id, pair_b_id,
       tournaments:tournament_id ( name, tier, venues:venue_id ( name, address, city ) ),
       categories:category_id ( display_name )`
    )
    .in('pair_a_id', pairIds)
    .neq('status', 'finished')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(1);

  const { data: asB, error: errB } = await supabase
    .from('matches')
    .select(
      `id, stage, scheduled_at, status, court_label, category_id,
       pair_a_id, pair_b_id,
       tournaments:tournament_id ( name, tier, venues:venue_id ( name, address, city ) ),
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
  /** `soyA`, `categoryId`, `miPairId` y `rivalPairId` son de trabajo: para
      orientar el marcador y calcular los puntos garantizados y la cabeza de
      serie del rival. No salen a la interfaz. */
  const candidates: Array<
    Omit<NextMatch, 'marcador' | 'puntos' | 'rankingRival'> & {
      soyA: boolean; categoryId: string; miPairId: string; rivalPairId: string | null; tier: string | null;
    }
  > = [];

  // Los dos rivales posibles se resuelven de una vez, antes de decidir cuál
  // de los dos partidos es el más próximo.
  const rivales = await fetchParejasPublicas([
    (asA?.[0] as { pair_b_id?: string } | undefined)?.pair_b_id,
    (asB?.[0] as { pair_a_id?: string } | undefined)?.pair_a_id,
  ]);

  if (asA && asA.length > 0) {
    const row = asA[0] as unknown as {
      id: string; stage: string; category_id: string;
      scheduled_at: string | null; status: string; court_label: string | null;
      pair_a_id: string | null; pair_b_id: string | null;
      tournaments: { name: string; tier: string | null; venues: { name: string; address: string | null; city: string | null } | null };
      categories: { display_name: string };
    };
    const rival = row.pair_b_id ? rivales.get(row.pair_b_id) : undefined;
    if (row.pair_a_id) {
      candidates.push({
        soyA: true,
        categoryId: row.category_id,
        miPairId: row.pair_a_id,
        rivalPairId: row.pair_b_id,
        tier: row.tournaments?.tier ?? null,
        matchId: row.id,
        tournamentName: row.tournaments?.name ?? '—',
        categoryName: row.categories?.display_name ?? '—',
        stage: row.stage,
        scheduledAt: row.scheduled_at,
        rivalPlayer1: rival?.player1_name ?? '—',
        rivalPlayer2: rival?.player2_name ?? '—',
        rivalPlayer1Id: rival?.player1_id ?? '',
        rivalPlayer2Id: rival?.player2_id ?? '',
        courtName: row.court_label ?? null,
        venue: row.tournaments?.venues ?? null,
        status: row.status as NextMatch['status'],
      });
    }
  }

  if (asB && asB.length > 0) {
    const row = asB[0] as unknown as {
      id: string; stage: string; category_id: string;
      scheduled_at: string | null; status: string; court_label: string | null;
      pair_a_id: string | null; pair_b_id: string | null;
      tournaments: { name: string; tier: string | null; venues: { name: string; address: string | null; city: string | null } | null };
      categories: { display_name: string };
    };
    const rival = row.pair_a_id ? rivales.get(row.pair_a_id) : undefined;
    if (row.pair_b_id) {
      candidates.push({
        soyA: false,
        categoryId: row.category_id,
        miPairId: row.pair_b_id,
        rivalPairId: row.pair_a_id,
        tier: row.tournaments?.tier ?? null,
        matchId: row.id,
        tournamentName: row.tournaments?.name ?? '—',
        categoryName: row.categories?.display_name ?? '—',
        stage: row.stage,
        scheduledAt: row.scheduled_at,
        rivalPlayer1: rival?.player1_name ?? '—',
        rivalPlayer2: rival?.player2_name ?? '—',
        rivalPlayer1Id: rival?.player1_id ?? '',
        rivalPlayer2Id: rival?.player2_id ?? '',
        courtName: row.court_label ?? null,
        venue: row.tournaments?.venues ?? null,
        status: row.status as NextMatch['status'],
      });
    }
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
  //
  // La cabeza de serie es de la CATEGORÍA (todas sus parejas), no solo del
  // rival: se pide una vez y se busca la fila del rival adentro. Sin rival
  // conocido (bye, o la vista no resolvió la pareja) no hay nada que pedir.
  const [{ data: sets }, estado, ordenPorPuntos] = await Promise.all([
    supabase
      .from('match_sets')
      .select('set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b')
      .eq('match_id', elegido.matchId),
    fetchEstadoParaPuntos({
      categoryId: elegido.categoryId,
      miPairId: elegido.miPairId,
      tier: elegido.tier,
      proximoStage: elegido.stage,
    }),
    elegido.rivalPairId ? fetchCabezaDeSerie(elegido.categoryId) : Promise.resolve(null),
  ]);

  const rivalOrdenado = elegido.rivalPairId
    ? (ordenPorPuntos ?? []).find((p) => p.pairId === elegido.rivalPairId) ?? null
    : null;

  return {
    ...elegido,
    marcador: marcadorParcial(sets ?? [], elegido.soyA),
    puntos: puntosGarantizados(estado),
    rankingRival: rivalOrdenado
      ? {
          cabezaDeSerie: rivalOrdenado.cabezaDeSerie,
          // `jugador1`/`jugador2` de `fetchCabezaDeSerie` salen de
          // `pairs.player1_id`/`player2_id` — las mismas columnas que
          // `bracket_pairs_public.player1_id`/`player2_id`, o sea las mismas
          // que `rivalPlayer1Id`/`rivalPlayer2Id`. No hace falta emparejar
          // por id: el orden ya coincide.
          jugador1Posicion: rivalOrdenado.jugador1.posicion,
          jugador2Posicion: rivalOrdenado.jugador2.posicion,
        }
      : null,
  };
}

/**
 * Reúne el estado de la pareja que necesita `puntosGarantizados`: victorias
 * de grupo (de `group_standings.won`, ya calculado por el motor de
 * resultados) y, si el próximo partido es de cuadro, la ronda más lejana ya
 * asegurada (de sus partidos de cuadro ya resueltos). En fase de grupos no
 * hace falta esa segunda consulta: `qualified` es `false` y `furthestRound`
 * es `'none'` porque todavía no se llegó al cuadro.
 */
async function fetchEstadoParaPuntos(args: {
  categoryId: string;
  miPairId: string;
  tier: string | null;
  proximoStage: string;
}): Promise<EstadoParaPuntos> {
  const { categoryId, miPairId, tier, proximoStage } = args;
  const enCuadro = proximoStage !== 'group';

  const [{ count: parejasEnCategoria }, { data: standing }, previos] = await Promise.all([
    supabase.from('pairs').select('*', { count: 'exact', head: true }).eq('category_id', categoryId),
    supabase.from('group_standings').select('won').eq('pair_id', miPairId).maybeSingle(),
    enCuadro
      ? supabase
          .from('matches')
          .select('stage')
          .eq('category_id', categoryId)
          .neq('stage', 'group')
          .eq('status', 'finished')
          .not('winner_pair_id', 'is', null)
          .or(`pair_a_id.eq.${miPairId},pair_b_id.eq.${miPairId}`)
      : Promise.resolve({ data: null }),
  ]);

  return {
    tier: tier as Tier | null,
    parejasEnCategoria: parejasEnCategoria ?? null,
    groupWins: standing?.won ?? null,
    qualified: enCuadro,
    furthestRound: enCuadro
      ? rondaMasLejanaAlcanzada((previos.data ?? []).map((m) => m.stage))
      : 'none',
    proximoStage,
  };
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
    // Coma y no espacio: "6-2, 3-1" separa los sets de un vistazo, y con el
    // set en curso al final la lista ya no son solo resultados cerrados.
    .join(', ');
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
        {/* SIN `round_label`. Es un identificador nuestro —"round_of_16-02-03"—
            con zero-padding para poder ordenar el cuadro, y no significa nada
            para el jugador: con la categoría y la ronda ya sabe qué partido es.
            Se quitó también del tipo, porque el dato que sigue ahí es el que
            vuelve a colarse. */}
        {match.categoryName}
        {stageLabel(match.stage) ? ` · ${stageLabel(match.stage)}` : ''}
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

      {/* Quién es el rival según el ranking. Solo cuando `fetchCabezaDeSerie`
          pudo calcular un orden real para la categoría — ver
          `@/lib/cabeza-de-serie`. Hoy, con `ranking_points` vacía, no
          calcula nada y esto no se pinta: aparece solo cuando haya datos. */}
      {match.rankingRival && (
        <View style={{ marginBottom: 12, gap: 4 }}>
          <RankingBadge variant="seed" value={match.rankingRival.cabezaDeSerie} compact />
          <Text style={{ fontFamily: font.body, fontSize: 12, color: color.muted }}>
            {nombreConPosicion(match.rivalPlayer1, match.rankingRival.jugador1Posicion)}
            {' · '}
            {nombreConPosicion(match.rivalPlayer2, match.rankingRival.jugador2Posicion)}
          </Text>
        </View>
      )}

      {/* Puntos de ranking en juego. Solo cuando `puntosGarantizados` pudo
          calcularlos con datos reales — ver `@/lib/puntos-garantizados`.
          Sin partido de por medio no hay nada que proyectar, y un número
          aproximado sería peor que no decir nada. */}
      {match.puntos && (
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 12,
            fontWeight: '600',
            color: color.goldBright,
            marginBottom: 12,
          }}
        >
          {match.stage === 'group'
            ? `Ganar este partido: +${match.puntos.siGanan - match.puntos.garantizados} pts de ranking`
            : `Tienes ${match.puntos.garantizados.toLocaleString()} pts garantizados · Si ganan: ${match.puntos.siGanan.toLocaleString()}`}
        </Text>
      )}

      {/* Hora · Cancha · Cómo llegar.
          `flexWrap` y gap más corto: las tres píldoras no caben en los 354px de
          un iPhone y la tercera —"Cómo llegar", que es la accionable— quedaba
          cortada por el borde. Con wrap baja a una segunda línea entera en vez
          de mostrarse a medias.

          `flexShrink: 0` en las píldoras a propósito: con wrap lo correcto es
          que bajen ENTERAS a la segunda línea, no que se compriman hasta
          recortar la hora. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <View
          style={{
            backgroundColor: color.surface2,
            borderRadius: radius.sm,
            paddingHorizontal: 10,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
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
              flexShrink: 0,
            }}
          >
            <Text style={{ fontFamily: font.body, fontSize: 12, color: color.text }} numberOfLines={1}>
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
