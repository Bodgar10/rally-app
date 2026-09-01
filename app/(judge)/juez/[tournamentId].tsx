/**
 * app/(judge)/juez/[tournamentId].tsx
 *
 * RALLY · Pantalla de captura de resultados para un torneo.
 * Lista de partidos → seleccionar → ScoreCapture → match-result.
 *
 * TRES COSAS QUE ESTABAN ROTAS Y AQUÍ SE ARREGLAN
 *
 *   1. NO SE PODÍA CORREGIR UN RESULTADO. La lista filtraba
 *      `.neq('status','finished')`, así que al capturar un partido desaparecía
 *      de la única pantalla que existe. La RPC sí sabe regrabar sets y
 *      standings; era la UI la que no dejaba llegar. Ahora hay filtro de estado
 *      (pendientes / capturados / todos) y los capturados se reabren con el
 *      marcador precargado.
 *
 *   2. 165 TARJETAS PLANAS. Sin `scheduled_at` —y hoy los partidos de grupo no
 *      lo tienen— el orden quedaba indefinido y todas las tarjetas decían "Sin
 *      hora asignada". Hay filtro por categoría y por grupo, y un orden estable
 *      categoría → grupo → ronda que no depende de la hora.
 *
 *   3. UN FALLO DE CARGA SE VEÍA COMO "TODO AL DÍA". `fetchPendingMatches`
 *      logueaba el error y devolvía [], y la pantalla pintaba el mismo
 *      "✓ Todo al día" que cuando de verdad no queda trabajo. Un juez con la
 *      sesión caducada creía haber terminado. Ahora el error tiene su propio
 *      estado, con su causa y su botón de reintentar.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { color, font, radius } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import ScoreCapture, { type SetGuardado } from '@/components/judge/ScoreCapture';
import Hoja, { HOJA_FORMULARIO } from '@/components/ui/Hoja';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import { horaDeTorneo } from '@/lib/fechas';
import { ordenarPartidos, type PartidoOrdenable } from '@/lib/juez/orden-partidos';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

interface JudgeMatch extends PartidoOrdenable {
  id: string;
  stage: string;
  roundLabel: string | null;
  status: string;
  pairAId: string;
  pairBId: string;
  pairAName: string;
  pairBName: string;
  categoryId: string;
  categoryName: string;
  groupId: string | null;
  groupName: string | null;
  scheduledAt: string | null;
  winnerPairId: string | null;
  sets: SetGuardado[];
  /** '6-4 7-5' · '6-3 4-6 [10-7]'. Null si no hay marcador guardado. */
  marcador: string | null;
}

type FiltroEstado = 'pendientes' | 'capturados' | 'todos';

const STAGE_LABEL: Record<string, string> = {
  group: 'Grupos',
  round_of_32: 'R32',
  round_of_16: 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semi',
  final: 'Final',
  third_place: '3er lugar',
};

const TODAS = '__todas__';

/**
 * '6-4 7-5' · '6-3 4-6 [10-7]'.
 * El super muerte va con sus PUNTOS entre corchetes, no con el 1-0 que cuenta
 * para la tabla. Mismo formato que la pantalla de grupos del organizador.
 */
function marcadorDe(sets: SetGuardado[]): string | null {
  if (sets.length === 0) return null;
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((st) =>
      st.is_super_tiebreak && st.tiebreak_a != null && st.tiebreak_b != null
        ? `[${st.tiebreak_a}-${st.tiebreak_b}]`
        : `${st.games_a}-${st.games_b}`)
    .join(' ');
}

// ───────────────────────────────────────────
// Fetch
// ───────────────────────────────────────────

/**
 * Devuelve los partidos O LANZA. No se traga el error: quien llama distingue
 * "falló" de "no hay nada", que es justo lo que antes se confundía.
 */
