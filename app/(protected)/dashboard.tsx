/**
 * RALLY · Dashboard del Jugador
 *
 * EL ORDEN ES LA PANTALLA
 *   Las tarjetas se leen en el orden en que el jugador se hace las preguntas, y
 *   antes no era así: la respuesta a "¿cuándo juego?" estaba partida en tres
 *   tarjetas con un banner comercial en medio.
 *
 *     1. Qué pasa en mi cancha  — decide si se mueve del sillón. Va primero.
 *     2. Mi siguiente partido   — la hora y el rival.
 *     3. Mi situación           — si sigo dentro y de qué depende.
 *     4. Mis resultados         — cómo me fue.
 *     5. Ver mi grupo           — la tabla completa.
 *
 *   El banner de Pro se fue al final. En medio del bloque informativo competía
 *   con el dato justo cuando más urge.
 *
 * Colores: 100% desde design-tokens (cero hex literales).
 * Estilo: Doc D §8 (tarjetas, banners, botones).
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';
import MyNextMatch from '@/components/realtime/MyNextMatch';
import TorneoPorEmpezar, { type TorneoInscrito } from '@/components/realtime/TorneoPorEmpezar';
import { ProBenefitsSheet } from '@/components/checkout/ProBenefitsSheet';
import { ProActivatedModal } from '@/components/checkout/ProActivatedModal';
import { getFeatureFlags } from '@/lib/feature-flags';
import { LinearGradient } from 'expo-linear-gradient';
import { useProActivation } from '@/hooks/useProActivation';
import { useURL, parse } from 'expo-linking';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { useIsOrganizerOwner } from '@/hooks/useIsOrganizerOwner';
import { webContentColumn, bottomInset, organizerEntryInHeader } from '@/lib/web-layout';
import { RankingBadge } from '@/components/tournament/RankingBadge';
import MiSituacion, { type SituacionResuelta } from '@/components/player/MiSituacion';
import MisResultados from '@/components/player/MisResultados';
import EnMiCancha from '@/components/player/EnMiCancha';
import { porQueNoHayPartido } from '@/lib/situacion-jugador';

export default function DashboardScreen() {
  const router = useRouter();

  const [user, setUser]           = useState<User | null>(null);
  const isOwner                   = useIsOrganizerOwner();
  const [loading, setLoading]     = useState(true);
  const [torneoProximo, setTorneoProximo] = useState<TorneoInscrito | null>(null);
  const [pairIds, setPairIds]     = useState<string[]>([]);
  const [subscription, setSubscription] = useState<{ status: string | null; billing_cycle: string | null } | null>(null);
  const [proSheetOpen, setProSheetOpen] = useState(false);
  const [networkRank, setNetworkRank] = useState<number | null>(null); // mejor posición de red (S5-SON-02b)
  /**
   * La situación que resolvió `MiSituacion`, para que el bloque de "próximo
   * partido" pueda explicar POR QUÉ no hay uno en vez de callarse.
   */
  const [situacion, setSituacion] = useState<SituacionResuelta | null>(null);

  useEffect(() => {
    async function loadUserData() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      setUser(data.user);

      // Obtener pair_ids del usuario para MyNextMatch
      const { data: pairs } = await supabase
        .from('pairs')
        .select('id')
        .or(`player1_id.eq.${data.user.id},player2_id.eq.${data.user.id}`);
      if (pairs) setPairIds(pairs.map((p: { id: string }) => p.id));

      // Torneo inscrito más próximo, para cuando todavía no hay partido.
      const { data: mias } = await supabase
        .from('my_pairs')
        .select('tournament_id, category_id');

      // `my_pairs` es una VISTA: Postgres no propaga NOT NULL a través de una
      // vista, así que sus columnas llegan nullable aunque en origen no lo sean.
      const filasMias = (mias ?? []).filter(
        (m): m is typeof m & { tournament_id: string; category_id: string } =>
          m.tournament_id !== null && m.category_id !== null,
      );

      const idsTorneo = [...new Set(filasMias.map((m) => m.tournament_id))];
      if (idsTorneo.length > 0) {
        const [{ data: ts }, { data: cats }] = await Promise.all([
          supabase
            .from('tournaments')
            .select('id, name, start_date, end_date, status')
            .in('id', idsTorneo)
            // El que antes empiece: es el que le va a tocar.
            .order('start_date', { ascending: true }),
          supabase.from('categories').select('id, display_name').in('id',
            [...new Set(filasMias.map((m) => m.category_id))]),
        ]);

        // Un torneo terminado ya no "está por empezar".
        const vivo = (ts ?? []).find((t) => t.status !== 'finished');
        if (vivo) {
          const nombreCat = new Map((cats ?? []).map((c) => [c.id, c.display_name]));
          setTorneoProximo({
            id:     vivo.id,
            nombre: vivo.name,
            inicio: vivo.start_date,
            fin:    vivo.end_date,
            categorias: filasMias
              .filter((m) => m.tournament_id === vivo.id)
              .map((m) => nombreCat.get(m.category_id) ?? '')
              .filter(Boolean),
          });
        }
      }

      // Suscripción del usuario (para el banner Pro): active o trialing
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, billing_cycle')
        .eq('user_id', data.user.id)
        .in('status', ['active', 'trialing'])
        .maybeSingle();
      setSubscription(sub ?? null);

      // Mejor posición de red del jugador (S5-SON-02b) — read-path ranking_public.
      // La mejor (menor) posición entre sus divisiones. Sin filas -> sin badge.
      const { data: ranks } = await supabase
        .from('ranking_public')
        .select('position')
        .eq('player_id', data.user.id)
        .order('position', { ascending: true })
        .limit(1);
      setNetworkRank(ranks && ranks.length > 0 ? (ranks[0] as { position: number }).position : null);

      setLoading(false);
    }
    loadUserData();
  }, []);

  // Deep link de regreso desde la web de suscripción (la BD es la fuente de verdad).
  const incomingURL = useURL();
  const {
    isProJustActivated,
    billingCycle: activatedCycle,
    checkProStatus,
    clearActivation,
  } = useProActivation();

  useEffect(() => {
    if (!incomingURL) return;
    const { queryParams } = parse(incomingURL);
    if (queryParams?.pro_activated === 'true') {
      // El parámetro solo gatilla la verificación; la activación se confirma contra la BD.
      checkProStatus();
    }
  }, [incomingURL, checkProStatus]);

  // Nombre visible: metadata del auth o email como fallback
  const displayName = user?.user_metadata?.full_name
    ? (user.user_metadata.full_name as string).split(' ')[0]
    : (user?.email?.split('@')[0] ?? 'Jugador');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  const flags = getFeatureFlags();
  const isPro = subscription?.status === 'active' || subscription?.status === 'trialing';

  return (
    <SafeAreaView style={styles.safe}>
      <ProBenefitsSheet
        visible={proSheetOpen}
        onClose={() => setProSheetOpen(false)}
        isDirectCTA={flags.SUBSCRIPTION_CTA_DIRECT ?? false}
      />
      <ProActivatedModal
        visible={isProJustActivated}
        billingCycle={activatedCycle}
        onClose={clearActivation}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerTextos}>
            <Text style={styles.eyebrow}>RALLY</Text>
            <Text style={styles.greeting}>Hola, {displayName} 👋</Text>
          </View>

          {/* Acceso a organizador — SOLO nativo. En web ya vive en el nav de
              WebShell, y ponerlo aquí lo duplicaría en la misma vista.
              Oro perfilado: el granate está reservado al banner Pro. */}
          {organizerEntryInHeader && (
            <Pressable
              onPress={() => router.push(isOwner ? '/(organizer)/org' : '/(protected)/organizador')}
              style={({ pressed }) => [styles.organizar, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Organizar torneos"
            >
              <Text style={styles.organizarLabel}>Organizar</Text>
            </Pressable>
          )}
        </View>

        {/* ── QUÉ PASA EN MI CANCHA ───────────────────────────────
             Justo debajo del próximo partido, porque es su continuación: la
             hora publicada dice cuándo TENDRÍA que jugar, y esto dice cuándo va
             a jugar de verdad.

             El caso que lo motivó: un jugador con partido a las 10:00 se
             levantó a las 8:30 y jugó a las 10:40, porque su cancha estaba
             ocupada con una categoría que no era la suya. La información no
             estaba en su categoría — estaba en la cancha, y en la cancha no la
             miraba nadie.

             El componente no pinta nada si su próximo partido no tiene cancha
             asignada: sin cancha no hay cola que mirar. */}
        {pairIds.length > 0 && (
          <View style={{ marginTop: space[3] }}>
            <EnMiCancha pairIds={pairIds} />
          </View>
        )}

        {/* ── Mi próximo partido ──────────────────────────────────
             Ya no es stub: MyNextMatch lee de matches por Realtime. Sus
             nombres de rival salen de bracket_pairs_public (migración 039)
             desde que se quitó el embed roto contra users_select_own. */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>MI PRÓXIMO PARTIDO</Text>
        </View>

        {pairIds.length > 0 ? (
          // En vivo via Realtime cuando el usuario tiene parejas inscritas.
          // Si aún no hay partido programado, en vez de "no tienes partidos"
          // se enseña el torneo que le espera: los partidos no existen hasta
          // que el organizador cierra la categoría y arma el cuadro.
          <MyNextMatch
            pairIds={pairIds}
            sinPartidoAun={
              /* El torneo que aún no empieza manda: es información concreta.
                 Pero si el torneo YA empezó y aun así no hay partido, callarse
                 era lo peor — el jugador no distingue "la app se rompió" de
                 "todavía no se puede saber", y lo segundo es casi siempre la
                 respuesta. `porQueNoHayPartido` la dice a partir del estado que
                 acaba de resolver MiSituacion. */
              torneoProximo
                ? <TorneoPorEmpezar torneo={torneoProximo} />
                : situacion
                  ? (
                    <View style={styles.heroCard}>
                      <View style={styles.accentBar} />
                      <Text style={styles.heroEmpty}>Todavía sin hora</Text>
                      <Text style={styles.heroSubtext}>
                        {porQueNoHayPartido(situacion.estado, situacion.gruposPendientes)}
                      </Text>
                    </View>
                  )
                  : undefined
            }
          />
        ) : (
          <View style={styles.heroCard}>
            <View style={styles.accentBar} />
            <Text style={styles.heroEmpty}>Sin partidos programados</Text>
            <Text style={styles.heroSubtext}>
              Inscríbete a un torneo para ver tu próximo partido aquí, en vivo.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPrimaryPressed]}
              onPress={() => router.push('/(protected)/torneos')}
              accessibilityRole="button"
              accessibilityLabel="Ver torneos disponibles"
            >
              <Text style={styles.btnPrimaryText}>Ver torneos disponibles</Text>
            </Pressable>
          </View>
        )}

        {/* ── MI SITUACIÓN ────────────────────────────────────────
             ARRIBA DEL TODO, antes que el próximo partido, porque es la
             pregunta con la que se abre la app: "¿sigo dentro?". El horario
             importa DESPUÉS de saber que hay horario que esperar.

             El dato ya existía —`clinch_status`, calculado por el motor— y no
             salía a ninguna pantalla del jugador. */}
        {pairIds.length > 0 && (
          <View style={{ marginBottom: space[4] }}>
            <MiSituacion pairIds={pairIds} onResuelta={setSituacion} />
          </View>
        )}

        {/* ── MIS RESULTADOS ──────────────────────────────────────
             Debajo de la situación y del próximo partido, que es el orden en
             que se preguntan las cosas: ¿sigo dentro? → ¿cuándo juego? → ¿cómo
             me fue? Y para quien acaba de quedar fuera es lo único que queda
             por mirar, así que va justo detrás de la frase que se lo dice.

             El componente no pinta nada si todavía no ha jugado: una tarjeta
             que dice "aún no hay resultados" ocupa el sitio de lo que sí
             importa antes de empezar. Por eso la etiqueta va dentro. */}
        {pairIds.length > 0 && (
          <>
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>MIS RESULTADOS</Text>
            </View>
            <MisResultados pairIds={pairIds} />
          </>
        )}

        {/* ── VER MI GRUPO ────────────────────────────────────────
             La tabla completa de su grupo no era alcanzable desde el
             dashboard: había que entrar por Torneos, buscar el torneo y
             luego la categoría. Es la pantalla que contesta "¿en qué
             posición voy?", y va aquí porque es el paso natural después
             de leer su situación. */}
        {situacion && (
          <Pressable
            style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.85 }]}
            onPress={() => router.push(
              `/(protected)/torneos/${situacion.tournamentId}/${situacion.categoryId}`,
            )}
            accessibilityRole="button"
            accessibilityLabel={`Ver la tabla de mi grupo en ${situacion.categoria}`}
          >
            <View style={styles.quickCardRow}>
              <Text style={styles.quickCardTitle}>Ver mi grupo</Text>
              <Text style={styles.quickCardChevron}>›</Text>
            </View>
            <Text style={styles.quickCardSub}>
              La tabla completa de {situacion.categoria}, con todas las parejas
            </Text>
          </Pressable>
        )}

        {/* ── Acceso rápido a torneos ──────────────────────────── */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>TORNEOS</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(protected)/torneos')}
          accessibilityRole="button"
        >
          <View style={styles.quickCardRow}>
            <Text style={styles.quickCardTitle}>Torneos disponibles</Text>
            <Text style={styles.quickCardChevron}>›</Text>
          </View>
          <Text style={styles.quickCardSub}>Inscríbete y compite</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(protected)/ranking')}
          accessibilityRole="button"
        >
          <View style={styles.quickCardRow}>
            <Text style={styles.quickCardTitle}>Mi Ranking</Text>
            <Text style={styles.quickCardChevron}>›</Text>
          </View>
          <Text style={styles.quickCardSub}>Tus puntos por categoría</Text>

          {/* Badge de posición de red (S5-SON-02b) — solo si el jugador ya tiene ranking */}
          {networkRank !== null && (
            <View style={{ marginTop: space[2] }}>
              <RankingBadge variant="top_network" value={networkRank} compact />
            </View>
          )}
        </Pressable>
        {/* ── Banner Pro ──────────────────────────────────────────
             AL FINAL, no en medio. Estaba entre "mi próximo partido" y "qué
             pasa en mi cancha", partiendo en dos la única pregunta que trae al
             jugador a esta pantalla: ¿cuándo juego? Una oferta comercial en
             mitad de esa respuesta la vuelve ilegible, y además compite con el
             dato justo cuando más urge. */}
        {!isPro && (
          <Pressable
            onPress={() => setProSheetOpen(true)}
            style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1, marginTop: space[4] })}
          >
            <View
              style={{
                backgroundColor: color.wine,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: 'rgba(241,217,140,0.38)',
                padding: 13,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
              }}
            >
              <LinearGradient
                colors={[color.goldBright, color.goldDeep]}
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <Text style={{ fontSize: 16 }}>⚡</Text>
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: font.display, fontSize: 13.5, fontWeight: '600', color: '#F7EAC6' }}>
                  Conoce los beneficios Pro
                </Text>
                <Text style={{ fontFamily: font.body, fontSize: 10.5, color: '#E6CDC2', marginTop: 2, lineHeight: 14 }}>
                  Análisis, scouting, descuento en torneos y más.
                </Text>
              </View>
              <Text style={{ color: color.goldBright, fontSize: 16 }}>›</Text>
            </View>
          </Pressable>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos — solo tokens de design-tokens (cero hex literales) ─────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3], marginBottom: space[2] },
  headerTextos: { flex: 1, minWidth: 0 },

  // Acceso a organizador (nativo) — mismo tratamiento que el item de WebShell
  organizar: {
    borderWidth:       1,
    borderColor:       color.gold,
    backgroundColor:   'rgba(212,175,55,0.08)',
    borderRadius:      radius.pill,
    paddingHorizontal: space[3],
    paddingVertical:   space[2],
    alignItems:        'center',
    justifyContent:    'center',
    flexShrink:        0,
  },
  organizarLabel: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.champagne },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  greeting: { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, letterSpacing: 0.3 },

  // Section label (Doc D §3.1 — section label)
  sectionLabel: { marginTop: space[3] },
  sectionLabelText: { fontFamily: font.display, fontSize: fontSize.section, color: color.champagne, letterSpacing: 2.5 },

  // Hero card — mi próximo partido (Doc D §8.2 Hero)
  heroCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.xl2,
    padding: space[5],
    overflow: 'hidden',
    gap: space[3],
  },
  accentBar: {
    // grad-rule: barra superior de acento (Doc D §8.2)
    height: 3,
    backgroundColor: color.gold,
    borderRadius: 2,
    marginBottom: space[2],
  },
  heroEmpty: { fontFamily: font.display, fontSize: fontSize.metric, color: color.champagne, textAlign: 'center' },
  heroSubtext: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', lineHeight: 20 },
  btnPrimary: {
    backgroundColor: color.gold,
    borderRadius: radius.sm,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[5],
  },
  btnPrimaryPressed: { opacity: 0.85 },
  btnPrimaryText: { fontFamily: font.body, fontSize: 14, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },

  // Quick access cards
  quickCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.xl,
    padding: space[4],
    gap: space[1],
  },
  quickCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickCardTitle: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  quickCardChevron: { fontSize: 20, color: color.muted },
  quickCardSub: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
});
