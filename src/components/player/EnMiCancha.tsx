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
 *   `matches.status = 'in_progress'` manda cuando está: es la señal directa, y
 *   la escribe la captura set a set. Cuando no está —el juez todavía no ha
 *   anotado el primer set aunque la gente esté en la pista— la cancha se lee
 *   como una cola y el ocupante es el primero sin terminar, así que un partido
 *   que lleva 75 minutos sigue ocupando.
 *
 * Y SI EL QUE OCUPA LA CANCHA ES ÉL MISMO, ESTA TARJETA SE CALLA
 *   Decirle "tu cancha está ocupada" a alguien que está jugando en ella no
 *   tiene sentido, y de su propio partido ya habla "Mi próximo partido". El
 *   guard que evitaba anunciarlo como ajeno lo confundía con "no hay ocupante",
 *   y salía "tu cancha está libre" con él dentro.
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
import {
  estadoDeCancha, fraseDeRetraso, fraseDeCola, fraseDeTurno,
  type PartidoEnCancha, type PartidoDeCola,
} from '@/lib/cancha-ahora';

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
   * Los games de cada set, por pareja: `[[6,2],[3,1]]` es 6-2 y 3-1.
   *
   * En columnas y no en una cadena "6-2 3-1" porque el marcador se pinta como
   * un marcador deportivo —cada pareja con sus games— y para eso hace falta
   * saber qué número es de quién. Vacío mientras no haya sets capturados.
   */
  sets: Array<[number, number]>;
}

interface Vista {
  cancha: string;
  ocupante: Ocupante | null;
  /**
   * El que ocupa la cancha es EL PARTIDO DEL PROPIO JUGADOR.
   *
   * Es el caso que hacía decir "tu cancha está libre" con él dentro jugando: el
   * guard que evitaba anunciar tu propio partido como ajeno lo colapsaba con
   * "no hay ocupante". Son dos cosas distintas y ahora se distinguen — de tu
   * propio partido ya habla "Mi próximo partido", así que aquí no se repite.
   */
  ocupanteEsMio: boolean;
  /** Partidos sin terminar por delante del mío, el ocupante incluido. */
  partidosAntes: number;
  /**
   * La cola completa de esta cancha antes de mi partido, en orden de hora —
   * terminados incluidos, no solo los que faltan por jugar. Es lo que
   * `partidosAntes` no puede decir: QUIÉNES juegan y CÓMO van. Vacía si mi
   * partido es el primero de la cancha.
   */
  antes: PartidoDeCola[];
  miHoraPublicada: string | null;
  miRetraso: number;
  miInicioEstimado: string | null;
}

