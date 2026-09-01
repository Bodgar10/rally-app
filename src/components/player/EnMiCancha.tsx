/**
 * RALLY · Qué se juega ahora en mi cancha
 *
 * EL CASO REAL
 *   Un jugador tenía partido a las 10:00. Se levantó a las 8:30, llegó a las
 *   9:30 y jugó a las 10:40, porque su cancha estaba ocupada con una categoría
 *   que no era la suya. La información que necesitaba no estaba en su categoría:
 *   estaba en la cancha. Y en la cancha no la miraba nadie.
 *
 * POR ESO SE MIRA EL TORNEO ENTERO, NO SU CATEGORÍA
 *   La consulta trae TODOS los partidos de esa cancha, de cualquier categoría.
 *   Es justo el dato que faltaba: quien le estaba ocupando la pista jugaba otra
 *   cosa, y por eso no aparecía en ninguna pantalla suya.
 *
 * CÓMO SE SABE QUÉ ESTÁ EN JUEGO — ver `@/lib/cancha-ahora`
 *   `matches.status` no sirve: el enum tiene 'in_progress' y nadie lo escribe
 *   nunca. La cancha es una cola y el ocupante es el primero sin terminar, así
 *   que un partido que lleva 75 minutos sigue ocupando — que es exactamente el
 *   caso que rompe cualquier regla basada en la duración nominal.
 *
 * SE CONSULTA Y SE SUSCRIBE AQUÍ, como MiSituacion y por lo mismo: los datos
 * inyectados apagan la suscripción y dejan un componente que se ve bien y no se
 * entera de nada. Esta tarjeta es la que más lo necesita — su valor entero es
 * estar al día mientras el jugador la mira desde el coche.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, tournamentChannel, combineUnsubs } from '@/lib/realtime/channels';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';
import { horaDeTorneo } from '@/lib/fechas';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';
import { estadoDeCancha, fraseDeRetraso, type PartidoEnCancha } from '@/lib/cancha-ahora';

const ETAPA: Record<string, string> = {
  group: 'Fase de grupos',
  round_of_32: 'Ronda de 32',
  round_of_16: 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semifinal',
  final: 'Final',
  third_place: '3.er lugar',
};

interface Ocupante {
  categoria: string;
  ronda: string;
  parejaA: string;
  parejaB: string;
  desde: string | null;
  lleva: number;
  /**
   * Sets ya capturados del partido en curso. HUECO PREPARADO: hoy siempre viene
   * vacío porque la captura es de una sola vez, al final. Cuando exista la
   * captura set a set —el otro chat la está construyendo— esto se llena solo y
   * la tarjeta dirá "van 1-0". No se depende de ello para funcionar.
   */
  sets: string | null;
}

interface Vista {
  cancha: string;
  ocupante: Ocupante | null;
  miHoraPublicada: string | null;
  miRetraso: number;
  miInicioEstimado: string | null;
}

/** '6-4' · '6-4 3-2' — lo que va del partido, no el resultado final. */
function marcadorParcial(sets: Array<{
  set_number: number; games_a: number; games_b: number;
  is_super_tiebreak: boolean; tiebreak_a: number | null; tiebreak_b: number | null;
}>): string | null {
  if (sets.length === 0) return null;
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((st) => (st.is_super_tiebreak && st.tiebreak_a != null && st.tiebreak_b != null
      ? `[${st.tiebreak_a}-${st.tiebreak_b}]`
      : `${st.games_a}-${st.games_b}`))
    .join(' ');
}

