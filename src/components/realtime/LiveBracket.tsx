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
  Pressable,
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
  columnasDelCuadro,
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
  /**
   * Tocar un partido jugable lo entrega aquí, para capturar su resultado.
   *
   * Sin la prop el cuadro es de solo lectura, que es como lo ve el jugador. La
   * decide quien monta el componente DESPUÉS de comprobar el permiso por el
   * camino real (`can_capture_tournament`), no por el rol: ver la pantalla de
   * grupos del organizador.
   */
  onCapturar?: (match: BracketMatch) => void;
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

/**
 * El hueco reservado de una ronda que todavía no existe.
 *
 * `match_schedule` guarda el plan del día para TODAS las rondas desde que se
 * programa, incluidas las que aún no tienen fila en `matches` porque el cuadro
 * se materializa ronda a ronda. Se identifica por (categoría, etapa,
 * slot_index) — la posición dentro de la ronda, que es lo único que existe
 * antes que el partido. Es el mismo plan que lee la RPC para que el partido
 * nazca con hora (migración 061).
 */
interface SlotDelPlan {
  stage: string;
  slotIndex: number;
  scheduledAt: string;
  courtLabel: string;
}

/** El plan de la categoría, indexado por `etapa#slot`. */
async function fetchPlanDelCuadro(categoryId: string): Promise<Map<string, SlotDelPlan>> {
  const { data, error } = await supabase
    .from('match_schedule')
    .select('stage, slot_index, scheduled_at, court_label')
    .eq('category_id', categoryId);
  // Un plan que no se puede leer no es motivo para no pintar el cuadro: las
  // celdas futuras se quedan sin hora, que es exactamente como estaban antes.
  if (error) { console.warn('[LiveBracket] plan no leído:', error.message); return new Map(); }
  const m = new Map<string, SlotDelPlan>();
  for (const r of data ?? []) {
    m.set(`${r.stage}#${r.slot_index}`, {
      stage: r.stage,
      slotIndex: r.slot_index,
      scheduledAt: r.scheduled_at,
      courtLabel: r.court_label,
    });
  }
  return m;
}

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
// La celda de una ronda que todavía no existe
// ───────────────────────────────────────────

/**
 * El hueco de un partido que aún no tiene fila en `matches`.
 *
 * NO es lo mismo que un cruce pendiente: aquel ya existe y espera a saber quién
 * lo juega; esto no existe todavía. Se pinta con el borde punteado y sin
 * relleno para que se lea como "aquí irá algo", no como un partido con los
 * nombres en blanco.
 *
 * Dice de dónde saldrá quien lo juegue —"Ganador de cuartos 1"— porque eso es
 * justo lo que se va a mirar en un cuadro antes de que se juegue: el camino.
 */
function CeldaFutura({
  etapa, indice, slot, ladoA, ladoB,
}: {
  etapa: EtapaCuadro;
  indice: number;
  /** El hueco del plan, si lo hay. Sin él la celda queda como estaba. */
  slot?: SlotDelPlan;
  /**
   * Los dos lados del cruce, ya resueltos si se pueden.
   *
   * CADA LADO POR SEPARADO, y ese es el punto. La celda esperaba a que las DOS
   * semifinales terminaran para decir algo: en 6ª Varonil acabó la primera,
   * ganaron Víctor Martínez / Andrés Torres, y la final seguía anunciando
   * "Ganador de semifinal 1" con el nombre ya sabido. Media verdad conocida se
   * dice; no se guarda hasta tener la otra mitad.
   */
  ladoA: string | null;
  ladoB: string | null;
}) {
  const viene = ORIGEN_DE_LA_RONDA[etapa];
  return (
    <View
      style={{
        width: 180,
        minHeight: 84,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: color.lineSoft,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        gap: 2,
      }}
    >
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 11,
          // El nombre real se lee como dato; el hueco, como espera.
          color: ladoA ? color.text : color.muted,
          fontWeight: ladoA ? '600' : '400',
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {ladoA ?? (viene ? `${viene} ${indice * 2 + 1}` : 'Por definir')}
      </Text>
      <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted, textAlign: 'center' }}>
        vs
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 11,
          color: ladoB ? color.text : color.muted,
          fontWeight: ladoB ? '600' : '400',
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {ladoB ?? (viene ? `${viene} ${indice * 2 + 2}` : 'Por definir')}
      </Text>

      {/* LA HORA YA SE SABE, AUNQUE LAS PAREJAS NO.
          La celda sigue punteada —quién juega está por decidir— pero cuándo y
          dónde no: el plan del día reserva el hueco de todas las rondas desde
          que se programa. Callarlo obligaba al organizador a irse al
          calendario para leer un dato que esta celda ya tenía al alcance. */}
      {slot && (
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 11,
            color: color.champagne,
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          {horaDeTorneo(slot.scheduledAt)} · {slot.courtLabel}
        </Text>
      )}
    </View>
  );
}

