/**
 * src/components/expres/PartidosYCaptura.tsx
 *
 * RALLY · La agenda de un exprés: qué se juega, a qué hora, en qué cancha, y
 * capturar el marcador desde ahí mismo.
 *
 * ► POR QUÉ ES UN COMPONENTE Y NO VIVÍA EN LA PANTALLA DEL JUEZ
 *   Esto solo existía en `(judge)/juez/expres/[tournamentId]`. El panel del
 *   ORGANIZADOR enseñaba únicamente las dos tablas: podía ver cómo iba el
 *   grupo, pero no qué partido tocaba, ni a qué hora, ni en qué cancha, ni
 *   capturar nada.
 *
 *   Es justo al revés de cómo se usa. En un exprés el organizador ESTÁ en el
 *   club esa tarde: es quien canta los partidos por el micrófono y quien
 *   apunta los marcadores cuando no hay juez asignado — que en un torneo de
 *   una tarde es casi siempre. Mandarlo a la pantalla de juez para eso es
 *   pedirle que cambie de rol para hacer su trabajo.
 *
 *   Así que la agenda es una sola y la usan los dos. Copiarla habría sido
 *   garantizar que dentro de un mes la del juez y la del organizador enseñan
 *   cosas distintas del mismo partido.
 *
 * ► AGRUPADA POR RONDA, NO POR HORA SUELTA
 *   "Grupo A · Ronda 2" es la unidad con la que se trabaja en la cancha: se
 *   llama a las cuatro parejas a la vez y se juega la ronda entera. Una lista
 *   plana ordenada por hora obligaría a leer la cabecera de cada fila para
 *   saber dónde empieza y acaba la tanda.
 *
 * ► Y LO CAPTURADO BAJA
 *   En orden de reloj de punta a punta, a media tarde había que pasar por
 *   encima de veinte marcadores ya anotados para llegar al siguiente que
 *   falta — con gente delante esperando. Arriba va lo que queda POR HACER.
 *
 *   Baja, pero no se esconde: un marcador mal tecleado se corrige tocándolo,
 *   y meterlo detrás de un filtro cambiaría un problema de scroll por uno
 *   peor. El orden lo decide `@/lib/agenda-expres`, con tests.
 *
 * ► DOS FASES, DOS CAPTURAS, Y NO ES UNA INCONSISTENCIA
 *   La fase de grupos de un exprés se juega a suma 6: dos casillas que suman
 *   seis y ningún ganador. El cuadro NO: cuartos y semis van a set de oro y la
 *   final a dos sets, que son formatos normales con ganador.
 *
 *   Así que el cuadro se captura por el camino de siempre —`ScoreCapture` y
 *   `match-result`— y no por el del exprés. De hecho `expres-resultado`
 *   rechaza cualquier partido que no sea suma 6, y hace bien: son dos cosas
 *   distintas que casualmente ocurren en el mismo torneo.
 *
 * ► SE RECARGA ENTERO AL GUARDAR
 *   Un marcador cambia la tabla del grupo, el clinch de las ocho parejas y a
 *   veces quién va a cuartos. Recalcular eso a mano en el cliente es
 *   exactamente cómo la pantalla se despega del motor, así que se vuelve a
 *   pedir y punto: son dos consultas y pasa cuarenta veces en una tarde, no
 *   cuarenta veces por segundo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { supabase } from '@/lib/supabase/client';
import ScoreCaptureExpres from '@/components/expres/ScoreCaptureExpres';
import { fetchParejasPublicas, nombreDePareja, type ParejaPublica } from '@/lib/parejas-publicas';
import { type ResultadoSuma6 } from '@/lib/engine/expres';
import { agendaExpres, coincide } from '@/lib/agenda-expres';
import ScoreCapture from '@/components/judge/ScoreCapture';
import { scoreConfigDelTorneo } from '@/lib/tercer-set';
import { scoreConfigDeFormato, esFormatoDeCuadro } from '@/lib/engine/expres/formato';
import type { ScoreConfig } from '@/lib/engine/score';
import type { FaseTorneo } from '@/lib/fase-torneo';
import { textoDeBalance } from '@/lib/expres-texto';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

export interface PartidoExpresFila {
  id: string;
  /** 'group' | 'quarter' | 'semi' | 'final'. */
  stage: string;
  groupId: string;
  grupo: string;
  ronda: string;
  hora: string;
  cancha: string;
  pairAId: string;
  pairBId: string;
  gamesA: number | null;
  gamesB: number | null;
  /** Todos los sets, ordenados. En un suma 6 es uno solo. */
  sets: Array<{
    set_number: number; games_a: number; games_b: number;
    is_super_tiebreak: boolean | null; tiebreak_a: number | null; tiebreak_b: number | null;
  }>;
  /** Solo en el cuadro: en un suma 6 es siempre null. */
  ganadorId: string | null;
  /**
   * CÓMO SE JUEGA ESTE PARTIDO: `matches.formato`, que el trigger de la
   * migración 088 copia de `expres_etapa`.
   *
   * En un exprés el formato es de la ETAPA, no del torneo: cuartos y semis a
   * un set, y la final como la eligió el organizador. Por eso viaja en la fila
   * y no en un estado suelto de la pantalla — dos partidos abiertos a la vez
   * en la misma lista pueden jugarse distinto.
   */
  formato: string;
}

