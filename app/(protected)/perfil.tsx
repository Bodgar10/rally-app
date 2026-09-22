/**
 * RALLY · Perfil del Jugador
 * Muestra datos del usuario, estatus de suscripción (stub) y logout.
 * [REUSO PASAS] — patrón de perfil portado a React Native.
 * Sprint 4 completará: suscripción, CancellationFlow, CFDI, PROFECO.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { User } from '@supabase/supabase-js';

import { supabase }                             from '@/lib/supabase/client';
import { PlayerAnalysis }                       from '@/components/player/PlayerAnalysis';
import { ContadorDeAhorro }                    from '@/components/campeon/ContadorDeAhorro';
import { TuNivel }                             from '@/components/player/TuNivel';
import { textoDeJugador, type PerfilDeJuego }  from '@/lib/lado-y-mano';
import { CancellationFlow }                      from '@/components/perfil/CancellationFlow';
import { Button, Card, Avatar, SectionLabel }   from '@/components/ui';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

interface UserProfile {
  full_name:    string;
  email:        string;
  role:         string;
  phone:        string | null;
  preferred_side: string | null;
}

export default function PerfilScreen() {
  const router = useRouter();
  const [user, setUser]         = useState<User | null>(null);
  const [profile, setProfile]   = useState<UserProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [subscription, setSubscription] = useState<
    { status: string | null; billing_cycle: string | null; current_period_end: string | null } | null
  >(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUser(user);

    const { data } = await supabase
      .from('users')
      .select('full_name, email, role, phone, preferred_side')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data as UserProfile);

    // Suscripción (para mostrar plan activo + cancelación PROFECO)
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, billing_cycle, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();
    setSubscription(
      (sub as { status: string | null; billing_cycle: string | null; current_period_end: string | null }) ?? null
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  if (loading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator color={color.gold} />
    </View>
  );

  const displayName = profile?.full_name ?? user?.email?.split('@')[0] ?? 'Jugador';

  const isActiveSub = subscription?.status === 'active';
  const planLabel = isActiveSub
    ? (subscription?.billing_cycle === 'annual' ? 'Campeón anual' : 'Pro mensual')
    : 'Gratuito';
  const periodEndLabel = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header con avatar */}
        <View style={styles.header}>
          <Avatar name={displayName} size={64} />
          <View style={styles.headerTexts}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{profile?.email ?? user?.email}</Text>
            {profile?.role === 'admin' && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>ADMIN</Text>
              </View>
            )}
          </View>
        </View>

        {/* Suscripción */}
        <SectionLabel title="Suscripción" />
        <Card variant="standard">
          <View style={styles.subRow}>
            <Text style={styles.subLabel}>Plan actual</Text>
            <Text style={styles.subValue}>{planLabel}</Text>
          </View>

          {isActiveSub ? (
            <>
              {periodEndLabel && (
                <Text style={styles.subNote}>Renovación: {periodEndLabel}</Text>
              )}
              {/* Cancelación PROFECO: ≤2 clics, texto simple (accesible, no prominente) */}
              <Pressable
                onPress={() => setCancelOpen(true)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: space[3] })}
              >
                <Text
                  style={{
                    fontFamily: font.body,
                    fontSize: fontSize.body,
                    color: color.muted,
                    textAlign: 'center',
                    textDecorationLine: 'underline',
                  }}
                >
                  Cancelar suscripción
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.subNote}>
                Suscríbete a Padel Crown Pro para acceder al análisis de tu juego y ranking histórico.
              </Text>
              <View style={{ marginTop: space[3] }}>
                <Button
                  label="Ver planes"
                  variant="secondary"
                  onPress={() => router.push('/(protected)/planes')}
                />
              </View>
            </>
          )}
        </Card>

        {/* CUÁNTO LLEVA AHORRADO CON CAMPEÓN.
            Va justo debajo de su suscripción y no en otra pantalla: es el
            número que decide si renueva en diciembre. Se pinta solo si es
            Campeón — a quien no lo es, aquí sería publicidad, y el sitio de la
            publicidad es el checkout, donde está pagando de más. */}
        {user && <ContadorDeAhorro userId={user.id} />}

        {/* BUSCAR PAREJA.
            Va aquí y no en el tab bar: no es algo que se abra a diario, es algo
            que se busca cuando hace falta — y cuando hace falta, el jugador ya
            está mirando su perfil o inscribiéndose, que son los dos sitios
            desde donde se llega. */}
        <Pressable
          onPress={() => router.push('/(protected)/buscar-pareja')}
          accessibilityRole="button"
          accessibilityLabel="Buscar pareja"
          style={({ pressed }) => [styles.buscarPareja, pressed && { opacity: 0.85 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.buscarParejaTitulo}>Buscar pareja</Text>
            <Text style={styles.buscarParejaSub}>
              De tu nivel, del lado contrario al tuyo y por tu zona
            </Text>
          </View>
          <Text style={styles.buscarParejaFlecha}>›</Text>
        </Pressable>

        {/* TU NIVEL Y TU CURVA.
            Va antes del análisis porque es lo que el jugador viene a ver: su
            división y si está subiendo. El resto son detalles de eso. */}
        {user && <TuNivel userId={user.id} />}

        {/* Análisis descriptivo del jugador (free) + gating Pro — S5-SON-03 */}
        {user && (
          <PlayerAnalysis userId={user.id} />
        )}

        <CancellationFlow
          visible={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onCanceled={loadProfile}
          billingCycle={(subscription?.billing_cycle as 'monthly' | 'annual' | null) ?? null}
          periodEnd={periodEndLabel ?? 'fin del período'}
        />

        {/* Datos del jugador */}
        <SectionLabel title="Mis datos" />
        <Card variant="standard">
          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Nombre</Text>
            <Text style={styles.dataValue}>{profile?.full_name ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Correo</Text>
            <Text style={styles.dataValue}>{profile?.email ?? user?.email ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Teléfono</Text>
            <Text style={styles.dataValue}>{profile?.phone ?? 'No registrado'}</Text>
          </View>
          <View style={styles.divider} />
          {/* Lo contesta la tarjeta del dashboard, de una en una. Aquí solo
              se lee: hasta que exista una pantalla de edición, un valor mal
              puesto se corrige desde el mismo sitio donde se preguntó. */}
          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Cómo juegas</Text>
            <Text style={styles.dataValue}>
              {textoDeJugador({
                lado: (profile?.preferred_side ?? null) as PerfilDeJuego['lado'],
                mano: null,
              }) ?? 'Te lo preguntamos pronto'}
            </Text>
          </View>
          <View style={{ marginTop: space[3] }}>
            <Button
              label="Editar perfil"
              variant="secondary"
              onPress={() => router.push('/(protected)/perfil-editar')}
            />
          </View>
        </Card>

        {/* Legal */}
        <SectionLabel title="Legal" />
        <Card variant="standard">
          {[
            { label: 'Términos y Condiciones', route: '/(public)/terminos' },
            { label: 'Aviso de Privacidad',    route: '/(public)/privacidad' },
            { label: 'Política de reembolso',  route: '/(public)/reembolso' },
            { label: 'Cómo cancelar',          route: '/(public)/como-cancelar' },
          ].map((item, i) => (
            <View key={item.route}>
              {i > 0 && <View style={styles.divider} />}
              <Pressable
                style={styles.legalRow}
                onPress={() => router.push(item.route as any)}
              >
                <Text style={styles.legalLabel}>{item.label}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </View>
          ))}
        </Card>

        {/* Cerrar sesión */}
        <View style={{ marginTop: space[4] }}>
          <Button
            label={loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            variant="danger"
            loading={loggingOut}
            onPress={handleLogout}
          />
        </View>

        <Text style={styles.version}>Padel Crown v0.1.0 · Sprint 0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ► ESTABA PEGADO A LO DE ARRIBA Y A LO DE ABAJO.
  //   Sin margen vertical quedaba encajado entre la tarjeta de suscripción y
  //   la de nivel, como si fuera parte de una de las dos. Es una acción propia
  //   —lleva a otra pantalla— y necesita aire para leerse como tal. El de
  //   arriba es mayor que el de abajo a propósito: lo separa de la tarjeta de
  //   suscripción, con la que no tiene nada que ver.
  buscarPareja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: touchTarget + 12,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    marginTop: space[5],
    marginBottom: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.goldMuted,
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  buscarParejaTitulo: { color: color.goldBright, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },
  buscarParejaSub: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17, marginTop: 2 },
  buscarParejaFlecha: { color: color.muted, fontFamily: font.body, fontSize: fontSize.h1Inline },
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:          { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: bottomInset, ...webContentColumn },

  header:      { flexDirection: 'row', alignItems: 'center', gap: space[4], marginBottom: space[2] },
  headerTexts: { flex: 1 },
  name:        { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.text, marginBottom: 2 },
  email:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  adminBadge:     { marginTop: space[1], alignSelf: 'flex-start', backgroundColor: color.wine, borderRadius: radius.xs, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText: { fontFamily: font.body, fontSize: 9, fontWeight: '700', color: color.onWine, letterSpacing: 1 },

  subRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1] },
  subLabel: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  subValue: { fontFamily: font.display, fontSize: fontSize.body, color: color.champagne },
  subNote:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, marginTop: space[1] },

  dataRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space[2] },
  dataLabel: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  dataValue: { fontFamily: font.body, fontSize: fontSize.body, color: color.text, textAlign: 'right', flex: 1, marginLeft: space[3] },

  divider: { height: 1, backgroundColor: color.lineSoft, marginVertical: 0 },

  legalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space[3] },
  legalLabel:{ fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  chevron:   { fontSize: 18, color: color.muted },

  version: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, textAlign: 'center', marginTop: space[5] },
});
