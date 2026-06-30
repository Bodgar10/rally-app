/**
 * CancellationFlow · Cancelación de suscripción PROFECO 2025
 * [REUSO PASAS — portado de Next.js a React Native]
 *
 * REGLA PROFECO (reforma 2025):
 *   - Cancelación en MÁXIMO 2 clics desde Perfil, sin obstáculos antes de confirmar.
 *   - La retención (descuento/pausa) se ofrece SOLO DESPUÉS de confirmar la cancelación.
 *   - Multa por incumplimiento: hasta $3M MXN.
 *
 * Flujo de 3 pasos:
 *   PASO 1 (1er clic): "¿Por qué cancelas?" → razón + botón "Cancelar suscripción"
 *   PASO 2 (2do clic): Confirmación → POST a subscription-cancel → éxito
 *   PASO 3 (post-cancel): Oferta de retención → OPCIONAL, solo después de cancelar
 *
 * Uso (desde app/(protected)/perfil.tsx):
 *   const [cancelOpen, setCancelOpen] = useState(false);
 *   <CancellationFlow visible={cancelOpen} onClose={() => setCancelOpen(false)} onCanceled={refetch} />
 *
 * Edge Function: subscription-cancel [REUSO PASAS]
 *   POST {reason, feedback} → {ok: true, canceled_at_period_end: true}
 */

import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, radius, font } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';

// ─── Tipos ───────────────────────────────────────────────────────────────

type Step = 'reason' | 'confirm' | 'retention' | 'done';

const REASONS = [
  'No uso suficiente la app',
  'Es muy caro para lo que ofrece',
  'Dejé de jugar padel',
  'Prefiero una alternativa',
  'Solo era para el torneo pasado',
  'Otro motivo',
] as const;

// ─── Componente de paso 1: razón ────────────────────────────────────────────

function ReasonStep({
  selected,
  onSelect,
  feedback,
  onFeedbackChange,
  onNext,
}: {
  selected: string | null;
  onSelect: (r: string) => void;
  feedback: string;
  onFeedbackChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <>
      <Text
        style={{
          fontFamily: font.display,
          fontSize: 20,
          fontWeight: '600',
          color: color.text,
          marginBottom: 6,
        }}
      >
        ¿Por qué cancelas?
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 13,
          color: color.muted,
          lineHeight: 20,
          marginBottom: 20,
        }}
      >
        Tu feedback nos ayuda a mejorar.
      </Text>

      {/* Opciones de razón */}
      <View style={{ gap: 8, marginBottom: 16 }}>
        {REASONS.map((reason) => (
          <Pressable
            key={reason}
            onPress={() => onSelect(reason)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                backgroundColor:
                  selected === reason
                    ? 'rgba(212,175,55,0.1)'
                    : color.surface,
                borderRadius: radius.md,
                borderWidth: selected === reason ? 1.5 : 1,
                borderColor:
                  selected === reason ? color.gold : color.lineSoft,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {/* Indicador */}
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  borderWidth: 2,
                  borderColor:
                    selected === reason ? color.gold : color.muted,
                  backgroundColor:
                    selected === reason ? color.gold : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {selected === reason && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: color.onGold,
                    }}
                  />
                )}
              </View>
              <Text
                style={{
                  fontFamily: font.body,
                  fontSize: 13,
                  color: selected === reason ? color.text : color.muted,
                  flex: 1,
                }}
              >
                {reason}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Campo de texto adicional */}
      <TextInput
        value={feedback}
        onChangeText={onFeedbackChange}
        placeholder="Cuéntanos más (opcional)"
        placeholderTextColor={color.muted}
        multiline
        numberOfLines={3}
        style={{
          backgroundColor: color.surface2,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.lineSoft,
          padding: 12,
          fontFamily: font.body,
          fontSize: 13,
          color: color.text,
          minHeight: 80,
          textAlignVertical: 'top',
          marginBottom: 20,
        }}
      />

      {/* CTA: primer clic de cancelación */}
      <Pressable
        onPress={onNext}
        disabled={!selected}
        style={({ pressed }) => ({
          opacity: pressed || !selected ? 0.7 : 1,
        })}
      >
        <View
          style={{
            backgroundColor: color.surface,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: 'rgba(224,114,111,0.35)',
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontSize: 15,
              fontWeight: '600',
              color: color.danger,
            }}
          >
            Cancelar suscripción
          </Text>
        </View>
      </Pressable>
    </>
  );
}

// ─── Componente de paso 2: confirmación ──────────────────────────────────────