/** '6-4' · '6-4 3-2' — lo que va del partido, no el resultado final. */
function marcadorParcial(sets: Array<{
  set_number: number; games_a: number; games_b: number;
  is_super_tiebreak: boolean; tiebreak_a: number | null; tiebreak_b: number | null;
}>): Array<[number, number]> {
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((st) => (st.is_super_tiebreak && st.tiebreak_a != null && st.tiebreak_b != null
      ? [st.tiebreak_a, st.tiebreak_b]
      : [st.games_a, st.games_b]) as [number, number]);
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

  // 3. Nombres e identidad de TODAS las parejas de la cancha, y sus sets, en
  //    una sola consulta cada uno — no una por partido. Antes esto solo se
  //    pedía para el ocupante; ahora hace falta para toda la cola que se
  //    pinta debajo.
  const idsDeLaCancha = filas.map((m) => m.id);
  const [parejas, { data: setsDeLaCancha }] = await Promise.all([
    fetchParejasPublicas(filas.flatMap((m) => [m.pair_a_id, m.pair_b_id])),
    idsDeLaCancha.length > 0
      ? supabase
          .from('match_sets')
          .select('match_id, set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b')
          .in('match_id', idsDeLaCancha)
      : Promise.resolve({ data: [] as Array<{ match_id: string }> }),
  ]);

  const setsPorPartido = new Map<string, Array<{
    set_number: number; games_a: number; games_b: number;
    is_super_tiebreak: boolean; tiebreak_a: number | null; tiebreak_b: number | null;
  }>>();
  for (const s of (setsDeLaCancha ?? []) as Array<{
    match_id: string; set_number: number; games_a: number; games_b: number;
    is_super_tiebreak: boolean; tiebreak_a: number | null; tiebreak_b: number | null;
  }>) {
    const arr = setsPorPartido.get(s.match_id) ?? [];
    arr.push(s);
    setsPorPartido.set(s.match_id, arr);
  }

  const cola: PartidoEnCancha[] = filas.map((m) => ({
    id: m.id,
    scheduledAt: m.scheduled_at,
    playedAt: m.played_at,
    finished: m.status === 'finished',
    // La señal directa. Antes no se pasaba porque nadie escribía este estado;
    // con la captura set a set sí, y decide sin tener que deducir nada.
    enJuego: m.status === 'in_progress',
    categoria: m.categories?.display_name ?? '—',
    // Sin `?? m.stage`: un stage que no conocemos es un id nuestro
    // ('round_of_64'), y antes que enseñárselo al jugador, nada.
    etapa: ETAPA[m.stage] ?? '',
    parejaA: m.pair_a_id ? nombreDePareja(parejas.get(m.pair_a_id)) : '—',
    parejaB: m.pair_b_id ? nombreDePareja(parejas.get(m.pair_b_id)) : '—',
    marcador: marcadorParcial(setsPorPartido.get(m.id) ?? []),
  }));

  const estado = estadoDeCancha({
    partidos: cola,
    miMatchId: mio.id,
    ahora: Date.now(),
    // La duración nominal solo proyecta lo que aún no ha empezado; lo ya jugado
    // usa su `played_at` real.
    minutosPorPartido: 60,
  });

  // NADA DE ESTA CANCHA ES DE HOY. Ver `sinJornada`: el torneo terminó, o ese
  // partido nunca se capturó. La app no puede distinguirlo y las dos se
  // contestan igual — callándose. Antes salía "lleva 52 horas de retraso".
  if (estado.sinJornada) return null;

  const ocupanteEsMio = estado.ocupanteId === mio.id;

  let ocupante: Ocupante | null = null;
  if (estado.ocupanteId && !ocupanteEsMio) {
    const fila = filas.find((m) => m.id === estado.ocupanteId);
    if (fila) {
      ocupante = {
        categoria: fila.categories?.display_name ?? '—',
        ronda: ETAPA[fila.stage] ?? '',
        parejaA: fila.pair_a_id ? nombreDePareja(parejas.get(fila.pair_a_id)) : '—',
        parejaB: fila.pair_b_id ? nombreDePareja(parejas.get(fila.pair_b_id)) : '—',
        desde: estado.ocupanteDesde,
        lleva: estado.ocupanteLleva,
        sets: marcadorParcial(setsPorPartido.get(fila.id) ?? []),
      };
    }
  }

  return {
    cancha: mio.court_label,
    ocupante,
    ocupanteEsMio,
    partidosAntes: estado.partidosAntesDelMio,
    antes: estado.colaDetallada,
    miHoraPublicada: mio.scheduled_at,
    miRetraso: estado.miRetraso,
    miInicioEstimado: estado.miInicioEstimado,
  };
}

/**
 * Quién va ganando, para resaltar su fila.
 *
 * Sets ganados, no games totales: un 6-0 3-6 va 1-1 aunque uno tenga nueve
 * games más. Sin sets terminados no hay nadie por delante y no se resalta a
 * nadie — un partido a 3-2 en el primer set no tiene líder.
 */
const setsGanados = (sets: Array<[number, number]>, lado: 0 | 1): number =>
  sets.filter((x) => x[lado] > x[1 - lado]).length;

const ganaA = (sets: Array<[number, number]>): boolean =>
  setsGanados(sets, 0) > setsGanados(sets, 1);
const ganaB = (sets: Array<[number, number]>): boolean =>
  setsGanados(sets, 1) > setsGanados(sets, 0);

