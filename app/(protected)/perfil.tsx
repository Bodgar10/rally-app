/**
 * RALLY · Perfil del Jugador
 * Muestra datos del usuario, estatus de suscripción (stub) y logout.
 * [REUSO PASAS] — patrón de perfil portado a React Native.
 * Sprint 4 completará: suscripción, CancellationFlow, CFDI, PROFECO.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { User } from '@supabase/supabase-js';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, Avatar, SectionLabel }   from '@/components/ui';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUser(user);

      const { data } = await supabase
        .from('users')
        .select('full_name, email, role, phone, preferred_side')
        .eq('id', user.id)
        .single();

      if (data) setProfile(data as UserProfile);
      setLoading(false);
    }
    load();
  }, []);

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

        {/* Suscripción — stub hasta Sprint 4 */}
        <SectionLabel title="Suscripción" />
        <Card variant="standard">
          <View style={styles.subRow}>
            <Text style={styles.subLabel}>Plan actual</Text>
            <Text style={styles.subValue}>Gratuito</Text>
          </View>
          <Text style={styles.subNote}>
            Suscríbete a RALLY Pro para acceder al análisis de tu juego y ranking histórico.
          </Text>
          <View style={{ marginTop: space[3] }}>
            <Button
              label="Ver planes"
              variant="secondary"
              onPress={() => router.push('/(protected)/planes')}
            />
          </View>
        </Card>

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
          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>Lado preferido</Text>
            <Text style={styles.dataValue}>
              {profile?.preferred_side
                ? profile.preferred_side.charAt(0).toUpperCase() + profile.preferred_side.slice(1)
                : 'No definido'}
            </Text>
          </View>
          <View style={{ marginTop: space[3] }}>
            <Button
              label="Editar perfil"
              variant="secondary"
              onPress={() => {}} // TODO Sprint 1: pantalla de edición
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

        <Text style={styles.version}>RALLY v0.1.0 · Sprint 0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:          { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: space[6] * 2 },

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
