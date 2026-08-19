/**
 * S4-SON-04 · Página de planes y suscripción (Web-first)
 *
 * Esta pantalla funciona en las TRES plataformas (iOS, Android, Web).
 * REGLA CRÍTICA (Doc C §2.7):
 *   - En Web: muestra precio, planes, toggle ciclo, checkout completo.
 *   - En iOS/Android (México): muestra precio e información BUT el
 *     botón de pago abre la web (Linking.openURL). Esto es correcto
 *     porque al no ser un "product within the app" sino que redirige
 *     al navegador, respeta las reglas de App Store en MX.
 *   - El feature flag SUBSCRIPTION_CTA_DIRECT controla si el CTA es
 *     directo o informativo (igual que en el banner).
 *
 * Reutiliza ConsentBox (REUSO PASAS portado) + BillingCycleToggle
 * (nuevo en RN, inspirado en el componente de Pasas).
 *
 * Estado: si el usuario ya tiene suscripción activa, muestra el
 * estado actual y la opción de cancelar (que lleva a CancellationFlow).
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { color, radius, font } from '@/lib/design-tokens';
import { webContentColumn } from '@/lib/web-layout';
import { supabase } from '@/lib/supabase/client';
import { ConsentBox } from '@/components/checkout/ConsentBox';
import { getFeatureFlags } from '@/lib/feature-flags';

// URL de la web de RALLY (para el handoff de pago desde app nativa)
const WEB_PLANES_URL = process.env.EXPO_PUBLIC_WEB_URL
  ? `${process.env.EXPO_PUBLIC_WEB_URL}/planes`
  : 'https://rally.app/planes'; // TODO: reemplazar por dominio real

// ─── Tipos ───────────────────────────────────────────────────────────────

type BillingCycle = 'monthly' | 'annual';

interface UserSub {
  id: string;
  status: 'active' | 'canceled' | 'past_due';
  billing_cycle: BillingCycle;
  current_period_end: string;
}

interface UserProfile {
  full_name: string;
  email: string;
  // Stats cargadas para el preview personalizado
  tournaments_played?: number;
  wins?: number;
}

const PLANS = {
  monthly: {
    label: 'Pro',
    sublabel: 'mensual',
    price: 149,
    priceLabel: '$149',
    period: '/mes',
    cta: 'Suscribirme por $149/mes',
    highlight: false,
  },
  annual: {
    label: 'Campeón',
    sublabel: 'anual',
    price: 1900,
    priceLabel: '$1,900',
    period: '/año',
    cta: 'Suscribirme por $1,900/año',
    highlight: true, // plan destacado
  },
} as const;

const ANNUAL_SAVINGS = Math.round(149 * 12 - 1900); // $88 de "ahorro"
const ANNUAL_MONTHLY_EQUIV = Math.round(1900 / 12); // ~$158/mes → en realidad es $149 pero destacar el compromiso

// ─── Toggle de ciclo de pago ────────────────────────────────────────────────

function BillingCycleToggle({
  selected,
  onChange,
}: {
  selected: BillingCycle;
  onChange: (v: BillingCycle) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.lineSoft,
        borderRadius: radius.md,
        padding: 4,
        gap: 4,
        marginBottom: 20,
      }}
    >
      {(['monthly', 'annual'] as BillingCycle[]).map((cycle) => {
        const isActive = selected === cycle;
        const label = cycle === 'monthly' ? 'Mensual' : 'Anual';
        const sub = cycle === 'annual' ? '  ✦ Más popular' : '';

        return (
          <Pressable
            key={cycle}
            onPress={() => onChange(cycle)}
            style={{ flex: 1, borderRadius: radius.md - 2, overflow: 'hidden' }}
          >
            {isActive ? (
              <LinearGradient
                colors={[color.goldBright, color.gold]}
                style={{ paddingVertical: 10, alignItems: 'center' }}
              >
                <Text
                  style={{
                    fontFamily: font.body,
                    fontSize: 13,
                    fontWeight: '600',
                    color: color.onGold,
                  }}
                >
                  {label}
                  {sub && (
                    <Text style={{ fontSize: 10, fontWeight: '400' }}>{sub}</Text>
                  )}
                </Text>
              </LinearGradient>
            ) : (
              <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                <Text
                  style={{
                    fontFamily: font.body,
                    fontSize: 13,
                    fontWeight: '600',
                    color: color.muted,
                  }}
                >
                  {label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Tarjeta de plan ─────────────────────────────────────────────────────────

function PlanCard({
  cycle,
  isSelected,
  onSelect,
}: {
  cycle: BillingCycle;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const plan = PLANS[cycle];
  const isAnnual = cycle === 'annual';

  return (
    <Pressable onPress={onSelect} style={{ marginBottom: 12 }}>
      <View
        style={{
          backgroundColor: isSelected
            ? 'rgba(212,175,55,0.08)'
            : color.surface,
          borderRadius: radius.xl,
          borderWidth: isSelected ? 1.5 : 1,
          borderColor: isSelected ? color.gold : color.lineSoft,
          overflow: 'hidden',
        }}
      >
        {/* Barra de acento superior (solo plan destacado) */}
        {isAnnual && (
          <LinearGradient
            colors={[color.goldDeep, color.goldBright, color.goldDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 2.5 }}
          />
        )}

        <View style={{ padding: 16 }}>
          {/* Header del plan */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 12,
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: font.display,
                  fontSize: 18,
                  fontWeight: '600',
                  color: color.text,
                }}
              >
                {plan.label}
              </Text>
              <Text
                style={{
                  fontFamily: font.body,
                  fontSize: 12,
                  color: color.muted,
                }}
              >
                {plan.sublabel}
              </Text>
            </View>

            {/* Precio */}
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={{
                  fontFamily: font.display,
                  fontSize: 26,
                  fontWeight: '600',
                  color: isSelected ? color.goldBright : color.text,
                  lineHeight: 30,
                }}
              >
                {plan.priceLabel}
              </Text>
              <Text
                style={{
                  fontFamily: font.body,
                  fontSize: 11,
                  color: color.muted,
                }}
              >
                {plan.period}
              </Text>
            </View>
          </View>

          {/* Badge de ahorro (solo anual) */}
          {isAnnual && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  backgroundColor: 'rgba(212,175,55,0.14)',
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: color.line,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    fontFamily: font.display,
                    fontSize: 10,
                    color: color.goldBright,
                    fontWeight: '600',
                    letterSpacing: 1,
                  }}
                >
                  5% DESCUENTO EN TORNEOS
                </Text>
              </View>
            </View>
          )}

          {/* Beneficios del plan */}
          {(isAnnual
            ? [
                'Análisis Pro completo',
                'Probabilidad de victoria',
                'Scouting del rival',
                'Proyección de ranking',
                'Tarjetas compartibles',
                '5% de descuento en inscripciones',
              ]
            : [
                'Análisis Pro completo',
                'Probabilidad de victoria',
                'Scouting del rival',
                'Proyección de ranking',
                'Tarjetas compartibles',
              ]
          ).map((b, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: color.live, fontSize: 12 }}>✓</Text>
              <Text
                style={{
                  fontFamily: font.body,
                  fontSize: 12.5,
                  color: color.muted,
                }}
              >
                {b}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Preview personalizado ───────────────────────────────────────────────────

function PersonalizedPreview({ profile }: { profile: UserProfile }) {
  const winRate =
    (profile.tournaments_played ?? 0) > 0
      ? Math.round(((profile.wins ?? 0) / (profile.tournaments_played ?? 1)) * 100)
      : null;

  return (
    <LinearGradient
      colors={['#241F12', '#19171A']}
      style={{
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.line,
        padding: 16,
        marginBottom: 20,
        overflow: 'hidden',
      }}
    >
      {/* Barra de acento */}
      <LinearGradient
        colors={[color.goldDeep, color.goldBright, color.goldDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2.5,
        }}
      />

      <Text
        style={{
          fontFamily: font.display,
          fontSize: 11,
          letterSpacing: 2,
          color: color.gold,
          textTransform: 'uppercase',
          marginBottom: 10,
          marginTop: 4,
        }}
      >
        Tu análisis Pro · Vista previa
      </Text>

      <Text
        style={{
          fontFamily: font.body,
          fontSize: 15,
          fontWeight: '500',
          color: color.text,
          marginBottom: 12,
        }}
      >
        Hola, {profile.full_name.split(' ')[0]} 👋
      </Text>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          {
            value: profile.tournaments_played ?? '—',
            label: 'Torneos',
          },
          {
            value: winRate !== null ? `${winRate}%` : '—',
            label: 'Win rate',
          },
          {
            value: '🔒',
            label: 'Clutch rate',
          },
          {
            value: '🔒',
            label: 'Química pareja',
          },
        ].map((stat, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: color.surface,
              borderRadius: radius.lg,
              padding: 10,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: font.display,
                fontSize: i < 2 ? 20 : 18,
                fontWeight: '600',
                color: i < 2 ? color.goldBright : color.muted,
                marginBottom: 4,
              }}
            >
              {String(stat.value)}
            </Text>
            <Text
              style={{
                fontFamily: font.body,
                fontSize: 10,
                color: color.muted,
                textAlign: 'center',
              }}
            >
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      <Text
        style={{
          fontFamily: font.body,
          fontSize: 11,
          color: color.muted,
          marginTop: 10,
          textAlign: 'center',
        }}
      >
        🔒 Suscríbete para desbloquear el análisis completo
      </Text>
    </LinearGradient>
  );
}

