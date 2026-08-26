/**
 * RALLY · Detalle de Torneo (vista del jugador)
 *
 * POR QUÉ LAS CATEGORÍAS SE VEN SIEMPRE
 *   Antes esta pantalla decía "Las categorías y el cuadro estarán disponibles
 *   una vez que el organizador cierre las inscripciones". Estaba al revés: las
 *   categorías existen desde que el organizador las crea, y esconderlas hasta
 *   el cierre obligaba al jugador a inscribirse sin saber a qué puede entrar.
 *   Lo que sí depende del cierre es el CUADRO — grupos, partidos y tabla.
 *
 * POR QUÉ NO SE ENSEÑA CUÁNTAS PAREJAS VAN
 *   Se llegó a mostrar y se quitó: al jugador no le sirve saber cómo va el
 *   llenado, y una categoría en cero desanima justo al que iba a ser el
 *   primero en apuntarse. La tarjeta se queda con el nombre y el estado.
 *
 *   El RPC `tournament_category_counts` (migración 038) queda sin consumidor
 *   en el cliente. La función sigue en la base a propósito: el conteo real es
 *   útil para el organizador y no cuesta nada tenerla.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase }                          from '@/lib/supabase/client';
import { Card, Badge, SectionLabel, Button } from '@/components/ui';
import Icon                                  from '@/components/ui/Icon';
import ComoLlegar                            from '@/components/tournament/ComoLlegar';
import { formatearRango }                    from '@/lib/fechas';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

/** Una inscripción del propio usuario en este torneo. */
interface MiInscripcion {
  categoriaId: string;
  categoria:   string;
  companero:   string;
  pagada:      boolean;
}

interface Tournament {
  id:               string;
  name:             string;
  start_date:       string;
  end_date:         string;
  status:           string;
  registration_fee: number;
  venues:           { name: string; address: string; city: string } | null;
}

/** Los cinco estados del enum category_status. */
interface CategoriaVista {
  id:           string;
  display_name: string;
  status:       'open' | 'closed' | 'seeded' | 'in_progress' | 'finished';
}

/**
 * Qué se le dice al jugador en cada estado.
 *
 * `closed`, `seeded` e `in_progress` se funden en una sola lectura a
 * propósito: la diferencia entre ellos es de mecánica interna del motor de
 * formato, y para quien mira desde fuera todos significan lo mismo — ya no se
 * puede entrar y el cuadro está armado.
 */
function lecturaDeEstado(c: CategoriaVista): { etiqueta: string; tono: 'live' | 'muted' } {
  if (c.status === 'open')     return { etiqueta: 'Abierta',    tono: 'live'  };
  if (c.status === 'finished') return { etiqueta: 'Finalizada', tono: 'muted' };
  return { etiqueta: 'Cuadro armado', tono: 'muted' };
}