async function fetchCancha(pairIds: string[]): Promise<Vista | null> {
  if (pairIds.length === 0) return null;

  // 1. Mi próximo partido CON cancha. Sin cancha asignada no hay nada que mirar.
  const { data: mios } = await supabase
    .from('matches')
    .select('id, tournament_id, court_label, scheduled_at, status, pair_a_id, pair_b_id')
    .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`)
    .neq('status', 'finished')
    .not('court_label', 'is', null)
    .not('scheduled_at', 'is', null)
    .order('scheduled_at', { ascending: true })
    .limit(1);

  const mio = (mios ?? [])[0] as {
    id: string; tournament_id: string; court_label: string; scheduled_at: string;
  } | undefined;
  if (!mio) return null;

  // 2. TODA la cancha, de cualquier categoría. Aquí está el dato que faltaba.
  const { data: enLaCancha } = await supabase
    .from('matches')
    .select(
      `id, stage, status, scheduled_at, played_at, pair_a_id, pair_b_id,
       categories:category_id ( display_name )`,
    )
    .eq('tournament_id', mio.tournament_id)
    .eq('court_label', mio.court_label);

  const filas = (enLaCancha ?? []) as unknown as Array<{
    id: string; stage: string; status: string;
    scheduled_at: string | null; played_at: string | null;
    pair_a_id: string | null; pair_b_id: string | null;
    categories: { display_name: string } | null;
  }>;

  const cola: PartidoEnCancha[] = filas.map((m) => ({
    id: m.id,
    scheduledAt: m.scheduled_at,
    playedAt: m.played_at,
    finished: m.status === 'finished',
  }));

  const estado = estadoDeCancha({
    partidos: cola,
    miMatchId: mio.id,
    ahora: Date.now(),
    // La duración nominal solo proyecta lo que aún no ha empezado; lo ya jugado
    // usa su `played_at` real.
    minutosPorPartido: 60,
  });

  let ocupante: Ocupante | null = null;
  if (estado.ocupanteId && estado.ocupanteId !== mio.id) {
    const fila = filas.find((m) => m.id === estado.ocupanteId);
    if (fila) {
      const [parejas, { data: sets }] = await Promise.all([
        fetchParejasPublicas([fila.pair_a_id, fila.pair_b_id].filter((x): x is string => !!x)),
        supabase
          .from('match_sets')
          .select('set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b')
          .eq('match_id', fila.id),
      ]);
      ocupante = {
        categoria: fila.categories?.display_name ?? '—',
        ronda: ETAPA[fila.stage] ?? fila.stage,
        parejaA: fila.pair_a_id ? nombreDePareja(parejas.get(fila.pair_a_id)) : '—',
        parejaB: fila.pair_b_id ? nombreDePareja(parejas.get(fila.pair_b_id)) : '—',
        desde: estado.ocupanteDesde,
        lleva: estado.ocupanteLleva,
        sets: marcadorParcial(sets ?? []),
      };
    }
  }

  return {
    cancha: mio.court_label,
    ocupante,
    miHoraPublicada: mio.scheduled_at,
    miRetraso: estado.miRetraso,
    miInicioEstimado: estado.miInicioEstimado,
  };
}

export default function EnMiCancha({ pairIds }: { pairIds: string[] }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [cargando, setCargando] = useState(true);
  /** El canal confirmó SUBSCRIBED. Sin esto, "en vivo" sería una promesa. */
  const [enVivo, setEnVivo] = useState(false);
  const torneo = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    const v = await fetchCancha(pairIds);
    setVista(v);
    setCargando(false);
  }, [pairIds]);

  useEffect(() => { void cargar(); }, [cargar]);

  // El torneo del que hay que escuchar. Se guarda aparte de `vista` para que
  // recargar los datos no cierre y reabra el canal en cada evento.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (pairIds.length === 0) return;
      const { data } = await supabase
        .from('matches')
        .select('tournament_id')
        .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`)
        .neq('status', 'finished')
        .limit(1);
      if (vivo) torneo.current = (data ?? [])[0]?.tournament_id ?? null;
    })();
    return () => { vivo = false; };
  }, [pairIds]);

  // ── La suscripción ────────────────────────────────────────────────────────
  //
  // Al TORNEO, no a la categoría: quien ocupa la cancha juega otra cosa, y
  // escuchar solo lo propio es exactamente el error que dejó al jugador
  // esperando hora y media sin enterarse.
  useEffect(() => {
    const t = vista ? torneo.current : null;
    if (!t) return;
    const unsubs = [
      subscribeToTable({
        channelName: `${tournamentChannel(t)}:cancha`,
        table: 'matches',
        filter: `tournament_id=eq.${t}`,
        onData: () => void cargar(),
        onSubscribed: () => setEnVivo(true),
        onError: () => setEnVivo(false),
      }),
    ];
    return () => { setEnVivo(false); combineUnsubs(...unsubs)(); };
  }, [vista?.cancha, cargar]);

  // Un reloj de un minuto: "lleva 75 minutos" tiene que seguir subiendo aunque
  // no llegue ningún evento. Sin esto, la tarjeta se congela justo cuando el
  // retraso está creciendo, que es cuando más se mira.
  useEffect(() => {
    if (!vista?.ocupante) return;
    const t = setInterval(() => void cargar(), 60_000);
    return () => clearInterval(t);
  }, [vista?.ocupante?.desde, cargar]);

  if (cargando) {
    return (
      <View style={{ paddingVertical: space[4], alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  // Sin próximo partido con cancha no hay nada que contar. No se pinta una
  // tarjeta vacía: ocuparía el sitio de lo que sí importa.
  if (!vista) return null;

  const retraso = fraseDeRetraso(vista.miRetraso);

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: retraso ? color.alive : color.lineSoft,
        borderRadius: radius.xl,
        padding: space[4],
        gap: space[2],
      }}
      accessibilityLiveRegion="polite"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text
          style={{
            fontFamily: font.display, fontSize: 10, color: color.champagne,
            textTransform: 'uppercase', letterSpacing: 1.4, flex: 1, minWidth: 0,
          }}
          numberOfLines={1}
        >
          En tu {vista.cancha}
        </Text>
        {enVivo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.live }} />
            <Text style={{ fontFamily: font.body, fontSize: 10, color: color.live }}>en vivo</Text>
          </View>
        )}
      </View>

      {vista.ocupante ? (
        <>
          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
            {vista.ocupante.categoria} · {vista.ocupante.ronda}
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: fontSize.body, color: color.text }} numberOfLines={2}>
            {vista.ocupante.parejaA}
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>vs</Text>
          <Text style={{ fontFamily: font.body, fontSize: fontSize.body, color: color.text }} numberOfLines={2}>
            {vista.ocupante.parejaB}
          </Text>

          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, marginTop: space[1] }}>
            {vista.ocupante.desde
              ? `Desde las ${horaDeTorneo(vista.ocupante.desde)} · lleva ${vista.ocupante.lleva} min`
              : `Lleva ${vista.ocupante.lleva} min`}
            {/* El hueco preparado: hoy no hay sets hasta que termina el partido,
                así que esto no aparece. Con la captura set a set se llena solo. */}
            {vista.ocupante.sets ? ` · van ${vista.ocupante.sets}` : ''}
          </Text>
        </>
      ) : (
        <Text style={{ fontFamily: font.body, fontSize: fontSize.body, color: color.text }}>
          Tu cancha está libre ahora mismo.
        </Text>
      )}

      {/* EL NÚMERO QUE CAMBIA LA MAÑANA. Es lo que convierte "levántate a las
          8:30" en "puedes dormir media hora más". */}
      {retraso && (
        <View
          style={{
            backgroundColor: 'rgba(230,180,80,0.12)',
            borderRadius: radius.md,
            padding: space[3],
            marginTop: space[1],
            gap: 2,
          }}
        >
          <Text style={{ fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.alive }}>
            {retraso}
          </Text>
          {vista.miInicioEstimado && (
            <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.text }}>
              Tu partido era a las {horaDeTorneo(vista.miHoraPublicada)}; con este ritmo
              entras hacia las {horaDeTorneo(vista.miInicioEstimado)}.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
