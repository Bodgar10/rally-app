/**
 * RALLY · Ayuda y Preguntas Frecuentes
 * FAQ expandible por categorías + contacto soporte.
 * [REUSO PASAS] — estructura portada a React Native.
 * Requerida por App Store Review.
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  StyleSheet, SafeAreaView, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

// ─── Datos ──────────────────────────────────────────────────────────────────

interface FAQ { q: string; a: string }
interface Category { label: string; faqs: FAQ[] }

const CATEGORIES: Category[] = [
  {
    label: 'Inscripciones',
    faqs: [
      {
        q: '¿Cómo me inscribo a un torneo?',
        a: 'Ve a la sección "Torneos", elige el torneo que te interesa y toca "Inscribirme". Necesitas tener a tu pareja registrada en RALLY — busca su correo dentro del flujo de inscripción.',
      },
      {
        q: '¿Mi pareja necesita estar registrada en RALLY?',
        a: 'Sí. Ambos jugadores de la pareja deben tener cuenta en RALLY. Si tu pareja aún no está registrada, primero comparte la app con ella para que se registre.',
      },
      {
        q: '¿Puedo cambiar de pareja o categoría después de inscribirme?',
        a: 'Los cambios dependen del organizador del torneo y del estado de las inscripciones. Contacta directamente al organizador antes de que cierren las inscripciones.',
      },
      {
        q: '¿Qué significa "paid_offline"?',
        a: 'Significa que el organizador te registró manualmente porque el pago se hizo fuera de la plataforma (efectivo, transferencia, etc.). Tu inscripción es válida.',
      },
    ],
  },
  {
    label: 'Torneos y partidos',
    faqs: [
      {
        q: '¿Cómo sé a qué hora juego?',
        a: 'Una vez que el organizador publique el calendario, verás tu próximo partido en el Dashboard ("Home"). Recibirás una notificación con la hora y cancha asignadas.',
      },
      {
        q: '¿Cómo se cuentan los puntos de la tabla del grupo?',
        a: '2 puntos por partido ganado y 0 por perderlo: tus puntos son tus victorias por dos. Si dos parejas quedan con los mismos puntos, decide primero el resultado entre ellas, luego la diferencia de sets y después la de games. No se reparten puntos por jugar, así que un grupo de 4 no da más puntos que uno de 3 por el simple hecho de tener un partido más.',
      },
      {
        q: 'Si pasa 1 por grupo, ¿cómo se eligen los "mejores segundos"?',
        a: 'Cuando el cuadro no se llena solo con los primeros de cada grupo, se completa con los mejores segundos de toda la categoría. Se comparan por puntos, luego por diferencia de sets, luego por diferencia de games y por último por el porcentaje de games ganados. Todos los criterios son proporciones o diferencias, para que un segundo de un grupo de 4 no salga favorecido por haber jugado un partido más.',
      },
      {
        q: '¿Qué significa "Ya clasificaste"?',
        a: 'Es el motor de clasificación anticipada de RALLY. Significa que matemáticamente ya no puedes quedar fuera, sin importar los resultados restantes. Puedes jugar tranquilo.',
      },
      {
        q: '¿Qué es la "dependencia"?',
        a: 'Si aparece "Dependes del partido X", significa que tu clasificación depende del resultado de ese partido entre otras parejas. RALLY te dice exactamente de qué resultado necesitas.',
      },
      {
        q: '¿Quién captura los resultados?',
        a: 'El juez designado o el organizador captura el resultado y el marcador completo. La tabla se actualiza automáticamente en tiempo real en tu app.',
      },
    ],
  },
  {
    label: 'Ranking y puntos',
    faqs: [
      {
        q: '¿Cómo se calculan los puntos de ranking?',
        a: 'Son distintos de los puntos de la tabla del grupo, que solo ordenan ese grupo. Los de ranking: ganas por victorias en fase de grupos (50 pts c/u), por clasificar de grupos (+100), y según la ronda eliminatoria que alcances (cuartos +250, semis +400, final +650, campeón +1,000). Los puntos se multiplican según el tamaño del cuadro.',
      },
      {
        q: '¿Los puntos se acumulan entre torneos?',
        a: 'Sí. Los puntos de ranking se acumulan en toda la red RALLY, sin importar el organizador. Tu posición refleja tu temporada completa.',
      },
      {
        q: '¿Qué es el rating Glicko?',
        a: 'Es una medida estadística de tu habilidad real (similar al ELO del ajedrez). RALLY lo calcula internamente desde tu primer torneo. Se mostrará en una próxima actualización.',
      },
    ],
  },
  {
    label: 'Suscripción',
    faqs: [
      {
        q: '¿Qué incluye el plan gratuito?',
        a: 'Tabla en vivo, tu próximo partido, clasificación anticipada ("ya clasificaste"), historial de torneos y tu posición en el ranking. Todo lo esencial para jugar.',
      },
      {
        q: '¿Qué agrega RALLY Pro?',
        a: 'Análisis de rendimiento (win-rate, clutch en super muertes, rendimiento por horario y sede), ranking histórico detallado, 5% de descuento en inscripciones y acceso anticipado a nuevas funciones.',
      },
      {
        q: '¿Cómo cancelo mi suscripción?',
        a: 'Ve a tu Perfil → Gestionar suscripción → Cancelar. Máximo 2 toques, sin obstáculos. Tu acceso continúa hasta el final del período pagado.',
      },
      {
        q: '¿Por qué el pago se completa en la web?',
        a: 'Para poder ofrecerte el mejor precio sin la comisión de las tiendas (~30%). El pago en web es igual de seguro — usamos Stripe, el mismo procesador de millones de empresas.',
      },
    ],
  },
  {
    label: 'Cuenta y datos',
    faqs: [
      {
        q: '¿Cómo cambio mi contraseña?',
        a: 'En la pantalla de Login, toca "¿Olvidaste tu contraseña?" e ingresa tu correo. Te enviamos un link para restablecerla.',
      },
      {
        q: '¿Cómo elimino mi cuenta?',
        a: 'Escríbenos a privacidad@rallypadel.mx solicitando la eliminación de tu cuenta. Lo procesamos en máximo 30 días hábiles.',
      },
      {
        q: '¿RALLY comparte mis datos con patrocinadores?',
        a: 'Solo si tú lo autorizas explícitamente al solicitar un producto de un patrocinador. Tu nombre y correo se comparten solo en ese momento y con ese patrocinador específico.',
      },
    ],
  },
];

// ─── Componente de FAQ expandible ──────────────────────────────────────────

function FAQItem({ q, a }: FAQ) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(!open)} style={s.faqItem}>
      <View style={s.faqHeader}>
        <Text style={s.faqQ}>{q}</Text>
        <Text style={[s.faqChevron, open && s.faqChevronOpen]}>›</Text>
      </View>
      {open && <Text style={s.faqA}>{a}</Text>}
    </Pressable>
  );
}

// ─── Pantalla ────────────────────────────────────────────────────────────

export default function AyudaScreen() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState(0);

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto="Volver" />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>RALLY</Text>
        <Text style={s.title}>Ayuda</Text>
        <Text style={s.subtitle}>¿Tienes alguna duda? Aquí están las respuestas.</Text>

        {/* Tabs de categoría */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabs}
        >
          {CATEGORIES.map((cat, i) => (
            <Pressable
              key={cat.label}
              style={[s.tab, activeCategory === i && s.tabActive]}
              onPress={() => setActiveCategory(i)}
            >
              <Text style={[s.tabLabel, activeCategory === i && s.tabLabelActive]}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* FAQs de la categoría activa */}
        <View style={s.faqList}>
          {CATEGORIES[activeCategory].faqs.map((faq, i) => (
            <View key={i}>
              {i > 0 && <View style={s.faqDivider} />}
              <FAQItem q={faq.q} a={faq.a} />
            </View>
          ))}
        </View>

        {/* Contacto */}
        <View style={s.contactBox}>
          <Text style={s.contactTitle}>¿No encontraste lo que buscas?</Text>
          <Text style={s.contactBody}>
            Escríbenos y te respondemos en menos de 24 horas.
          </Text>
          <Pressable
            style={s.contactBtn}
            onPress={() => Linking.openURL('mailto:hola@rallypadel.mx')}
          >
            <Text style={s.contactBtnText}>Enviar correo →</Text>
          </Pressable>
        </View>

        {/* Links legales */}
        <View style={s.legalLinks}>
          {[
            { label: 'Términos y Condiciones', route: '/(public)/terminos' },
            { label: 'Aviso de Privacidad',    route: '/(public)/privacidad' },
            { label: 'Política de reembolso',  route: '/(public)/reembolso' },
            { label: 'Cómo cancelar',          route: '/(public)/como-cancelar' },
          ].map(link => (
            <Pressable
              key={link.route}
              onPress={() => router.push(link.route as any)}
              style={s.legalLink}
            >
              <Text style={s.legalLinkText}>{link.label} ›</Text>
            </Pressable>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[4], ...webContentColumn },

  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  subtitle: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },

  // Tabs
  tabs: { gap: space[2], paddingVertical: space[1] },
  tab: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius:      radius.pill,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    backgroundColor:   color.surface2,
  },
  tabActive:      { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  tabLabel:       { fontFamily: font.body, fontSize: 13, color: color.muted },
  tabLabelActive: { color: color.goldBright, fontWeight: '600' },

  // FAQs
  faqList:    { backgroundColor: color.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: color.lineSoft, overflow: 'hidden' },
  faqDivider: { height: 1, backgroundColor: color.lineSoft },
  faqItem:    { padding: space[4] },
  faqHeader:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3] },
  faqQ:       { fontFamily: font.body, fontSize: fontSize.body, color: color.text, flex: 1, fontWeight: '500', lineHeight: 20 },
  faqChevron: { fontSize: 20, color: color.muted, transform: [{ rotate: '0deg' }] },
  faqChevronOpen: { transform: [{ rotate: '90deg' }] },
  faqA:       { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginTop: space[2] },

  // Contacto
  contactBox:    { backgroundColor: color.surface, borderRadius: radius.xl, padding: space[5], borderWidth: 1, borderColor: color.lineSoft, gap: space[2] },
  contactTitle:  { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  contactBody:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },
  contactBtn:    { backgroundColor: color.gold, borderRadius: radius.sm, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.goldBright, marginTop: space[1] },
  contactBtnText:{ fontFamily: font.body, fontSize: 14, fontWeight: '600', color: color.onGold },

  // Legales
  legalLinks: { gap: space[1] },
  legalLink:  { paddingVertical: space[2] },
  legalLinkText: { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
});
