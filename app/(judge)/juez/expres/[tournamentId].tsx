/**
 * app/(judge)/juez/expres/[tournamentId].tsx
 *
 * RALLY · La pantalla del juez en un torneo exprés.
 *
 * RUTA APARTE DE `juez/[tournamentId].tsx`
 *   Aquella captura sets, deriva un ganador y lo contrasta. Aquí no hay
 *   ganador que derivar y un 5-1 no es un set. Son 766 líneas construidas
 *   sobre esa premisa: ramificarlas pondría a jugarse cada domingo largo cada
 *   vez que se toque el exprés.
 *
 * LA LISTA VA POR FRANJA, NO POR GRUPO
 *   El juez no busca "el grupo B": busca lo que se juega AHORA. Los partidos
 *   salen ordenados por hora, con su cancha, y la ronda como título. Es el
 *   orden en el que ocurren en la cancha.
 *
 * LO CAPTURADO NO DESAPARECE
 *   Se queda con su marcador a la vista y se puede volver a tocar para
 *   corregir. Un partido que se esfuma al capturarlo obliga a preguntarse si
 *   se guardó, y ese fue un fallo real de la pantalla larga.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import BotonVolver from '@/components/ui/BotonVolver';
import ScoreCaptureExpres from '@/components/expres/ScoreCaptureExpres';
import { fetchParejasPublicas, nombreDePareja, type ParejaPublica } from '@/lib/parejas-publicas';
import { partidosPendientes, type ResultadoSuma6 } from '@/lib/engine/expres';
import { textoDeBalance } from '@/lib/expres-texto';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

interface PartidoFila {
  id: string;
  groupId: string;
  grupo: string;
  ronda: string;
  hora: string;
  cancha: string;
  pairAId: string;
  pairBId: string;
  gamesA: number | null;
  gamesB: number | null;
}

/** 'HH:MM' de un timestamptz, en la hora de la cancha (UTC-6). */
function horaLocal(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City',
  });
}