export default function TorneoDetailScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router           = useRouter();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [categorias, setCategorias] = useState<CategoriaVista[]>([]);
  const [misInscripciones, setMisInscripciones] = useState<MiInscripcion[]>([]);
  const [loading, setLoading]       = useState(true);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

    // Las tres en paralelo: ninguna depende del resultado de otra.
    const [{ data: t }, { data: cats }, { data: mias }] = await Promise.all([
      supabase
        .from('tournaments')
        .select('id, name, start_date, end_date, status, registration_fee, venues(name, address, city)')
        .eq('id', tournamentId)
        .single(),
      supabase
        .from('categories')
        .select('id, display_name, status, division, gender')
        .eq('tournament_id', tournamentId)
        .order('gender')
        .order('division'),
      user
        ? supabase
            .from('my_pairs')
            .select('category_id, payment_status, player1_id, player2_id, player1_name, player2_name')
            .eq('tournament_id', tournamentId)
        : Promise.resolve({ data: null }),
    ]);

    if (t) setTournament(t as unknown as Tournament);

    const nombreCat = new Map((cats ?? []).map((c) => [c.id, c.display_name]));

    // `my_pairs` es una VISTA y sus columnas llegan nullable: Postgres no
    // propaga NOT NULL a través de una vista. Sin category_id la fila no se
    // puede etiquetar, así que se descarta.
    setMisInscripciones(
      (mias ?? [])
        .filter((m): m is typeof m & { category_id: string } => m.category_id !== null)
        .map((m) => ({
          categoriaId: m.category_id,
          categoria:   nombreCat.get(m.category_id) ?? '—',
          // El compañero es el OTRO, quienquiera que sea de los dos.
          companero:   (m.player1_id === user?.id ? m.player2_name : m.player1_name) ?? '—',
          pagada:      m.payment_status !== 'pending',
        })),
    );

    setCategorias(
      (cats ?? []).map((c) => ({
        id:           c.id,
        display_name: c.display_name,
        status:       c.status as CategoriaVista['status'],
      })),
    );

    setLoading(false);
  }, [tournamentId]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (loading) return (
    <View style={s.loadingContainer}>
      <ActivityIndicator color={color.gold} />
    </View>
  );

  if (!tournament) return (
    <View style={s.loadingContainer}>
      <Text style={s.errorText}>Torneo no encontrado.</Text>
    </View>
  );

  const abierto = tournament.status === 'registration_open';
  const enCurso = tournament.status === 'in_progress';

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto="Torneos" />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hero info */}
        <View style={s.heroCard}>
          <View style={s.accentBar} />
          <Text style={s.eyebrow}>RALLY</Text>
          <Text style={s.title}>{tournament.name}</Text>
          <Text style={s.dates}>
            {formatearRango(tournament.start_date, tournament.end_date)}
          </Text>
          {tournament.venues && (
            <>
              <View style={s.venueRow}>
                <Icon name="pin" size={14} color={color.muted} />
                <Text style={s.venue}>
                  {tournament.venues.name} · {tournament.venues.city}
                </Text>
              </View>
              {/* Donde el jugador decide si se inscribe, saber dónde queda pesa */}
              <View style={{ marginTop: space[2] }}>
                <ComoLlegar venue={tournament.venues} />
              </View>
            </>
          )}
          <View style={{ marginTop: space[2] }}>
            <Badge
              label={abierto ? 'Inscripciones abiertas' : tournament.status}
              type={abierto ? 'live' : 'muted'}
              dot={abierto}
            />
          </View>
        </View>

        {/* ── Ya estás inscrito ──────────────────────────────────────────
             Va ANTES del bloque de inscripción: lo primero que el jugador
             tiene que ver al abrir un torneo suyo es que ya está dentro, no
             un botón para volver a entrar. */}
        {misInscripciones.length > 0 && (
          <>
            <SectionLabel title="Tu inscripción" />
            <View style={s.listaCategorias}>
              {misInscripciones.map((m) => (
                <View key={m.categoriaId} style={s.miInscripcion}>
                  <View style={s.categoriaFila}>
                    <Text style={s.miCategoria}>{m.categoria}</Text>
                    <Badge
                      label={m.pagada ? 'Inscrito' : 'Falta pagar'}
                      type={m.pagada ? 'live' : 'alive'}
                      dot={m.pagada}
                    />
                  </View>
                  <Text style={s.miCompanero}>Juegas con {m.companero}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Inscripción */}
        {abierto && (
          <>
            <SectionLabel title={misInscripciones.length > 0 ? 'Otra categoría' : 'Inscripción'} />
            <Card variant="standard">
              {misInscripciones.length > 0 && (
                // Inscribirse en otra categoría sigue siendo posible; lo que no
                // puede es parecer que no estás en ninguna.
                <Text style={s.otraNota}>
                  Ya estás en {misInscripciones.length === 1 ? 'una categoría' : `${misInscripciones.length} categorías`}.
                  Puedes entrar a otra distinta con la misma o con otra pareja.
                </Text>
              )}
              <View style={s.feeRow}>
                <Text style={s.feeLabel}>Cuota por pareja</Text>
                <Text style={s.feeAmount}>
                  {tournament.registration_fee > 0
                    ? `$${tournament.registration_fee.toLocaleString('es-MX')} MXN`
                    : 'Gratuito'}
                </Text>
              </View>
              <Text style={s.feeNote}>
                Incluye a los dos jugadores de la pareja.
              </Text>
              <View style={{ marginTop: space[3] }}>
                <Button
                  label={misInscripciones.length > 0 ? 'Inscribirme a otra categoría' : 'Inscribirme a este torneo'}
                  variant="primary"
                  onPress={() => router.push(`/(protected)/inscripcion/${tournament.id}`)}
                />
              </View>
            </Card>
          </>
        )}

        {/* ── Categorías ─────────────────────────────────────────────────
            Visibles SIEMPRE. Ver cabecera del archivo. */}
        <SectionLabel title="Categorías" />
        {categorias.length === 0 ? (
          <Card variant="standard">
            <Text style={s.vacio}>
              El organizador aún no ha definido las categorías.
            </Text>
          </Card>
        ) : (
          <View style={s.listaCategorias}>
            {categorias.map((c) => {
              const l = lecturaDeEstado(c);

              // Antes del cierre no hay grupos ni partidos, así que entrar
              // llevaría a una pantalla vacía. El badge ya dice lo único que
              // hay que saber: que está abierta.
              if (c.status === 'open') {
                return (
                  <View key={c.id} style={s.categoria}>
                    <View style={s.categoriaFila}>
                      <Text style={s.categoriaNombre} numberOfLines={1}>{c.display_name}</Text>
                      <Badge label={l.etiqueta} type={l.tono} dot={l.tono === 'live'} />
                    </View>
                  </View>
                );
              }

              return (
                <Pressable
                  key={c.id}
                  onPress={() => router.push(`/(protected)/torneos/${tournamentId}/${c.id}`)}
                  style={({ pressed }) => [s.categoria, pressed && s.categoriaPulsada]}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver el cuadro de ${c.display_name}`}
                >
                  <View style={s.categoriaFila}>
                    <Text style={s.categoriaNombre} numberOfLines={1}>{c.display_name}</Text>
                    <Badge label={l.etiqueta} type={l.tono} dot={l.tono === 'live'} />
                  </View>
                  <Text style={[s.verCuadro, { alignSelf: 'flex-end' }]}>Ver cuadro ›</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Tabla en vivo — sí depende de que el torneo esté en curso */}
        <SectionLabel title="Tabla en vivo" />
        <Card variant="standard">
          <Text style={s.stubText}>
            {enCurso
              ? 'La tabla en vivo estará disponible en esta pantalla en breve.'
              : 'La tabla en vivo aparecerá aquí cuando el torneo esté en curso.'}
          </Text>
        </Card>

        {/* TODO S5-SON-02: cuando esta pantalla cargue resultados/posición del torneo
            (read-path ranking_public o Realtime de group_standings), renderizar aquí el badge:
              import { RankingBadge } from '@/components/tournament/RankingBadge';
              <RankingBadge variant="top_tournament" value={miPosicion} subtitle={`de ${totalJugadores} jugadores`} />
            o variant="champion"/"finalist" según el resultado final. NUNCA derivar de player_ratings. */}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  errorText:        { fontFamily: font.body, fontSize: fontSize.body, color: color.danger },

  content: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  heroCard: {
    backgroundColor: '#19171A',
    borderWidth:     1,
    borderColor:     color.line,
    borderRadius:    24,
    padding:         space[5],
    overflow:        'hidden',
    gap:             space[1.5],
  },
  accentBar: { height: 3, backgroundColor: color.gold, marginBottom: space[2], marginHorizontal: -space[5], marginTop: -space[5] },
  eyebrow:   { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:     { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  dates:     { fontFamily: font.body, fontSize: fontSize.body, color: color.champagne },

  venueRow: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
  venue:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, flex: 1 },

  feeRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1] },
  feeLabel:  { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  feeAmount: { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright },
  feeNote:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  listaCategorias: { gap: space[2] },
  miInscripcion: {
    backgroundColor:   color.surface,
    borderWidth:       1,
    borderColor:       color.line,
    borderRadius:      radius.md,
    paddingHorizontal: space[4],
    paddingVertical:   space[3],
    gap:               space[1],
  },
  miCategoria: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, flex: 1 },
  miCompanero: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },
  otraNota:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17, marginBottom: space[3] },
  categoria: {
    backgroundColor:   color.surface,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
    paddingHorizontal: space[4],
    paddingVertical:   space[3],
    gap:               space[1],
  },
  categoriaPulsada: { backgroundColor: color.surface2 },
  categoriaFila:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  verCuadro:        { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold, flexShrink: 0 },
  categoriaNombre:  { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, flex: 1 },

  vacio:    { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', paddingVertical: space[3] },
  stubText: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', paddingVertical: space[3] },
});
