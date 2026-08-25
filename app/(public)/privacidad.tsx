/**
 * RALLY · Aviso de Privacidad
 * Cumplimiento LFPDPPP (México). Requerido por App Store.
 */

import { ScrollView, View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { color, font, fontSize, space } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.body}>{children}</Text>
    </View>
  );
}

export default function PrivacidadScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto="Volver" />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>RALLY</Text>
        <Text style={s.title}>Aviso de Privacidad</Text>
        <Text style={s.meta}>Versión 1.0.0 · Vigente desde junio 2026</Text>

        <Section title="Responsable">
          RALLY es el responsable del tratamiento de tus datos personales, con domicilio en Ciudad de México, México. Contacto: privacidad@rallypadel.mx
        </Section>

        <Section title="Datos que recopilamos">
          Nombre completo, correo electrónico, teléfono (opcional), fecha de nacimiento (opcional), género (opcional), lado de juego preferido (opcional), historial de torneos, marcadores y estadísticas de partidos, información de pago (procesada por Stripe, no almacenamos datos de tarjeta), y parámetros de adquisición (UTM/referrer).
        </Section>

        <Section title="Finalidades">
          Primarias: registro y autenticación, gestión de inscripciones a torneos, cálculo de ranking y estadísticas, procesamiento de pagos. Secundarias (requieren consentimiento adicional): envío de promociones y ofertas de patrocinadores, análisis de comportamiento para mejora del producto.
        </Section>

        <Section title="Transferencia de datos">
          Tus datos pueden ser compartidos con: organizadores de torneos (solo datos necesarios para el evento), patrocinadores (únicamente si otorgas consentimiento explícito al solicitar un producto), proveedores de tecnología (Supabase, Stripe, Resend) bajo acuerdos de confidencialidad. No vendemos tus datos.
        </Section>

        <Section title="Datos de menores">
          Si eres menor de 18 años, requerimos el consentimiento de tu padre, madre o tutor para registrarte. El responsable del menor debe completar el formulario de consentimiento parental durante el registro.
        </Section>

        <Section title="Derechos ARCO">
          Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte al tratamiento de tus datos. Envía tu solicitud a privacidad@rallypadel.mx con tu nombre, correo registrado y descripción de la solicitud. Responderemos en un máximo de 20 días hábiles.
        </Section>

        <Section title="Cookies y rastreo">
          Usamos cookies y tecnologías de rastreo para analítica (PostHog, Google Analytics) y atribución de marketing (Meta CAPI). Puedes desactivarlas desde la configuración de tu dispositivo.
        </Section>

        <Section title="Cambios al aviso">
          Cualquier cambio sustancial será notificado por correo con al menos 30 días de anticipación.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, ...webContentColumn },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[1] },
  meta:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginBottom: space[5] },
  section: { marginBottom: space[5] },
  sectionTitle: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne, marginBottom: space[1.5] },
  body:    { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },
});
