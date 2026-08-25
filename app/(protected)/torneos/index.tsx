/**
 * RALLY · Mis Torneos
 * Lista torneos disponibles + inscritos.
 * Lee de public.tournaments (RLS: lectura autenticada).
 * Doc D §8.2 tarjetas, §8.4 badges, §8.5 segmented control.
 *
 * LA PESTAÑA "INSCRITOS" ESTABA CODIFICADA A VACÍO
 *   `const list = tab === 'disponibles' ? available : []` — el jugador podía
 *   estar inscrito en tres torneos y la app le decía "Aún no estás inscrito en
 *   ningún torneo". No era un caso sin cubrir: era una respuesta falsa.
 *
 *   Se resuelve por `pairs`, no por `registrations`: la inscripción del jugador
 *   ES la pareja. `registrations` solo existe cuando hubo cobro por Stripe, así
 *   que las parejas que el organizador metió a mano (paid_offline) no tienen
 *   fila ahí y habrían quedado igual de invisibles.
 *
 *   El filtro por player1/player2 es explícito y NO redundante con la RLS:
 *   `pairs_select` (migración 008) también deja ver todas las parejas a los
 *   miembros del organizador, así que un organizador que además juega vería
 *   las de todo su torneo listadas como suyas.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, Badge, SectionLabel }    from '@/components/ui';
import { formatearRango }                       from '@/lib/fechas';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

type TournamentStatus = 'draft' | 'registration_open' | 'registration_closed' | 'in_progress' | 'finished';

interface Tournament {
  id:               string;
  name:             string;
  start_date:       string;
  end_date:         string;
  status:           TournamentStatus;
  registration_fee: number;
  venues:           { name: string; city: string } | null;
}

type Tab = 'disponibles' | 'inscritos';

/** Lo que el jugador tiene en un torneo: en qué categorías y si ya pagó. */
interface MiInscripcion {
  tournamentId: string;
  categorias:   string[];
  /** Alguna pareja sin pagar. Es lo único accionable desde esta pantalla. */
  pendiente:    boolean;
}

function statusBadge(status: TournamentStatus) {
  switch (status) {
    case 'registration_open':   return { label: 'Inscripciones abiertas', type: 'live'   as const };
    case 'registration_closed': return { label: 'Inscripciones cerradas', type: 'muted'  as const };
    case 'in_progress':         return { label: 'En curso',               type: 'alive'  as const };
    case 'finished':            return { label: 'Finalizado',             type: 'muted'  as const };
    default:                    return { label: 'Borrador',               type: 'muted'  as const };
  }
}