function ConfirmStep({
  billingCycle,
  periodEnd,
  onConfirm,
  onBack,
  loading,
  error,
}: {
  billingCycle: 'monthly' | 'annual' | null;
  periodEnd: string;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const planName = billingCycle === 'annual' ? 'Campeón anual' : 'Pro mensual';

  return (
    <>
      <Text
        style={{
          fontFamily: font.display,
          fontSize: 20,
          fontWeight: '600',
          color: color.text,
          marginBottom: 6,
        }}
      >
        Confirma la cancelación
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 13,
          color: color.muted,
          lineHeight: 20,
          marginBottom: 20,
        }}
      >
        Tu plan {planName} continuará activo hasta el{' '}
        <Text style={{ color: color.text, fontWeight: '500' }}>{periodEnd}</Text>
        . Después de esa fecha perderás acceso al análisis Pro.
      </Text>

      {/* Resumen de lo que se pierde */}
      <View
        style={{
          backgroundColor: color.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.lineSoft,
          padding: 14,
          marginBottom: 20,
          gap: 10,
        }}
      >
        {[
          'Análisis Pro de tu juego',
          'Probabilidad de victoria pre-partido',
          'Scouting de rivales',
          ...(billingCycle === 'annual'
            ? ['5% de descuento en inscripciones']
            : []),
        ].map((item, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text style={{ color: color.danger, fontSize: 12 }}>✕</Text>
            <Text
              style={{
                fontFamily: font.body,
                fontSize: 12.5,
                color: color.muted,
              }}
            >
              {item}
            </Text>
          </View>
        ))}
      </View>

      {error && (
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 12,
            color: color.danger,
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          {error}
        </Text>
      )}

      {/* Segundo clic: confirmar cancelación */}
      <Pressable
        onPress={onConfirm}
        disabled={loading}
        style={({ pressed }) => ({
          opacity: pressed || loading ? 0.8 : 1,
          marginBottom: 12,
        })}
      >
        <View
          style={{
            backgroundColor: 'rgba(224,114,111,0.12)',
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: 'rgba(224,114,111,0.35)',
            paddingVertical: 14,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {loading ? (
            <ActivityIndicator color={color.danger} size="small" />
          ) : (
            <Text
              style={{
                fontFamily: font.display,
                fontSize: 15,
                fontWeight: '600',
                color: color.danger,
              }}
            >
              Sí, cancelar mi suscripción
            </Text>
          )}
        </View>
      </Pressable>

      {/* Volver (sin obstáculos, pero el CTA principal ya fue el confirmador) */}
      <Pressable
        onPress={onBack}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 13,
              color: color.muted,
            }}
          >
            Mantener mi suscripción
          </Text>
        </View>
      </Pressable>
    </>
  );
}

// ─── Componente de paso 3: retención (SOLO DESPUÉS de cancelar) ───────────────

function RetentionStep({ onClose }: { onClose: () => void }) {
  return (
    <>
      {/* Banner granate de oferta */}
      <LinearGradient
        colors={[color.wine, color.wineDeep]}
        style={{
          borderRadius: 15,
          borderWidth: 1,
          borderColor: 'rgba(241,217,140,0.38)',
          padding: 20,
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Text style={{ fontSize: 32, marginBottom: 12 }}>🎾</Text>
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 18,
            fontWeight: '600',
            color: '#F7EAC6',
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          ¿Quieres seguir mejorando?
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
          Tu suscripción ya está cancelada, pero si cambias de opinión puedes
          volver a suscribirte en cualquier momento desde Perfil.
        </Text>
      </LinearGradient>

      {/* Confirmación de cancelación */}
      <View
        style={{
          backgroundColor: 'rgba(66,214,164,0.08)',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: 'rgba(66,214,164,0.2)',
          padding: 14,
          marginBottom: 20,
        }}
      >
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 12,
            color: color.live,
            textAlign: 'center',
            lineHeight: 18,
          }}
        >
          ✓ Cancelación confirmada. Tu acceso Pro se mantiene hasta el final del
          período actual.
        </Text>
      </View>

      <Pressable
        onPress={onClose}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
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
              fontSize: 15,
              fontWeight: '600',
              color: color.onGold,
            }}
          >
            Entendido
          </Text>
        </LinearGradient>
      </Pressable>
    </>
  );
}

// ─── Modal principal ─────────────────────────────────────────────────────────

export interface CancellationFlowProps {
  visible: boolean;
  onClose: () => void;
  onCanceled: () => void; // callback para refrescar el perfil
  billingCycle?: 'monthly' | 'annual' | null;
  periodEnd?: string; // fecha legible del fin del período
}

export function CancellationFlow({
  visible,
  onClose,
  onCanceled,
  billingCycle = null,
  periodEnd = 'fin del período',
}: CancellationFlowProps) {
  const [step, setStep] = useState<Step>('reason');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('reason');
    setSelectedReason(null);
    setFeedback('');
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ─── Ejecutar cancelación (2do clic) ──────────────────────────────────

  const handleConfirmCancel = async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/subscription-cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            reason: selectedReason,
            feedback: feedback.trim() || null,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al cancelar');

      // Éxito: avanzar a la retención (PROFECO: se ofrece DESPUÉS de cancelar)
      setStep('retention');
      onCanceled(); // refrescar el perfil en paralelo
      // TODO: Cuando Resend esté configurado → enviar email de confirmación de cancelación
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al procesar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {/* Header */}
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
              color: color.muted,
              textTransform: 'uppercase',
              flex: 1,
            }}
          >
            {step === 'retention' || step === 'done'
              ? 'Cancelación confirmada'
              : 'Cancelar suscripción'}
          </Text>
          {(step === 'reason' || step === 'retention') && (
            <Pressable
              onPress={handleClose}
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
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'reason' && (
            <ReasonStep
              selected={selectedReason}
              onSelect={setSelectedReason}
              feedback={feedback}
              onFeedbackChange={setFeedback}
              onNext={() => setStep('confirm')}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep
              billingCycle={billingCycle}
              periodEnd={periodEnd}
              onConfirm={handleConfirmCancel}
              onBack={() => setStep('reason')}
              loading={loading}
              error={error}
            />
          )}

          {(step === 'retention' || step === 'done') && (
            <RetentionStep onClose={handleClose} />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
