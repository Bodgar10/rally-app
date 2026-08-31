/**
 * RALLY · Fase de grupos del organizador
 *
 * EL HUECO QUE LLENA
 *   El panel tenía trece pantallas de CONFIGURACIÓN y ninguna que enseñara el
 *   torneo. El sábado son dos tercios de los partidos —165 de 237 en Cimepa— y
 *   hasta ahora eran invisibles: el organizador cerraba inscripciones, se
 *   generaban 55 grupos, y no tenía dónde verlos.
 *
 * ESTA PANTALLA RESPONDE "¿CÓMO VA 5ª FUERZA?"
 *   El calendario responde otra: "¿qué pasa el sábado a las 11?". Son dos
 *   preguntas distintas y por eso son dos pantallas — una tabla de posiciones
 *   ordenada por puntos y una parrilla ordenada por hora no se pueden fundir
 *   sin que una de las dos deje de leerse. El enlace entre ellas va abajo.
 *
 * LAS HORAS APARECEN SOLAS
 *   Hora y cancha están cableadas desde `scheduled_at` y `court_label`. Con
 *   NULL no se pinta nada y se dice una vez en la cabecera; en cuanto
 *   `schedule-groups` las escriba, salen sin tocar esta pantalla.
 *
 * UNA CONSULTA POR PESTAÑA, NO POR GRUPO
 *   5ª Fuerza tiene 10 grupos. Diez `LiveStandings` autoabasteciéndose serían
 *   diez consultas y diez suscripciones Realtime; se traen los datos de la
 *   categoría entera de una vez y se reparten en memoria.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, StyleSheet, SafeAreaView, Pressable,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import SelectorPestanas from '@/components/ui/SelectorPestanas';
import LiveStandings, { type StandingRow } from '@/components/realtime/LiveStandings';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';
import { horaDeTorneo } from '@/lib/fechas';

// ── Modelo ──────────────────────────────────────────────────────────────────

interface SetDeMatch {
  match_id: string;
  set_number: number;
  games_a: number;
  games_b: number;
  is_super_tiebreak: boolean;
  tiebreak_a: number | null;
  tiebreak_b: number | null;
}

interface PartidoGrupo {
  id: string;
  parejaA: string;
  parejaB: string;
  marcador: string | null;
  /** Null mientras no exista el scheduler de grupos. */
  hora: string | null;
  cancha: string | null;
}

interface Grupo {
  id: string;
  nombre: string;
  filas: StandingRow[];
  partidos: PartidoGrupo[];
  /** Partidos con resultado capturado. */
  finalizados: number;
  /** Un grupo COMPLETO es el que ya tiene los tres resultados. */
  completo: boolean;
}

