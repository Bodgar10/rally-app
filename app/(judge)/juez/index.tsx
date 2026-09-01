/**
 * app/(judge)/juez/index.tsx
 *
 * RALLY · Lista de torneos asignados al juez autenticado.
 *
 * QUÉ CAMBIÓ
 *   La consulta y los filtros se fueron a `useJudgeTournaments`, que es la
 *   misma fuente que decide si la pestaña "Juez" aparece en el menú y a dónde
 *   lleva. Antes esta pantalla tenía su propia idea de qué torneos contaban, y
 *   como no había ninguna entrada a ella, esa idea no la comprobaba nadie.
 *
 *   Con el hook llegan además dos cosas que faltaban: el ORDEN (el más cercano
 *   primero, que es el que se está jugando) y la VENTANA DE FECHAS (fuera lo
 *   terminado hace más de 5 días y lo que empieza dentro de más de 30).
 *
 *   Aquí solo queda lo que es de esta pantalla: contar partidos pendientes.
 *   Va por torneo y no en el hook porque el nav no necesita ese número y sería
 *   una consulta por torneo en cada navegación.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { color, font, radius } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import { formatearRango } from '@/lib/fechas';
import {
  useJudgeTournaments,
  invalidateJudgeTournamentsCache,
  type TorneoDeJuez,
} from '@/hooks/useJudgeTournaments';

interface AssignedTournament extends TorneoDeJuez {
  pendingMatches: number;
}

/** Partidos sin capturar, por torneo. Una consulta de conteo, sin traer filas. */
async function contarPendientes(torneos: TorneoDeJuez[]): Promise<AssignedTournament[]> {
  return Promise.all(torneos.map(async (t) => {
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', t.id)
      .neq('status', 'finished');
    return { ...t, pendingMatches: count ?? 0 };
  }));
}

export default function JudgeIndexScreen() {
  const base = useJudgeTournaments();
  const [tournaments, setTournaments] = useState<AssignedTournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (base === undefined) return;
    let vivo = true;
    contarPendientes(base).then((v) => {
      if (!vivo) return;
      setTournaments(v);
      setLoading(false);
    });
    return () => { vivo = false; };
  }, [base]);

  // Al volver de capturar, los pendientes son otros. Se tira la caché del hook
  // para que la lista se rehaga: si el juez acaba de cerrar el último partido
  // de un torneo, el número tiene que bajar sin salir y volver a entrar.
  useFocusEffect(useCallback(() => {
    invalidateJudgeTournamentsCache();
  }, []));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      {/* LA SALIDA, QUE NO EXISTÍA.
          Al panel de juez se entra por el tab, que hace `router.replace` — así
          que aquí NO hay historial y `router.back()` habría sido un botón que
          no hace nada. `BotonVolver` ya lo contempla: sin historial navega a
          `rutaPadre('/juez')`, que es el dashboard del jugador.

          Y el dashboard es donde vive el menú principal (tab bar en nativo,
          WebShell en web): el grupo (judge) no lo monta a propósito —es una
          herramienta de captura, no la app del jugador—, así que sin este
          botón el juez se quedaba dentro sin manera de salir. */}
      <BotonVolver texto="Modo Jugador" />

      {/* Header */}
      {/* Fuera del FlatList: no hereda la columna del contentContainerStyle. */}
      <View style={{ paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8, ...webContentColumn }}>
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 10,
            fontWeight: '500',
            color: color.champagne,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 4,
          }}
        >
          Panel de juez
        </Text>
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 26,
            fontWeight: '600',
            color: color.text,
          }}
        >
          Mis torneos
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={color.gold} />
        </View>
      ) : tournaments.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: color.muted, fontFamily: font.body, fontSize: 14, textAlign: 'center' }}>
            No tienes torneos que arbitrar ahora mismo.{'\n'}
            Aquí aparecen desde un mes antes de que empiecen y hasta cinco días
            después de que terminen.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: bottomInset, ...webContentColumn }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(judge)/juez/${item.id}`)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? color.surface2 : color.surface,
                borderRadius: radius.xl,
                padding: 16,
                borderWidth: 1,
                borderColor: item.pendingMatches > 0 ? color.line : color.lineSoft,
              })}
              accessibilityRole="button"
              accessibilityLabel={`Torneo ${item.nombre}, ${item.pendingMatches} partidos pendientes`}
            >
              {/* Barra de acento si hay partidos pendientes */}
              {item.pendingMatches > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2.5,
                    backgroundColor: color.gold,
                    borderTopLeftRadius: radius.xl,
                    borderTopRightRadius: radius.xl,
                  }}
                />
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: item.pendingMatches > 0 ? 6 : 0 }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: font.display,
                      fontSize: 16,
                      fontWeight: '600',
                      color: color.text,
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                  >
                    {item.nombre}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 11,
                      color: color.muted,
                      marginBottom: 10,
                    }}
                  >
                    {item.organizador}
                  </Text>
                </View>

                {/* Badge de partidos pendientes */}
                {item.pendingMatches > 0 && (
                  <View
                    style={{
                      backgroundColor: 'rgba(212,175,55,0.14)',
                      borderRadius: radius.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderWidth: 1,
                      borderColor: color.line,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: font.display,
                        fontSize: 12,
                        fontWeight: '600',
                        color: color.gold,
                      }}
                    >
                      {item.pendingMatches} pendiente{item.pendingMatches !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: color.surface2,
                  borderRadius: radius.sm,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{ fontFamily: font.body, fontSize: 11, color: color.text }}>
                  {formatearRango(item.inicio, item.fin)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
