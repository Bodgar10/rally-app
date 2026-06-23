/**
 * RALLY · Planes de Suscripción
 * La venta es WEB-FIRST: la app muestra los planes y redirige
 * a la web para el checkout (evita comisión ~30% de Apple).
 * Doc C §2.7 — no se puede cobrar suscripción digital directo en iOS (México).
 * Sprint 4: conectar con URL real de checkout web.
 * [REUSO PASAS] — estructura de planes portada a RN.
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, SafeAreaView, Linking,
} from 'react-native';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

type Cycle = 'mensual' | 'anual';

const PLANS = {
  mensual: {
    name:     'RALLY Pro',
    price:    '$149',
    period:   'al mes',
    save:     null,
    features: [
      'Tabla en vivo en todos tus torneos',
      'Tu ranking histórico por categoría',
      'Análisis de rendimiento (win-rate, progreso)',
      '5% de descuento en inscripciones',
      'Acceso anticipado a nuevas features',
    ],
  },
  anual: {
    name:     'RALLY Campeón',
    price:    '$1,499',
    period:   'al año',
    save:     'Ahorras $289 vs mensual',
    features: [
      'Todo lo de Pro',
      'Análisis avanzado de estilo de juego (IA)',
      'Informe de temporada al cierre del año',
      '5% de descuento en inscripciones todo el año',
      'Acceso prioritario a soporte',
    ],
  },
};

const FREE_FEATURES = [
  'Tabla en vivo (solo lectura)',
  'Tu próximo partido',
  'Clasificación anticipada ("ya clasificaste")',
  'Historial de torneos',
];

export default function PlanesScreen() {
  const [cycle, setCycle] = useState<Cycle>('anual');
  const plan = PLANS[cycle];

  function handleSubscribe() {
    // TODO Sprint 4: reemplazar con URL real del checkout web de Stripe
    const url = `https://rallypadel.mx/planes?plan=${cycle}`;
    Linking.openURL(url).catch(() => {
      // Si no puede abrir el navegador, mostrar error
      console.warn('[RALLY] No se pudo abrir el navegador para el checkout');
    });
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>RALLY PRO</Text>
          <Text style={s.title}>Sube tu juego</Text>
          <Text style={s.subtitle}>
            Análisis, ranking histórico y ventajas exclusivas para el jugador que quiere mejorar.
          </Text>
        </View>

        {/* Toggle de ciclo — Doc D §8.5 segmented */}
        <View style={s.segWrapper}>
          <View style={s.segment}>
            {(['mensual', 'anual'] as Cycle[]).map(c => (
              <Pressable
                key={c}
                style={[s.segTab, cycle === c && s.segTabActive]}
                onPress={() => setCycle(c)}
              >
                <Text style={[s.segLabel, cycle === c && s.segLabelActive]}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </Text>
                {c === 'anual' && (
                  <Text style={[s.segSave, cycle === 'anual' && s.segSaveActive]}>
                    -16%
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Tarjeta del plan — banner granate (Doc D §8.13) */}
        <View style={s.planCard}>
          <View style={s.planCardInner}>
            <Text style={s.planName}>{plan.name}</Text>
            <View style={s.priceRow}>
              <Text style={s.price}>{plan.price}</Text>
              <Text style={s.period}> {plan.period}</Text>
            </View>
            {plan.save && (
              <View style={s.saveBadge}>
                <Text style={s.saveBadgeText}>🎾 {plan.save}</Text>
              </View>
            )}

            <View style={s.divider} />

            {plan.features.map((f, i) => (
              <View key={i} style={s.featureRow}>
                <Text style={s.checkmark}>✓</Text>
                <Text style={s.featureText}>{f}</Text>
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.85 }]}
              onPress={handleSubscribe}
              accessibilityRole="button"
              accessibilityLabel={`Suscribirse al plan ${plan.name}`}
            >
              <Text style={s.ctaBtnText}>Suscribirme · {plan.price}/{cycle === 'mensual' ? 'mes' : 'año'}</Text>
            </Pressable>

            <Text style={s.disclaimer}>
              El pago se completa en nuestro sitio web. Cancela cuando quieras.
            </Text>
          </View>
        </View>

        {/* Plan gratuito */}
        <View style={s.freeCard}>
          <Text style={s.freeName}>Plan Gratuito</Text>
          <Text style={s.freeSubtitle}>Siempre incluido</Text>
          {FREE_FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Text style={s.checkmarkMuted}>✓</Text>
              <Text style={s.featureTextMuted}>{f}</Text>
            </View>
          ))}
        </View>

        {/* Nota PROFECO */}
        <View style={s.profecoNote}>
          <Text style={s.profecoText}>
            💡 La suscripción se renueva automáticamente. Recibirás un aviso por correo 5 días antes de cada renovación. Puedes cancelar en 2 toques desde tu perfil.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space[4.5], paddingTop: space[5], paddingBottom: space[6] * 2, gap: space[4] },

  header:   { alignItems: 'center', gap: space[1.5] },
  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, textAlign: 'center' },
  subtitle: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', lineHeight: 20 },

  segWrapper: {},
  segment:    { flexDirection: 'row', backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.lineSoft, padding: 4 },
  segTab:     { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm - 2, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  segTabActive: { backgroundColor: color.gold },
  segLabel:   { fontFamily: font.body, fontSize: 13, fontWeight: '500', color: color.muted },
  segLabelActive: { color: color.onGold, fontWeight: '600' },
  segSave:    { fontFamily: font.body, fontSize: 10, fontWeight: '700', color: color.muted, backgroundColor: color.surface2, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  segSaveActive: { color: color.onGold, backgroundColor: 'rgba(26,20,7,0.3)' },

  // Banner granate (Doc D §8.13)
  planCard:  {
    backgroundColor: color.wine,
    borderWidth:     1,
    borderColor:     'rgba(241,217,140,0.38)',
    borderRadius:    15,
    overflow:        'hidden',
    shadowColor:     '#7B1C30',
    shadowOffset:    { width: 0, height: 8 },
    shadowOpacity:   0.6,
    shadowRadius:    24,
    elevation:       8,
  },
  planCardInner: { padding: space[5], gap: space[3] },
  planName:  { fontFamily: font.display, fontSize: fontSize.section, color: color.onWine, letterSpacing: 2, opacity: 0.8 },
  priceRow:  { flexDirection: 'row', alignItems: 'baseline' },
  price:     { fontFamily: font.display, fontSize: 40, color: color.onWine, lineHeight: 44 },
  period:    { fontFamily: font.body, fontSize: fontSize.body, color: 'rgba(247,234,198,0.7)' },
  saveBadge: { alignSelf: 'flex-start', backgroundColor: color.gold, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  saveBadgeText: { fontFamily: font.body, fontSize: 11, fontWeight: '700', color: color.onGold },

  divider:  { height: 1, backgroundColor: 'rgba(241,217,140,0.2)', marginVertical: space[1] },

  featureRow: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
  checkmark:  { fontSize: 13, color: color.gold, marginTop: 1, fontWeight: '700', width: 16 },
  featureText:{ fontFamily: font.body, fontSize: fontSize.body, color: color.onWine, lineHeight: 20, flex: 1 },

  ctaBtn:     { backgroundColor: color.gold, borderRadius: radius.sm, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.goldBright },
  ctaBtnText: { fontFamily: font.body, fontSize: 15, fontWeight: '700', color: color.onGold },
  disclaimer: { fontFamily: font.body, fontSize: fontSize.caption, color: 'rgba(247,234,198,0.5)', textAlign: 'center' },

  // Plan gratuito
  freeCard:     { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.xl, padding: space[4], gap: space[2] },
  freeName:     { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  freeSubtitle: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginBottom: space[1] },
  checkmarkMuted:  { fontSize: 13, color: color.muted, marginTop: 1, width: 16 },
  featureTextMuted:{ fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, flex: 1 },

  // Nota PROFECO
  profecoNote: { backgroundColor: color.surface, borderRadius: radius.xl, padding: space[4], borderWidth: 1, borderColor: color.lineSoft },
  profecoText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, textAlign: 'center' },
});