async function fetchMatches(tournamentId: string): Promise<JudgeMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    // Sin embed de `pairs → users`: users_select_own solo deja leer la propia
    // fila, así que el juez veía '?' en el nombre de TODOS los jugadores de
    // todos los partidos que iba a arbitrar. Los nombres van por
    // bracket_pairs_public. Ver src/lib/parejas-publicas.ts.
    //
    // `categories`, `groups` y `match_sets` SÍ se embeben: la migración 040 los
    // deja leer a cualquiera en un torneo publicado.
    .select(
      `id, stage, round_label, status, pair_a_id, pair_b_id, scheduled_at,
       category_id, group_id, winner_pair_id,
       categories:category_id ( display_name ),
       groups:group_id ( name ),
       match_sets ( set_number, games_a, games_b, is_super_tiebreak, tiebreak_a, tiebreak_b )`
    )
    .eq('tournament_id', tournamentId);

  if (error) throw new Error(error.message);

  const filas = (data ?? []) as unknown as Array<{
    id: string; stage: string; round_label: string | null;
    status: string; pair_a_id: string; pair_b_id: string;
    scheduled_at: string | null; category_id: string; group_id: string | null;
    winner_pair_id: string | null;
    categories: { display_name: string } | null;
    groups: { name: string } | null;
    match_sets: SetGuardado[] | null;
  }>;

  // Una consulta para los dos lados de todos los partidos: el helper deduplica,
  // y una misma pareja juega varios partidos del mismo torneo.
  const parejas = await fetchParejasPublicas(
    filas.flatMap((r) => [r.pair_a_id, r.pair_b_id]),
  );

  const salida: JudgeMatch[] = filas.map((row) => {
    const sets = row.match_sets ?? [];
    return {
      id: row.id,
      stage: row.stage,
      roundLabel: row.round_label,
      status: row.status,
      pairAId: row.pair_a_id,
      pairBId: row.pair_b_id,
      pairAName: nombreDePareja(parejas.get(row.pair_a_id)),
      pairBName: nombreDePareja(parejas.get(row.pair_b_id)),
      categoryId: row.category_id,
      categoryName: row.categories?.display_name ?? '—',
      groupId: row.group_id,
      groupName: row.groups?.name ?? null,
      scheduledAt: row.scheduled_at,
      winnerPairId: row.winner_pair_id,
      sets,
      marcador: marcadorDe(sets),
    };
  });

  return ordenarPartidos(salida);
}

// ───────────────────────────────────────────
// Pantalla
// ───────────────────────────────────────────