/**
 * Quién sale de un partido de la ronda anterior, si ya se sabe.
 *
 * `null` mientras no haya ganador. Un bye cuenta: si solo hay una pareja
 * apuntada, esa pasa aunque nadie haya capturado nada.
 */
function saleDe(m: BracketMatch | undefined, quiero: 'ganador' | 'perdedor'): string | null {
  if (!m) return null;
  const ganador = m.winnerPairId
    ?? (m.pairAId && !m.pairBId ? m.pairAId : null)
    ?? (m.pairBId && !m.pairAId ? m.pairBId : null);
  if (!ganador) return null;
  if (quiero === 'ganador') {
    return ganador === m.pairAId ? m.pairAName : m.pairBName;
  }
  // El perdedor solo existe si jugaron los dos: un bye no deja perdedor.
  if (!m.pairAId || !m.pairBId) return null;
  return ganador === m.pairAId ? m.pairBName : m.pairAName;
}

/**
 * La ronda anterior ORDENADA POR SU ETIQUETA, no por id.
 *
 * `fetchBracketMatches` pide `order by id`, que dentro de una ronda no
 * significa nada. Las etiquetas —'semi-01', 'quarter-00-01'— sí: llevan el
 * número con cero delante justo para que el orden lexicográfico sea el
 * numérico (ver `etiquetaDeRonda`). Emparejar por posición con el orden
 * equivocado pondría al ganador de una semifinal en el lado de la otra.
 */
function porEtiqueta(partidos: BracketMatch[]): BracketMatch[] {
  return [...partidos].sort((a, b) => (a.roundLabel ?? '').localeCompare(b.roundLabel ?? ''));
}