/** Una pareja y sus games, en fila, como en un marcador de televisión. */
function FilaDeMarcador({
  nombre, games, gana,
}: { nombre: string; games: number[]; gana: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      {/* `minWidth: 0` para que el nombre largo se recorte en vez de empujar
          los números fuera de la tarjeta. */}
      <Text
        style={{
          flex: 1, minWidth: 0,
          fontFamily: font.body,
          fontSize: fontSize.body,
          fontWeight: gana ? '600' : '400',
          color: gana ? color.text : color.muted,
        }}
        numberOfLines={2}
      >
        {nombre}
      </Text>
      <View style={{ flexDirection: 'row', gap: space[2], flexShrink: 0 }}>
        {games.map((g, i) => (
          <Text
            key={i}
            style={{
              fontFamily: font.display,
              fontSize: 26,
              fontWeight: '600',
              color: gana ? color.goldBright : color.text,
              minWidth: 22,
              textAlign: 'center',
            }}
          >
            {g}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Una fila de la cola de antes: quién juega, y cómo va — no solo un
 * contador. Tres estados y solo tres, por lo que pide el producto:
 *   - terminado: marcador final + quién ganó.
 *   - en curso:  marcador parcial + "en vivo".
 *   - por jugar: solo la hora — nunca un marcador inventado.
 */
function FilaDeCola({ partido }: { partido: PartidoDeCola }) {
  const hayMarcador = partido.marcador.length > 0;
  // El ganador solo se afirma con marcador de verdad delante: sin sets no
  // hay quién ganó, aunque `finished` diga lo contrario (no debería pasar).
  const ganadorA = partido.finished && hayMarcador && ganaA(partido.marcador);
  const ganadorB = partido.finished && hayMarcador && ganaB(partido.marcador);

  return (
    <View style={{ paddingVertical: space[2], gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text
          style={{
            flex: 1, minWidth: 0,
            fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
          }}
          numberOfLines={1}
        >
          {partido.categoria}{partido.etapa ? ` · ${partido.etapa}` : ''}
        </Text>
        {partido.enJuego && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.live }} />
            <Text style={{ fontFamily: font.body, fontSize: 9, color: color.live }}>en vivo</Text>
          </View>
        )}
      </View>

      <Text
        style={{
          fontFamily: font.body, fontSize: fontSize.body,
          fontWeight: ganadorA ? '600' : '400',
          color: ganadorA ? color.text : color.muted,
        }}
        numberOfLines={1}
      >
        {partido.parejaA}
      </Text>
      <Text
        style={{
          fontFamily: font.body, fontSize: fontSize.body,
          fontWeight: ganadorB ? '600' : '400',
          color: ganadorB ? color.text : color.muted,
        }}
        numberOfLines={1}
      >
        {partido.parejaB}
      </Text>

      {/* Marcador solo si de verdad hay uno — nunca un 0-0 inventado para un
          partido "por jugar" o que se marcó en curso sin sets todavía. */}
      {hayMarcador ? (
        <Text
          style={{
            fontFamily: font.display, fontSize: fontSize.caption,
            color: partido.enJuego ? color.goldBright : color.champagne,
          }}
        >
          {partido.marcador.map(([a, b]) => `${a}-${b}`).join(', ')}
        </Text>
      ) : (
        <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
          {horaDeTorneo(partido.scheduledAt)}
        </Text>
      )}
    </View>
  );
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

  // ── Suscripción a los SETS de la cola ─────────────────────────────────────
  //
  // El canal de arriba escucha `matches`, y anotar un set no toca esa tabla:
  // escribe en `match_sets`. Mismo caso que resolvió `MyNextMatch` para el
  // partido propio — aquí hace falta un canal por partido de la cola, porque
  // Realtime no acepta un filtro `in` (un solo canal no puede escuchar varios
  // match_id a la vez).
  //
  // La clave de dependencia es la lista de ids, no el array: `vista.antes` es
  // un array nuevo en cada carga y usarlo directo reabriría los canales en
  // cada evento.
  const idsEnCola = (vista?.antes ?? []).map((p) => p.id);
  const idsEnColaClave = idsEnCola.join(',');
  useEffect(() => {
    if (idsEnCola.length === 0) return;
    const unsubs = idsEnCola.map((id) =>
      subscribeToTable<Record<string, unknown>>({
        channelName: `cancha:${id}:sets`,
        table: 'match_sets',
        filter: `match_id=eq.${id}`,
        onData: () => void cargar(),
      }),
    );
    return combineUnsubs(...unsubs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsEnColaClave, cargar]);

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
  const cola = fraseDeCola(vista.partidosAntes, !!vista.ocupante);
  const turno = fraseDeTurno(vista.partidosAntes, !!vista.ocupante);

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

      {vista.ocupanteEsMio ? (
        /* Es SU partido el que está en la cancha. No se repite lo que ya dice
           "Mi próximo partido" —ahí está el marcador—; solo se confirma, que es
           lo que evita la duda de "¿me habré equivocado de pista?". */
        <Text style={{ fontFamily: font.body, fontSize: fontSize.body, color: color.live }}>
          Es tu partido el que se está jugando aquí.
        </Text>
      ) : vista.ocupante ? (
        <>
          {/* LA CATEGORÍA, EN GRANDE Y PRIMERO.
              Es el dato que faltaba en el caso real: la cancha estaba ocupada
              con una categoría que no era la suya y no había forma de saberlo.
              Iba en gris de 12px junto a la ronda, como una nota al pie de algo
              más importante — y resulta que era lo importante. */}
          <Text
            style={{
              fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.text,
            }}
            numberOfLines={2}
          >
            {vista.ocupante.categoria}
          </Text>
          {vista.ocupante.ronda ? (
            <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
              {vista.ocupante.ronda}
            </Text>
          ) : null}
          {/* EL MARCADOR, COMO UN MARCADOR.
              Iba escondido al final de una línea gris de metadatos —"Desde las
              10:59 · lleva 0 min · van 6-2"—, que es exactamente el dato que el
              jugador viene a mirar tratado como nota al pie. Ahora es una
              rejilla: cada pareja con sus games por set, legible de un vistazo
              desde el coche.

              Sin sets capturados se pinta igual, con los nombres y sin números:
              la estructura no depende de que haya marcador. */}
          <View style={{ marginTop: space[2], gap: space[2] }}>
            <FilaDeMarcador
              nombre={vista.ocupante.parejaA}
              games={vista.ocupante.sets.map((x) => x[0])}
              gana={ganaA(vista.ocupante.sets)}
            />
            <FilaDeMarcador
              nombre={vista.ocupante.parejaB}
              games={vista.ocupante.sets.map((x) => x[1])}
              gana={ganaB(vista.ocupante.sets)}
            />
          </View>

          {/* La hora y los minutos bajan a línea secundaria: son el contexto del
              marcador, no el marcador. */}
          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: space[2] }}>
            {vista.ocupante.desde
              ? `Desde las ${horaDeTorneo(vista.ocupante.desde)} · lleva ${vista.ocupante.lleva} min`
              : `Lleva ${vista.ocupante.lleva} min`}
          </Text>
        </>
      ) : (
        <Text style={{ fontFamily: font.body, fontSize: fontSize.body, color: color.text }}>
          Tu cancha está libre ahora mismo.
        </Text>
      )}

      {/* CUÁNTOS FALTAN ANTES DEL MÍO.
          "Cuál se juega ahora" no contesta la pregunta del jugador. Dos
          partidos por delante o ser el siguiente es la diferencia entre ir
          saliendo de casa y sentarse otra vez — y es lo que decide si se mueve
          del sillón, así que va en la línea más visible después del ocupante. */}
      {!vista.ocupanteEsMio && (cola || turno) && (
        <Text
          style={{
            fontFamily: font.display,
            fontSize: fontSize.body,
            color: turno ? color.live : color.champagne,
            marginTop: space[1],
          }}
        >
          {turno ?? cola}
        </Text>
      )}

      {/* EL NÚMERO QUE CAMBIA LA MAÑANA. Es lo que convierte "levántate a las
          8:30" en "puedes dormir media hora más". */}
      {retraso ? (
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
      ) : (
        /* Sin retraso digno de aviso, la hora real se dice igual: es la
           respuesta a "¿a qué hora entro?", y callarla porque la cancha va en
           hora obliga al jugador a deducir que su hora publicada sigue en pie. */
        !vista.ocupanteEsMio && vista.miInicioEstimado && (
          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
            Entras hacia las {horaDeTorneo(vista.miInicioEstimado)}.
          </Text>
        )
      )}

      {/* LA COLA COMPLETA, NO SOLO EL CONTADOR.
          "Falta 1 partido antes del tuyo" no dice quiénes juegan ni cómo van
          — es justo lo que faltaba en el caso real. Terminados incluidos: el
          de las 14:00 ya se sabe, y verlo ayuda a leer el de las 15:00.
          Vacía si mi partido es el primero de la cancha: no hay nada que
          pintar y no se pinta la sección. */}
      {vista.antes.length > 0 && (
        <View style={{ marginTop: space[2] }}>
          <Text
            style={{
              fontFamily: font.display, fontSize: 10, color: color.champagne,
              textTransform: 'uppercase', letterSpacing: 1.2,
              marginBottom: space[1],
            }}
          >
            Antes del tuyo en esta cancha
          </Text>
          <View style={{ gap: 0 }}>
            {vista.antes.map((p, i) => (
              <View
                key={p.id}
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: color.lineSoft } : undefined}
              >
                <FilaDeCola partido={p} />
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
