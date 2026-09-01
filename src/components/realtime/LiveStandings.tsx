/**
 * src/components/realtime/LiveStandings.tsx
 *
 * RALLY · Tabla de posiciones EN VIVO de un grupo.
 *
 * REGLAS:
 * - Lee group_standings ya calculado por el motor 12 vía match-result.
 * - NUNCA recalcula posiciones aquí. Solo renderiza.
 * - Se actualiza sin recargar via Supabase Realtime.
 * - Colores y tipografía exclusivamente desde design-tokens.ts.
 * - Solo primitivos React Native + NativeWind. Sin div/span/button.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, Pressable } from 'react-native';
import { color, radius, font } from '@/lib/design-tokens';
import { LEYENDA_TABLA } from '@/lib/desempate-texto';
import { supabase } from '@/lib/supabase/client';
import { subscribeToTable, groupChannel } from '@/lib/realtime/channels';
import { fetchParejasPublicas } from '@/lib/parejas-publicas';

// ───────────────────────────────────────────
// Tipos locales (sin reimportar el engine)
// ───────────────────────────────────────────

type ClinchStatus = 'clinched' | 'alive' | 'eliminated' | 'repechage_pending';

interface StandingRow {
  id: string;
  pair_id: string;
  player1_name: string;
  player2_name: string;
  played: number;
  won: number;
  lost: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  points: number;
  position: number;
  clinch_status: ClinchStatus;
  /** Para resaltar TU fila. Null si la vista no resolvió la pareja. */
  player1_id: string | null;
  player2_id: string | null;
}

export interface LiveStandingsProps {
  groupId: string;
  /** ID del jugador autenticado para resaltar su fila. */
  currentUserId?: string;
  /** Cuántas parejas pasan de este grupo (para línea de corte visual). */
  advanceCount?: number;
  /**
   * Filas ya resueltas por quien llama. Si se pasan, el componente NO consulta
   * ni se suscribe a Realtime.
   *
   * Existe para la pantalla de grupos del organizador, que pinta hasta diez
   * grupos a la vez: diez componentes autoabasteciéndose serían diez consultas
   * y diez suscripciones para datos que se traen de una en una sola consulta
   * por categoría.
   *
   * Sin la prop, el comportamiento es el de siempre — la rama del jugador.
   */
  filas?: StandingRow[];
  /**
   * pair_id de las parejas que empataron en TODOS los criterios.
   *
   * Para esas el orden de la tabla salió del orden de las filas, no del
   * reglamento. Se marcan y se les esconde el sello de CLASIFICADO/ELIMINADO:
   * enseñar un sello sobre un orden que puede cambiar al recalcular es
   * exactamente la mentira que había que quitar.
   */
  empatadasSinResolver?: string[];
  /** Aviso a pintar ARRIBA de la tabla cuando hay un empate que nadie resuelve. */
  avisoEmpate?: string | null;
  /** Línea corta bajo la tabla: con qué criterio se resolvió el empate. */
  explicacionDesempate?: string | null;
}

export type { StandingRow };

// ───────────────────────────────────────────
// Colores semánticos (de design-tokens.ts)
// ───────────────────────────────────────────

const CLINCH_COLORS: Record<ClinchStatus, string> = {
  clinched: color.gold,
  alive: color.alive,
  // Pendiente de repesca NO es eliminación: no se pinta de rojo.
  repechage_pending: color.alive,
  eliminated: color.danger,
};

const CLINCH_BG: Record<ClinchStatus, string> = {
  clinched: 'rgba(212,175,55,0.12)',
  alive: 'rgba(230,180,80,0.10)',
  repechage_pending: 'rgba(230,180,80,0.10)',
  eliminated: 'rgba(224,114,111,0.10)',
};

const CLINCH_TEXTO: Record<ClinchStatus, string> = {
  clinched: '✓ Clasificado',
  alive: 'En juego',
  repechage_pending: 'Pendiente de repesca',
  eliminated: 'Eliminado',
};

// ───────────────────────────────────────────
// Fetch inicial
// ───────────────────────────────────────────