export default function TorneosScreen() {
  const router = useRouter();
  const [tab, setTab]               = useState<Tab>('disponibles');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [mias, setMias]             = useState<Map<string, MiInscripcion>>(new Map());
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      const [{ data, error }, { data: parejas }] = await Promise.all([
        supabase
          .from('tournaments')
          .select('id, name, start_date, end_date, status, registration_fee, venues(name, city)')
          .order('start_date', { ascending: true }),
        user
          ? supabase
              .from('pairs')
              .select('tournament_id, payment_status, categories(display_name)')
              .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
          : Promise.resolve({ data: null }),
      ]);

      if (!error && data) setTournaments(data as unknown as Tournament[]);

      // Un jugador puede estar en varias categorías del mismo torneo, así que
      // se agrupa por torneo en vez de pintar una tarjeta por pareja.
      const porTorneo = new Map<string, MiInscripcion>();
      for (const p of (parejas ?? []) as unknown as Array<{
        tournament_id: string;
        payment_status: string;
        categories: { display_name: string } | null;
      }>) {
        const previa = porTorneo.get(p.tournament_id) ?? {
          tournamentId: p.tournament_id, categorias: [], pendiente: false,
        };
        if (p.categories?.display_name) previa.categorias.push(p.categories.display_name);
        if (p.payment_status === 'pending') previa.pendiente = true;
        porTorneo.set(p.tournament_id, previa);
      }
      setMias(porTorneo);

      setLoading(false);
    }
    load();
  }, []);

  const available = tournaments.filter(t =>
    ['registration_open', 'in_progress'].includes(t.status)
  );

  // Los inscritos NO se filtran por estado: un torneo terminado en el que
  // jugaste sigue siendo tuyo, y es donde el jugador va a buscar el resultado.
  const inscritos = tournaments.filter(t => mias.has(t.id));

  const list = tab === 'disponibles' ? available : inscritos;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>RALLY</Text>
        <Text style={styles.title}>Torneos</Text>
      </View>

      {/* Segmented control — Doc D §8.5 */}
      <View style={styles.segmentWrapper}>
        <View style={styles.segment}>
          {(['disponibles', 'inscritos'] as Tab[]).map(t => (
            <Pressable
              key={t}
              style={[styles.segTab, tab === t && styles.segTabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.segLabel, tab === t && styles.segLabelActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading
        ? <View style={styles.center}><ActivityIndicator color={color.gold} /></View>
        : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {list.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {tab === 'disponibles'
                    ? 'No hay torneos disponibles por ahora.'
                    : 'Aún no estás inscrito en ningún torneo.'}
                </Text>
              </View>
            )}

            {list.map(t => {
              const badge = statusBadge(t.status);
              const mia   = tab === 'inscritos' ? mias.get(t.id) : undefined;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => router.push(`/(protected)/torneos/${t.id}`)}
                  style={({ pressed }) => [styles.cardPress, pressed && { opacity: 0.8 }]}
                >
                  <Card variant="standard">
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{t.name}</Text>
                      <Badge label={badge.label} type={badge.type} />
                    </View>
                    <Text style={styles.cardSub}>
                      {t.venues?.name ?? 'Sede por confirmar'} · {t.venues?.city ?? 'CDMX'}
                    </Text>
                    <View style={styles.cardMeta}>
                      <Text style={styles.metaText}>
                        {formatearRango(t.start_date, t.end_date)}
                      </Text>
                      {/* En "inscritos" la cuota ya no es información: el
                          jugador ya decidió. Lo que importa es en qué está
                          metido y si le falta pagar. */}
                      {mia ? (
                        <Text style={styles.metaText} numberOfLines={1}>
                          {mia.categorias.length > 0
                            ? mia.categorias.join(' · ')
                            : 'Categoría por confirmar'}
                        </Text>
                      ) : (
                        <Text style={styles.metaFee}>
                          {t.registration_fee > 0
                            ? `$${t.registration_fee.toLocaleString('es-MX')} MXN`
                            : 'Gratuito'}
                        </Text>
                      )}
                    </View>

                    {mia?.pendiente && (
                      <Text style={styles.pendiente}>Te falta completar el pago</Text>
                    )}
                  </Card>
                </Pressable>
              );
            })}
          </ScrollView>
        )
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: space[2], ...webContentColumn },
  eyebrow:{ fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:  { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },

  segmentWrapper: { paddingHorizontal: space[4.5], marginBottom: space[3], ...webContentColumn },
  segment: {
    flexDirection:   'row',
    backgroundColor: color.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     color.lineSoft,
    padding:         4,
  },
  segTab:       { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm - 2 },
  segTabActive: { backgroundColor: color.gold },
  segLabel:     { fontFamily: font.body, fontSize: 13, fontWeight: '500', color: color.muted },
  segLabelActive:{ color: color.onGold, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  empty:     { alignItems: 'center', paddingVertical: space[6] },
  emptyText: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center' },

  cardPress:   {},
  cardHeader:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[2], marginBottom: space[1.5] },
  cardTitle:   { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, flex: 1 },
  cardSub:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginBottom: space[2] },
  cardMeta:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space[1] },
  metaText:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  metaFee:     { fontFamily: font.display, fontSize: fontSize.body, color: color.goldBright },
  pendiente:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, marginTop: space[1.5] },
});
