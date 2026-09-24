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
 *
 * ► SOLO EL TORNEO DEL QUE VIENES
 *   Esto traía TODOS sus partidos terminados, de todos los torneos, sin tope.
 *   Con uno jugado son ocho tarjetas; con cinco, cuarenta, y el dashboard se
 *   convierte en un archivo. Y un archivo no es lo que contesta "¿cómo me
 *   fue?" el domingo por la tarde.
 *
 *   El dashboard habla del presente: se queda con el torneo MÁS RECIENTE en el
 *   que jugó, y lo nombra — sin el nombre, un jugador con dos torneos seguidos
 *   no sabría de cuál son esos marcadores.
 *
 *   El historial completo vive en Perfil, en el palmarés. Ver `@/lib/palmares`.
 *
 * ► Y SE VA ENTERA CUANDO EL TORNEO TERMINA
 *   Mientras el torneo está vivo esto contesta "¿cómo voy?" y va pegado a la
 *   situación. Cerrado el torneo ya no contesta nada: es un archivo, y un
 *   archivo encima del dashboard es lo que le impide al jugador ver que hay
 *   otros torneos a los que apuntarse — que es lo único que le queda por hacer.
 *
 *   Sus marcadores no se pierden: están en el palmarés y en la tabla de su
 *   categoría, que no se borra.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, pairChannel, combineUnsubs } from '@/lib/realtime/channels';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';
import { textoDeBalance } from '@/lib/expres-texto';
import { SectionLabel } from '@/components/ui';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

interface Jugado {
  id: string;
  /** Para quedarse solo con los del último torneo. */
  tournamentId: string;
  rival: string;
  marcador: string | null;
  ganado: boolean;
  etapa: string;
  /**
   * ► UN SUMA 6 NO SE GANA NI SE PIERDE, Y AQUÍ SE DECÍA QUE SE PERDÍA.
   *
   *   `ganado` sale de `winner_pair_id`, que en un partido de grupo de exprés
   *   es SIEMPRE null: el formato no tiene ganador. El resultado es que un
   *   6-0 a favor salía marcado como "Perdido", en rojo, al jugador que
   *   acababa de barrer.
   *
   *   Con `suma6` la fila deja de hablar de ganar: enseña el marcador y lo
   *   que le hizo a la tabla, que es lo único que significa algo.
   */
  suma6: boolean;
  /** El saldo de games: +2, 0, −6. Solo en suma 6. */
  saldo: number | null;
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

async function fetchJugados(
  pairIds: string[],
): Promise<{ torneo: string | null; jugados: Jugado[] }> {
  if (pairIds.length === 0) return { torneo: null, jugados: [] };

  const { data, error } = await supabase
    .from('matches')
    .select(
      `id, stage, status, formato, tournament_id, pair_a_id, pair_b_id, winner_pair_id, scheduled_at,
       tournaments:tournament_id ( name, status ),
       match_sets ( set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b )`,
    )
    .eq('status', 'finished')
    .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`)
    .order('scheduled_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.warn('[MisResultados]', error.message);
    return { torneo: null, jugados: [] };
  }

  const todas = (data ?? []) as unknown as Array<{
    id: string; stage: string; formato: string | null;
    tournament_id: string;
    tournaments: { name: string; status: string } | null;
    pair_a_id: string | null; pair_b_id: string | null;
    winner_pair_id: string | null;
    match_sets: Parameters<typeof marcadorDe>[0];
  }>;

  // EL TORNEO MÁS RECIENTE, y solo ese. La consulta viene ordenada por hora
  // descendente, así que el torneo del primer partido es el último que jugó.
  const ultimo = todas[0]?.tournament_id;
  const filas = todas.filter((r) => r.tournament_id === ultimo);
  const nombreDelTorneo = filas[0]?.tournaments?.name ?? null;

  // TERMINADO: esta sección no tiene nada que contestar. Ver la cabecera.
  if (filas[0]?.tournaments?.status === 'finished') {
    return { torneo: null, jugados: [] };
  }

  const mios = new Set(pairIds);
  const rivales = await fetchParejasPublicas(
    filas.map((r) => (r.pair_a_id && mios.has(r.pair_a_id) ? r.pair_b_id : r.pair_a_id))
      .filter((x): x is string => !!x),
  );

  const jugados = filas.map((r) => {
    const soyA = !!r.pair_a_id && mios.has(r.pair_a_id);
    const rivalId = soyA ? r.pair_b_id : r.pair_a_id;
    const miPar = soyA ? r.pair_a_id : r.pair_b_id;
    const suma6 = r.formato === 'suma_6';
    // El set 1 es el único que hay en un suma 6, y sus games SON el marcador.
    const set1 = (r.match_sets ?? []).find((x) => x.set_number === 1);
    const saldo = suma6 && set1
      ? (soyA ? set1.games_a - set1.games_b : set1.games_b - set1.games_a)
      : null;

    return {
      id: r.id,
      tournamentId: r.tournament_id,
      rival: rivalId ? nombreDePareja(rivales.get(rivalId)) : '—',
      marcador: marcadorDe(r.match_sets ?? [], soyA),
      // En un suma 6 nunca hay ganador, así que `ganado` se queda en false y
      // NO se pinta: la fila usa `suma6` para decidir qué enseña.
      ganado: !suma6 && !!r.winner_pair_id && r.winner_pair_id === miPar,
      etapa: ETAPA[r.stage] ?? r.stage,
      suma6,
      saldo,
    };
  });

  return { torneo: nombreDelTorneo, jugados };
}

export default function MisResultados({ pairIds }: { pairIds: string[] }) {
  const [jugados, setJugados] = useState<Jugado[]>([]);
  /** El nombre del torneo al que pertenecen estos resultados. */
  const [torneo, setTorneo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const r = await fetchJugados(pairIds);
    setJugados(r.jugados);
    setTorneo(r.torneo);
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
      {/* LA ETIQUETA VA AQUÍ DENTRO, no en el dashboard: esta sección se apaga
          sola —sin partidos, o con el torneo ya terminado— y una etiqueta
          "MIS RESULTADOS" sobre un hueco es peor que no tener la sección. */}
      <SectionLabel title="Mis resultados" />
      {/* DE QUÉ TORNEO SON. Antes esto mezclaba todos los torneos de su vida y
          el nombre sobraba; ahora que es uno solo, sin nombrarlo un jugador
          con dos torneos seguidos no sabe de cuál son estos marcadores. */}
      {torneo && (
        <Text
          style={{
            fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
            marginTop: -space[1],
          }}
          numberOfLines={1}
        >
          {torneo}
        </Text>
      )}
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
              backgroundColor: j.suma6
                ? ((j.saldo ?? 0) > 0 ? color.live : (j.saldo ?? 0) < 0 ? color.danger : color.lineSoft)
                : j.ganado ? color.live : color.lineSoft,
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
                color: j.suma6
                  ? ((j.saldo ?? 0) > 0 ? color.goldBright : color.text)
                  : j.ganado ? color.goldBright : color.muted,
              }}
            >
              {j.marcador ?? '—'}
            </Text>
            <Text style={{
              fontFamily: font.body,
              fontSize: 10,
              color: j.suma6
                ? ((j.saldo ?? 0) > 0 ? color.live : (j.saldo ?? 0) < 0 ? color.danger : color.muted)
                : j.ganado ? color.live : color.muted,
            }}>
              {j.suma6
                ? (j.saldo === 0 ? 'No suma ni resta' : textoDeBalance(j.saldo ?? 0))
                : j.ganado ? 'Ganado' : 'Perdido'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
