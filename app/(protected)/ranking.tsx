/**
 * app/(protected)/ranking.tsx
 * Mi Ranking — posición en la red por categoría/división.
 * Read-path: ranking_public — vista pública post-migración 028 (bien común de red, cruza organizadores).
 * NUNCA leer player_ratings directo: acceso revocado para roles de cliente en la migración 028.
 * Sprint 5 · S5-SON-01
 *
 * NOTA (ajuste §0): ranking_public YA expone full_name (join a users resuelto en la vista),
 * por eso se lee full_name directo y NO se usa el embed users:player_id(full_name)
 * (PostgREST no puede embeder users desde una vista sin relación FK detectable).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { color, radius, space, font } from '@/lib/design-tokens';
import { webContentColumn } from '@/lib/web-layout';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

// ─── Tipos ───────────────────────────────────────────────────────────────

type RankRow = {
  player_id: string;
  full_name: string | null;
  points: number;
  position: number;
  is_me: boolean;
};

type MyRankSummary = {
  points: number;
  position: number;
  total_players: number;
  delta_this_week: number | null; // null si no hay datos previos
  win_rate: number | null;        // porcentaje 0-100, null si sin partidos
  streak: number;                 // racha actual de victorias (0 si ninguna)
  tournaments_played: number;
};

/**
 * Del esquema, no escrito a mano. `ranking_public` es una VISTA, y Postgres no
 * propaga NOT NULL a través de una vista: por eso sus columnas llegan como
 * `| null` aunque en la práctica nunca lo sean. Se normaliza con `?? 0` en el
 * punto de uso — nunca con `!`, que le mentiría al compilador y reventaría el
 * día que la vista sí devuelva un hueco.
 */
type Division = Database['public']['Enums']['division'];

type DivisionOption = {
  label: string;
  value: Division; // ej. "primera", "quinta"
};

/**
 * Fila de `ranking_champions` (campeones de temporadas ya cerradas).
 * Aparte de `RankRow` a propósito: esa vista trae `season`/`photo_url`/
 * `torneos`, que `ranking_public` no tiene — mezclarlas ensuciaría RankRow
 * con campos que no aplican al leaderboard de la temporada en curso.
 */
