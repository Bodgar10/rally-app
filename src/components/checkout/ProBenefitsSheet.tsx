/**
 * ProBenefitsSheet
 *
 * Modal/Sheet informativo de los beneficios Pro.
 * REGLA iOS México (Doc C §2.7): este componente es 100% INFORMATIVO.
 * - NO muestra precio
 * - NO tiene botón de checkout dentro de la app
 * - El único CTA es "Ver planes y precios" → handoff a la web
 *
 * En regiones donde esté habilitado el CTA directo (isDirectCTA=true),
 * el botón puede mostrar precio y navegar al checkout web.
 * La lógica de qué mostrar viene del feature flag SUBSCRIPTION_CTA_DIRECT.
 *
 * Uso:
 *   <ProBenefitsSheet visible={open} onClose={() => setOpen(false)} isDirectCTA={flag} />
 */

import { Modal, View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, radius, font } from '@/lib/design-tokens';
import { Linking } from 'react-native';

// URL de la página web de planes (se abre en el navegador)
// Reemplazar por el dominio real cuando esté configurado en Sprint 4
const PLANS_WEB_URL = process.env.EXPO_PUBLIC_WEB_URL
  ? `${process.env.EXPO_PUBLIC_WEB_URL}/planes`
  : 'https://rally.app/planes'; // TODO: reemplazar por dominio real

interface BenefitItem {
  emoji: string;
  title: string;
  desc: string;
  pro: boolean;
  champion: boolean;
}

const BENEFITS: BenefitItem[] = [
  {
    emoji: '📊',
    title: 'Análisis Pro de tu juego',
    desc: 'Química con tu pareja, porcentaje de clutch, splits por horario y sede.',
    pro: true,
    champion: true,
  },
  {
    emoji: '🎯',
    title: 'Probabilidad de ganar',
    desc: 'Antes de cada partido, ve tus chances basadas en tu historial vs el rival.',
    pro: true,
    champion: true,
  },
  {
    emoji: '🔍',
    title: 'Scouting del rival',
    desc: 'Ficha completa pre-partido: racha, head-to-head, puntos fuertes.',
    pro: true,
    champion: true,
  },
  {
    emoji: '📈',
    title: 'Proyección de ranking',
    desc: '"Te faltan ~180 pts para entrar al top 5." Sabe dónde estás parado.',
    pro: true,
    champion: true,
  },
  {
    emoji: '🏅',
    title: 'Tarjetas compartibles',
    desc: 'Tu estampa dorada con tus stats. Para redes, para presumir.',
    pro: true,
    champion: true,
  },
  {
    emoji: '💸',
    title: '5% de descuento en inscripciones',
    desc: 'En todos tus torneos del año. Se descuenta automáticamente al pagar.',
    pro: false,
    champion: true,
  },
];

export interface ProBenefitsSheetProps {
  visible: boolean;
  onClose: () => void;
  isDirectCTA: boolean; // feature flag SUBSCRIPTION_CTA_DIRECT
}

export function ProBenefitsSheet({
  visible,
  onClose,
  isDirectCTA,
}: ProBenefitsSheetProps) {
  const handleWebCTA = async () => {
    await Linking.openURL(PLANS_WEB_URL);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {/* Header del sheet */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 18,
            paddingTop: Platform.OS === 'ios' ? 16 : 12,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: color.lineSoft,
          }}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontSize: 11,
              letterSpacing: 0.22 * 11,
              color: color.gold,
              textTransform: 'uppercase',
              flex: 1,
            }}
          >
            Beneficios Pro
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              backgroundColor: color.surface,
              borderRadius: radius.md,
              padding: 6,
            })}
          >
            <Text style={{ color: color.muted, fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero granate */}
          <LinearGradient
            colors={[color.wine, color.wineDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 15,
              borderWidth: 1,
              borderColor: 'rgba(241,217,140,0.38)',
              padding: 20,
              alignItems: 'center',
              marginBottom: 24,
            }}
          >
            {/* Medalla */}
            <LinearGradient
              colors={[color.goldBright, color.goldDeep]}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 26 }}>🏆</Text>
            </LinearGradient>

            <Text
              style={{
                fontFamily: font.display,
                fontSize: 22,
                fontWeight: '600',
                color: '#F7EAC6',
                textAlign: 'center',
                marginBottom: 6,
              }}
            >
              Juega como Campeón
            </Text>
            <Text
              style={{
                fontFamily: font.body,
                fontSize: 13,
                color: '#E6CDC2',
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              Análisis de élite + descuento en todos tus torneos.
              {'\n'}Todo lo que necesitas para subir de nivel.
            </Text>
          </LinearGradient>

          {/* Tabla de beneficios */}
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
            Qué incluye
          </Text>

          <View
            style={{
              backgroundColor: color.surface,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: color.lineSoft,
              overflow: 'hidden',
              marginBottom: 24,
            }}
          >
            {BENEFITS.map((b, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  padding: 14,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: color.lineSoft,
                  // El descuento (solo Campeón) tiene acento dorado
                  backgroundColor: !b.pro
                    ? 'rgba(212,175,55,0.06)'
                    : 'transparent',
                }}
              >
                {/* Emoji */}
                <Text style={{ fontSize: 20, lineHeight: 24 }}>{b.emoji}</Text>

                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: font.body,
                        fontSize: 13,
                        fontWeight: '500',
                        color: color.text,
                        flex: 1,
                      }}
                    >
                      {b.title}
                    </Text>
                    {/* Chip de plan */}
                    <View
                      style={{
                        backgroundColor: !b.pro
                          ? 'rgba(212,175,55,0.14)'
                          : 'rgba(212,175,55,0.08)',
                        borderRadius: radius.pill,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderWidth: 1,
                        borderColor: !b.pro ? color.line : color.lineSoft,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.display,
                          fontSize: 9,
                          color: !b.pro ? color.goldBright : color.champagne,
                          fontWeight: '600',
                          letterSpacing: 1,
                        }}
                      >
                        {!b.pro ? 'CAMPEÓN' : 'PRO'}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 11.5,
                      color: color.muted,
                      lineHeight: 17,
                    }}
                  >
                    {b.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Nota sobre venta web */}
          {!isDirectCTA && (
            <View
              style={{
                backgroundColor: color.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: color.lineSoft,
                padding: 12,
                marginBottom: 20,
                flexDirection: 'row',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <Text style={{ fontSize: 16 }}>ℹ️</Text>
              <Text
                style={{
                  fontFamily: font.body,
                  fontSize: 11.5,
                  color: color.muted,
                  lineHeight: 18,
                  flex: 1,
                }}
              >
                La suscripción se gestiona desde el sitio web de RALLY. Al
                tocar el botón de abajo se abrirá en tu navegador.
              </Text>
            </View>
          )}

          {/* CTA: ver planes en la web */}
          <Pressable
            onPress={handleWebCTA}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <LinearGradient
              colors={['#F6E3A6', '#E2BE4A']}
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
                {isDirectCTA ? 'Ver planes y suscribirme' : 'Ver planes y precios'}
              </Text>
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
            Se abrirá rally.app en tu navegador
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
