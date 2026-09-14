/**
 * src/components/realtime/MyNextMatch.tsx
 *
 * RALLY · Próximo partido del jugador autenticado, en tiempo real.
 *
 * LA TARJETA CRECE CON LA RONDA
 *   Es la que el jugador mira durante horas, y la que tiene delante mientras
 *   espera su final — así que es la que más necesitaba escalar. Usa la MISMA
 *   escala de cuatro niveles que `YaEstasEnLaSiguiente`, definida una sola vez
 *   en `@/lib/escala-de-ronda`: si las dos no escalaran igual, el jugador vería
 *   su final tratada como algo grande los diez minutos que dura la otra tarjeta
 *   y como un partido cualquiera el resto del día.
 *
 *   Lo que crece es el TITULAR: a partir de cuartos la ronda sale de la línea
 *   gris de la categoría y pasa a ser la palabra grande de la tarjeta. La hora,
 *   la cancha, el rival y el marcador no escalan ni se mueven: son el dato que
 *   hace levantarse a alguien de la cama.
 *
 *   La fase de grupos se queda en el nivel 1 y se ve exactamente como siempre.
 *
 * REGLAS:
 * - Lee `matches` filtrando por pair_ids del usuario. Solo muestra.
 * - Se actualiza sin recargar si cambia el calendario (scheduled_at).
 * - Colores y fuentes solo desde design-tokens.ts.
 * - Solo primitivos React Native. Sin div/span/button/window.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ComoLlegar from '@/components/tournament/ComoLlegar';
import Icon from '@/components/ui/Icon';
import { RankingBadge } from '@/components/tournament/RankingBadge';
import { color, radius, font, fontSize, gradient, space } from '@/lib/design-tokens';
import { tratoDeRonda } from '@/lib/escala-de-ronda';
import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, pairChannel, combineUnsubs } from '@/lib/realtime/channels';
import { fetchParejasPublicas } from '@/lib/parejas-publicas';
import { fechaHoraDeTorneo } from '@/lib/fechas';
import { elegirProximo, momentoDelPartido, type MomentoDelPartido } from '@/lib/proximo-partido';
import { fetchPuntosDelPartido } from '@/lib/puntos-de-la-ronda';
import type { PuntosGarantizados } from '@/lib/puntos-garantizados';
import { fetchCabezaDeSerie } from '@/lib/cabeza-de-serie';

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

export interface NextMatch {
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
   * En qué momento está respecto del reloj. Ver `@/lib/proximo-partido`.
   *
   * EL RÓTULO NO PUEDE MENTIR. Una semifinal del domingo a las 23:00, sin
   * capturar, se pintaba el miércoles bajo "Próximo partido". Con el día ya
   * cambiado eso deja de ser un próximo partido y pasa a ser uno pendiente, y
   * decirlo es todo lo que hace falta: nada de cuentas atrás ni de "lleva 3
   * días de retraso", que envejecen mal y dejan de creerse en cuanto fallan
   * una vez.
   */
  momento: MomentoDelPartido;
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
  //
  // Y SIEMPRE CON SU DÍA: 'dom, 13 sept, 08:00', nunca '08:00' a secas ni
  // "faltan 3 horas". En un torneo de tres días una hora suelta no identifica
  // nada, y una cuenta atrás envejece con cada partido que se corre.
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
  // SIN `.limit(1)`. Antes se pedía UN partido por lado, el más antiguo por
  // hora — y el más antiguo no es el más próximo. Un jugador con su semifinal
  // ya nacida y un partido del viernes sin capturar veía el del viernes, porque
  // la base ya había descartado el otro antes de que nadie pudiera compararlos.
  // La elección se hace aquí, con el reloj delante: ver `@/lib/proximo-partido`.
  //
  // El tope de 20 es solo un cinturón: nadie juega tantos partidos a la vez.
  const columnas =
    `id, stage, scheduled_at, status, court_label, category_id,
     pair_a_id, pair_b_id,
     tournaments:tournament_id ( name, tier, venues:venue_id ( name, address, city ) ),
     categories:category_id ( display_name )`;

  const [{ data: asA, error: errA }, { data: asB, error: errB }] = await Promise.all([
    supabase.from('matches').select(columnas)
      .in('pair_a_id', pairIds)
      .neq('status', 'finished')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(20),
    supabase.from('matches').select(columnas)
      .in('pair_b_id', pairIds)
      .neq('status', 'finished')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(20),
  ]);

  if (errA || errB) {
    console.error('[MyNextMatch] fetch error', errA ?? errB);
    return null;
  }

  /** Una fila de `matches` con sus dos embeds. */
  type Fila = {
    id: string; stage: string; category_id: string;
    scheduled_at: string | null; status: string; court_label: string | null;
    pair_a_id: string | null; pair_b_id: string | null;
    tournaments: { name: string; tier: string | null; venues: { name: string; address: string | null; city: string | null } | null };
    categories: { display_name: string };
  };

  /** `soyA` orienta el marcador; el resto alimenta puntos y cabeza de serie. */
  const candidatos = [
    ...((asA ?? []) as unknown as Fila[]).map((row) => ({ row, soyA: true })),
    ...((asB ?? []) as unknown as Fila[]).map((row) => ({ row, soyA: false })),
  ]
    // Sin el `pair_id` de su propio lado la fila no es suya de verdad.
    .filter(({ row, soyA }) => (soyA ? row.pair_a_id : row.pair_b_id) !== null)
    .map(({ row, soyA }) => ({
      row,
      soyA,
      scheduledAt: row.scheduled_at,
      status: row.status,
    }));

  const elegido = elegirProximo(candidatos);
  if (!elegido) return null;

  const row = elegido.row;
  const miPairId = (elegido.soyA ? row.pair_a_id : row.pair_b_id) as string;
  const rivalPairId = elegido.soyA ? row.pair_b_id : row.pair_a_id;

  // LOS NOMBRES, SOLO DEL ELEGIDO. Antes se resolvían los dos rivales posibles
  // antes de decidir; ahora se decide primero y se pide uno.
  const rival = rivalPairId
    ? (await fetchParejasPublicas([rivalPairId])).get(rivalPairId)
    : undefined;

  const base = {
    soyA: elegido.soyA,
    categoryId: row.category_id,
    miPairId,
    rivalPairId,
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
    // En qué momento está respecto del reloj. Decide el rótulo: un partido de
    // otro día sin resultado no es "Próximo partido".
    momento: momentoDelPartido({ scheduledAt: row.scheduled_at, status: row.status }),
  };

  // Los sets, solo del partido que se va a pintar: una consulta más, y solo
  // cuando hay algo que pintar. Se piden SIEMPRE y no solo si está 'in_progress'
  // porque un partido con sets y todavía en 'scheduled' —el juez anotó el
  // primer set y el estado va un paso por detrás— también tiene marcador.
  //
  // La cabeza de serie es de la CATEGORÍA (todas sus parejas), no solo del
  // rival: se pide una vez y se busca la fila del rival adentro. Sin rival
  // conocido (bye, o la vista no resolvió la pareja) no hay nada que pedir.
  const [{ data: sets }, puntos, ordenPorPuntos] = await Promise.all([
    supabase
      .from('match_sets')
      .select('set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b')
      .eq('match_id', base.matchId),
    // LOS PUNTOS, DE LA MISMA CUENTA QUE `YaEstasEnLaSiguiente`.
    // Antes esto tenía su propia versión y le salía otro número para el mismo
    // jugador: ver `@/lib/puntos-de-la-ronda`.
    fetchPuntosDelPartido({
      categoryId: base.categoryId,
      miPairId: base.miPairId,
      stage: base.stage,
      tier: base.tier,
    }),
    base.rivalPairId ? fetchCabezaDeSerie(base.categoryId) : Promise.resolve(null),
  ]);

  const rivalOrdenado = base.rivalPairId
    ? (ordenPorPuntos ?? []).find((p) => p.pairId === base.rivalPairId) ?? null
    : null;

  return {
    ...base,
    marcador: marcadorParcial(sets ?? [], base.soyA),
    puntos,
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

  return <TarjetaProximoPartido match={match} />;
}