/** De qué ronda sale quien juega la siguiente. */
const ORIGEN_DE_LA_RONDA: Partial<Record<EtapaCuadro, string>> = {
  round_of_16: 'Ganador de R32',
  quarter: 'Ganador de octavos',
  semi: 'Ganador de cuartos',
  final: 'Ganador de semifinal',
  third_place: 'Perdedor de semifinal',
};

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
  onCapturar,
}: {
  primeraRonda?: boolean;
  match: BracketMatch;
  currentUserId?: string;
  onCapturar?: (match: BracketMatch) => void;
}) {
  const isLive = match.status === 'in_progress';
  const isDone = match.status === 'finished';
  const isPending = estaPendiente(match);
  // "(Por definir)" no explicaba nada. Ahora dice de donde saldra la pareja:
  // la primera ronda se alimenta de los grupos, las demas de la anterior.
  const pendiente = textoPendiente(match.stage, primeraRonda);

  const pairAWon = isDone && match.winnerPairId === match.pairAId;
  const pairBWon = isDone && match.winnerPairId === match.pairBId;

  /**
   * Solo se captura un cruce con LAS DOS parejas.
   *
   * Un hueco pendiente todavía no es un partido: no hay a quién dar por ganador
   * y `match-result` lo rechazaría. Un partido ya jugado SÍ se toca — reabrirlo
   * es corregirlo, igual que en la pantalla del juez.
   */
  const capturable = !!onCapturar && !isPending;

  const cuerpo = (
    <>
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

      {/* Footer: hora, cancha y —si se puede— la invitación a capturar.
          APILADO, no en fila: "14:00 · Cancha 3" y "Capturar →" no caben en los
          160px útiles de la tarjeta, y en fila la hora se partía en dos líneas
          justo por el medio ("14:00 · CANCHA" / "3"). */}
      <View
        style={{
          gap: 2,
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

        {/* La invitación a capturar, solo cuando se puede. En el cuadro del
            jugador esta línea no existe, así que la tarjeta se ve igual que
            siempre. */}
        {capturable && (
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 9,
              fontWeight: '600',
              color: color.gold,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            {isDone ? 'Corregir →' : 'Capturar →'}
          </Text>
        )}
      </View>
    </>
  );

  const caja = {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: isLive ? color.gold : color.lineSoft,
    width: 180,
    overflow: 'hidden' as const,
  };

  if (!capturable) return <View style={caja}>{cuerpo}</View>;

  return (
    <Pressable
      onPress={() => onCapturar!(match)}
      style={({ pressed }) => [caja, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={
        `${isDone ? 'Corregir' : 'Capturar'} resultado: ` +
        `${match.pairAName ?? '?'} contra ${match.pairBName ?? '?'}`
      }
    >
      {cuerpo}
    </Pressable>
  );
}

// ───────────────────────────────────────────
// Componente principal
// ───────────────────────────────────────────

export default function LiveBracket({
  categoryId, currentUserId, partidos, vacio, onCapturar,
}: LiveBracketProps) {
  const inyectado = partidos !== undefined;

  const [matchesByStage, setMatchesByStage] = useState<
    Partial<Record<BracketStage, BracketMatch[]>>
  >({});
  const [loading, setLoading] = useState(!inyectado);
  const [error, setError] = useState<string | null>(null);
  /**
   * El plan del día, indexado por `etapa#slot`.
   *
   * Se pide SIEMPRE, también con partidos inyectados. Los partidos los puede
   * traer quien llama —una consulta por categoría en vez de diez—, pero el
   * plan es de este componente: es lo único que hace falta para que las celdas
   * futuras digan su hora, y es una tabla diminuta con una fila por hueco.
   */
  const [plan, setPlan] = useState<Map<string, SlotDelPlan>>(new Map());

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
    let vivo = true;
    void fetchPlanDelCuadro(categoryId).then((p) => { if (vivo) setPlan(p); });
    return () => { vivo = false; };
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

  // No solo las rondas con partidos: TODAS las que quedan hasta la final. El
  // cuadro se materializa ronda a ronda, así que sin esto la 6.ª Varonil se
  // pintaba con una sola columna —CUARTOS— y no se veía hacia dónde iba.
  const columnas = columnasDelCuadro(porEtapa);
  // La primera columna del cuadro es la que se alimenta de los grupos; las
  // demás salen de la ronda anterior. Lo necesita el texto de los pendientes.
  const primeraEtapa = columnas[0]?.etapa;

  if (columnas.length === 0) {
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
        {columnas.map(({ etapa: stage, partidos, huecos }, col) => {
          /**
           * La ronda de la que salen los cruces de ESTA columna.
           *
           * El 3.er lugar no cuelga de la columna anterior: sale de los dos
           * perdedores de semifinales, así que se busca su ronda por nombre.
           */
          const previa = stage === 'third_place'
            ? porEtiqueta(columnas.find((c) => c.etapa === 'semi')?.partidos ?? [])
            : porEtiqueta(col > 0 ? columnas[col - 1].partidos : []);
          const quiero = stage === 'third_place' ? 'perdedor' as const : 'ganador' as const;

          return (
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

            {/* Tarjetas de la ronda, y los huecos de las que faltan */}
            <View style={{ gap: 12 }}>
              {partidos.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  currentUserId={currentUserId}
                  primeraRonda={stage === primeraEtapa}
                  onCapturar={onCapturar}
                />
              ))}
              {Array.from({ length: huecos }, (_, i) => {
                // Los huecos van DETRÁS de los partidos ya materializados, así
                // que el primer hueco es el slot que sigue al último real. Con
                // la ronda entera sin materializar —lo normal, porque se crea
                // de golpe— esto es 0, 1, 2…
                const slotIndex = partidos.length + i;
                // Un cruce sale de dos partidos consecutivos de la ronda
                // anterior: el 2n y el 2n+1. El 3.er lugar sale de las dos
                // semifinales, que son justo esos dos con n = 0.
                return (
                  <CeldaFutura
                    key={`hueco-${stage}-${i}`}
                    etapa={stage}
                    indice={i}
                    slot={plan.get(`${stage}#${slotIndex}`)}
                    ladoA={saleDe(previa[slotIndex * 2], quiero)}
                    ladoB={saleDe(previa[slotIndex * 2 + 1], quiero)}
                  />
                );
              })}
            </View>
          </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
