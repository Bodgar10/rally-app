/**
 * RALLY · Cómo cancelar mi suscripción
 * PROFECO 2025 — obligatorio. Máximo 2 clics desde perfil.
 * [REUSO PASAS] — mismo patrón portado a RN.
 */

import { ScrollView, View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

export default function ComoCancelarScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.back()} style={s.back}>
        <Text style={s.backText}>← Volver</Text>
      </Pressable>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>RALLY</Text>
        <Text style={s.title}>Cómo cancelar tu suscripción</Text>
        <Text style={s.intro}>
          Puedes cancelar tu suscripción en cualquier momento, sin cargos adicionales, siguiendo estos pasos:
        </Text>

        {[
          { n: '1', t: 'Ve a tu Perfil', d: 'Toca el ícono de perfil en la barra de navegación inferior.' },
          { n: '2', t: 'Sección Suscripción', d: 'Dentro de tu perfil, toca "Gestionar suscripción".' },
          { n: '3', t: 'Cancelar', d: 'Toca "Cancelar suscripción" y confirma tu decisión. Listo.' },
        ].map(step => (
          <View key={step.n} style={s.step}>
            <View style={s.stepNum}>
              <Text style={s.stepNumText}>{step.n}</Text>
            </View>
            <View style={s.stepContent}>
              <Text style={s.stepTitle}>{step.t}</Text>
              <Text style={s.stepDesc}>{step.d}</Text>
            </View>
          </View>
        ))}

        <View style={s.infoBox}>
          <Text style={s.infoTitle}>¿Qué pasa después de cancelar?</Text>
          <Text style={s.infoBody}>
            Tu suscripción permanece activa hasta el final del período ya pagado. No se realizan cargos adicionales. Conservas acceso a todas las funciones del plan hasta esa fecha.
          </Text>
        </View>

        <View style={s.infoBox}>
          <Text style={s.infoTitle}>Aviso de renovación</Text>
          <Text style={s.infoBody}>
            Conforme a la reforma PROFECO 2025, recibirás un correo de aviso al menos 5 días antes de cada renovación automática, con el monto y la fecha exacta del cargo.
          </Text>
        </View>

        <Text style={s.contact}>
          ¿Problemas para cancelar? Escríbenos a hola@rallypadel.mx y lo resolvemos en menos de 24 horas.
        </Text>

        <Pressable
          style={s.ctaBtn}
          onPress={() => router.push('/(protected)/perfil')}
        >
          <Text style={s.ctaBtnText}>Ir a mi perfil para cancelar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: color.bg },
  back:    { paddingHorizontal: space[4.5], paddingTop: space[4], paddingBottom: space[2] },
  backText:{ fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
  content: { paddingHorizontal: space[4.5], paddingBottom: space[6] * 2 },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[3] },
  intro:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[5] },

  step:        { flexDirection: 'row', gap: space[3], marginBottom: space[4] },
  stepNum:     { width: 32, height: 32, borderRadius: 16, backgroundColor: color.gold, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText: { fontFamily: font.display, fontSize: 16, fontWeight: '600', color: color.onGold },
  stepContent: { flex: 1 },
  stepTitle:   { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, marginBottom: 4 },
  stepDesc:    { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 18 },

  infoBox:   { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.xl, padding: space[4], marginBottom: space[3] },
  infoTitle: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne, marginBottom: space[1] },
  infoBody:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },

  contact: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, textAlign: 'center', marginVertical: space[4] },

  ctaBtn:     { backgroundColor: color.gold, borderRadius: radius.sm, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.goldBright },
  ctaBtnText: { fontFamily: font.body, fontSize: 14, fontWeight: '600', color: color.onGold },
});
