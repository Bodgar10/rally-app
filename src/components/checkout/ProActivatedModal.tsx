/**
 * ProActivatedModal
 *
 * Modal de celebración: "¡Ya eres Pro!" / "¡Ya eres Campeón!"
 *
 * Se muestra cuando:
 *   A) El deep link de regreso incluye ?pro_activated=true (atajo)
 *   B) La app detecta que la suscripción pasó a 'active' en la BD
 *      (la BD es la fuente de verdad; el deep link es el atajo)
 *
 * Flujo de validación (regla del proyecto):
 *   - Al recibir el deep link de regreso, NO confiar en el parámetro ciegamente.
 *   - Consultar la BD para verificar que subscriptions.status='active'.
 *   - Solo entonces mostrar el modal. Si la BD aún no está actualizada (webhook
 *     en tránsito), reintentar hasta 3 veces con 1s de espera entre intentos.
 *
 * El confetti es un efecto RN puro (sin librerías externas):
 * usa Animated + partículas aleatorias que caen.
 */

import { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, radius, font } from '@/lib/design-tokens';

// ─── Partícula de confetti ──────────────────────────────────────────────────

const CONFETTI_COLORS = [
  color.goldBright,
  color.gold,
  color.goldDeep,
  color.champagne,
  '#F7EAC6',
  color.live,
];

function ConfettiParticle({
  x,
  delay,
  colorIdx,
}: {
  x: number;
  delay: number;
  colorIdx: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 2000 + Math.random() * 1000,
        delay,
        useNativeDriver: true,
      })
    ).start();
  }, [anim, delay]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 500],
  });

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${360 + Math.random() * 360}deg`],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 0.8, 0],
  });

  const size = 6 + Math.random() * 8;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: 0,
        width: size,
        height: size,
        borderRadius: Math.random() > 0.5 ? size / 2 : 2,
        backgroundColor: CONFETTI_COLORS[colorIdx],
        transform: [{ translateY }, { rotate }],
        opacity,
      }}
    />
  );
}

function Confetti() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    x: Math.random() * 100,
    delay: Math.random() * 1000,
    colorIdx: i % CONFETTI_COLORS.length,
  }));

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      {particles.map((p, i) => (
        <ConfettiParticle key={i} {...p} />
      ))}
    </View>
  );
}

// ─── Beneficios desbloqueados ────────────────────────────────────────────────

const UNLOCKED = [
  '📊 Análisis Pro de tu juego',
  '🎯 Probabilidad de victoria',
  '🔍 Scouting del rival',
  '📈 Proyección de ranking',
  '🏅 Tarjetas compartibles',
];

const UNLOCKED_CHAMPION = [...UNLOCKED, '💸 5% de descuento en torneos'];

// ─── Modal principal ─────────────────────────────────────────────────────────

export interface ProActivatedModalProps {
  visible: boolean;
  billingCycle: 'monthly' | 'annual' | null;
  onClose: () => void;
}

export function ProActivatedModal({
  visible,
  billingCycle,
  onClose,
}: ProActivatedModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim]);

  const isChampion = billingCycle === 'annual';
  const title = isChampion ? '¡Ya eres Campeón!' : '¡Ya eres Pro!';
  const subtitle = isChampion
    ? 'Tu análisis está desbloqueado y ahorras 5% en todos tus torneos.'
    : 'Tu análisis Pro está desbloqueado. Úsalo antes de tu próximo partido.';
  const benefits = isChampion ? UNLOCKED_CHAMPION : UNLOCKED;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.75)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        {/* Confetti */}
        {visible && <Confetti />}

        {/* Card principal */}
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 420,
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          }}
        >
          <View
            style={{
              backgroundColor: color.surface,
              borderRadius: radius.xl2,
              borderWidth: 1,
              borderColor: color.line,
              overflow: 'hidden',
            }}
          >
            {/* Barra de acento */}
            <LinearGradient
              colors={[color.goldDeep, color.goldBright, color.goldDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ height: 3 }}
            />

            {/* Header granate */}
            <LinearGradient
              colors={[color.wine, color.wineDeep]}
              style={{
                padding: 24,
                alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: color.lineSoft,
              }}
            >
              {/* Medalla animada */}
              <LinearGradient
                colors={[color.goldBright, color.goldDeep]}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                  shadowColor: color.goldBright,
                  shadowOffset: { width: 0, height: 0 },
                  shadowRadius: 20,
                  shadowOpacity: 0.4,
                  elevation: 12,
                }}
              >
                <Text style={{ fontSize: 36 }}>🏆</Text>
              </LinearGradient>

              <Text
                style={{
                  fontFamily: font.display,
                  fontSize: 26,
                  fontWeight: '600',
                  color: '#F7EAC6',
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                {title}
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
                {subtitle}
              </Text>
            </LinearGradient>

            {/* Lista de beneficios */}
            <View style={{ padding: 20 }}>
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
                Ahora tienes acceso a
              </Text>

              {benefits.map((b, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 6,
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: color.lineSoft,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: 'rgba(66,214,164,0.15)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Text style={{ color: color.live, fontSize: 10, fontWeight: '700' }}>
                      ✓
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 13,
                      color: color.text,
                    }}
                  >
                    {b}
                  </Text>
                </View>
              ))}

              {/* CTA */}
              <Pressable
                onPress={onClose}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  marginTop: 20,
                })}
              >
                <LinearGradient
                  colors={['#F6E3A6', '#E2BE4A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: radius.sm,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.display,
                      fontSize: 16,
                      fontWeight: '600',
                      color: color.onGold,
                    }}
                  >
                    Ir al dashboard
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
