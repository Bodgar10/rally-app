/**
 * RALLY · Mis resultados
 *
 * Los partidos que ya jugó el usuario, con marcador.
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE
 *   Es lo que quiere ver quien acaba de quedar fuera —por eso va justo debajo
 *   de "tu torneo terminó aquí"— y es la única prueba que tiene el jugador de
 *   que su resultado se registró como él lo recuerda. Sin esto, la única forma
 *   de comprobar un marcador era abrir la tabla de su grupo y buscarse.
 *
 * SE CONSULTA Y SE SUSCRIBE AQUÍ MISMO, como `MiSituacion` y por lo mismo: un
 * resultado que se captura mientras la app está abierta tiene que aparecer sin
 * que nadie recargue. Es literalmente el caso de uso — el jugador sale de la
 * cancha y mira el teléfono.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, pairChannel, combineUnsubs } from '@/lib/realtime/channels';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

interface Jugado {
  id: string;
  rival: string;
  marcador: string | null;
  ganado: boolean;
  etapa: string;
}

const ETAPA: Record<string, string> = {
  group: 'Fase de grupos',
  round_of_32: 'Ronda de 32',
  round_of_16: 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semifinal',
  final: 'Final',
  third_place: '3.er lugar',
};

/**
 * '6-4 7-5' · '6-3 4-6 [10-7]'.
 * El super muerte con sus PUNTOS entre corchetes, no con el 1-0 que cuenta para
 * la tabla. Mismo formato que la pantalla del juez y la de grupos.
 */
function marcadorDe(sets: Array<{
  set_number: number; games_a: number; games_b: number;
  is_super_tiebreak: boolean; tiebreak_a: number | null; tiebreak_b: number | null;
}>, soyA: boolean): string | null {
  if (sets.length === 0) return null;
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((st) => {
      const [x, y] = st.is_super_tiebreak && st.tiebreak_a != null && st.tiebreak_b != null
        ? [st.tiebreak_a, st.tiebreak_b]
        : [st.games_a, st.games_b];
      // Siempre desde el punto de vista del que mira: su marcador primero.
      const par = soyA ? `${x}-${y}` : `${y}-${x}`;
      return st.is_super_tiebreak ? `[${par}]` : par;
    })
    .join(' ');
}

async function fetchJugados(pairIds: string[]): Promise<Jugado[]> {
  if (pairIds.length === 0) return [];

  const { data, error } = await supabase
    .from('matches')
    .select(
      `id, stage, status, pair_a_id, pair_b_id, winner_pair_id, scheduled_at,
       match_sets ( set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b )`,
    )
    .eq('status', 'finished')
    .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`)
    .order('scheduled_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.warn('[MisResultados]', error.message);
    return [];
  }

  const filas = (data ?? []) as unknown as Array<{
    id: string; stage: string; pair_a_id: string | null; pair_b_id: string | null;
    winner_pair_id: string | null;
    match_sets: Parameters<typeof marcadorDe>[0];
  }>;

  const mios = new Set(pairIds);
  const rivales = await fetchParejasPublicas(
    filas.map((r) => (r.pair_a_id && mios.has(r.pair_a_id) ? r.pair_b_id : r.pair_a_id))
      .filter((x): x is string => !!x),
  );

  return filas.map((r) => {
    const soyA = !!r.pair_a_id && mios.has(r.pair_a_id);
    const rivalId = soyA ? r.pair_b_id : r.pair_a_id;
    const miPar = soyA ? r.pair_a_id : r.pair_b_id;
    return {
      id: r.id,
      rival: rivalId ? nombreDePareja(rivales.get(rivalId)) : '—',
      marcador: marcadorDe(r.match_sets ?? [], soyA),
      ganado: !!r.winner_pair_id && r.winner_pair_id === miPar,
      etapa: ETAPA[r.stage] ?? r.stage,
    };
  });
}

export default function MisResultados({ pairIds }: { pairIds: string[] }) {
  const [jugados, setJugados] = useState<Jugado[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setJugados(await fetchJugados(pairIds));
    setCargando(false);
  }, [pairIds]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Un canal por pareja y por lado: Realtime no acepta filtros `in`, así que no
  // hay forma de escuchar "mis partidos" en una sola suscripción.
  useEffect(() => {
    if (pairIds.length === 0) return;
    const unsubs = pairIds.flatMap((pid) => [
      subscribeToTable({
        channelName: `${pairChannel(pid)}:resultados_a`,
        table: 'matches', filter: `pair_a_id=eq.${pid}`,
        onData: () => void cargar(),
      }),
      subscribeToTable({
        channelName: `${pairChannel(pid)}:resultados_b`,
        table: 'matches', filter: `pair_b_id=eq.${pid}`,
        onData: () => void cargar(),
      }),
    ]);
    return combineUnsubs(...unsubs);
  }, [pairIds, cargar]);

  if (cargando) {
    return (
      <View style={{ paddingVertical: space[4], alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  // Sin partidos jugados no se pinta nada: una tarjeta que dice "todavía no has
  // jugado" solo ocupa el sitio de lo que sí importa antes de empezar.
  if (jugados.length === 0) return null;

  return (
    <View style={{ gap: space[2] }}>
      {jugados.map((j) => (
        <View
          key={j.id}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: space[3],
            backgroundColor: color.surface,
            borderWidth: 1, borderColor: color.lineSoft,
            borderRadius: radius.md,
            paddingHorizontal: space[3.5], paddingVertical: space[3],
          }}
        >
          {/* Ganado o perdido, de un vistazo y sin leer el marcador. */}
          <View
            style={{
              width: 3, alignSelf: 'stretch', borderRadius: 2,
              backgroundColor: j.ganado ? color.live : color.lineSoft,
            }}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontFamily: font.body, fontSize: 10, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {j.etapa}
            </Text>
            <Text style={{ fontFamily: font.body, fontSize: fontSize.body, color: color.text }} numberOfLines={2}>
              {j.rival}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            <Text
              style={{
                fontFamily: font.display, fontSize: fontSize.body,
                color: j.ganado ? color.goldBright : color.muted,
              }}
            >
              {j.marcador ?? '—'}
            </Text>
            <Text style={{ fontFamily: font.body, fontSize: 10, color: j.ganado ? color.live : color.muted }}>
              {j.ganado ? 'Ganado' : 'Perdido'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
