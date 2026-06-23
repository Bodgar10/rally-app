/**
 * RALLY · Términos y Condiciones
 * Versión 1.0.0 — requerida por App Store y PROFECO.
 * [REUSO PASAS] — estructura y cláusulas portadas.
 */

import { ScrollView, View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { color, font, fontSize, space } from '@/lib/design-tokens';

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.body}>{children}</Text>
    </View>
  );
}

export default function TerminosScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.back()} style={s.back}>
        <Text style={s.backText}>← Volver</Text>
      </Pressable>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>RALLY</Text>
        <Text style={s.title}>Términos y Condiciones</Text>
        <Text style={s.meta}>Versión 1.0.0 · Vigente desde junio 2026</Text>

        <Section title="1. Aceptación">
          Al crear una cuenta o usar la plataforma RALLY, aceptas estos Términos y Condiciones en su totalidad. Si no los aceptas, no uses la plataforma.
        </Section>

        <Section title="2. Descripción del servicio">
          RALLY es una plataforma digital que facilita la organización, inscripción y seguimiento de torneos de pádel. El servicio incluye: registro de torneos, inscripción de parejas, tabla de posiciones en vivo, clasificación anticipada y análisis estadístico del jugador (en planes de suscripción).
        </Section>

        <Section title="3. Inscripciones a torneos">
          Las inscripciones a torneos son pagos únicos por pareja. El pago se procesa a través de Stripe Connect. RALLY actúa como intermediario tecnológico y cobra una comisión de servicio sobre cada inscripción. El organizador del torneo es el responsable del evento. Los pagos y devoluciones de inscripciones se sujetan a la política del organizador.
        </Section>

        <Section title="4. Suscripción (plan Pro / Campeón)">
          La suscripción a planes de análisis avanzado es un cargo recurrente (mensual o anual). La renovación es automática al final de cada período. Puedes cancelar en cualquier momento desde tu perfil, con efectividad al final del período pagado. Recibirás un aviso con al menos 5 días de anticipación antes de cada renovación (reforma PROFECO 2025).
        </Section>

        <Section title="5. Uso aceptable">
          Está prohibido: hacer uso fraudulento de la plataforma, inscribirse en categorías para las que no calificás, manipular resultados, compartir credenciales de acceso, o realizar ingeniería inversa del sistema.
        </Section>

        <Section title="6. Propiedad intelectual">
          Todo el contenido de RALLY (diseño, logotipos, código, textos) es propiedad de sus creadores. Los datos estadísticos generados por tu participación en torneos son tuyos; RALLY los usa de forma agregada y anonimizada para el ranking de la red.
        </Section>

        <Section title="7. Limitación de responsabilidad">
          RALLY no se hace responsable de lesiones, daños o pérdidas ocurridas durante los torneos. La responsabilidad máxima de RALLY se limita al monto pagado por el usuario en los últimos 12 meses.
        </Section>

        <Section title="8. Modificaciones">
          RALLY puede actualizar estos términos. Te notificaremos con al menos 30 días de anticipación ante cambios sustanciales. El uso continuado de la plataforma implica aceptación de los nuevos términos.
        </Section>

        <Section title="9. Ley aplicable">
          Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia se somete a los tribunales competentes de la Ciudad de México.
        </Section>

        <Section title="10. Contacto">
          Para dudas o reclamaciones: hola@rallypadel.mx
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