interface Categoria {
  id: string;
  nombre: string;
  parejas: number;
  pasanPorGrupo: number;
  repescados: number;
  partidos: number;
  grupos: Grupo[];
  /** Cuántos de sus grupos ya están completos. */
  gruposCompletos: number;
  /** True en cuanto alguno de sus partidos tiene hora. */
  conHorario: boolean;
  /** True si ya existen partidos de eliminatorias: el cuadro está sembrado. */
  cuadroSembrado: boolean;
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function GruposScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [cats, setCats]     = useState<Categoria[]>([]);
  const [tab, setTab]       = useState<string>('');
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [error, setError]   = useState<string | null>(null);
  const [sembrando, setSembrando] = useState<string | null>(null);
  const [avisoSiembra, setAvisoSiembra] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);

    const [{ data: t }, { data: filasCat }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).maybeSingle(),
      supabase.from('categories')
        .select('id, display_name, advance_per_group, best_extra_qualifiers')
        .eq('tournament_id', tournamentId).order('division'),
    ]);

    if (t) setNombre(t.name);

    const catIds = (filasCat ?? []).map((c) => c.id);
    if (catIds.length === 0) { setCats([]); setCargando(false); return; }

    // Todo de una vez. El reparto por grupo se hace abajo, en memoria.
    const [{ data: grupos }, { data: parejas }, { data: partidos }] = await Promise.all([
      supabase.from('groups').select('id, category_id, name').in('category_id', catIds),
      supabase.from('pairs').select('id, category_id, group_id').eq('tournament_id', tournamentId),
      supabase.from('matches')
        .select('id, category_id, group_id, status, pair_a_id, pair_b_id, scheduled_at, court_label')
        .eq('tournament_id', tournamentId).eq('stage', 'group'),
    ]);

    // Partidos de fase final: su sola existencia dice que el cuadro ya se
    // sembró, y eso desactiva el botón de sembrar.
    const { data: cuadro } = await supabase
      .from('matches').select('category_id')
      .eq('tournament_id', tournamentId).neq('stage', 'group');
    const catsConCuadro = new Set((cuadro ?? []).map((m) => m.category_id));

    const grupoIds = (grupos ?? []).map((g) => g.id);
    const matchIds = (partidos ?? []).map((m) => m.id);

    const [{ data: standings }, { data: sets }, mapaParejas] = await Promise.all([
      grupoIds.length
        ? supabase.from('group_standings')
            .select('id, group_id, pair_id, played, won, lost, sets_won, sets_lost, games_won, games_lost, points, position, clinch_status')
            .in('group_id', grupoIds)
            .order('position')
        : Promise.resolve({ data: [] as never[] }),
      matchIds.length
        ? supabase.from('match_sets')
            .select('match_id, set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b')
            .in('match_id', matchIds).order('set_number')
        : Promise.resolve({ data: [] as SetDeMatch[] }),
      fetchParejasPublicas((parejas ?? []).map((p) => p.id)),
    ]);

    // ── Índices ────────────────────────────────────────────────────────────
    const setsPorMatch = new Map<string, SetDeMatch[]>();
    for (const st of (sets ?? []) as SetDeMatch[]) {
      const ya = setsPorMatch.get(st.match_id);
      if (ya) ya.push(st); else setsPorMatch.set(st.match_id, [st]);
    }

    const standingsPorGrupo = new Map<string, StandingRow[]>();
    for (const st of standings ?? []) {
      const pp = mapaParejas.get(st.pair_id);
      const fila: StandingRow = {
        id: st.id,
        pair_id: st.pair_id,
        player1_name: pp?.player1_name ?? '—',
        player2_name: pp?.player2_name ?? '—',
        played: st.played, won: st.won, lost: st.lost,
        sets_won: st.sets_won, sets_lost: st.sets_lost,
        games_won: st.games_won, games_lost: st.games_lost,
        points: st.points, position: st.position,
        clinch_status: (st.clinch_status ?? 'alive') as StandingRow['clinch_status'],
        player1_id: pp?.player1_id ?? null,
        player2_id: pp?.player2_id ?? null,
      };
      const ya = standingsPorGrupo.get(st.group_id);
      if (ya) ya.push(fila); else standingsPorGrupo.set(st.group_id, [fila]);
    }

    const partidosPorGrupo = new Map<string, PartidoGrupo[]>();
    for (const m of partidos ?? []) {
      if (!m.group_id) continue;
      const p: PartidoGrupo = {
        id: m.id,
        parejaA: nombreDePareja(m.pair_a_id ? mapaParejas.get(m.pair_a_id) : undefined),
        parejaB: nombreDePareja(m.pair_b_id ? mapaParejas.get(m.pair_b_id) : undefined),
        marcador: marcadorDe(setsPorMatch.get(m.id) ?? []),
        // Cableadas para el día que el scheduler de grupos las escriba.
        hora: m.scheduled_at ? horaDeTorneo(m.scheduled_at) : null,
        cancha: m.court_label ?? null,
      };
      const ya = partidosPorGrupo.get(m.group_id);
      if (ya) ya.push(p); else partidosPorGrupo.set(m.group_id, [p]);
    }

    const parejasPorCat = new Map<string, number>();
    for (const p of parejas ?? []) {
      parejasPorCat.set(p.category_id, (parejasPorCat.get(p.category_id) ?? 0) + 1);
    }
    const partidosPorCat = new Map<string, number>();
    for (const m of partidos ?? []) {
      partidosPorCat.set(m.category_id, (partidosPorCat.get(m.category_id) ?? 0) + 1);
    }

    // ── Armado ─────────────────────────────────────────────────────────────
    const salida: Categoria[] = [];
    for (const c of filasCat ?? []) {
      const gs = (grupos ?? [])
        .filter((g) => g.category_id === c.id)
        // Por nombre y numérico: "Grupo 10" va detrás de "Grupo 9", no entre
        // el 1 y el 2.
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
        .map((g) => {
          const delGrupo = (partidos ?? []).filter((m) => m.group_id === g.id);
          const finalizados = delGrupo.filter((m) => m.status === 'finished').length;
          return {
            id: g.id,
            nombre: g.name,
            filas: standingsPorGrupo.get(g.id) ?? [],
            partidos: partidosPorGrupo.get(g.id) ?? [],
            finalizados,
            // Un grupo sin partidos no está "completo": está vacío.
            completo: delGrupo.length > 0 && finalizados === delGrupo.length,
          };
        });

      if (gs.length === 0) continue;   // categoría sin cerrar todavía

      salida.push({
        id: c.id,
        nombre: c.display_name,
        parejas: parejasPorCat.get(c.id) ?? 0,
        pasanPorGrupo: c.advance_per_group ?? 0,
        repescados: c.best_extra_qualifiers ?? 0,
        partidos: partidosPorCat.get(c.id) ?? 0,
        grupos: gs,
        gruposCompletos: gs.filter((g) => g.completo).length,
        conHorario: (partidos ?? []).some((m) => m.category_id === c.id && m.scheduled_at),
        cuadroSembrado: catsConCuadro.has(c.id),
      });
    }

    setCats(salida);
    setTab((prev) => (salida.some((c) => c.id === prev) ? prev : salida[0]?.id ?? ''));
    setCargando(false);
  }, [tournamentId]);

  /**
   * Siembra el cuadro de una categoría.
   *
   * NO se dispara solo al completarse el último grupo, a propósito: sembrar
   * fija los cruces de la fase final y el organizador puede querer revisar la
   * tabla antes. Aquí solo se le da el botón, habilitado cuando de verdad se
   * puede. La misma condición se vuelve a comprobar en el servidor, porque
   * esta pantalla no es la única forma de llamar a la función.
   */
  const sembrarCuadro = useCallback(async (cat: Categoria) => {
    setAvisoSiembra(null);
    setSembrando(cat.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión activa.');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-bracket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'seed', category_id: cat.id }),
        },
      );
      const cuerpo = await res.json().catch(() => null);

      if (!res.ok) {
        setAvisoSiembra(
          cuerpo?.detail ??
          cuerpo?.error ??
          'No se pudo sembrar el cuadro.',
        );
        return;
      }

      setAvisoSiembra(`Cuadro de ${cat.nombre} sembrado: ${cuerpo?.bracket_size ?? '?'} llaves.`);
      await cargar();
    } catch (e) {
      setAvisoSiembra(e instanceof Error ? e.message : String(e));
    } finally {
      setSembrando(null);
    }
  }, [cargar]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const activa = useMemo(() => cats.find((c) => c.id === tab) ?? null, [cats, tab]);

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
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>FASE DE GRUPOS</Text>
        <Text style={s.title}>Grupos</Text>

        {cats.length === 0 ? (
          <Text style={s.vacio}>
            Todavía no hay grupos. Se generan al cerrar las inscripciones de una
            categoría.
          </Text>
        ) : (
          <>
            <SelectorPestanas
              pestanas={cats.map((c) => ({
                id: c.id, etiqueta: c.nombre, cuenta: c.grupos.length,
              }))}
              activa={tab}
              onCambiar={setTab}
            />

            {activa && (
              <>
                {/* Resumen de la categoría */}
                <View style={s.resumen}>
                  <Text style={s.resumenLinea}>
                    {activa.parejas} parejas · {activa.grupos.length}{' '}
                    {activa.grupos.length === 1 ? 'grupo' : 'grupos'} ·{' '}
                    {clasificados(activa)} clasifican · {activa.partidos} partidos
                  </Text>
                  <Text style={s.resumenDetalle}>
                    Pasa {activa.pasanPorGrupo === 1 ? 'el primero' : `${activa.pasanPorGrupo}`} de
                    cada grupo
                    {activa.repescados > 0
                      ? `, más ${activa.repescados} ${activa.repescados === 1 ? 'repescado' : 'repescados'} entre los mejores segundos de toda la categoría.`
                      : '.'}
                  </Text>
                  {/* Una sola vez, no en cada partido. Y solo mientras sea
                      verdad: en cuanto haya horas, sobra. */}
                  {!activa.conHorario && (
                    <Text style={s.sinHorario}>
                      El horario de la fase de grupos todavía no está publicado.
                    </Text>
                  )}

                  {/* Progreso de la fase de grupos. */}
                  <Text style={s.progreso}>
                    {activa.gruposCompletos} de {activa.grupos.length}{' '}
                    {activa.grupos.length === 1 ? 'grupo completo' : 'grupos completos'}
                  </Text>

                  {/* Siembra del cuadro. */}
                  {activa.cuadroSembrado ? (
                    <Text style={s.siembraHecha}>✓ El cuadro de esta categoría ya está sembrado.</Text>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => void sembrarCuadro(activa)}
                        disabled={!todosCompletos(activa) || sembrando === activa.id}
                        style={[
                          s.botonSembrar,
                          (!todosCompletos(activa) || sembrando === activa.id) && s.botonSembrarOff,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Sembrar cuadro de ${activa.nombre}`}
                        accessibilityState={{ disabled: !todosCompletos(activa) }}
                      >
                        {sembrando === activa.id
                          ? <ActivityIndicator color={color.onGold} />
                          : <Text style={s.botonSembrarTexto}>Sembrar cuadro</Text>}
                      </Pressable>
                      {!todosCompletos(activa) && (
                        <Text style={s.siembraBloqueada}>
                          Se habilita cuando los {activa.grupos.length} grupos tengan todos sus
                          resultados capturados.
                        </Text>
                      )}
                    </>
                  )}

                  {avisoSiembra && <Text style={s.aviso}>{avisoSiembra}</Text>}

                  {/* El puente a la otra pregunta. Aquí se ve cómo va la
                      categoría; allí, qué pasa a cada hora del fin de semana. */}
                  <Pressable
                    onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/calendario`)}
                    style={({ pressed }) => [s.enlace, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Ver el calendario del fin de semana"
                  >
                    <Text style={s.enlaceTexto}>Ver el calendario del fin de semana →</Text>
                  </Pressable>
                </View>

                {activa.grupos.map((g) => (
                  <View key={g.id} style={s.grupo}>
                    <View style={s.grupoCabecera}>
                      <Text style={s.grupoNombre}>Grupo {g.nombre}</Text>
                      <Text style={g.completo ? s.grupoCompleto : s.grupoPasan}>
                        {g.completo
                          ? '✓ completo'
                          : `${g.finalizados}/${g.partidos.length} · pasa${activa.pasanPorGrupo === 1 ? '' : 'n'} ${activa.pasanPorGrupo}`}
                      </Text>
                    </View>

                    <LiveStandings
                      groupId={g.id}
                      filas={g.filas}
                      advanceCount={activa.pasanPorGrupo}
                    />

                    <View style={s.partidos}>
                      {g.partidos.map((p) => (
                        <View key={p.id} style={s.partido}>
                          <Text style={s.partidoParejas} numberOfLines={2}>
                            {p.parejaA}  vs  {p.parejaB}
                          </Text>
                          <View style={s.partidoMeta}>
                            {/* Aparecen solas cuando el scheduler las escriba. */}
                            {p.hora && <Text style={s.partidoHora}>{p.hora}</Text>}
                            {p.cancha && <Text style={s.partidoCancha}>{p.cancha}</Text>}
                            {p.marcador && <Text style={s.partidoMarcador}>{p.marcador}</Text>}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

/** True si TODOS los grupos de la categoría tienen ya sus resultados. */
const todosCompletos = (c: Categoria): boolean =>
  c.grupos.length > 0 && c.gruposCompletos === c.grupos.length;

/** Cuántas parejas de la categoría llegan al cuadro. */
const clasificados = (c: Categoria): number =>
  c.grupos.length * c.pasanPorGrupo + c.repescados;

/**
 * '6-4 7-5' · '6-3 4-6 [10-7]'.
 *
 * El super muerte va entre corchetes y con sus PUNTOS, no con el 1-0 que cuenta
 * para la tabla: quien mira un marcador quiere ver el 10-7 que se jugó.
 */
function marcadorDe(sets: SetDeMatch[]): string | null {
  if (sets.length === 0) return null;
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((st) =>
      st.is_super_tiebreak && st.tiebreak_a != null && st.tiebreak_b != null
        ? `[${st.tiebreak_a}-${st.tiebreak_b}]`
        : `${st.games_a}-${st.games_b}`)
    .join(' ');
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.bg },
  centro:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, letterSpacing: 1 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[2] },

  resumen:        { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: space[4], gap: space[1] },
  resumenLinea:   { fontFamily: font.display, fontSize: fontSize.body, color: color.text },
  resumenDetalle: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  sinHorario:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 18, marginTop: space[1] },
  progreso:       { fontFamily: font.display, fontSize: fontSize.body, color: color.champagne, marginTop: space[2] },

  botonSembrar:      { backgroundColor: color.gold, borderRadius: radius.sm, paddingVertical: space[3], alignItems: 'center', marginTop: space[2] },
  botonSembrarOff:   { backgroundColor: color.surface2, opacity: 0.6 },
  botonSembrarTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.onGold },
  siembraBloqueada:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, marginTop: space[1] },
  siembraHecha:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.live, lineHeight: 18, marginTop: space[2] },
  aviso:             { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18, marginTop: space[2] },
  enlace:            { marginTop: space[3], paddingVertical: space[2] },
  enlaceTexto:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },

  grupo:         { gap: space[2], marginTop: space[2] },
  grupoCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2] },
  grupoNombre:   { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  grupoPasan:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  grupoCompleto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.live },

  partidos:        { gap: space[1] },
  partido:         { backgroundColor: color.surface, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2], flexDirection: 'row', alignItems: 'center', gap: space[2] },
  partidoParejas:  { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  partidoMeta:     { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  partidoHora:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },
  partidoCancha:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },
  partidoMarcador: { fontFamily: font.display, fontSize: fontSize.caption, color: color.text },

  vacio: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 21, paddingVertical: space[3] },
  error: { fontFamily: font.body, fontSize: fontSize.body, color: color.danger, lineHeight: 21, marginTop: space[2] },
});
