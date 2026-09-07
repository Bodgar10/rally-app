/**
 * RALLY · Sembrar los cuadros
 *
 * EL HUECO QUE LLENA
 *   Con ocho categorías, sembrar era entrar a cada pestaña y repetir el mismo
 *   gesto ocho veces. Y pasa el sábado por la noche, con todas terminando a la
 *   vez, que es cuando menos ganas hay de eso.
 *
 *   Y antes del botón, lo que de verdad faltaba: una vista que diga CÓMO VA EL
 *   TORNEO. Para saber si la 4ª Mixto estaba lista había que abrir la 4ª Mixto.
 *
 * POR QUÉ UNA PANTALLA Y NO UNA FILA MÁS EN EL ÍNDICE
 *   El índice es una lista de ajustes: cada fila un dato y un toque. Esto es
 *   un checklist de ocho categorías con sus motivos, sus enlaces y una acción
 *   de lote — no cabe en una fila sin volverla ilegible, y el índice ya es la
 *   pantalla más cargada del panel. Allí queda el resumen ("3 de 8 listas"),
 *   que es la parte de vistazo, y aquí el detalle.
 *
 * LA SIEMBRA SIGUE PASANDO POR generate-bracket
 *   Una a una, con su validación de servidor. Nada de INSERT directos: el
 *   único camino al cuadro es el que ya comprueba todo.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import FilaCategoriaSiembra from '@/components/organizer/FilaCategoriaSiembra';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';
import { fallo } from '@/lib/errores-red';
import {
  checklistDeSiembra, listasParaSembrar,
  type CategoriaParaSembrar,
} from '@/lib/siembra-lote';
import type { MatchResultInput } from '@/lib/engine/types';

/** Lo que pasó al sembrar una categoría del lote. */
interface Resultado {
  id: string;
  nombre: string;
  ok: boolean;
  detalle: string;
}

