/**
 * RALLY · Dashboard del Jugador
 * Home mínimo (Sprint 0). Muestra:
 *   - Saludo + nombre del usuario
 *   - Banner "Mi próximo partido" (stub — se rellena en Sprint 3)
 *   - Banner CTA granate "¿Organizas torneos?" (visible solo si NO tiene membresía)
 *     o switch de modo si SÍ la tiene.
 *   - Acceso rápido a torneos disponibles.
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
import { hasOrganizerMembership } from '@/lib/auth/guards';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';

export default function DashboardScreen() {
  const router = useRouter();

  const [user, setUser]           = useState<User | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    async function loadUserData() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      setUser(data.user);

      // Verificar membresía de organizador (muestra switch de modo o CTA)
      const hasMembership = await hasOrganizerMembership(data.user.id);
      setIsOrganizer(hasMembership);
      setLoading(false);
    }
    loadUserData();
  }, []);

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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>RALLY</Text>
          <Text style={styles.greeting}>Hola, {displayName} 👋</Text>
        </View>

        {/* ── Mi próximo partido — STUB (Sprint 3) ─────────────── */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>MI PRÓXIMO PARTIDO</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.accentBar} />
          <Text style={styles.heroEmpty}>Sin partidos programados</Text>
          <Text style={styles.heroSubtext}>
            Inscríbete a un torneo para ver tu próximo partido aquí, en vivo.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPrimaryPressed]}
            onPress={() => router.push('/(protected)/torneos/index')}
            accessibilityRole="button"
            accessibilityLabel="Ver torneos disponibles"
          >
            <Text style={styles.btnPrimaryText}>Ver torneos disponibles</Text>
          </Pressable>
        </View>

        {/* ── CTA Organizador o Switch de Modo ─────────────────── */}
        {isOrganizer ? (
          // Switch de modo — tiene al menos una membresía de organizador
          <Pressable
            style={({ pressed }) => [styles.switchModeCard, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/(organizer)/org/index')}
            accessibilityRole="button"
            accessibilityLabel="Ir al panel de organizador"
          >
            <View style={styles.switchModeRow}>
              <Text style={styles.switchModeIcon}>⚙️</Text>
              <View style={styles.switchModeTexts}>
                <Text style={styles.switchModeTitle}>Modo Organizador</Text>
                <Text style={styles.switchModeSubtitle}>Administra tus torneos</Text>
              </View>
              <Text style={styles.switchModeChevron}>›</Text>
            </View>
          </Pressable>
        ) : (
          // CTA granate — no es organizador aún
          <View style={styles.ctaBanner}>
            <View style={styles.ctaContent}>
              <Text style={styles.ctaEyebrow}>¿ORGANIZAS TORNEOS?</Text>
              <Text style={styles.ctaTitle}>Crea el tuyo en RALLY</Text>
              <Text style={styles.ctaBody}>
                Tabla en vivo, clasificación anticipada y pagos automáticos.
                Sin Excel.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  // TODO Sprint 4: router.push('/(organizer)/org/onboarding-connect')
                  // Por ahora muestra un stub de "próximamente"
                  router.push('/(protected)/dashboard'); // placeholder
                }}
                accessibilityRole="button"
                accessibilityLabel="Comenzar como organizador"
              >
                <Text style={styles.ctaBtnText}>Comenzar →</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Acceso rápido a torneos ──────────────────────────── */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>TORNEOS</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(protected)/torneos/index')}
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
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos — solo tokens de design-tokens (cero hex literales) ─────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: space[6] * 2, gap: space[3] },

  // Header
  header: { marginBottom: space[2] },
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

  // Switch de modo organizador
  switchModeCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.xl,
    padding: space[4],
  },
  switchModeRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  switchModeIcon: { fontSize: 22, color: color.gold },
  switchModeTexts: { flex: 1 },
  switchModeTitle: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  switchModeSubtitle: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  switchModeChevron: { fontSize: 22, color: color.muted },

  // CTA Banner granate — "¿Organizas torneos?" (Doc D §8.13)
  ctaBanner: {
    backgroundColor: color.wine,
    borderWidth: 1,
    borderColor: 'rgba(241,217,140,0.38)',
    borderRadius: 15,
    overflow: 'hidden',
    // shadow granate (Doc D §8.13)
    shadowColor: '#7B1C30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 8,
  },
  ctaContent: { padding: space[5], gap: space[2] },
  ctaEyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.onWine, letterSpacing: 2.5, opacity: 0.7 },
  ctaTitle: { fontFamily: font.display, fontSize: fontSize.metric, color: color.onWine, letterSpacing: 0.3 },
  ctaBody: { fontFamily: font.body, fontSize: fontSize.body, color: 'rgba(247,234,198,0.8)', lineHeight: 20 },
  ctaBtn: {
    backgroundColor: color.gold,
    borderRadius: radius.sm,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[2],
  },
  ctaBtnText: { fontFamily: font.body, fontSize: 14, fontWeight: '600', color: color.onGold },

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