async function fetchStandings(groupId: string): Promise<StandingRow[]> {
  // Sin embed de `pairs → users`: users_select_own solo deja leer la propia
  // fila, así que ese embed devolvía null para todos los rivales. Los nombres
  // van por bracket_pairs_public. Ver src/lib/parejas-publicas.ts.
  const { data, error } = await supabase
    .from('group_standings')
    .select(
      `id, pair_id, played, won, lost,
       sets_won, sets_lost, games_won, games_lost,
       points, position, clinch_status`
    )
    .eq('group_id', groupId)
    .order('position', { ascending: true });

  if (error) throw error;

  const filas = data ?? [];
  const parejas = await fetchParejasPublicas(filas.map((f) => f.pair_id));

  return filas.map((row) => ({
    id: row.id,
    pair_id: row.pair_id,
    player1_name: parejas.get(row.pair_id)?.player1_name ?? '—',
    player2_name: parejas.get(row.pair_id)?.player2_name ?? '—',
    played: row.played,
    won: row.won,
    lost: row.lost,
    sets_won: row.sets_won,
    sets_lost: row.sets_lost,
    games_won: row.games_won,
    games_lost: row.games_lost,
    points: row.points,
    position: row.position,
    clinch_status: (row.clinch_status ?? 'alive') as ClinchStatus,
    /** Los ids viajan para poder resaltar TU fila sin comparar por nombre. */
    player1_id: parejas.get(row.pair_id)?.player1_id ?? null,
    player2_id: parejas.get(row.pair_id)?.player2_id ?? null,
  }));
}

// ───────────────────────────────────────────
// Componente
// ───────────────────────────────────────────