export default function JuezExpresScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partidos, setPartidos] = useState<PartidoFila[]>([]);
  const [parejas, setParejas] = useState<Map<string, ParejaPublica>>(new Map());
  const [abierto, setAbierto] = useState<PartidoFila | null>(null);

  const nombre = useCallback((id: string) => nombreDePareja(parejas.get(id)), [parejas]);

  const cargar = useCallback(async () => {
    if (!tournamentId) return;
    setCargando(true);
    setError(null);
    try {
      const { data: partidosDb, error: pe } = await supabase
        .from('matches')
        .select('id, group_id, round_label, scheduled_at, court_label, pair_a_id, pair_b_id, formato')
        .eq('tournament_id', tournamentId)
        .eq('stage', 'group')
        .eq('formato', 'suma_6')
        .order('scheduled_at');
      if (pe) throw new Error(pe.message);

      const filas = partidosDb ?? [];
      if (filas.length === 0) {
        setPartidos([]);
        setError('Este torneo todavía no tiene calendario. El organizador lo sortea primero.');
        return;
      }

      const [gruposRes, setsRes] = await Promise.all([
        supabase.from('groups').select('id, name').in('id', [...new Set(filas.map((m) => m.group_id!))]),
        supabase.from('match_sets').select('match_id, games_a, games_b')
          .in('match_id', filas.map((m) => m.id)).eq('set_number', 1),
      ]);

      const nombreGrupo = new Map((gruposRes.data ?? []).map((g) => [g.id, g.name]));
      const games = new Map((setsRes.data ?? []).map((s) => [s.match_id, { a: s.games_a, b: s.games_b }]));

      setParejas(await fetchParejasPublicas(filas.flatMap((m) => [m.pair_a_id, m.pair_b_id])));
      setPartidos(filas.map((m) => ({
        id: m.id,
        groupId: m.group_id!,
        grupo: nombreGrupo.get(m.group_id!) ?? '?',
        ronda: m.round_label ?? '',
        hora: horaLocal(m.scheduled_at),
        cancha: m.court_label ?? '',
        pairAId: m.pair_a_id!,
        pairBId: m.pair_b_id!,
        gamesA: games.get(m.id)?.a ?? null,
        gamesB: games.get(m.id)?.b ?? null,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los partidos.');
    } finally {
      setCargando(false);
    }
  }, [tournamentId]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** El grupo del partido abierto, para que el motor recalcule su tabla entera. */
  const contexto = useMemo(() => {
    if (!abierto) return null;
    const delGrupo = partidos.filter((p) => p.groupId === abierto.groupId);
    const resultados: ResultadoSuma6[] = delGrupo.map((p) => ({
      matchId: p.id, pairAId: p.pairAId, pairBId: p.pairBId, gamesA: p.gamesA, gamesB: p.gamesB,
    }));
    const pairIds = [...new Set(delGrupo.flatMap((p) => [p.pairAId, p.pairBId]))];
    return { resultados, pairIds };
  }, [abierto, partidos]);

  async function guardar(payload: { marcador: { gamesA: number; gamesB: number } | null }) {
    const { data, error: fe } = await supabase.functions.invoke('expres-resultado', {
      body: {
        match_id: abierto!.id,
        games_a: payload.marcador?.gamesA ?? null,
        games_b: payload.marcador?.gamesB ?? null,
      },
    });
    // El cuerpo del error trae el motivo; sin leerlo, el juez ve "non-2xx" y no
    // sabe si otro capturó a la vez o si el marcador no era válido.
    if (fe) {
      const detalle = await (fe as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(detalle?.detail ?? detalle?.error ?? fe.message);
    }
    if (data?.error) throw new Error(data.detail ?? data.error);
    setAbierto(null);
    await cargar();
  }

  if (abierto && contexto) {
    return (
      <SafeAreaView style={s.safe}>
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
      </SafeAreaView>
    );
  }

  const pendientes = partidosPendientes(
    partidos.map((p) => ({
      matchId: p.id, pairAId: p.pairAId, pairBId: p.pairBId, gamesA: p.gamesA, gamesB: p.gamesB,
    })),
  );

  let rondaActual = '';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />
        <Text style={s.h1}>Capturar</Text>
        {partidos.length > 0 && (
          <Text style={s.resumen}>
            {pendientes === 0
              ? `Los ${partidos.length} partidos están capturados.`
              : `Faltan ${pendientes} de ${partidos.length}.`}
          </Text>
        )}

        {cargando && <ActivityIndicator color={color.gold} />}
        {error && (
          <View style={s.error}><Text style={s.errorTexto}>{error}</Text></View>
        )}

        {partidos.map((p) => {
          const cabecera = `${p.grupo} · ${p.ronda}`;
          const nueva = cabecera !== rondaActual;
          rondaActual = cabecera;
          const capturado = p.gamesA != null;
          return (
            <View key={p.id}>
              {nueva && <Text style={s.ronda}>{cabecera}</Text>}
              <Pressable onPress={() => setAbierto(p)} style={[s.fila, capturado && s.filaHecha]}>
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
                  <Text style={s.porJugar}>capturar</Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  cont: {
    paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: bottomInset,
    gap: space[2], ...webContentColumn,
  },
  h1: {
    color: color.champagne, fontFamily: font.display, fontSize: fontSize.screenH1,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  resumen: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption },

  ronda: {
    color: color.gold, fontFamily: font.body, fontSize: fontSize.eyebrow,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: space[3], marginBottom: space[1],
  },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    minHeight: touchTarget + 12, paddingHorizontal: space[3], paddingVertical: space[2],
    borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: color.surface,
  },
  filaHecha: { borderColor: 'rgba(66,214,164,0.28)', backgroundColor: 'rgba(66,214,164,0.06)' },

  cuando: { width: 56 },
  hora: { color: color.goldBright, fontFamily: font.display, fontSize: fontSize.cardName },
  cancha: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute },

  quienes: { flex: 1, gap: 2 },
  pareja: { color: color.text, fontFamily: font.body, fontSize: fontSize.body },

  marcador: { alignItems: 'flex-end' },
  games: { color: color.text, fontFamily: font.display, fontSize: fontSize.cardName, lineHeight: 20 },
  saldo: { color: color.live, fontFamily: font.body, fontSize: fontSize.minAbsolute },
  porJugar: {
    color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },

  error: {
    padding: space[3], borderRadius: radius.sm, backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1, borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
});
