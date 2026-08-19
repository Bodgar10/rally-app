/**
 * pago.tsx · Pantalla de checkout de inscripción
 * Sprint 4 · Stripe Connect
 *
 * Llega aquí desde inscripcion/[tournamentId]/index.tsx cuando fee > 0
 * y el pair ya existe en BD con payment_status='pending'.
 *
 * Flujo:
 *   1. Carga el torneo + la pareja pending del usuario
 *   2. Toggle "Pago completo / Solo mi parte"
 *   3. Desglose de pago (PayBreakdown)
 *   4. Banner granate Pro (respeta regla iOS México)
 *   5. Botón "Pagar" → POST checkout-tournament → Linking.openURL(url)
 *   6. Estado de éxito
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { color, radius, font } from '@/lib/design-tokens';
import { webContentColumn } from '@/lib/web-layout';
import { supabase } from '@/lib/supabase/client';
import { PayBreakdown, computeTotal } from '@/components/checkout/PayBreakdown';
import { getFeatureFlags } from '@/lib/feature-flags';

type SplitMode = 'full' | 'half';

interface TournamentInfo {
  id: string;
  name: string;
  date: string;
  venue: string;
  entry_fee: number;
  organizer_id: string;
}

interface PairInfo {
  id: string;
  player1: { id: string; full_name: string };
  player2: { id: string; full_name: string };
  category: { name: string; fee_override: number | null };
}

interface UserSubscription {
  billing_cycle: 'monthly' | 'annual' | null;
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

function ProBanner({
  isChampion,
  entryFee,
  splitMode,
  isDirectCTA,
  onCtaPress,
}: {
  isChampion: boolean;
  entryFee: number;
  splitMode: SplitMode;
  isDirectCTA: boolean;
  onCtaPress: () => void;
}) {
  if (isChampion) {
    return (
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
          marginBottom: 12,
          elevation: 8,
        }}
      >
        <LinearGradient
          colors={[color.goldBright, color.goldDeep]}
          style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <Text style={{ fontSize: 16 }}>🏅</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.display, fontSize: 13.5, fontWeight: '600', color: '#F7EAC6' }}>
            ¡Felicidades, Campeón!
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: 10.5, color: '#E6CDC2', marginTop: 2, lineHeight: 14 }}>
            Ahorras 5% en este torneo — descuento ya aplicado en tu total.
          </Text>
        </View>
      </View>
    );
  }

  const base = splitMode === 'half' ? entryFee / 2 : entryFee;
  const saving = Math.round(base * 0.05);
  const ctaLabel = isDirectCTA ? `Suscríbete y ahorra $${saving.toLocaleString('es-MX')}` : 'Conoce los beneficios Pro';
  const bodyText = isDirectCTA
    ? `Con Campeón anual este torneo te sale en $${(base - saving).toLocaleString('es-MX')} (−5%) + análisis Pro.`
    : 'Descuento en inscripciones, análisis de juego y mucho más.';

  return (
    <Pressable onPress={onCtaPress} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1, marginBottom: 12 })}>
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
          elevation: 8,
        }}
      >
        <LinearGradient
          colors={[color.goldBright, color.goldDeep]}
          style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <Text style={{ fontSize: 16 }}>⚡</Text>
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: font.display, fontSize: 13.5, fontWeight: '600', color: '#F7EAC6' }}>
            {ctaLabel}
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: 10.5, color: '#E6CDC2', marginTop: 2, lineHeight: 14 }}>
            {bodyText}
          </Text>
        </View>
        <LinearGradient
          colors={[color.goldBright, '#E2BE4A']}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, flexShrink: 0 }}
        >
          <Text style={{ fontFamily: font.body, fontSize: 11, fontWeight: '600', color: color.onGold }}>
            {isDirectCTA ? 'Agregar' : 'Ver más'}
          </Text>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

export default function PagoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();
  const flags = getFeatureFlags();

  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [pair, setPair] = useState<PairInfo | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription>({ billing_cycle: null, status: null });
  const [splitMode, setSplitMode] = useState<SplitMode>('full');
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadData = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: t, error: te } = await supabase
        .from('tournaments')
        .select('id, name, start_date, registration_fee, organizer_id, venue:venues(name)')
        .eq('id', tournamentId)
        .single();
      if (te) throw te;

      const tt = t as unknown as {
        id: string; name: string; start_date: string;
        registration_fee: number; organizer_id: string;
        venue: { name: string } | { name: string }[] | null;
      };
      const venueName = Array.isArray(tt.venue) ? tt.venue[0]?.name : tt.venue?.name;
      setTournament({
        id: tt.id, name: tt.name, date: tt.start_date,
        venue: venueName ?? '—',
        entry_fee: Number(tt.registration_fee ?? 0),
        organizer_id: tt.organizer_id,
      });

      // Pareja pending del usuario en este torneo
      const { data: pairData } = await supabase
        .from('pairs')
        .select(`
          id,
          player1:users!pairs_player1_id_fkey(id, full_name),
          player2:users!pairs_player2_id_fkey(id, full_name),
          category:categories(name, fee_override)
        `)
        .eq('tournament_id', tournamentId)
        .eq('payment_status', 'pending')
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        .maybeSingle();

      if (pairData) setPair(pairData as unknown as PairInfo);

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('billing_cycle, status')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing'])
        .maybeSingle();

      if (sub) setSubscription(sub as UserSubscription);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { loadData(); }, [loadData]);

  const isChampion =
    (subscription.status === 'active' || subscription.status === 'trialing') &&
    subscription.billing_cycle === 'annual';

  const entryFee = pair?.category?.fee_override ?? tournament?.entry_fee ?? 0;
  const totalToPay = computeTotal(entryFee, splitMode, isChampion);
  const isDirectSubscriptionCTA = flags.SUBSCRIPTION_CTA_DIRECT ?? false;

  const handlePay = async () => {
    if (!pair) return;
    setCheckoutLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/checkout-tournament`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ pair_id: pair.id, mode: splitMode }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al procesar pago');
      if (!json.url) throw new Error('No se recibió la URL de pago');

      await Linking.openURL(json.url);
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al pagar');
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={color.gold} size="large" />
      </View>
    );
  }

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <LinearGradient
          colors={[color.goldBright, color.goldDeep]}
          style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}
        >
          <Text style={{ fontSize: 32 }}>🎾</Text>
        </LinearGradient>
        <Text style={{ fontFamily: font.display, fontSize: 28, fontWeight: '600', color: color.text, textAlign: 'center', marginBottom: 8 }}>
          ¡Inscripción iniciada!
        </Text>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: color.muted, textAlign: 'center', lineHeight: 20, marginBottom: 32 }}>
          Completa el pago en la página que se abrió. Cuando Stripe confirme, tu inscripción quedará activa.
        </Text>
        <Pressable onPress={() => router.replace(`/(protected)/inscripcion/${tournamentId}/patrocinadores`)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <LinearGradient colors={['#F6E3A6', '#E2BE4A']} style={{ borderRadius: radius.sm, paddingVertical: 14, paddingHorizontal: 32 }}>
            <Text style={{ fontFamily: font.display, fontSize: 16, fontWeight: '600', color: color.onGold }}>
              Continuar
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 0, ...webContentColumn }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontFamily: font.display, fontSize: 11, letterSpacing: 2, color: color.champagne, textTransform: 'uppercase', marginBottom: 10 }}>
          Confirmar pago
        </Text>

        <View style={{ backgroundColor: color.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: color.lineSoft, padding: 15, marginBottom: 14 }}>
          <Text style={{ fontFamily: font.display, fontSize: 18, fontWeight: '600', color: color.text, lineHeight: 22, marginBottom: 8 }}>
            {tournament?.name ?? '—'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 14, marginBottom: 12 }}>
            {[
              { icon: '📅', text: tournament ? formatDate(tournament.date) : '—' },
              { icon: '📍', text: tournament?.venue ?? '—' },
            ].map((item, i) => (
              <Text key={i} style={{ fontFamily: font.body, fontSize: 11.5, color: color.muted }}>
                {item.icon} {item.text}
              </Text>
            ))}
          </View>

          {pair?.category?.name && (
            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              <View style={{ borderWidth: 1, borderColor: color.line, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontFamily: font.display, fontSize: 11, color: color.champagne, fontWeight: '500' }}>
                  {pair.category.name}
                </Text>
              </View>
            </View>
          )}

          {pair && (
            <View style={{ borderTopWidth: 1, borderTopColor: color.lineSoft, paddingTop: 13, gap: 10 }}>
              {[
                { player: pair.player1, role: 'Tú · capitán' },
                { player: pair.player2, role: 'Tu pareja' },
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <LinearGradient
                    colors={[color.goldBright, color.goldDeep]}
                    style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: font.display, fontWeight: '600', fontSize: 14, color: color.onGold }}>
                      {initials(item.player.full_name)}
                    </Text>
                  </LinearGradient>
                  <View>
                    <Text style={{ fontFamily: font.body, fontSize: 13, fontWeight: '500', color: color.text }}>
                      {item.player.full_name}
                    </Text>
                    <Text style={{ fontFamily: font.body, fontSize: 10.5, color: color.muted }}>
                      {item.role}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Toggle Pago completo / Solo mi parte */}
          <View style={{ flexDirection: 'row', backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: 4, gap: 4, marginTop: 14 }}>
            {([
              { mode: 'full' as SplitMode, label: 'Pago completo', amount: `$${entryFee.toLocaleString('es-MX')}` },
              { mode: 'half' as SplitMode, label: 'Solo mi parte', amount: `$${(entryFee / 2).toLocaleString('es-MX')}` },
            ] as const).map((opt) => (
              <Pressable key={opt.mode} onPress={() => setSplitMode(opt.mode)} style={{ flex: 1, borderRadius: radius.md - 2, overflow: 'hidden' }}>
                {splitMode === opt.mode ? (
                  <LinearGradient colors={[color.goldBright, color.gold]} style={{ paddingVertical: 8, alignItems: 'center' }}>
                    <Text style={{ fontFamily: font.body, fontSize: 11.5, fontWeight: '600', color: color.onGold, textAlign: 'center' }}>{opt.label}</Text>
                    <Text style={{ fontFamily: font.display, fontSize: 13, fontWeight: '600', color: color.onGold, marginTop: 1 }}>{opt.amount}</Text>
                  </LinearGradient>
                ) : (
                  <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                    <Text style={{ fontFamily: font.body, fontSize: 11.5, fontWeight: '600', color: color.muted, textAlign: 'center' }}>{opt.label}</Text>
                    <Text style={{ fontFamily: font.display, fontSize: 13, fontWeight: '600', color: color.muted, marginTop: 1 }}>{opt.amount}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <PayBreakdown entryFee={entryFee} splitMode={splitMode} isChampion={isChampion} />
      </ScrollView>

      {/* Área fija de pago */}
      <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: color.lineSoft, backgroundColor: 'rgba(10,10,12,0.6)' }}>
        <ProBanner
          isChampion={isChampion}
          entryFee={entryFee}
          splitMode={splitMode}
          isDirectCTA={isDirectSubscriptionCTA}
          onCtaPress={() => router.push('/(protected)/planes')}
        />

        {error && (
          <Text style={{ fontFamily: font.body, fontSize: 12, color: color.danger, marginBottom: 10, textAlign: 'center' }}>
            {error}
          </Text>
        )}

        <Pressable onPress={handlePay} disabled={checkoutLoading || !pair} style={({ pressed }) => ({ opacity: pressed || checkoutLoading || !pair ? 0.8 : 1 })}>
          <LinearGradient
            colors={['#F6E3A6', '#E2BE4A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ borderRadius: radius.sm, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
          >
            {checkoutLoading ? (
              <ActivityIndicator color={color.onGold} size="small" />
            ) : (
              <Text style={{ fontFamily: font.display, fontSize: 16, fontWeight: '600', color: color.onGold, letterSpacing: 0.02 * 16 }}>
                Pagar ${totalToPay.toLocaleString('es-MX')}
              </Text>
            )}
          </LinearGradient>
        </Pressable>

        <Text style={{ fontFamily: font.body, fontSize: 10, color: color.muted, textAlign: 'center', marginTop: 9 }}>
          🔒 Pago seguro · procesado por Stripe
        </Text>
      </View>
    </View>
  );
}