type ChampionRow = {
  division: Division;
  season: number;
  player_id: string;
  full_name: string | null;
  photo_url: string | null;
  points: number;
  torneos: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Formatea posición ordinal: 1 → "#1", 7 → "#7" */
function fmtPos(pos: number): string {
  return `#${pos}`;
}

/** Top percentil: posición / total → "Top X%" */
function fmtPercentile(pos: number, total: number): string {
  if (total === 0) return '';
  const pct = Math.ceil((pos / total) * 100);
  return `Top ${pct}%`;
}

/** Iniciales de nombre para avatar */
function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// ─── Componente ──────────────────────────────────────────────────────────

export default function RankingScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);
  const [summary, setSummary] = useState<MyRankSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<RankRow[]>([]);
  const [champions, setChampions] = useState<ChampionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Temporada mostrada. Arranca en el año actual; sin selector todavía
  // (eso es para cuando se pueda navegar a temporadas cerradas), pero ya
  // vive en estado para que el encabezado nunca hardcodee el año.
  const [seasonSeleccionada] = useState<number>(() => new Date().getFullYear());
  const esTemporadaActual = seasonSeleccionada === new Date().getFullYear();

  // Obtener usuario actual
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // Cargar divisiones disponibles para este jugador en la temporada actual.
  //
  // `loading` arranca en `true` y este es el único efecto que corre siempre
  // (no depende de tener ya una división elegida), así que es quien tiene
  // que apagarlo — y lo hace en el `finally`, sin importar si encontró
  // divisiones, si no encontró ninguna, o si la consulta falló. Antes solo
  // se apagaba dentro de `loadRanking`, que nunca llega a ejecutarse si no
  // hay ninguna división: por eso el spinner se quedaba para siempre en
  // cuentas sin filas de ranking (que hoy es TODA la base).
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('ranking_public')
          .select('division')
          .eq('player_id', userId)
          .eq('season', seasonSeleccionada)
          .order('points', { ascending: false });

        if (err) {
          setError('No se pudo cargar el ranking. Intenta de nuevo.');
          return;
        }

        // Deduplica divisiones del jugador y construye opciones.
        // `division` llega nullable por ser columna de vista: las filas sin
        // división no representan ninguna opción y se descartan.
        const seen = new Set<Division>();
        const opts: DivisionOption[] = [];
        (data ?? []).forEach((row) => {
          if (row.division && !seen.has(row.division)) {
            seen.add(row.division);
            opts.push({ label: labelForDivision(row.division), value: row.division });
          }
        });

        setDivisions(opts);
        if (opts.length > 0) {
          // Si la división ya elegida sigue existiendo en esta temporada,
          // no la pisamos (respeta la elección del usuario). Si no —
          // primera carga, o la temporada cambió y ya no aplica— cae a la
          // de más puntos.
          const sigueValida = selectedDivision && opts.some((o) => o.value === selectedDivision);
          if (!sigueValida) setSelectedDivision(opts[0].value);
        } else {
          // Sin ninguna fila: no hay división que elegir. `loadRanking`
          // nunca corre para este caso (su guard de arriba lo evita), así
          // que hay que limpiar el estado de ranking a mano.
          setSelectedDivision(null);
          setSummary(null);
          setLeaderboard([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, seasonSeleccionada]);

  // Cargar datos de la división seleccionada.
  //
  // El guard de abajo solo puede disparar el `return` mientras el efecto de
  // divisiones todavía no resolvió (userId o selectedDivision aún null) —
  // y ese efecto SIEMPRE apaga `loading` en su `finally`, haya encontrado
  // división o no. Por eso este `return` no necesita tocar `loading`: si
  // lo apagara aquí también, se adelantaría a que terminen de llegar las
  // divisiones y parpadearía el estado vacío antes de tiempo.
  const loadRanking = useCallback(async () => {
    if (!userId || !selectedDivision) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Mi fila en ranking_public
      const { data: myRow, error: myErr } = await supabase
        .from('ranking_public')
        .select('points, position')
        .eq('player_id', userId)
        .eq('division', selectedDivision)
        .eq('season', seasonSeleccionada)
        .maybeSingle();

      if (myErr) throw myErr;

      // 2. Total de jugadores en esta división (misma temporada)
      const { count: totalCount } = await supabase
        .from('ranking_public')
        .select('*', { count: 'exact', head: true })
        .eq('division', selectedDivision)
        .eq('season', seasonSeleccionada);

      // 3. Top 50 del leaderboard (full_name viene directo de la vista, sin embed)
      const { data: board, error: boardErr } = await supabase
        .from('ranking_public')
        .select(`
          player_id,
          points,
          position,
          full_name
        `)
        .eq('division', selectedDivision)
        .eq('season', seasonSeleccionada)
        .order('position', { ascending: true })
        .limit(50);

      if (boardErr) throw boardErr;

      // 4. Estadísticas descriptivas del jugador (matches terminados).
      // NOTA: esta RPC no tiene parámetro de temporada (`Args` es solo
      // p_player_id/p_division en el esquema) y devuelve Json escalar, no
      // filas — no hay columna `season` sobre la que encadenar `.eq()`.
      // Agregarle un p_season requeriría tocar la función en una migración,
      // fuera de alcance de esta pasada. Se deja pendiente.
      const { data: matchStats } = await supabase.rpc('get_player_match_stats', {
        p_player_id: userId,
        p_division: selectedDivision,
      });
      // Si la RPC no existe aún, matchStats será null → se maneja con fallback

      const stats = matchStats as {
        win_rate: number | null;
        streak: number;
        tournaments_played: number;
      } | null;

      setSummary({
        points: myRow?.points ?? 0,
        position: myRow?.position ?? 0,
        total_players: totalCount ?? 0,
        delta_this_week: null, // TODO: implementar delta cuando haya histórico semanal
        win_rate: stats?.win_rate ?? null,
        streak: stats?.streak ?? 0,
        tournaments_played: stats?.tournaments_played ?? 0,
      });

      // Sin `: any`: el cliente tipado ya describe la vista. Los `?? 0` cubren
      // la nullabilidad que la vista arrastra (ver nota en `Division`), y las
      // filas sin player_id se descartan porque no se pueden comparar ni usar
      // como key de lista.
      const rows: RankRow[] = (board ?? [])
        .filter((r): r is typeof r & { player_id: string } => r.player_id !== null)
        .map((r) => ({
          player_id: r.player_id,
          full_name: r.full_name ?? null,
          points: r.points ?? 0,
          position: r.position ?? 0,
          is_me: r.player_id === userId,
        }));

      // Si el jugador autenticado no está en el top 50, agregar su fila al final
      if (myRow && !rows.some((r) => r.player_id === userId)) {
        rows.push({
          player_id: userId,
          full_name: null,
          points: myRow.points ?? 0,
          position: myRow.position ?? 0,
          is_me: true,
        });
      }

      setLeaderboard(rows);
    } catch (e: any) {
      setError('No se pudo cargar el ranking. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [userId, selectedDivision, seasonSeleccionada]);

  useEffect(() => {
    loadRanking();
  }, [loadRanking]);

  // Campeones de temporadas cerradas para la división elegida. Vive aparte
  // de `loadRanking`: si esta consulta falla no hay razón para tumbar el
  // leaderboard de la temporada en curso, así que no toca `loading`/`error`.
  useEffect(() => {
    if (!selectedDivision) {
      setChampions([]);
      return;
    }
    (async () => {
      const { data, error: err } = await supabase
        .from('ranking_champions')
        .select('division, season, player_id, full_name, photo_url, points, torneos')
        .eq('division', selectedDivision)
        .order('season', { ascending: false });

      if (err) {
        setChampions([]);
        return;
      }

      // Mismo criterio de nulabilidad que en `board`: sin player_id o
      // season no hay fila que mostrar ni key que usarle en el map.
      const rows: ChampionRow[] = (data ?? [])
        .filter(
          (r): r is typeof r & { player_id: string; season: number; division: Division } =>
            r.player_id !== null && r.season !== null && r.division !== null
        )
        .map((r) => ({
          division: r.division,
          season: r.season,
          player_id: r.player_id,
          full_name: r.full_name,
          photo_url: r.photo_url,
          points: r.points ?? 0,
          torneos: r.torneos ?? 0,
        }));

      setChampions(rows);
    })();
  }, [selectedDivision]);

  // ─── Render ──────────────────────────────────────────────────────────

  if (loading && !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space[6], ...webContentColumn }}
      >
        {/* Encabezado */}
        <View style={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[2] }}>
          <Text
            style={{
              fontFamily: font.display,
              fontWeight: '600',
              fontSize: 28,
              color: color.text,
              letterSpacing: 0.4,
            }}
          >
            Mi Ranking
          </Text>
        </View>

        {/* Selector de división */}
        {divisions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space[4], gap: 8, paddingBottom: space[2] }}
          >
            {divisions.map((div) => {
              const active = div.value === selectedDivision;
              return (
                <Pressable
                  key={div.value}
                  onPress={() => setSelectedDivision(div.value)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: radius.pill,
                    backgroundColor: active ? color.gold : color.surface,
                    borderWidth: 1,
                    borderColor: active ? color.gold : color.line,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontWeight: '600',
                      fontSize: 12.5,
                      color: active ? color.onGold : color.goldBright,
                    }}
                  >
                    {div.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {error && (
          <View style={{ paddingHorizontal: space[4], marginTop: space[3] }}>
            <Text style={{ color: color.danger, fontFamily: font.body, fontSize: 13 }}>
              {error}
            </Text>
          </View>
        )}

        {/* Estado vacío: el jugador no tiene ninguna fila de ranking todavía
            (nunca eligió división porque no hay ninguna). Distinto del caso
            de abajo, que sí tiene división pero posición 0. */}
        {!loading && !error && userId && divisions.length === 0 && (
          <NoRankingEmpty />
        )}

        {/* Estado vacío: el jugador aún no tiene ranking en esta división */}
        {!loading && !error && summary && summary.position === 0 && (
          <EmptyRanking />
        )}

        {/* Hero de posición */}
        {summary && summary.position > 0 && (
          <HeroCard summary={summary} division={selectedDivision} />
        )}

        {/* Stats rápidos */}
        {summary && summary.position > 0 && (
          <StatsRow summary={summary} />
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <View style={{ marginTop: space[4], paddingHorizontal: space[4] }}>
            <Text
              style={{
                fontFamily: font.body,
                fontSize: 12.5,
                color: color.muted,
                marginBottom: space[2],
              }}
            >
              {`Temporada ${seasonSeleccionada}${esTemporadaActual ? ' · En disputa' : ''}`}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] }}>
              <Text
                style={{
                  fontFamily: font.display,
                  fontWeight: '500',
                  fontSize: 13,
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  color: color.champagne,
                }}
              >
                Ranking de red
              </Text>
            </View>

            {leaderboard.map((row) => (
              <LeaderboardRow key={row.player_id} row={row} />
            ))}
          </View>
        )}

        {/* Campeones de temporadas cerradas en esta división. Si no hay
            ninguno todavía, la sección simplemente no aparece. */}
        {champions.length > 0 && (
          <View style={{ marginTop: space[5], paddingHorizontal: space[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] }}>
              <Text
                style={{
                  fontFamily: font.display,
                  fontWeight: '500',
                  fontSize: 13,
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  color: color.champagne,
                }}
              >
                Campeones
              </Text>
            </View>

            {champions.map((c) => (
              <ChampionRowItem key={`${c.season}-${c.player_id}`} champion={c} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

function HeroCard({
  summary,
  division,
}: {
  summary: MyRankSummary;
  division: Division | null;
}) {
  const pct = fmtPercentile(summary.position, summary.total_players);
  return (
    <View style={{ paddingHorizontal: space[4], marginTop: space[3] }}>
      {/* Tarjeta hero con borde dorado superior */}
      <View
        style={{
          borderRadius: radius.xl2,
          backgroundColor: color.surface,
          borderWidth: 1,
          borderColor: color.line,
          overflow: 'hidden',
        }}
      >
        {/* Raya dorada superior */}
        <LinearGradient
          colors={[color.goldDeep, color.goldBright, color.goldDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 3 }}
        />
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: font.display,
              letterSpacing: 3,
              fontSize: 11,
              color: color.gold,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Posición en la red
          </Text>

          {/* Número grande */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Text
              style={{
                fontFamily: font.display,
                fontWeight: '600',
                fontSize: 26,
                color: color.gold,
                marginTop: 6,
                marginRight: 2,
              }}
            >
              #
            </Text>
            <Text
              style={{
                fontFamily: font.display,
                fontWeight: '600',
                fontSize: 74,
                lineHeight: 72,
                color: color.goldBright,
              }}
            >
              {summary.position}
            </Text>
          </View>

          <Text style={{ fontFamily: font.body, fontSize: 13, color: color.champagne, marginTop: 2 }}>
            {division ? labelForDivision(division) : ''} · {summary.total_players} jugadores
          </Text>

          {/* Pills: puntos + percentil */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <PillChip label={`${summary.points.toLocaleString()} pts`} icon="🏆" />
            {pct !== '' && <PillChip label={pct} />}
            {summary.delta_this_week !== null && summary.delta_this_week !== 0 && (
              <PillChip
                label={`${summary.delta_this_week > 0 ? '▲' : '▼'} ${Math.abs(summary.delta_this_week)} esta semana`}
                positive={summary.delta_this_week > 0}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function PillChip({
  label,
  icon,
  positive,
}: {
  label: string;
  icon?: string;
  positive?: boolean;
}) {
  const textColor =
    positive === true ? color.live : positive === false ? color.danger : color.champagne;
  const borderColor =
    positive === true
      ? 'rgba(66,214,164,0.3)'
      : positive === false
      ? 'rgba(224,114,111,0.3)'
      : color.line;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderWidth: 1,
        borderColor,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      {icon && <Text style={{ fontSize: 12 }}>{icon}</Text>}
      <Text style={{ fontFamily: font.body, fontSize: 11.5, color: textColor, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

function StatsRow({ summary }: { summary: MyRankSummary }) {
  const items = [
    {
      value: summary.win_rate !== null ? `${Math.round(summary.win_rate)}%` : '—',
      label: 'Win-rate',
    },
    {
      value: summary.streak > 0 ? `🔥 ${summary.streak}` : '—',
      label: 'Racha',
    },
    {
      value: summary.tournaments_played > 0 ? String(summary.tournaments_played) : '—',
      label: 'Torneos',
    },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: space[4], marginTop: 13 }}>
      {items.map((item) => (
        <View
          key={item.label}
          style={{
            flex: 1,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: color.lineSoft,
            borderRadius: radius.lg,
            paddingVertical: 13,
            paddingHorizontal: 10,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontWeight: '600',
              fontSize: 22,
              color: color.goldBright,
            }}
          >
            {item.value}
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: 10, color: color.muted, marginTop: 3 }}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LeaderboardRow({ row }: { row: RankRow }) {
  const isTop3 = row.position <= 3;
  const bgColor = row.is_me
    ? 'rgba(212,175,55,0.08)'
    : 'transparent';
  const borderColor = row.is_me ? color.line : 'transparent';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        backgroundColor: bgColor,
        borderWidth: row.is_me ? 1 : 0,
        borderColor,
        marginBottom: 4,
      }}
    >
      {/* Posición */}
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '600',
          fontSize: isTop3 ? 16 : 14,
          color: isTop3 ? color.goldBright : color.muted,
          width: 32,
        }}
      >
        {fmtPos(row.position)}
      </Text>

      {/* Avatar */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.pill,
          backgroundColor: row.is_me ? color.gold : color.surface2,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
          borderWidth: row.is_me ? 0 : 1,
          borderColor: color.lineSoft,
        }}
      >
        <Text
          style={{
            fontFamily: font.display,
            fontWeight: '600',
            fontSize: 13,
            color: row.is_me ? color.onGold : color.champagne,
          }}
        >
          {initials(row.full_name)}
        </Text>
      </View>

      {/* Nombre */}
      <Text
        style={{
          flex: 1,
          fontFamily: font.body,
          fontWeight: row.is_me ? '600' : '400',
          fontSize: 14,
          color: row.is_me ? color.text : color.champagne,
        }}
        numberOfLines={1}
      >
        {row.is_me ? 'Tú' : (row.full_name ?? 'Jugador')}
      </Text>

      {/* Puntos */}
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '600',
          fontSize: 14,
          color: row.is_me ? color.goldBright : color.muted,
        }}
      >
        {row.points.toLocaleString()}
      </Text>
    </View>
  );
}

function ChampionRowItem({ champion }: { champion: ChampionRow }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        marginBottom: 4,
      }}
    >
      {/* Año */}
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '600',
          fontSize: 14,
          color: color.goldBright,
          width: 48,
        }}
      >
        {champion.season}
      </Text>

      {/* Nombre */}
      <Text
        style={{
          flex: 1,
          fontFamily: font.body,
          fontSize: 14,
          color: color.champagne,
        }}
        numberOfLines={1}
      >
        {champion.full_name ?? 'Jugador'}
      </Text>

      {/* Puntos */}
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '600',
          fontSize: 14,
          color: color.muted,
        }}
      >
        {champion.points.toLocaleString()}
      </Text>
    </View>
  );
}

/** Estado vacío cuando el jugador no tiene ninguna fila en ranking_public
 *  (aún no jugó ningún torneo terminado en ninguna división). */
function NoRankingEmpty() {
  return (
    <View
      style={{
        marginHorizontal: space[4],
        marginTop: space[4],
        backgroundColor: color.surface,
        borderRadius: radius.xl2,
        borderWidth: 1,
        borderColor: color.lineSoft,
        padding: space[5],
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 32 }}>🎾</Text>
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '500',
          fontSize: 17,
          color: color.text,
          textAlign: 'center',
        }}
      >
        Todavía no tienes puntos de ranking
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 13,
          color: color.muted,
          textAlign: 'center',
          lineHeight: 20,
        }}
      >
        Juega tu primer torneo para aparecer aquí.
      </Text>
    </View>
  );
}