/** "18:30" en hora de México. Null se pinta vacío, no como "Invalid Date". */
function horaLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City',
      });
}

export default function PartidosYCaptura({
  tournamentId, fase = 'grupos', onCambio,
}: {
  tournamentId: string;
  /** Qué partidos enseña. Decide también CÓMO se capturan. */
  fase?: FaseTorneo;
  /** Se guardó un marcador: el padre recarga sus tablas. */
  onCambio?: () => void;
}) {
  const esCuadro = fase === 'eliminatorias';
  const [partidos, setPartidos] = useState<PartidoExpresFila[]>([]);
  const [parejas, setParejas] = useState<Map<string, ParejaPublica>>(new Map());
  const [abierto, setAbierto] = useState<PartidoExpresFila | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * ► EL BUSCADOR ES POR QUIÉN JUEGA, NO POR HORA.
   *
   *   En la cancha nadie llega diciendo "el de las 13:30 en la 2": llega una
   *   pareja y dice su nombre. Con 40 partidos, encontrar el suyo bajando la
   *   lista es lo que hace que la fila se acumule.
   *
   *   Busca en las DOS parejas del partido y perdona acentos y ñ, que es lo
   *   que decide si un buscador sirve en español — ver `coincide`.
   */
  const [busqueda, setBusqueda] = useState('');
  /**
   * La BASE del marcador de este torneo: a cuántos puntos va la súper muerte
   * si algún partido llega a set decisivo.
   *
   * No es la regla de ningún partido por sí sola. La regla de cada uno sale de
   * su `formato` —un cuarto es un set, la final puede ser dos— y se compone
   * aquí abajo con `scoreConfigDeFormato`.
   */
  const [baseDelTorneo, setBaseDelTorneo] = useState<ScoreConfig | null>(null);

  const nombre = useCallback(
    (pairId: string) => nombreDePareja(parejas.get(pairId)),
    [parejas],
  );

  const cargar = useCallback(async () => {
    setError(null);
    try {
      // `stage = 'group'` o lo contrario: la fase es la única diferencia de
      // la consulta, y `faseDeStage` ya dice cuál es cuál.
      const consulta = supabase
        .from('matches')
        .select('id, stage, formato, group_id, round_label, scheduled_at, court_label, '
          + 'pair_a_id, pair_b_id, winner_pair_id, match_sets(set_number, games_a, games_b, '
          + 'is_super_tiebreak, tiebreak_a, tiebreak_b)')
        .eq('tournament_id', tournamentId);
      const { data: ms } = await (esCuadro
        ? consulta.neq('stage', 'group')
        : consulta.eq('stage', 'group')
      ).order('scheduled_at');

      // El cuadro necesita saber cómo juega este torneo el set decisivo.
      if (esCuadro) {
        const { data: t } = await supabase
          .from('tournaments')
          .select('tercer_set_formato, tercer_set_puntos')
          .eq('id', tournamentId)
          .maybeSingle();
        try {
          setBaseDelTorneo(scoreConfigDelTorneo(t as never, 'expres/cuadro'));
        } catch {
          // Un exprés nace con 'super_muerte' a 10 escrito explícitamente, así
          // que esto no debería pasar; si pasa, la captura se apaga sola en
          // vez de validar con una regla inventada.
          setBaseDelTorneo(null);
        }
      }

      type SetFila = {
        set_number: number; games_a: number; games_b: number;
        is_super_tiebreak: boolean | null; tiebreak_a: number | null; tiebreak_b: number | null;
      };
      const filas = (ms ?? []) as unknown as Array<{
        id: string; stage: string; formato: string | null;
        group_id: string | null; round_label: string | null;
        scheduled_at: string | null; court_label: string | null;
        pair_a_id: string | null; pair_b_id: string | null;
        winner_pair_id: string | null;
        match_sets: SetFila[] | null;
      }>;
      if (filas.length === 0) { setPartidos([]); return; }

      const idsGrupo = [...new Set(filas.map((m) => m.group_id).filter(Boolean))] as string[];
      const { data: gs } = idsGrupo.length
        ? await supabase.from('groups').select('id, name').in('id', idsGrupo)
        : { data: [] as { id: string; name: string }[] };

      const nombreGrupo = new Map((gs ?? []).map((g) => [g.id, g.name]));

      setParejas(await fetchParejasPublicas(
        filas.flatMap((m) => [m.pair_a_id, m.pair_b_id]).filter(Boolean) as string[],
      ));
      setPartidos(filas.map((m) => {
        const sets = (m.match_sets ?? []).slice().sort((a, b) => a.set_number - b.set_number);
        // En un suma 6 el marcador ES el set 1. En el cuadro hay varios, y lo
        // que resume la fila son los sets ganados por cada lado.
        const uno = sets.find((x) => x.set_number === 1);
        return {
          id: m.id,
          stage: m.stage,
          groupId: m.group_id ?? '',
          // En el cuadro no hay grupo: la cabecera es la ronda.
          grupo: m.group_id ? (nombreGrupo.get(m.group_id) ?? '?') : '',
          ronda: m.round_label ?? '',
          hora: horaLocal(m.scheduled_at),
          cancha: m.court_label ?? '',
          pairAId: m.pair_a_id!,
          pairBId: m.pair_b_id!,
          gamesA: uno?.games_a ?? null,
          gamesB: uno?.games_b ?? null,
          sets,
          ganadorId: m.winner_pair_id,
          formato: m.formato ?? '',
        };
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los partidos.');
    } finally {
      setCargando(false);
    }
  }, [tournamentId]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** El grupo del partido abierto: el motor recalcula su tabla entera. */
  const contexto = useMemo(() => {
    if (!abierto || esCuadro) return null;
    const delGrupo = partidos.filter((p) => p.groupId === abierto.groupId);
    return {
      resultados: delGrupo.map((p) => ({
        matchId: p.id, pairAId: p.pairAId, pairBId: p.pairBId,
        gamesA: p.gamesA, gamesB: p.gamesB,
      })) as ResultadoSuma6[],
      pairIds: [...new Set(delGrupo.flatMap((p) => [p.pairAId, p.pairBId]))],
    };
  }, [abierto, partidos]);

  async function guardar(payload: { marcador: { gamesA: number; gamesB: number } | null }) {
    const { data, error: fe } = await supabase.functions.invoke('expres-resultado', {
      body: {
        match_id: abierto!.id,
        games_a: payload.marcador?.gamesA ?? null,
        games_b: payload.marcador?.gamesB ?? null,
      },
    });
    // El cuerpo del error trae el motivo; sin leerlo se ve "non-2xx" y no se
    // sabe si otro capturó a la vez o si el marcador no era válido.
    if (fe) {
      const detalle = await (fe as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(detalle?.detail ?? detalle?.error ?? 'No se pudo guardar el marcador.');
    }
    if ((data as { error?: string } | null)?.error) {
      throw new Error((data as { detail?: string; error: string }).detail ?? (data as { error: string }).error);
    }
    setAbierto(null);
    await cargar();
    onCambio?.();
  }

  // ► EL CUADRO SE CAPTURA POR EL CAMINO NORMAL.
  //   Cuartos y semis van a set de oro y la final a dos sets: formatos con
  //   ganador. `ScoreCapture` y `match-result` son exactamente eso, y
  //   `expres-resultado` rechazaría estos partidos por no ser suma 6.
  //
  //   PERO CADA UNO CON SU FORMATO. Antes se pasaba la configuración del
  //   torneo a los tres, o sea mejor de 3 con súper muerte, y en un cuarto
  //   —que es UN SET— el 6-4 que lo cerraba dejaba el botón apagado pidiendo
  //   un segundo set que nadie iba a jugar. Ver `scoreConfigDeFormato`.
  if (abierto && esCuadro) {
    const config = baseDelTorneo && esFormatoDeCuadro(abierto.formato)
      ? scoreConfigDeFormato(abierto.formato, baseDelTorneo)
      : null;
    if (!config) {
      return (
        <View style={s.error}>
          <Text style={s.errorTexto}>
            {esFormatoDeCuadro(abierto.formato)
              ? 'Falta saber cómo juega este torneo el set decisivo. Revísalo en '
                + 'Formato antes de capturar el cuadro.'
              : 'Este partido no tiene formato guardado, así que no se sabe si es a '
                + 'un set o a dos. Revisa el formato de la etapa antes de capturar.'}
          </Text>
        </View>
      );
    }
    return (
      <ScoreCapture
        matchId={abierto.id}
        pairAId={abierto.pairAId}
        pairBId={abierto.pairBId}
        pairAName={nombre(abierto.pairAId)}
        pairBName={nombre(abierto.pairBId)}
        // `SetGuardado` usa los nombres de la columna tal cual, así que las
        // filas van derechas sin traducir.
        // Null se lee como "no fue súper muerte", que es lo que significa una
        // columna vacía aquí.
        setsIniciales={abierto.sets.map((x) => ({
          ...x, is_super_tiebreak: x.is_super_tiebreak ?? false,
        }))}
        ganadorInicial={abierto.ganadorId}
        scoreConfig={config}
        onSuccess={() => { setAbierto(null); void cargar(); onCambio?.(); }}
      />
    );
  }

  if (abierto && contexto) {
    return (
      <ScoreCaptureExpres
        pairIds={contexto.pairIds}
        resultados={contexto.resultados}
        matchId={abierto.id}
        nombreA={nombre(abierto.pairAId)}
        nombreB={nombre(abierto.pairBId)}
        guardado={abierto.gamesA != null ? { gamesA: abierto.gamesA, gamesB: abierto.gamesB! } : null}
        onGuardar={guardar}
        onCancelar={() => setAbierto(null)}
      />
    );
  }

  if (cargando) return <ActivityIndicator color={color.gold} />;
  if (partidos.length === 0) return null;

  const filtrados = partidos.filter(
    (p) => coincide(busqueda, nombre(p.pairAId), nombre(p.pairBId)),
  );
  const agenda = agendaExpres(filtrados);
  const buscando = busqueda.trim().length > 0;

  const seccion = (
    titulo: string | null,
    secciones: ReturnType<typeof agendaExpres<PartidoExpresFila>>['porJugar'],
  ) => (
    <>
      {titulo && <Text style={s.apartado}>{titulo}</Text>}
      {secciones.map((sec) => (
        <View key={`${titulo ?? ''}${sec.cabecera}`}>
          <Text style={s.ronda}>{sec.cabecera}</Text>
          {sec.partidos.map((p) => {
            const capturado = p.gamesA != null;
            return (
              <Pressable
                key={p.id}
                onPress={() => setAbierto(p)}
                style={({ pressed }) => [s.fila, capturado && s.filaHecha, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel={
                  `${p.hora} cancha ${p.cancha}, ${nombre(p.pairAId)} contra ${nombre(p.pairBId)}`
                  + (capturado ? `, ${p.gamesA} a ${p.gamesB}` : ', sin capturar')
                }
              >
                <View style={s.cuando}>
                  <Text style={s.hora}>{p.hora}</Text>
                  <Text style={s.cancha}>{p.cancha}</Text>
                </View>
                <View style={s.quienes}>
                  <Text style={s.pareja} numberOfLines={1}>{nombre(p.pairAId)}</Text>
                  <Text style={s.pareja} numberOfLines={1}>{nombre(p.pairBId)}</Text>
                </View>
                {capturado ? (
                  <View style={s.marcador}>
                    <Text style={s.games}>{p.gamesA}</Text>
                    <Text style={s.games}>{p.gamesB}</Text>
                    <Text style={s.saldo}>{textoDeBalance(p.gamesA! - p.gamesB!)}</Text>
                  </View>
                ) : (
                  <Text style={s.porJugar}>anotar</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </>
  );

  return (
    <View style={s.raiz}>
      <Text style={s.titulo}>PARTIDOS</Text>
      <Text style={s.resumen}>
        {buscando
          ? `${agenda.total} ${agenda.total === 1 ? 'partido' : 'partidos'} de ${partidos.length}.`
          : agenda.faltan === 0
            ? `Los ${agenda.total} partidos están capturados.`
            : `Faltan ${agenda.faltan} de ${agenda.total}. Toca uno para anotar el marcador.`}
      </Text>

      <View style={s.buscador}>
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Busca por nombre o apellido"
          placeholderTextColor={color.muted}
          autoCorrect={false}
          autoCapitalize="none"
          style={s.buscadorInput}
          accessibilityLabel="Buscar un partido por el nombre de una pareja"
        />
        {buscando && (
          <Pressable
            onPress={() => setBusqueda('')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Borrar la búsqueda"
          >
            <Text style={s.buscadorLimpiar}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Buscar y no encontrar tiene que decirse: si no, la lista vacía se
          lee como que no hay partidos. */}
      {buscando && agenda.total === 0 && (
        <Text style={s.sinResultados}>
          Ningún partido con «{busqueda.trim()}». Prueba solo con el apellido.
        </Text>
      )}

      {error && <View style={s.error}><Text style={s.errorTexto}>{error}</Text></View>}

      {seccion(null, agenda.porJugar)}

      {/* Los hechos, abajo. Siguen tocándose para corregir un dedazo. */}
      {agenda.capturados.length > 0 && seccion(
        agenda.faltan === 0 ? 'TODOS ANOTADOS' : 'YA ANOTADOS',
        agenda.capturados,
      )}
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: space[2] },
  titulo: {
    color: color.champagne, fontFamily: font.display, fontSize: fontSize.eyebrow,
    letterSpacing: 2, marginTop: space[3],
  },
  resumen: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },

  // Separa las dos mitades de la agenda. Más aire que una cabecera de ronda:
  // el salto de "lo que falta" a "lo hecho" es mayor que el de una ronda a
  // la siguiente.
  apartado: {
    color: color.muted, fontFamily: font.display, fontSize: fontSize.eyebrow,
    letterSpacing: 2, marginTop: space[5], marginBottom: space[1],
    borderTopWidth: 1, borderTopColor: color.lineSoft, paddingTop: space[4],
  },

  buscador: {
    flexDirection: 'row', alignItems: 'center', gap: space[2],
    borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md,
    backgroundColor: color.surface, paddingHorizontal: space[3],
    minHeight: touchTarget, marginTop: space[1],
  },
  buscadorInput: {
    flex: 1, color: color.text, fontFamily: font.body, fontSize: fontSize.body,
    minHeight: touchTarget,
  },
  buscadorLimpiar: { color: color.muted, fontFamily: font.body, fontSize: fontSize.body },
  sinResultados: {
    color: color.muted, fontFamily: font.body, fontSize: fontSize.caption,
    lineHeight: 18, paddingVertical: space[3],
  },

  ronda: {
    color: color.champagne, fontFamily: font.display, fontSize: fontSize.section,
    marginTop: space[3], marginBottom: space[1],
  },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    minHeight: touchTarget + 10, paddingHorizontal: space[3], paddingVertical: space[2],
    borderRadius: radius.md, borderWidth: 1, borderColor: color.lineSoft,
    backgroundColor: color.surface,
  },
  filaHecha: { borderColor: 'rgba(66,214,164,0.28)' },

  cuando: { width: 56 },
  hora: { color: color.text, fontFamily: font.display, fontSize: fontSize.cardName },
  cancha: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute },

  quienes: { flex: 1, gap: 2 },
  pareja: { color: color.text, fontFamily: font.body, fontSize: fontSize.caption },

  marcador: { alignItems: 'flex-end' },
  games: { color: color.text, fontFamily: font.display, fontSize: fontSize.cardName, lineHeight: 19 },
  saldo: { color: color.champagne, fontFamily: font.body, fontSize: fontSize.minAbsolute },
  porJugar: { color: color.gold, fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600' },

  error: {
    padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1, borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body },
});