export default function LiveStandings({
  groupId,
  currentUserId,
  advanceCount = 2,
  filas,
  empatadasSinResolver,
  avisoEmpate,
  explicacionDesempate,
}: LiveStandingsProps) {
  const empatadas = new Set(empatadasSinResolver ?? []);
  const inyectado = filas !== undefined;

  const [rows, setRows] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(!inyectado);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchStandings(groupId);
      setRows(data);
    } catch (e) {
      setError('No se pudo cargar la tabla. Intenta de nuevo.');
      console.error('[LiveStandings] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    // Con filas inyectadas los datos son de quien llama: ni consulta ni canal.
    if (inyectado) return;

    load();

    // Suscripción Realtime a cambios de group_standings del grupo
    const unsub = subscribeToTable<Record<string, unknown>>({
      channelName: groupChannel(groupId),
      table: 'group_standings',
      filter: `group_id=eq.${groupId}`,
      onData: () => {
        // Al recibir cualquier cambio, re-fetch completo para mantener orden y relaciones
        load();
      },
      onError: (e) => {
        console.warn('[LiveStandings] realtime error:', e);
      },
    });

    return unsub;
  }, [groupId, load, inyectado]);

  const datos = inyectado ? filas! : rows;

  // ¿Ya se jugó algo en este grupo?
  //
  // Con cero partidos jugados TODAS las filas traen position 0 y puntos 0: no
  // hay orden, hay empate absoluto. Numerar eso sería inventar una
  // clasificación, y dibujar la línea de corte separaría parejas por un
  // criterio que todavía no existe.
  const hayResultados = datos.some((r) => r.played > 0);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: 16, alignItems: 'center' }}>
        <Text style={{ color: color.danger, fontFamily: font.body, fontSize: 13 }}>{error}</Text>
        <Pressable
          onPress={load}
          style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 16,
            backgroundColor: color.surface, borderRadius: radius.sm }}
          accessibilityRole="button"
          accessibilityLabel="Reintentar cargar tabla"
        >
          <Text style={{ color: color.gold, fontFamily: font.body, fontWeight: '600', fontSize: 13 }}>
            Reintentar
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: color.lineSoft,
      }}
    >
      {/* EMPATE QUE EL REGLAMENTO NO RESUELVE.
          Va ARRIBA, antes que la tabla, porque cambia cómo hay que leerla:
          debajo hay un orden que no significa nada hasta que haya sorteo. */}
      {hayResultados && avisoEmpate && (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: 'rgba(230,180,80,0.10)',
            borderBottomWidth: 1,
            borderBottomColor: color.lineSoft,
          }}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontSize: 10,
              fontWeight: '600',
              color: color.alive,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 3,
            }}
          >
            Empate sin resolver
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: 12, color: color.text, lineHeight: 17 }}>
            {avisoEmpate}
          </Text>
        </View>
      )}

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: color.lineSoft,
        }}
      >
        {hayResultados && <Text style={[styles.headerCell, { flex: 0.35 }]}>#</Text>}
        <Text style={[styles.headerCell, { flex: 2 }]}>PAREJA</Text>
        <Text style={[styles.headerCell, { flex: 0.5, textAlign: 'center' }]}>PJ</Text>
        <Text style={[styles.headerCell, { flex: 0.5, textAlign: 'center' }]}>G</Text>
        <Text style={[styles.headerCell, { flex: 0.5, textAlign: 'center' }]}>P</Text>
        <Text style={[styles.headerCell, { flex: 0.6, textAlign: 'center' }]}>SETS</Text>
        <Text style={[styles.headerCell, { flex: 0.7, textAlign: 'right' }]}>PTS</Text>
      </View>

      {/* Filas */}
      {datos.map((row, idx) => {
        // Antes era `row.player1_name !== '—'`, un placeholder que resaltaba
        // TODAS las filas con nombre. Ahora se compara por id, que además no
        // falla con homónimos.
        const isMe = !!currentUserId
          && (row.player1_id === currentUserId || row.player2_id === currentUserId);
        // La línea de corte solo cuando hay un orden que cortar.
        const isCutoff = hayResultados && idx === advanceCount - 1;
        const clinchColor = CLINCH_COLORS[row.clinch_status];
        const clinchBg = CLINCH_BG[row.clinch_status];
        const setDiff = row.sets_won - row.sets_lost;
        // Empatada en todo: su posición es provisional y su sello, prematuro.
        const enEmpate = hayResultados && empatadas.has(row.pair_id);

        return (
          <React.Fragment key={row.id}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: enEmpate
                  ? 'rgba(230,180,80,0.08)'
                  : isMe ? 'rgba(212,175,55,0.07)' : 'transparent',
                // Filo lateral en las filas del empate: se ven como un bloque.
                borderLeftWidth: enEmpate ? 3 : 0,
                borderLeftColor: color.alive,
                paddingLeft: enEmpate ? 11 : 14,
              }}
            >
              {/* Posición. Sin resultados no se pinta: serían ceros en fila. */}
              {hayResultados && (
                <View style={{ flex: 0.35, alignItems: 'flex-start' }}>
                  <Text
                    style={{
                      fontFamily: font.display,
                      fontSize: 16,
                      fontWeight: '600',
                      color: enEmpate
                        ? color.muted
                        : row.position <= advanceCount ? color.gold : color.muted,
                    }}
                  >
                    {/* Con el empate sin resolver el número no es un puesto:
                        es el sitio donde cayó la fila. Se dice con el '=' en
                        vez de fingir un 1, un 2 y un 3. */}
                    {enEmpate ? `=${row.position}` : row.position}
                  </Text>
                </View>
              )}

              {/* Pareja + badge clinch */}
              <View style={{ flex: 2 }}>
                <Text
                  style={{
                    fontFamily: font.body,
                    fontSize: 12,
                    fontWeight: '600',
                    color: color.text,
                  }}
                  numberOfLines={1}
                >
                  {row.player1_name} / {row.player2_name}
                </Text>
                {/* Badge de clinch. Sin resultados todas las parejas están
                    'alive' y repetir "En juego" ocho veces no dice nada. */}
                {hayResultados && (
                <View
                  style={{
                    marginTop: 3,
                    alignSelf: 'flex-start',
                    backgroundColor: enEmpate ? 'rgba(230,180,80,0.10)' : clinchBg,
                    borderRadius: radius.pill,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.display,
                      fontSize: 9,
                      fontWeight: '500',
                      color: enEmpate ? color.alive : clinchColor,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                    }}
                  >
                    {/* Ni CLASIFICADO ni ELIMINADO mientras el empate siga sin
                        resolverse: cuál de las dos cosas es todavía no se
                        sabe, y el sello se lee como definitivo. */}
                    {enEmpate ? 'Empatadas · falta sorteo' : CLINCH_TEXTO[row.clinch_status]}
                  </Text>
                </View>
                )}
              </View>

              {/* PJ */}
              <Text style={[styles.dataCell, { flex: 0.5, textAlign: 'center' }]}>
                {row.played}
              </Text>
              {/* G */}
              <Text style={[styles.dataCell, { flex: 0.5, textAlign: 'center', color: color.live }]}>
                {row.won}
              </Text>
              {/* P */}
              <Text style={[styles.dataCell, { flex: 0.5, textAlign: 'center', color: color.danger }]}>
                {row.lost}
              </Text>
              {/* SETS diff */}
              <Text
                style={[
                  styles.dataCell,
                  {
                    flex: 0.6,
                    textAlign: 'center',
                    color: setDiff > 0 ? color.live : setDiff < 0 ? color.danger : color.muted,
                  },
                ]}
              >
                {setDiff > 0 ? `+${setDiff}` : setDiff}
              </Text>
              {/* PTS */}
              <Text
                style={[
                  styles.dataCell,
                  {
                    flex: 0.7,
                    textAlign: 'right',
                    fontFamily: font.display,
                    fontSize: 16,
                    fontWeight: '600',
                    color: color.goldBright,
                  },
                ]}
              >
                {row.points}
              </Text>
            </View>

            {/* Línea de corte visual después de la última pareja que clasifica.

                `datos.length` y NO `rows.length`: `rows` es solo el estado de
                la consulta propia, y con filas inyectadas —que es como la usa
                TODA la pantalla de Grupos del organizador— se queda vacío. La
                condición era entonces `idx < -1`, falsa siempre, así que la
                línea no se dibujaba nunca justo donde más se necesita. El bucle
                de arriba ya itera `datos`; esto solo faltaba por mirar lo mismo
                que se está pintando. */}
            {isCutoff && idx < datos.length - 1 && (
              <View
                style={{
                  height: 1.5,
                  backgroundColor: color.gold,
                  opacity: 0.35,
                  marginHorizontal: 14,
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Mismo `datos` que las filas, por lo mismo: con filas inyectadas
          `rows` está vacío y este aviso salía DEBAJO de una tabla llena. */}
      {datos.length === 0 && (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 12 }}>
            Sin partidos jugados aún.
          </Text>
        </View>
      )}

      {/* Pie de tabla.
          Sin resultados no hay orden que enseñar: se dice, en vez de dejar una
          tabla de ceros que parece un error de carga.

          LA LEYENDA MENTÍA. Decía "si dos parejas empatan, decide la diferencia
          de sets y luego la de games" — y estaba impresa justo debajo de un
          empate de TRES que la diferencia de sets no había resuelto. Cuando son
          tres o más lo primero que manda es la mini-tabla entre ellas. El texto
          vive en `LEYENDA_TABLA` para que salga del mismo sitio que la cadena.

          Encima va, cuando toca, la línea que dice CON QUÉ se resolvió el
          empate: sin ella cualquier orden se lee como arbitrario aunque no lo
          sea. */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.lineSoft }}>
        {hayResultados && explicacionDesempate && (
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 11,
              color: color.champagne,
              lineHeight: 16,
              marginBottom: 6,
            }}
          >
            {explicacionDesempate}
          </Text>
        )}
        <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted, lineHeight: 16 }}>
          {hayResultados ? LEYENDA_TABLA : 'El orden se define al jugar.'}
        </Text>
      </View>
    </View>
  );
}

// ───────────────────────────────────────────
// Estilos internos (sin StyleSheet — NativeWind inline)
// ───────────────────────────────────────────

const styles = {
  headerCell: {
    fontFamily: font.display as string,
    fontSize: 10,
    fontWeight: '500' as const,
    color: color.champagne,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  dataCell: {
    fontFamily: font.body as string,
    fontSize: 12,
    fontWeight: '500' as const,
    color: color.text,
  },
};