function EmptyRanking() {
  return (
    <View
      style={{
        marginHorizontal: space[4],
        marginTop: space[4],
        backgroundColor: color.surface,
        borderRadius: radius.xl2,
        borderWidth: 1,
        borderColor: color.lineSoft,
        padding: space[5],
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 32 }}>🎾</Text>
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '500',
          fontSize: 17,
          color: color.text,
          textAlign: 'center',
        }}
      >
        Aún sin ranking en esta categoría
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 13,
          color: color.muted,
          textAlign: 'center',
          lineHeight: 20,
        }}
      >
        Tu posición en la red aparece aquí después de tu primer torneo terminado.
      </Text>
    </View>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────

/** Convierte el valor de división del enum a etiqueta legible.
 *  Enum real public.division = primera..sexta (solo tier). Se mantienen también
 *  las claves con sufijo de género por compatibilidad futura. */
/**
 * Etiqueta corta de una división. El parámetro es el enum del esquema, así que
 * el mapa solo puede tener las seis claves que existen — las variantes
 * `*_varonil` / `*_femenil` / `*_mixto` que vivían aquí eran de un esquema
 * anterior y ninguna llamada podía alcanzarlas.
 */
function labelForDivision(value: Division): string {
  const map: Record<Division, string> = {
    primera: '1ª',
    segunda: '2ª',
    tercera: '3ª',
    cuarta: '4ª',
    quinta: '5ª',
    sexta: '6ª',
  };
  return map[value] ?? value;
}