export default function JudgeTournamentScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const [matches, setMatches] = useState<JudgeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<JudgeMatch | null>(null);

  const [estado, setEstado] = useState<FiltroEstado>('pendientes');
  const [catId, setCatId] = useState<string>(TODAS);
  const [grupoId, setGrupoId] = useState<string>(TODAS);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoadError(null);
    try {
      setMatches(await fetchMatches(tournamentId));
    } catch (e) {
      // NO se degrada a lista vacía: eso pintaba "Todo al día" sobre un fallo.
      console.error('[JudgeTournament] fetch error:', e);
      setMatches([]);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { void load(); }, [load]);

  function handleSuccess() {
    setSelectedMatch(null);
    void load(); // refrescar lista
  }

  // ── Filtros ──────────────────────────────────────────────────────────────

  const categorias = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of matches) m.set(x.categoryId, x.categoryName);
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [matches]);

  // Los grupos dependen de la categoría elegida: enseñar los 55 de golpe sería
  // el mismo problema que la lista plana.
  const grupos = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of matches) {
      if (!x.groupId || !x.groupName) continue;
      if (catId !== TODAS && x.categoryId !== catId) continue;
      m.set(x.groupId, x.groupName);
    }
    return [...m.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  }, [matches, catId]);

  const visibles = useMemo(() => matches.filter((m) => {
    if (estado === 'pendientes' && m.status === 'finished') return false;
    if (estado === 'capturados' && m.status !== 'finished') return false;
    if (catId !== TODAS && m.categoryId !== catId) return false;
    if (grupoId !== TODAS && m.groupId !== grupoId) return false;
    return true;
  }), [matches, estado, catId, grupoId]);

  const pendientes = useMemo(
    () => matches.filter((m) => m.status !== 'finished').length,
    [matches],
  );

  function elegirCategoria(id: string) {
    setCatId(id);
    setGrupoId(TODAS); // el grupo elegido puede no existir en la nueva categoría
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      {/* Cabecera fuera del FlatList: no hereda la columna centrada del
          contentContainerStyle, así que la aporta ella misma. */}
      <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, ...webContentColumn }}>
        {/* `canGoBack` y no `router.back()` a secas: a esta pantalla se llega
            por `replace` desde la puerta del juez cuando solo arbitra un
            torneo, y ahí no hay historial que deshacer — el botón se pintaba
            igual y no hacía nada. Mismo criterio que BotonVolver. */}
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(judge)/juez');
          }}
          style={{ padding: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={{ color: color.gold, fontFamily: font.body, fontSize: 15 }}>← Volver</Text>
        </Pressable>
        {/* `minWidth: 0`: en el navegador un hijo flex no baja de su ancho
            intrínseco salvo que se le diga, y sin esto el título empujaba la
            fila más allá del borde en vez de recortarse. */}
        <Text
          style={{ fontFamily: font.display, fontSize: 18, fontWeight: '600', color: color.text, flex: 1, minWidth: 0 }}
          numberOfLines={1}
        >
          Partidos
        </Text>
      </View>

      {/* EL CONTADOR, EN SU PROPIA LÍNEA.
          Iba al final de la fila del título, pegado al borde derecho, y en un
          iPhone de 390px se comía sus propias letras: «159 por captur…». No es
          un dato de la cabecera, es el resumen de la lista — así que va debajo
          del título y alineado a la izquierda, donde se lee entero. */}
      {!loading && !loadError && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 10, ...webContentColumn }}>
          <Text style={{ fontFamily: font.body, fontSize: 12, color: color.muted }}>
            {pendientes} por capturar
          </Text>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.gold} />
        </View>
      ) : loadError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={{ color: color.danger, fontFamily: font.display, fontSize: 18, fontWeight: '600' }}>
            No se pudieron cargar los partidos
          </Text>
          <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 13, textAlign: 'center' }}>
            Esto NO quiere decir que no haya trabajo pendiente: la consulta falló.
          </Text>
          <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 11, textAlign: 'center' }}>
            {loadError}
          </Text>
          <Pressable
            onPress={() => { setLoading(true); void load(); }}
            style={{ marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.sm, backgroundColor: color.gold }}
            accessibilityRole="button"
            accessibilityLabel="Reintentar"
          >
            <Text style={{ fontFamily: font.body, fontSize: 14, fontWeight: '600', color: color.onGold }}>
              Reintentar
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* FILTROS
              Eran tres filas de píldoras seguidas, sin nada que dijera qué
              filtraba cada una: «Pendientes / Todas / Grupo A» se leía como una
              sola lista revuelta. Cada fila lleva ahora su rótulo, del mismo
              tipo que el FASE DE GRUPOS del resto de la app. */}
          <View style={{ paddingHorizontal: 18, gap: 8, ...webContentColumn }}>
            <Rotulo texto="Estado" />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {([
                ['pendientes', 'Pendientes'],
                ['capturados', 'Capturados'],
                ['todos', 'Todos'],
              ] as [FiltroEstado, string][]).map(([id, etiqueta]) => (
                <Chip
                  key={id}
                  texto={etiqueta}
                  activo={estado === id}
                  onPress={() => setEstado(id)}
                />
              ))}
            </View>

            {categorias.length > 1 && (
              <>
                <Rotulo texto="Categoría" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 18 }}>
                  <Chip texto="Todas" activo={catId === TODAS} onPress={() => elegirCategoria(TODAS)} />
                  {categorias.map((c) => (
                    <Chip key={c.id} texto={c.nombre} activo={catId === c.id} onPress={() => elegirCategoria(c.id)} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* LA FILA DE GRUPO SOLO EXISTE DENTRO DE UNA CATEGORÍA.
                Los grupos se llaman A, B, C DENTRO de su categoría, así que con
                «Todas» puesto la fila listaba el grupo A de cada una y salía
                «Grupo A · Grupo A · Grupo A»: tres píldoras distintas con el
                mismo nombre y ninguna forma de saber cuál era cuál. No es un
                problema de etiqueta —sería igual de malo poner «Grupo A (Mixta
                B)»— sino de que la pregunta «¿qué grupo?» no significa nada sin
                categoría. Se oculta la fila entera, rótulo incluido. */}
            {catId !== TODAS && grupos.length > 1 && (
              <>
                <Rotulo texto="Grupo" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 18 }}>
                  <Chip texto="Todos los grupos" activo={grupoId === TODAS} onPress={() => setGrupoId(TODAS)} />
                  {grupos.map((g) => (
                    <Chip key={g.id} texto={`Grupo ${g.nombre}`} activo={grupoId === g.id} onPress={() => setGrupoId(g.id)} />
                  ))}
                </ScrollView>
              </>
            )}
          </View>

          {visibles.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <Text style={{ color: estado === 'pendientes' ? color.live : color.muted, fontFamily: font.display, fontSize: 20, fontWeight: '600', marginBottom: 8 }}>
                {estado === 'pendientes' ? '✓ Todo al día' : 'Nada que mostrar'}
              </Text>
              <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 13, textAlign: 'center' }}>
                {estado === 'pendientes'
                  ? 'No hay partidos pendientes con estos filtros.'
                  : 'Ningún partido coincide con los filtros elegidos.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={visibles}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: bottomInset, ...webContentColumn }}
              renderItem={({ item }) => {
                const capturado = item.status === 'finished';
                const ganador = capturado && item.winnerPairId
                  ? (item.winnerPairId === item.pairAId ? item.pairAName : item.pairBName)
                  : null;
                return (
                  <Pressable
                    onPress={() => setSelectedMatch(item)}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? color.surface2 : color.surface,
                      borderRadius: radius.xl,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: capturado ? color.lineSoft : color.line,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={`${capturado ? 'Corregir' : 'Capturar'}: ${item.pairAName} vs ${item.pairBName}`}
                  >
                    {/* Contexto: etapa · categoría · grupo */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: color.surface2, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: font.display, fontSize: 10, color: color.champagne, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          {STAGE_LABEL[item.stage] ?? item.stage}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted }}>
                        {item.categoryName}
                        {item.groupName ? ` · Grupo ${item.groupName}` : ''}
                      </Text>
                      {capturado && (
                        <Text style={{ fontFamily: font.body, fontSize: 11, color: color.live }}>✓ capturado</Text>
                      )}
                    </View>

                    {/* Parejas */}
                    <Text style={{ fontFamily: font.display, fontSize: 14, fontWeight: '600', color: ganador === item.pairAName ? color.goldBright : color.text, marginBottom: 2 }}>
                      {item.pairAName}
                    </Text>
                    <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted, marginBottom: 2 }}>vs</Text>
                    <Text style={{ fontFamily: font.display, fontSize: 14, fontWeight: '600', color: ganador === item.pairBName ? color.goldBright : color.text, marginBottom: 8 }}>
                      {item.pairBName}
                    </Text>

                    {/* Hora / marcador + acción */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      {/* `minWidth: 0`: sin él, en web esta línea no baja de su
                          ancho intrínseco y empuja el «Capturar resultado →»
                          fuera de la tarjeta en vez de recortarse. */}
                      <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted, flex: 1, minWidth: 0 }} numberOfLines={1}>
                        {item.marcador
                          ? item.marcador
                          : item.scheduledAt
                            ? horaDeTorneo(item.scheduledAt)
                            : 'Sin hora asignada'}
                      </Text>
                      <Text style={{ fontFamily: font.body, fontSize: 12, color: color.gold, fontWeight: '600' }}>
                        {capturado ? 'Corregir →' : 'Capturar resultado →'}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </>
      )}

      {/* La hoja de captura.
          Era un `<Modal presentationStyle="pageSheet">`: esa prop solo hace
          algo en iOS nativo, así que en web —y la web móvil es donde captura
          el juez— salía a pantalla completa y el contenido se perdía por
          debajo del pliegue. `Hoja` acota la altura y mete el cuerpo en un
          scroller que llega hasta el botón de confirmar. */}
      {selectedMatch && (
        <Hoja
          visible
          onClose={() => setSelectedMatch(null)}
          eyebrow={
            `${selectedMatch.categoryName}` +
            `${selectedMatch.groupName ? ` · Grupo ${selectedMatch.groupName}` : ''}` +
            ` · ${STAGE_LABEL[selectedMatch.stage] ?? selectedMatch.stage}`
          }
          titulo={selectedMatch.status === 'finished' ? 'Corregir resultado' : 'Capturar resultado'}
          ancho={HOJA_FORMULARIO}
          subtitulo={
            <>
              <Text style={{ fontFamily: font.body, fontSize: 14, color: color.text, lineHeight: 21 }}>
                {selectedMatch.pairAName} vs {selectedMatch.pairBName}
              </Text>
              {selectedMatch.marcador && (
                <Text style={{ fontFamily: font.body, fontSize: 12, color: color.champagne, marginTop: 4 }}>
                  Guardado: {selectedMatch.marcador}
                </Text>
              )}
            </>
          }
        >
          <ScoreCapture
            matchId={selectedMatch.id}
            pairAId={selectedMatch.pairAId}
            pairBId={selectedMatch.pairBId}
            pairAName={selectedMatch.pairAName}
            pairBName={selectedMatch.pairBName}
            setsIniciales={selectedMatch.sets}
            ganadorInicial={selectedMatch.winnerPairId}
            onSuccess={handleSuccess}
          />
        </Hoja>
      )}
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────
// Rótulo de fila de filtro
// ───────────────────────────────────────────

/**
 * El título de una fila de filtros: versalitas pequeñas y grises.
 *
 * Mismas medidas que el «FASE DE GRUPOS» de bloques/grupos/cerrar-inscripciones
 * (Oswald 12, tracking 1.8, `color.muted`), para que se lea como el mismo
 * elemento de la misma app y no como una etiqueta inventada aquí.
 */
function Rotulo({ texto }: { texto: string }) {
  return (
    <Text
      style={{
        fontFamily: font.display,
        fontSize: 12,
        color: color.muted,
        letterSpacing: 1.8,
        textTransform: 'uppercase',
      }}
    >
      {texto}
    </Text>
  );
}

// ───────────────────────────────────────────
// Chip de filtro
// ───────────────────────────────────────────

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: activo ? color.gold : color.lineSoft,
        backgroundColor: activo ? 'rgba(212,175,55,0.12)' : color.surface,
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={texto}
    >
      <Text style={{ fontFamily: font.body, fontSize: 12, color: activo ? color.goldBright : color.muted, fontWeight: activo ? '600' : '400' }}>
        {texto}
      </Text>
    </Pressable>
  );
}