export default function SembrarScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre] = useState('');
  const [cats, setCats] = useState<CategoriaParaSembrar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sembrando, setSembrando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [{ data: t }, { data: filasCat }] = await Promise.all([
        supabase.from('tournaments').select('name').eq('id', tournamentId).maybeSingle(),
        supabase.from('categories')
          .select('id, display_name, advance_per_group, best_extra_qualifiers')
          .eq('tournament_id', tournamentId).order('division'),
      ]);
      if (t) setNombre(t.name);

      const ids = (filasCat ?? []).map((c) => c.id);
      if (ids.length === 0) { setCats([]); setCargando(false); return; }

      const [{ data: grupos }, { data: parejas }, { data: partidos }, { data: cuadro }] =
        await Promise.all([
          supabase.from('groups').select('id, category_id, name').in('category_id', ids),
          supabase.from('pairs').select('id, category_id, group_id').eq('tournament_id', tournamentId),
          supabase.from('matches')
            .select('id, category_id, group_id, status, pair_a_id, pair_b_id, winner_pair_id, match_sets(games_a,games_b,is_super_tiebreak,tiebreak_a,tiebreak_b)')
            .eq('tournament_id', tournamentId).eq('stage', 'group'),
          supabase.from('matches').select('category_id')
            .eq('tournament_id', tournamentId).neq('stage', 'group'),
        ]);

      const grupoIds = (grupos ?? []).map((g) => g.id);
      const { data: standings } = grupoIds.length
        ? await supabase.from('group_standings')
            .select('group_id, pair_id, position, points, sets_won, sets_lost, games_won, games_lost, clinch_status')
            .in('group_id', grupoIds)
        : { data: [] as never[] };

      const mapaParejas = await fetchParejasPublicas((parejas ?? []).map((p) => p.id));
      const conCuadro = new Set((cuadro ?? []).map((m) => m.category_id));

      const salida: CategoriaParaSembrar[] = [];
      for (const c of filasCat ?? []) {
        const suyos = (grupos ?? []).filter((g) => g.category_id === c.id);
        if (suyos.length === 0) continue;   // categoría sin cerrar todavía
        salida.push({
          id: c.id,
          nombre: c.display_name,
          advancePerGroup: c.advance_per_group ?? 1,
          bestExtraQualifiers: c.best_extra_qualifiers ?? 0,
          cuadroSembrado: conCuadro.has(c.id),
          nombres: Object.fromEntries(
            (parejas ?? []).filter((p) => p.category_id === c.id)
              .map((p) => [p.id, nombreDePareja(mapaParejas.get(p.id))]),
          ),
          grupos: suyos
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
            .map((g) => {
              const delGrupo = (partidos ?? []).filter((m) => m.group_id === g.id);
              return {
                groupId: g.id,
                nombre: g.name,
                pairIds: (parejas ?? []).filter((p) => p.group_id === g.id).map((p) => p.id),
                matches: delGrupo
                  .filter((m) => m.pair_a_id && m.pair_b_id)
                  .map((m): MatchResultInput => ({
                    matchId: m.id,
                    pairAId: m.pair_a_id as string,
                    pairBId: m.pair_b_id as string,
                    winnerPairId: m.winner_pair_id ?? null,
                    played: m.status === 'finished',
                    sets: ((m as any).match_sets ?? []).map((x: any) => ({
                      gamesA: x.games_a, gamesB: x.games_b,
                      isSuperTiebreak: x.is_super_tiebreak,
                      tiebreakA: x.tiebreak_a, tiebreakB: x.tiebreak_b,
                    })),
                  })),
                filas: (standings ?? []).filter((r) => r.group_id === g.id).map((r) => ({
                  pairId: r.pair_id, groupId: g.id, position: r.position, points: r.points,
                  setsWon: r.sets_won, setsLost: r.sets_lost,
                  gamesWon: r.games_won, gamesLost: r.games_lost,
                  clinchStatus: r.clinch_status,
                })),
              };
            }),
        });
      }
      setCats(salida);
    } catch (e) {
      setError(fallo('sembrar/cargar', e, 'No se pudieron cargar las categorías.'));
    }
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const estados = useMemo(() => checklistDeSiembra(cats), [cats]);
  const listas = useMemo(() => listasParaSembrar(estados), [estados]);

  /**
   * Siembra las listas, UNA A UNA y por `generate-bracket`.
   *
   * Si una falla, las anteriores no se deshacen: cada categoría es un cuadro
   * independiente y desandar lo que ya salió bien sería peor que dejarlo. Se
   * anota y se sigue con las demás.
   */
  async function sembrarTodas() {
    setSembrando(true);
    setResultados(null);
    const out: Resultado[] = [];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Tu sesión expiró. Vuelve a entrar.');

      for (const e of listas) {
        try {
          const res = await fetch(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-bracket`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ action: 'seed', category_id: e.id }),
            },
          );
          const cuerpo = await res.json().catch(() => null);
          out.push(res.ok
            ? { id: e.id, nombre: e.nombre, ok: true, detalle: `${cuerpo?.bracket_size ?? '?'} llaves` }
            : { id: e.id, nombre: e.nombre, ok: false, detalle: cuerpo?.detail ?? cuerpo?.error ?? 'no se pudieron definir' });
        } catch (err) {
          out.push({
            id: e.id, nombre: e.nombre, ok: false,
            detalle: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (e) {
      setError(fallo('sembrar/lote', e, 'No se pudieron definir los enfrentamientos.'));
    }
    setResultados(out);
    setSembrando(false);
    await cargar();
  }

  const irAGrupos = (catId: string) =>
    router.push(`/(organizer)/org/torneos/${tournamentId}/grupos?cat=${catId}`);

  if (cargando) {
    return (
      <SafeAreaView style={s.pantalla}>
        <View style={s.centro}><ActivityIndicator color={color.gold} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.pantalla}>
      <BotonVolver texto={nombre || 'Torneo'} />
      <ScrollView contentContainerStyle={s.contenido} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>FASE FINAL</Text>
        <Text style={s.titulo}>Definir enfrentamientos</Text>

        {estados.length === 0 ? (
          <Text style={s.vacio}>
            Todavía no hay categorías con grupos. Se arman al cerrar las
            inscripciones.
          </Text>
        ) : (
          <Text style={s.entradilla}>
            {listas.length === 0
              ? 'Ninguna categoría está lista todavía.'
              : `${listas.length} de ${estados.length} ${listas.length === 1 ? 'lista' : 'listas'} para definirlos.`}
          </Text>
        )}

        {error && <Text style={s.error}>{error}</Text>}

        {/* ── EL CHECKLIST ─────────────────────────────────────────────── */}
        {estados.map((e) => (
          <FilaCategoriaSiembra key={e.id} estado={e} onVerGrupos={() => irAGrupos(e.id)} />
        ))}

        {/* ── EL LOTE ──────────────────────────────────────────────────── */}
        {estados.length > 0 && (
          <Pressable
            onPress={() => void sembrarTodas()}
            disabled={listas.length === 0 || sembrando}
            style={[s.boton, (listas.length === 0 || sembrando) && s.botonOff]}
            accessibilityRole="button"
            accessibilityLabel={`Definir los enfrentamientos de ${listas.length} categorías`}
            accessibilityState={{ disabled: listas.length === 0 || sembrando }}
          >
            {sembrando ? (
              <ActivityIndicator color={color.onGold} />
            ) : (
              <Text style={listas.length > 0 ? s.botonTexto : s.botonTextoOff}>
                {listas.length === 0
                  ? '🔒 Definir enfrentamientos · ninguna lista todavía'
                  : `Definir ${listas.length} ${listas.length === 1 ? 'cuadro' : 'cuadros'} →`}
              </Text>
            )}
          </Pressable>
        )}

        {/* ── EL RESUMEN ───────────────────────────────────────────────── */}
        {resultados && (
          <View style={s.resultados}>
            <Text style={s.resultadosTitulo}>
              {resultados.filter((r) => r.ok).length} de {resultados.length} definidos
            </Text>
            {resultados.map((r) => (
              <Text key={r.id} style={r.ok ? s.resOk : s.resMal}>
                {r.ok ? '✓' : '✕'} {r.nombre} — {r.detalle}
              </Text>
            ))}
            {estados.some((e) => e.motivoFuera === 'avisos' || e.motivoFuera === 'bloqueantes') && (
              <Text style={s.resultadosNota}>
                Las que quedaron fuera siguen arriba, con su motivo y su enlace.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pantalla:   { flex: 1, backgroundColor: color.bg },
  centro:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenido:  { ...webContentColumn, padding: space[4], paddingBottom: bottomInset, gap: space[3] },
  eyebrow:    { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 1.2 },
  titulo:     { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  entradilla: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  vacio:      { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },
  error:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 18 },

  // `flexWrap`: con nombres largos a 390px el chip se caía fuera de la tarjeta.

  boton:        { backgroundColor: color.gold, borderWidth: 1, borderColor: color.gold, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[3], marginTop: space[2] },
  botonOff:     { backgroundColor: 'transparent', borderColor: color.goldMuted },
  botonTexto:   { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.onGold },
  botonTextoOff:{ fontFamily: font.body, fontSize: fontSize.caption, color: color.goldMuted, textAlign: 'center' },

  resultados:       { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], gap: space[1] },
  resultadosTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  resOk:            { fontFamily: font.body, fontSize: fontSize.caption, color: color.live, lineHeight: 18 },
  resMal:           { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 18 },
  resultadosNota:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: space[1] },
});
