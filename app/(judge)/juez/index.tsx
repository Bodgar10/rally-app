/**
 * app/(judge)/juez/index.tsx
 *
 * RALLY · Lista de torneos asignados al juez autenticado.
 * Solo torneos activos del organizador al que pertenece el juez.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { color, font, radius } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

interface AssignedTournament {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  organizerName: string;
  pendingMatches: number;
}

async function fetchAssignedTournaments(): Promise<AssignedTournament[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Listar torneos asignados explícitamente al juez via tournament_judges.
  // Esto es tournament-level (granular), no org-level.
  const { data: assignments, error: aErr } = await supabase
    .from('tournament_judges')
    .select(
      `tournament_id,
       tournaments:tournament_id (
         id, name, status, start_date, end_date, organizer_id,
         organizers:organizer_id ( name )
       )`
    )
    .eq('user_id', user.id)
    // 'assigned_at' no existe en la tabla real (la migración 013 lo declara pero
    // nunca llegó a la base). La columna de tiempo es created_at.
    .order('created_at', { ascending: true });

  if (aErr || !assignments || assignments.length === 0) return [];

  // Filtrar solo torneos activos
  const active = (assignments as unknown as Array<{
    tournament_id: string;
    tournaments: {
      id: string;
      name: string;
      status: string;
      start_date: string | null;
      end_date: string | null;
      organizer_id: string;
      organizers: { name: string };
    };
  }>).filter((a) =>
    // 'registration_open' entra desde la migración 035: el torneo ya no pasa a
    // 'in_progress' al cerrar la PRIMERA categoría, sino la última. Sin esto,
    // un torneo con la 5ª Mixta ya cerrada y sus partidos generados no le
    // aparecería al juez hasta que se cerraran TODAS las categorías.
    // Un torneo sin ninguna categoría cerrada no tiene partidos, así que se
    // distingue solo por pendingMatches = 0.
    ['registration_open', 'registration_closed', 'in_progress']
      .includes(a.tournaments?.status ?? '')
  );

  if (active.length === 0) return [];

  // Para cada torneo asignado, contar partidos pendientes
  const result: AssignedTournament[] = [];
  for (const a of active) {
    const t = a.tournaments;

    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', t.id)
      .neq('status', 'finished');

    result.push({
      id: t.id,
      name: t.name,
      status: t.status,
      startDate: t.start_date,
      endDate: t.end_date,
      organizerName: t.organizers?.name ?? '—',
      pendingMatches: count ?? 0,
    });
  }

  return result;
}

export default function JudgeIndexScreen() {
  const [tournaments, setTournaments] = useState<AssignedTournament[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchAssignedTournaments();
    setTournaments(data);
    setLoading(false);
  }, []);

  // Al volver de capturar resultados, la lista debe reflejar el estado nuevo.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
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
            No tienes torneos activos asignados.
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
              accessibilityLabel={`Torneo ${item.name}, ${item.pendingMatches} partidos pendientes`}
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
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 11,
                      color: color.muted,
                      marginBottom: 10,
                    }}
                  >
                    {item.organizerName}
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
                  {item.status === 'in_progress' ? '🟢 En curso' : '🔒 Inscripciones cerradas'}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