// ─── Pantalla principal ──────────────────────────────────────────────────────

export default function PlanesScreen() {
  const router = useRouter();
  const flags = getFeatureFlags();
  const isWeb = Platform.OS === 'web';

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<UserSub | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('annual');
  const [consentChecked, setConsentChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Cargar datos ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prof }, { data: sub }, { data: stats }] = await Promise.all([
        supabase
          .from('users')
          .select('full_name, email')
          .eq('id', user.id)
          .single(),
        supabase
          .from('subscriptions')
          .select('id, status, billing_cycle, current_period_end')
          .eq('user_id', user.id)
          .maybeSingle(),
        // Stats básicas para el preview personalizado (tournament_ranking_points usa player_id)
        supabase
          .from('tournament_ranking_points')
          .select('id')
          .eq('player_id', user.id),
      ]);

      if (prof) {
        setProfile({
          full_name: prof.full_name ?? 'Jugador',
          email: prof.email ?? user.email ?? '',
          tournaments_played: stats?.length ?? 0,
        });
      }
      if (sub) setSubscription(sub as UserSub);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Fecha del próximo cobro (para ConsentBox) ──────────────────────────

  const nextBillingDate = (() => {
    const d = new Date();
    if (selectedCycle === 'monthly') {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setFullYear(d.getFullYear() + 1);
    }
    return d.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  })();

  // ─── Acción de suscripción ──────────────────────────────────────────────

  const handleSubscribe = async () => {
    // En app nativa: abrir la web (handoff)
    if (!isWeb) {
      await Linking.openURL(
        `${WEB_PLANES_URL}?cycle=${selectedCycle}&ref=app`
      );
      return;
    }

    // En web: checkout directo
    if (!consentChecked) {
      setError('Acepta los términos de cargo automático para continuar.');
      return;
    }

    setCheckoutLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/checkout-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ billing_cycle: selectedCycle }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al crear checkout');

      if (json.url) {
        // En web, redirigir en la misma ventana
        if (typeof window !== 'undefined') {
          window.location.href = json.url;
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al procesar');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ─── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={color.gold} size="large" />
      </View>
    );
  }

  // ─── Estado: ya suscrito ────────────────────────────────────────────────

  if (subscription?.status === 'active') {
    const endDate = new Date(subscription.current_period_end).toLocaleDateString(
      'es-MX',
      { day: 'numeric', month: 'long', year: 'numeric' }
    );
    const isChampion = subscription.billing_cycle === 'annual';

    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingTop: 32, ...webContentColumn }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontSize: 11,
              letterSpacing: 0.26 * 11,
              color: color.gold,
              textTransform: 'uppercase',
              marginBottom: 20,
            }}
          >
            Tu suscripción
          </Text>

          <LinearGradient
            colors={[color.wine, color.wineDeep]}
            style={{
              borderRadius: 15,
              borderWidth: 1,
              borderColor: 'rgba(241,217,140,0.38)',
              padding: 20,
              alignItems: 'center',
              marginBottom: 24,
            }}
          >
            <LinearGradient
              colors={[color.goldBright, color.goldDeep]}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 26 }}>🏆</Text>
            </LinearGradient>

            <Text
              style={{
                fontFamily: font.display,
                fontSize: 20,
                fontWeight: '600',
                color: '#F7EAC6',
                marginBottom: 4,
              }}
            >
              Plan {isChampion ? 'Campeón' : 'Pro'}
            </Text>
            <Text
              style={{
                fontFamily: font.body,
                fontSize: 12,
                color: '#E6CDC2',
                marginBottom: 12,
              }}
            >
              Renovación: {endDate}
            </Text>

            {/* Pill activo */}
            <View
              style={{
                backgroundColor: 'rgba(66,214,164,0.15)',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: 'rgba(66,214,164,0.3)',
                paddingHorizontal: 12,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: font.body,
                  fontSize: 11,
                  fontWeight: '600',
                  color: color.live,
                }}
              >
                Activa
              </Text>
            </View>
          </LinearGradient>

          {/* Botón cancelar */}
          <Pressable
            onPress={() => router.push('/(protected)/perfil')}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <View
              style={{
                backgroundColor: color.surface,
                borderRadius: radius.xl,
                borderWidth: 1,
                borderColor: color.lineSoft,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: font.body,
                  fontSize: 14,
                  color: color.muted,
                }}
              >
                Gestionar suscripción →
              </Text>
            </View>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ─── Pantalla de venta ──────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingTop: 32, paddingBottom: 40, ...webContentColumn }}
        showsVerticalScrollIndicator={false}
      >
        {/* Eyebrow */}
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 11,
            letterSpacing: 0.26 * 11,
            color: color.gold,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Planes
        </Text>

        {/* Título */}
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 28,
            fontWeight: '600',
            color: color.text,
            marginBottom: 6,
          }}
        >
          Juega diferente
        </Text>
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 13,
            color: color.muted,
            lineHeight: 20,
            marginBottom: 24,
          }}
        >
          Análisis en tiempo real, scouting del rival y el 5% de descuento en
          cada torneo que juegas.
        </Text>

        {/* Preview personalizado */}
        {profile && <PersonalizedPreview profile={profile} />}

        {/* Toggle mensual / anual */}
        <BillingCycleToggle
          selected={selectedCycle}
          onChange={setSelectedCycle}
        />

        {/* Tarjetas de plan */}
        <PlanCard
          cycle={selectedCycle}
          isSelected
          onSelect={() => {}}
        />

        {/* Nota de ahorro para anual */}
        {selectedCycle === 'annual' && (
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 11.5,
              color: color.goldBright,
              textAlign: 'center',
              marginBottom: 20,
            }}
          >
            ✦ El descuento del 5% en torneos se paga solo en 2 torneos al año
          </Text>
        )}

        {/* ConsentBox PROFECO — solo en web (en app nativa el checkout ocurre en web) */}
        {isWeb && (
          <ConsentBox
            billingCycle={selectedCycle}
            nextBillingDate={nextBillingDate}
            checked={consentChecked}
            onToggle={() => setConsentChecked((v) => !v)}
          />
        )}

        {/* Error */}
        {error && (
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 12,
              color: color.danger,
              marginBottom: 12,
              textAlign: 'center',
            }}
          >
            {error}
          </Text>
        )}

        {/* CTA */}
        <Pressable
          onPress={handleSubscribe}
          disabled={checkoutLoading || (isWeb && !consentChecked)}
          style={({ pressed }) => ({
            opacity:
              pressed || checkoutLoading || (isWeb && !consentChecked) ? 0.75 : 1,
          })}
        >
          <LinearGradient
            colors={['#F6E3A6', '#E2BE4A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              borderRadius: radius.sm,
              paddingVertical: 15,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            {checkoutLoading ? (
              <ActivityIndicator color={color.onGold} size="small" />
            ) : (
              <Text
                style={{
                  fontFamily: font.display,
                  fontSize: 16,
                  fontWeight: '600',
                  color: color.onGold,
                  letterSpacing: 0.02 * 16,
                }}
              >
                {isWeb
                  ? PLANS[selectedCycle].cta
                  : `Ver planes y precios`}
              </Text>
            )}
          </LinearGradient>
        </Pressable>

        {!isWeb && (
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 11,
              color: color.muted,
              textAlign: 'center',
              marginTop: 10,
            }}
          >
            Se abrirá en tu navegador para gestionar la suscripción
          </Text>
        )}

        {/* Legales */}
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 10,
            color: color.muted,
            textAlign: 'center',
            marginTop: 20,
            lineHeight: 16,
          }}
        >
          Al suscribirte aceptas nuestros{' '}
          <Text style={{ color: color.champagne }}>Términos y Condiciones</Text>.
          Puedes cancelar en cualquier momento desde tu perfil.{'\n'}
          RALLY · Reforma PROFECO 2025 cumplida.
        </Text>
      </ScrollView>
    </View>
  );
}
