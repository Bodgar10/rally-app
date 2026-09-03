/**
 * RALLY · Mi situación en el torneo
 *
 * LO PRIMERO QUE VE EL JUGADOR AL ABRIR LA APP.
 *
 * El motor de clinch calcula `group_standings.clinch_status` desde que se
 * captura el último resultado del grupo, y hasta ahora ese dato no salía a
 * ninguna pantalla del jugador: estaba en la tabla del organizador, en inglés y
 * como un sello de color. Aquí se traduce a una frase que cambia lo que la
 * persona hace esa noche (ver `@/lib/situacion-jugador`).
 *
 * SE CONSULTA AQUÍ, NO SE RECIBE INYECTADO — Y ES A PROPÓSITO.
 *   El patrón de "que el padre traiga los datos y me los pase" nos ha mordido
 *   tres veces: cuando llegan inyectados, la rama que abre la suscripción se
 *   apaga, el componente se ve perfecto y NO SE ACTUALIZA NUNCA. En esta
 *   pantalla eso sería lo peor posible: el jugador la deja abierta encima de la
 *   mesa esperando justo el cambio que no va a llegar.
 *
 *   Así que este componente siempre consulta y siempre se suscribe. Y además lo
 *   DICE: el punto de "en vivo" de la cabecera solo se enciende cuando el canal
 *   confirma `SUBSCRIBED`. Si algún día la suscripción se cae, se ve en la
 *   pantalla en vez de descubrirse en el club.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import { horaDeTorneo } from '@/lib/fechas';
import { subscribeToTable, categoryChannel, tournamentChannel, combineUnsubs } from '@/lib/realtime/channels';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';
import {
  situacionDe, gruposSinTerminar,
  type ClinchStatus, type TonoSituacion,
} from '@/lib/situacion-jugador';
import { avisosPorCambio, type EstadoDelJugador } from '@/lib/avisos-jugador';
import {
  notificarCanchaPorLiberarse, notificarPasasteDeFase,
  notificarResultadoCapturado, notificarYaHayHorario,
} from '@/native/push';

export interface SituacionResuelta {
  pairId: string;
  groupId: string;
  tournamentId: string;
  categoryId: string;
  categoria: string;
  torneo: string;
  estado: ClinchStatus;
  gruposPendientes: number;
  /** Posición en su grupo. 0 mientras no se ha jugado nada. */
  posicion: number;
  jugados: number;
  /** ISO del próximo partido suyo con hora, o null. Alimenta el aviso de horario. */
  proximaHora: string | null;
  /** Partidos suyos ya terminados. Alimenta el aviso de resultado capturado. */
  terminados: number;
  /**
   * Su cancha tiene AHORA MISMO otro partido en juego.
   *
   * Es el aviso de "ve saliendo": en un torneo real los partidos se corren y la
   * hora publicada deja de valer a media mañana. Esto es lo que sustituye al
   * altavoz del club.
   */
  canchaOcupadaAhora: string | null;
}

interface Props {
  /** Parejas del usuario. Vacío = no está inscrito en nada. */
  pairIds: string[];
  /** Se avisa hacia arriba para que el resto del dashboard sepa el contexto. */
  onResuelta?: (s: SituacionResuelta | null) => void;
}

const TINTE: Record<TonoSituacion, string> = {
  clasificado: color.live,
  espera: color.alive,
  vivo: color.champagne,
  // Gris, no rojo: quedarse fuera no es un error del sistema.
  fuera: color.muted,
};

const FONDO: Record<TonoSituacion, string> = {
  clasificado: 'rgba(66,214,164,0.10)',
  espera: 'rgba(230,180,80,0.10)',
  vivo: 'rgba(233,221,182,0.08)',
  fuera: 'transparent',
};

/**
 * La situación de la pareja del usuario que está jugando AHORA.
 *
 * Con varias parejas —dos categorías el mismo fin de semana— gana la que
 * todavía tiene algo que decidir: enseñar "ya clasificaste" de una mientras la
 * otra sigue viva sería contestar la pregunta que no se hizo. El orden es el de
 * urgencia real.
 */
const URGENCIA: Record<ClinchStatus, number> = {
  repechage_pending: 0,   // la que de verdad está esperando
  alive: 1,
  clinched: 2,
  eliminated: 3,
};

