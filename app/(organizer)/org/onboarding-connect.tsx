/**
 * S4-SON-01 · Onboarding de Stripe Connect para el organizador
 *
 * Flujo:
 *   1. Mostrar estado actual de la cuenta conectada (sin cuenta / pending / active / restricted)
 *   2. Si no hay cuenta: botón "Conectar pagos" → POST a connect-onboard → guarda account id
 *   3. Si hay cuenta incompleta (pending/restricted): botón "Continuar registro" → POST a connect-account-link → abre en navegador
 *   4. Si active: pantalla de éxito con acciones de torneo disponibles
 *
 * Guard: solo owner del organizador (verificado en _layout.tsx del grupo (organizer))
 * Diseño: tokens de design-tokens.ts, NativeWind, expo-linear-gradient
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
import { supabase } from '@/lib/supabase/client';

// ─── Tipos ───────────────────────────────────────────────────────────────

type ConnectStatus = 'none' | 'pending' | 'onboarding' | 'active' | 'restricted';

interface OrganizerConnect {
  id: string;
  name: string;
  stripe_connect_account_id: string | null;
  connect_status: ConnectStatus | null;
}

// ─── Helpers de UI ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ConnectStatus | null }) {
  if (!status || status === 'none') return null;

  const config: Record<
    Exclude<ConnectStatus, 'none'>,
    { label: string; bg: string; border: string; text: string }
  > = {
    pending: {
      label: 'Registro pendiente',
      bg: 'rgba(230,180,80,0.13)',
      border: 'rgba(230,180,80,0.3)',
      text: color.alive,
    },
    onboarding: {
      label: 'Registro pendiente',
      bg: 'rgba(230,180,80,0.13)',
      border: 'rgba(230,180,80,0.3)',
      text: color.alive,
    },
    active: {
      label: 'Cuenta activa',
      bg: 'rgba(66,214,164,0.12)',
      border: 'rgba(66,214,164,0.3)',
      text: color.live,
    },
    restricted: {
      label: 'Acción requerida',
      bg: 'rgba(224,114,111,0.13)',
      border: 'rgba(224,114,111,0.3)',
      text: color.danger,
    },
  };

  const c = config[status];

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 11,
          fontWeight: '600',
          color: c.text,
        }}
      >
        {c.label}
      </Text>
    </View>
  );
}

// ─── Íconos SVG inline (outline, trazo) ──────────────────────────────────────
// Se usan como componentes View con Text para mantener compatibilidad universal.
// En producción usar una librería de íconos outline (lucide-react-native).

// ─── Pantalla principal ──────────────────────────────────────────────────────

export default function OnboardingConnectScreen() {
  const router = useRouter();

  const [organizer, setOrganizer] = useState<OrganizerConnect | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Fetch del estado actual del organizador ──────────────────────────────

  const fetchOrganizer = useCallback(async () => {
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sin sesión');

      // El organizador al que pertenece este owner
      const { data, error: dbError } = await supabase
        .from('organizer_members')
        .select(
          `
          organizer_id,
          organizers!inner(
            id,
            name,
            stripe_connect_account_id,
            connect_status
          )
        `
        )
        .eq('user_id', user.id)
        .eq('member_role', 'owner')
        .maybeSingle();

      if (dbError) throw dbError;
      if (!data) throw new Error('No tienes un organizador asociado');

      // Cast del embed anidado (patrón estándar del proyecto)
      const org = (data as unknown as { organizers: OrganizerConnect }).organizers;
      setOrganizer(org);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizer();
  }, [fetchOrganizer]);

  // ─── Acción: crear cuenta conectada ──────────────────────────────────────

  const handleCreateAccount = async () => {
    if (!organizer) return;
    setActionLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/connect-onboard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ organizer_id: organizer.id }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al crear cuenta');

      // La Edge Function devuelve el account_link para continuar el onboarding
      if (json.url) {
        await Linking.openURL(json.url);
      }

      // Refrescar el estado (el webhook actualizará connect_status a 'pending')
      await fetchOrganizer();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al conectar');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Acción: continuar onboarding (ya tiene cuenta) ──────────────────────

  const handleContinueOnboarding = async () => {
    if (!organizer?.stripe_connect_account_id) return;
    setActionLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/connect-account-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            organizer_id: organizer.id,
            stripe_connect_account_id: organizer.stripe_connect_account_id,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al generar link');

      if (json.url) {
        await Linking.openURL(json.url);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al continuar registro');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────

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

  const status: ConnectStatus = organizer?.connect_status ?? 'none';

  // ─── Render: pantalla activa (cuenta conectada) ──────────────────────────

  if (status === 'active') {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingTop: 32 }}
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
              marginBottom: 20,
            }}
          >
            Pagos · Stripe Connect
          </Text>

          {/* Sello de éxito */}
          <LinearGradient
            colors={['rgba(66,214,164,0.08)', 'rgba(66,214,164,0.02)']}
            style={{
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: 'rgba(66,214,164,0.2)',
              padding: 24,
              alignItems: 'center',
              marginBottom: 24,
            }}
          >
            {/* Medalla */}
            <LinearGradient
              colors={[color.goldBright, color.goldDeep]}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 28 }}>✓</Text>
            </LinearGradient>

            <Text
              style={{
                fontFamily: font.display,
                fontSize: 22,
                fontWeight: '600',
                color: color.text,
                marginBottom: 8,
                textAlign: 'center',
              }}
            >
              Pagos conectados
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
              Tu cuenta de Stripe está activa. Las inscripciones se dividirán
              automáticamente entre tu cuenta y RALLY.
            </Text>

            <StatusPill status="active" />
          </LinearGradient>

          {/* Detalles de la comisión */}
          <View
            style={{
              backgroundColor: color.surface,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: color.lineSoft,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                fontFamily: font.display,
                fontSize: 11,
                letterSpacing: 2,
                color: color.champagne,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Cómo funciona el split
            </Text>

            {[
              {
                label: 'Inscripción por pareja',
                value: 'La defines tú',
                sub: 'ejemplo $1,900',
              },
              {
                label: 'Comisión RALLY (5%)',
                value: '−5%',
                sub: 'se descuenta automáticamente',
              },
              {
                label: 'Lo que recibes en tu banco',
                value: '95%',
                sub: 'depósito automático vía Stripe',
              },
            ].map((row, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  paddingVertical: 10,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: color.lineSoft,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 13,
                      color: color.muted,
                    }}
                  >
                    {row.label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 11,
                      color: color.muted,
                      opacity: 0.7,
                      marginTop: 2,
                    }}
                  >
                    {row.sub}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: font.display,
                    fontSize: 16,
                    fontWeight: '600',
                    color:
                      i === 2
                        ? color.live
                        : i === 1
                        ? color.danger
                        : color.text,
                  }}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>

          {/* CTA: volver al panel, que es donde vive la lista de torneos.
              No hay ruta `org/torneos`: ese directorio solo tiene `nuevo` y
              `[tournamentId]`, así que apuntar ahí daba Unmatched Route. */}
          <Pressable
            onPress={() => router.push('/(organizer)/org')}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <LinearGradient
              colors={[color.goldBright, '#E2BE4A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                borderRadius: radius.sm,
                paddingVertical: 15,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: font.display,
                  fontSize: 16,
                  fontWeight: '600',
                  color: color.onGold,
                  letterSpacing: 0.02 * 16,
                }}
              >
                Ir a mis torneos
              </Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ─── Render: sin cuenta o registro pendiente/restringido ──────────────────

  const isPending = status === 'pending' || status === 'onboarding' || status === 'restricted';

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingTop: 32 }}
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
            marginBottom: 20,
          }}
        >
          Pagos · Stripe Connect
        </Text>

        {/* Título */}
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 28,
            fontWeight: '600',
            color: color.text,
            letterSpacing: 0.01 * 28,
            marginBottom: 8,
          }}
        >
          {isPending ? 'Completa tu registro' : 'Conecta tus pagos'}
        </Text>
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 13,
            color: color.muted,
            lineHeight: 20,
            marginBottom: 28,
          }}
        >
          {isPending
            ? 'Tu cuenta está pendiente de verificación en Stripe. Completa el proceso para poder abrir inscripciones de pago.'
            : 'Para cobrar inscripciones en línea, conecta tu cuenta bancaria con Stripe. Solo te tomará unos minutos.'}
        </Text>

        {/* Status pill si aplica */}
        {isPending && (
          <View style={{ marginBottom: 20 }}>
            <StatusPill status={status} />
          </View>
        )}

        {/* Pasos del proceso */}
        <View
          style={{
            backgroundColor: color.surface,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: color.lineSoft,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontSize: 11,
              letterSpacing: 2,
              color: color.champagne,
              textTransform: 'uppercase',
              marginBottom: 14,
            }}
          >
            Qué necesitas
          </Text>

          {[
            {
              step: '1',
              title: 'Datos de identidad',
              desc: 'INE o pasaporte, CURP.',
              done: isPending,
            },
            {
              step: '2',
              title: 'Cuenta bancaria',
              desc: 'CLABE interbancaria donde recibirás los pagos.',
              done: isPending,
            },
            {
              step: '3',
              title: 'Verificación de Stripe',
              desc: 'Stripe valida la identidad (suele tardar minutos).',
              // En esta rama status nunca es 'active' (ya retornó arriba): el paso 3 sigue pendiente.
              done: false,
            },
          ].map((item, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingVertical: 10,
                borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: color.lineSoft,
              }}
            >
              {/* Número/check */}
              <LinearGradient
                colors={
                  item.done
                    ? [color.goldBright, color.goldDeep]
                    : [color.surface2, color.surface2]
                }
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  borderWidth: item.done ? 0 : 1,
                  borderColor: color.lineSoft,
                }}
              >
                <Text
                  style={{
                    fontFamily: font.display,
                    fontSize: 13,
                    fontWeight: '600',
                    color: item.done ? color.onGold : color.muted,
                  }}
                >
                  {item.done ? '✓' : item.step}
                </Text>
              </LinearGradient>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: font.body,
                    fontSize: 13,
                    fontWeight: '500',
                    color: color.text,
                    marginBottom: 2,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    fontFamily: font.body,
                    fontSize: 11.5,
                    color: color.muted,
                    lineHeight: 17,
                  }}
                >
                  {item.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Nota legal */}
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 11,
            color: color.muted,
            lineHeight: 17,
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          El registro es con Stripe. RALLY{' '}
          <Text style={{ color: color.champagne, fontWeight: '500' }}>
            nunca
          </Text>{' '}
          administra ni transfiere tu dinero manualmente — el split es
          automático en cada pago.
        </Text>

        {/* Error */}
        {error && (
          <View
            style={{
              backgroundColor: 'rgba(224,114,111,0.1)',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: 'rgba(224,114,111,0.25)',
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: font.body,
                fontSize: 12,
                color: color.danger,
                lineHeight: 18,
              }}
            >
              {error}
            </Text>
          </View>
        )}

        {/* CTA principal */}
        <Pressable
          onPress={isPending ? handleContinueOnboarding : handleCreateAccount}
          disabled={actionLoading}
          style={({ pressed }) => ({
            opacity: pressed || actionLoading ? 0.85 : 1,
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
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {actionLoading ? (
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
                {isPending ? 'Continuar registro en Stripe' : 'Conectar pagos'}
              </Text>
            )}
          </LinearGradient>
        </Pressable>

        <Text
          style={{
            fontFamily: font.body,
            fontSize: 10,
            color: color.muted,
            textAlign: 'center',
            marginTop: 10,
          }}
        >
          Se abrirá la página de Stripe en tu navegador.
        </Text>
      </ScrollView>
    </View>
  );
}
