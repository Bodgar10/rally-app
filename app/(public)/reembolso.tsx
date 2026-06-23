/**
 * RALLY · Política de Reembolso
 * Requerida por App Store Review y PROFECO.
 */

import { ScrollView, View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.body}>{children}</Text>
    </View>
  );
}

export default function ReembolsoScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.back()} style={s.back}>
        <Text style={s.backText}>← Volver</Text>
      </Pressable>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>RALLY</Text>
        <Text style={s.title}>Política de Reembolso</Text>
        <Text style={s.meta}>Versión 1.0.0 · Vigente desde junio 2026</Text>

        <Section title="Inscripciones a torneos">
          Las inscripciones a torneos son gestionadas por el organizador de cada evento. La política de reembolso de inscripciones la define el organizador y se informa en la página del torneo. RALLY puede facilitar el proceso de solicitud de reembolso, pero la decisión final corresponde al organizador.
        </Section>

        <Section title="Suscripción RALLY Pro / Campeón">
          Si cancelas tu suscripción dentro de los primeros 7 días naturales desde la fecha de contratación o renovación, puedes solicitar un reembolso completo. Pasado ese período, no se realizan reembolsos parciales: tu acceso continúa hasta el final del período pagado.
        </Section>

        <Section title="Cómo solicitar un reembolso">
          Envía un correo a reembolsos@rallypadel.mx con tu nombre, correo registrado, monto y motivo. Responderemos en un máximo de 5 días hábiles. Si el reembolso procede, se acredita en el mismo método de pago original en un plazo de 5 a 10 días hábiles adicionales.
        </Section>

        <Section title="Casos especiales">
          Si el torneo fue cancelado por el organizador, tienes derecho a reembolso completo de la inscripción. Contáctanos si el organizador no lo gestiona en 5 días hábiles.
        </Section>
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
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[1] },
  meta:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginBottom: space[5] },
  section: { marginBottom: space[5] },
  sectionTitle: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne, marginBottom: space[1.5] },
  body:    { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },
});