async function fetchSituacion(pairIds: string[]): Promise<SituacionResuelta | null> {
  if (pairIds.length === 0) return null;

  const { data: standings, error } = await supabase
    .from('group_standings')
    .select('pair_id, group_id, clinch_status, position, played, groups:group_id ( id, name, category_id )')
    .in('pair_id', pairIds);

  if (error || !standings || standings.length === 0) {
    if (error) console.warn('[MiSituacion] standings:', error.message);
    return null;
  }

  const filas = standings as unknown as Array<{
    pair_id: string; group_id: string; clinch_status: ClinchStatus;
    position: number; played: number;
    groups: { id: string; name: string; category_id: string } | null;
  }>;

  const elegida = [...filas].sort(
    (a, b) => URGENCIA[a.clinch_status] - URGENCIA[b.clinch_status],
  )[0];
  const categoryId = elegida.groups?.category_id;
  if (!categoryId) return null;

  // El contexto: nombre de categoría y torneo, y cuántos grupos siguen abiertos.
  const [{ data: cat }, { data: partidos }] = await Promise.all([
    supabase
      .from('categories')
      .select('display_name, tournament_id, tournaments:tournament_id ( name )')
      .eq('id', categoryId)
      .maybeSingle(),
    supabase
      .from('matches')
      .select('group_id, status, scheduled_at, court_label, pair_a_id, pair_b_id')
      .eq('category_id', categoryId),
  ]);

  const c = cat as unknown as {
    display_name: string; tournament_id: string; tournaments: { name: string } | null;
  } | null;

  /** Los partidos DEL USUARIO dentro de esta categoría. */
  const suyas = new Set(pairIds);
  const mios = (partidos ?? []).filter(
    (m) => (m.pair_a_id && suyas.has(m.pair_a_id)) || (m.pair_b_id && suyas.has(m.pair_b_id)),
  );

  return {
    pairId: elegida.pair_id,
    groupId: elegida.group_id,
    tournamentId: c?.tournament_id ?? '',
    categoryId,
    categoria: c?.display_name ?? '—',
    torneo: c?.tournaments?.name ?? '—',
    estado: elegida.clinch_status,
    gruposPendientes: gruposSinTerminar(
      // Solo la fase de grupos: un cruce de cuartos no es un grupo pendiente.
      (partidos ?? [])
        .filter((m) => m.group_id !== null)
        .map((m) => ({ groupId: m.group_id, finished: m.status === 'finished' })),
    ),
    posicion: elegida.position,
    jugados: elegida.played,
    proximaHora: mios
      .filter((m) => m.status !== 'finished' && m.scheduled_at)
      .map((m) => m.scheduled_at as string)
      .sort()[0] ?? null,
    terminados: mios.filter((m) => m.status === 'finished').length,
    canchaOcupadaAhora: (() => {
      const miProximo = mios
        .filter((m) => m.status !== 'finished' && m.scheduled_at && m.court_label)
        .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))[0];
      if (!miProximo?.court_label) return null;
      // Alguien está jugando en MI cancha justo ahora: cuando acaben, entro yo.
      const ocupada = (partidos ?? []).some(
        (m) => m.status === 'in_progress' && m.court_label === miProximo.court_label,
      );
      return ocupada ? miProximo.court_label : null;
    })(),
  };
}