// ───────────────────────────────────────────
// La tarjeta
// ───────────────────────────────────────────

/**
 * Solo presentación: recibe el partido ya resuelto y lo pinta.
 *
 * SEPARADA DEL FETCH A PROPÓSITO. La tarjeta escala con la ronda y hay cuatro
 * tratos distintos que mirar; con la consulta dentro, la única forma de ver el
 * de la final era tener a alguien jugando una final de verdad. Así se puede
 * pintar con datos de prueba sin tocar la base.
 *
 * `MyNextMatch` sigue consultando y suscribiéndose como siempre: lo que se
 * separó es el dibujo, no el dato.
 */
export function TarjetaProximoPartido({ match }: { match: NextMatch }) {
  const isLive = match.momento === 'en_curso';
  /** Su hora fue otro día y sigue sin resultado. */
  const atrasado = match.momento === 'atrasado';

  // CUÁNTO PESA ESTA RONDA. Mismo trato que `YaEstasEnLaSiguiente`: las dos
  // tarjetas nunca se ven a la vez, pero el jugador las ve una detrás de otra y
  // tienen que parecer hermanas. Ver `@/lib/escala-de-ronda`.
  const trato = tratoDeRonda(match.stage);
  /** Desde cuartos, la ronda deja de ser una nota gris y pasa a ser el titular. */
  const conTitular = trato.nivel >= 2;
  const titular = stageLabel(match.stage);

  const contenido = (
    <>
      {/* LA BARRA DE ACENTO.
          En el nivel 1 es la de siempre: solo aparece en vivo, dorada y pegada
          al borde. Desde cuartos es la del trato de la ronda y está siempre —
          es la primera señal de que este partido pesa más que el anterior. */}
      {conTitular ? (
        trato.acento.colors ? (
          <LinearGradient
            colors={[...trato.acento.colors] as [string, string, ...string[]]}
            start={gradient.rule.start}
            end={gradient.rule.end}
            style={{ height: trato.acento.alto, borderRadius: 2, marginBottom: space[2] }}
          />
        ) : (
          <View
            style={{
              height: trato.acento.alto,
              backgroundColor: trato.acento.plano,
              borderRadius: 2,
              marginBottom: space[2],
            }}
          />
        )
      ) : (
        isLive && (
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
        )
      )}

      {/* Eyebrow */}
      <Text
        style={{
          fontFamily: font.display,
          fontSize: 10,
          fontWeight: '500',
          color: trato.nivel >= 3 ? trato.colorTitular : color.champagne,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginBottom: 6,
          marginTop: !conTitular && isLive ? 6 : 0,
        }}
      >
        {isLive ? '🟢 En curso' : atrasado ? 'Partido pendiente' : 'Próximo partido'}
      </Text>

      {/* EL TITULAR: LA RONDA.
          Hasta octavos vive donde siempre, en la línea gris junto a la
          categoría. Desde cuartos sale de ahí y se pone en grande — y en
          semifinales y la final, en mayúsculas: la palabra es lo que el
          jugador va a enseñarle a alguien. */}
      {conTitular && !!titular && (
        <Text
          style={{
            fontFamily: font.display,
            fontSize: trato.tamanoTitular,
            fontWeight: '600',
            color: trato.colorTitular,
            textTransform: trato.titularPartido ? 'uppercase' : 'none',
            letterSpacing: 0.5,
            lineHeight: trato.tamanoTitular * 1.1,
            marginBottom: 6,
          }}
        >
          {titular}
        </Text>
      )}

      {/* EL SELLO DE LA FINAL. Lo único que ninguna otra ronda tiene. */}
      {trato.sello && (
        <LinearGradient
          colors={[...gradient.seal.colors] as [string, string, ...string[]]}
          start={gradient.seal.start}
          end={gradient.seal.end}
          style={{
            alignSelf: 'flex-start',
            borderRadius: radius.pill,
            paddingHorizontal: space[3],
            paddingVertical: space[1.5],
            marginBottom: space[2],
          }}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontSize: fontSize.eyebrow,
              fontWeight: '600',
              color: color.onGold,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {trato.sello}
          </Text>
        </LinearGradient>
      )}

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
            color: trato.colorTitular,
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
          color: trato.colorTexto,
          marginBottom: 2,
        }}
      >
        {match.tournamentName}
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 12,
          color: trato.colorTenue,
          marginBottom: 12,
        }}
      >
        {/* SIN `round_label`. Es un identificador nuestro —"round_of_16-02-03"—
            con zero-padding para poder ordenar el cuadro, y no significa nada
            para el jugador: con la categoría y la ronda ya sabe qué partido es.
            Se quitó también del tipo, porque el dato que sigue ahí es el que
            vuelve a colarse.

            Y la ronda solo va aquí si NO es ya el titular: decirla dos veces en
            la misma tarjeta la convierte en ruido. */}
        {match.categoryName}
        {!conTitular && titular ? ` · ${titular}` : ''}
      </Text>

      {/* Rival */}
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 11,
          color: trato.colorTenue,
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
          color: trato.colorTexto,
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
          <Text style={{ fontFamily: font.body, fontSize: 12, color: trato.colorTenue }}>
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
            backgroundColor: trato.ficha.fondo,
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
          <Icon name="clock" size={13} color={trato.ficha.texto} />
          <Text style={{ fontFamily: font.body, fontSize: 12, color: trato.ficha.texto }}>
            {formatScheduledAt(match.scheduledAt)}
          </Text>
        </View>
        {match.courtName && (
          <View
            style={{
              backgroundColor: trato.ficha.fondo,
              borderRadius: radius.sm,
              paddingHorizontal: 10,
              paddingVertical: 5,
              flexShrink: 0,
            }}
          >
            <Text style={{ fontFamily: font.body, fontSize: 12, color: trato.ficha.texto }} numberOfLines={1}>
              🎾 {match.courtName}
            </Text>
          </View>
        )}

        {/* El momento de verdad: "juego en 40 min, ¿dónde es?" */}
        <ComoLlegar venue={match.venue} variant="compact" />
      </View>
    </>
  );

  const estiloTarjeta = {
    borderRadius: radius.xl2,
    padding: trato.padding,
    borderWidth: 1,
    // En vivo el borde sigue siendo oro pleno, esté en la ronda que esté: es
    // una señal de estado y gana a la de jerarquía.
    //
    // Y en el nivel 1 manda el borde QUE ESTA TARJETA YA TENÍA. "Nivel 1" no
    // es un trato, es "como estaba" — y las dos tarjetas no estaban igual:
    // esta llevaba `lineSoft` y la de siguiente ronda `line`. La escala empieza
    // a decidir en cuartos, que es donde empieza a haber algo que decir.
    borderColor: isLive ? color.gold : trato.nivel === 1 ? color.lineSoft : trato.borde,
    overflow: 'hidden' as const,
  };

  // El degradado solo desde semifinales. Debajo, superficie plana: una tarjeta
  // de octavos con fondo degradado competiría con la de la final, que es justo
  // lo que esto viene a arreglar.
  return trato.fondo ? (
    <LinearGradient
      colors={[...trato.fondo.colors] as [string, string, ...string[]]}
      start={trato.fondo.start}
      end={trato.fondo.end}
      style={estiloTarjeta}
    >
      {contenido}
    </LinearGradient>
  ) : (
    <View style={[estiloTarjeta, { backgroundColor: trato.fondoPlano }]}>{contenido}</View>
  );
}