export default function MiSituacion({ pairIds, onResuelta }: Props) {
  const [situacion, setSituacion] = useState<SituacionResuelta | null>(null);
  const [cargando, setCargando] = useState(true);
  /** El canal confirmó SUBSCRIBED. Sin esto, "en vivo" sería una promesa. */
  const [enVivo, setEnVivo] = useState(false);

  // `onResuelta` en una ref: si el padre la redefine en cada render —y lo hace,
  // porque es una flecha inline— meterla en las deps del efecto lo relanzaría
  // en bucle, cerrando y abriendo el canal sin parar.
  const avisar = useRef(onResuelta);
  avisar.current = onResuelta;

  /**
   * Lo que se leyó la vez anterior, para saber QUÉ CAMBIÓ.
   *
   * En una ref y no en estado: cambiarlo no tiene que repintar nada, y
   * meterlo en el estado relanzaría el efecto que abre el canal.
   */
  const anterior = useRef<EstadoDelJugador | null>(null);

  const cargar = useCallback(async () => {
    const s = await fetchSituacion(pairIds);
    setSituacion(s);
    setCargando(false);
    avisar.current?.(s);

    // ── LOS AVISOS ────────────────────────────────────────────────────────
    // Push todavía no está configurado: `@/native/push` escribe en consola. Lo
    // que sí está decidido es CUÁNDO y QUÉ DICE cada uno, que es la parte que
    // no se puede improvisar el día que se enchufe el transporte.
    //
    // Tres de los cuatro momentos tienen que acabar saliendo del SERVIDOR: el
    // jugador que duerme no tiene la app abierta, y esto solo dispara con la
    // pantalla montada. Aquí valen para verlos funcionar contra el torneo de
    // prueba y para fijar los textos.
    if (s) {
      const ahora: EstadoDelJugador = {
        estado: s.estado, proximaHora: s.proximaHora, jugadosTerminados: s.terminados,
        canchaOcupada: s.canchaOcupadaAhora,
      };
      for (const momento of avisosPorCambio(anterior.current, ahora)) {
        if (momento === 'pasaste_de_fase') {
          void notificarPasasteDeFase({
            ronda: 'la siguiente ronda',
            tournamentId: s.tournamentId, categoryId: s.categoryId,
          });
        } else if (momento === 'ya_hay_horario' && s.proximaHora) {
          void notificarYaHayHorario({
            hora: horaDeTorneo(s.proximaHora), cancha: null,
            tournamentId: s.tournamentId, categoryId: s.categoryId,
          });
        } else if (momento === 'cancha_por_liberarse' && s.canchaOcupadaAhora) {
          // 20 min es la estimación honesta de lo que le queda a un partido ya
          // empezado. El texto de `push.ts` dice "unos", no promete una hora.
          void notificarCanchaPorLiberarse({ cancha: s.canchaOcupadaAhora, minutos: 20 });
        } else if (momento === 'resultado_capturado') {
          void notificarResultadoCapturado({
            marcador: 'ver detalle', ganaste: false,
            tournamentId: s.tournamentId, categoryId: s.categoryId,
          });
        }
      }
      anterior.current = ahora;
    }
  }, [pairIds]);

  useEffect(() => { void cargar(); }, [cargar]);

  // ── La suscripción, que es media razón de que esta pantalla exista ────────
  //
  // Dos tablas porque son dos cosas distintas: `group_standings` mueve el
  // clinch_status (paso de vivo a clasificado), y `matches` mueve cuántos
  // grupos faltan por terminar — el número que acota la espera.
  useEffect(() => {
    if (!situacion) return;
    const { categoryId, tournamentId } = situacion;

    let vivos = 0;
    const confirmar = () => { vivos += 1; setEnVivo(true); };

    const unsubs = [
      subscribeToTable({
        channelName: `${categoryChannel(categoryId)}:situacion`,
        table: 'group_standings',
        // `group_standings` no tiene category_id: se filtra por el grupo propio.
        filter: `group_id=eq.${situacion.groupId}`,
        onData: () => void cargar(),
        onSubscribed: confirmar,
        onError: () => setEnVivo(false),
      }),
      subscribeToTable({
        channelName: `${tournamentChannel(tournamentId)}:situacion`,
        table: 'matches',
        filter: `category_id=eq.${categoryId}`,
        onData: () => void cargar(),
        onSubscribed: confirmar,
        onError: () => setEnVivo(false),
      }),
    ];

    return () => { setEnVivo(false); combineUnsubs(...unsubs)(); };
  }, [situacion?.categoryId, situacion?.tournamentId, situacion?.groupId, cargar]);

  if (cargando) {
    return (
      <View style={{ paddingVertical: space[5], alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  // Sin standings todavía no hay situación que contar: el torneo no ha
  // empezado. De eso ya habla `TorneoPorEmpezar`, así que aquí no se dice nada
  // en vez de poner una tarjeta vacía.
  if (!situacion) return null;

  const s = situacionDe(situacion.estado, situacion.gruposPendientes);
  const tinte = TINTE[s.tono];

  return (
    <View
      style={{
        backgroundColor: FONDO[s.tono],
        borderWidth: 1,
        borderColor: s.tono === 'fuera' ? color.lineSoft : tinte,
        borderRadius: radius.xl,
        padding: space[4],
        gap: space[1],
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
          {situacion.categoria} · {situacion.torneo}
        </Text>
        {/* Solo cuando el canal lo confirmó. Un punto verde mentiroso es peor
            que ninguno: haría creer que la pantalla se actualiza sola. */}
        {enVivo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.live }} />
            <Text style={{ fontFamily: font.body, fontSize: 10, color: color.live }}>en vivo</Text>
          </View>
        )}
      </View>

      <Text style={{ fontFamily: font.display, fontSize: fontSize.h1Inline, color: tinte }}>
        {s.titulo}
      </Text>
      <Text style={{ fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 21 }}>
        {s.detalle}
      </Text>

      {/* DE QUÉ PARTIDOS DEPENDE.
          Hoy esta lista llega SIEMPRE vacía y no se pinta nada: el motor de
          clinch dice si sigues vivo, no de qué resultados concretos depende que
          lo sigas estando. El sitio está hecho para que ese día solo haya que
          llenar el array — y para que no se cuele un "0 partidos" mientras. */}
      {s.dependeDe.map((d) => (
        <View
          key={`${d.partido}-${d.queTeConviene}`}
          style={{
            borderLeftWidth: 2,
            borderLeftColor: tinte,
            paddingLeft: space[3],
            marginTop: space[2],
            gap: 2,
          }}
        >
          <Text style={{ fontFamily: font.body, fontSize: fontSize.body, color: color.text }} numberOfLines={2}>
            {d.partido}
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: tinte }}>
            {d.queTeConviene}
            {d.cuando ? ` · ${d.cuando}` : ''}
          </Text>
        </View>
      ))}

      {situacion.jugados > 0 && (
        <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: space[1] }}>
          Vas {situacion.posicion}.º de tu grupo con {situacion.jugados}{' '}
          {situacion.jugados === 1 ? 'partido jugado' : 'partidos jugados'}.
        </Text>
      )}
    </View>
  );
}
