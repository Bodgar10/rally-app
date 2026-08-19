/**
 * src/components/sponsors/SponsorUpsell.tsx
 * Modal de upsell de patrocinador: muestra el producto seleccionado y
 * dispara la acción "Apartar" → Edge Function sponsor-lead.
 *
 * Contrato verificado contra la ejecución real de S5-SON-04 + sponsor-lead (OPUS-03):
 * - Body: { tournament_id, product_id } — NUNCA sponsor_id ni user_id (el servidor los deriva).
 * - Reusa SponsorProduct tal cual lo exporta SponsorCatalog.tsx (no redefinir aquí).
 * - 5 respuestas posibles del servidor: éxito (deduped true/false) y 4 casos de error.
 *
 * Maneja respuesta parental_consent_required con mensaje claro (REGLA #5).
 * Sprint 5 · S5-SON-05 (actualizado tras verificación de contrato real)
 */
import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, radius, space, font } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import type { SponsorProduct } from './SponsorCatalog';

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Códigos de error que sponsor-lead puede devolver, además de éxito. */
type LeadErrorCode =
  | 'parental_consent_required'
  | 'sponsor_not_in_tournament'
  | 'product_inactive'
  | 'product_not_found'
  | 'unknown';

type LeadState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; deduped: boolean }
  | { status: 'lead_error'; code: LeadErrorCode; message: string }
  | { status: 'network_error'; message: string };

type SponsorUpsellProps = {
  product: SponsorProduct | null; // null = modal cerrado
  /** Requerido por el body de sponsor-lead: { tournament_id, product_id } */
  tournamentId: string;
  onClose: () => void;
};

// ─── Componente ─────────────────────────────────────────────────────────────

export function SponsorUpsell({ product, tournamentId, onClose }: SponsorUpsellProps) {
  const [leadState, setLeadState] = useState<LeadState>({ status: 'idle' });

  const handleClose = () => {
    setLeadState({ status: 'idle' });
    onClose();
  };

  const handleReserve = async () => {
    if (!product) return;
    setLeadState({ status: 'submitting' });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLeadState({
          status: 'network_error',
          message: 'Sesión expirada. Vuelve a iniciar sesión.',
        });
        return;
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/sponsor-lead`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          // Contrato real: tournament_id + product_id. NUNCA sponsor_id ni user_id —
          // el servidor deriva sponsor_id de product_id y user_id del JWT.
          body: JSON.stringify({
            tournament_id: tournamentId,
            product_id: product.id,
          }),
        },
      );

      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setLeadState({ status: 'success', deduped: json.deduped === true });
        return;
      }

      // Mapeo de los 4 códigos de error conocidos del contrato real.
      const code = mapErrorCode(res.status, json.code ?? json.error);
      setLeadState({
        status: 'lead_error',
        code,
        message: messageForErrorCode(code, json.message),
      });
    } catch (e: any) {
      setLeadState({
        status: 'network_error',
        message: 'Error de conexión. Intenta de nuevo.',
      });
    }
  };

  return (
    <Modal
      visible={product !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {/* Handle */}
        <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: color.muted,
              opacity: 0.4,
            }}
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {product && (
            <>
              {/* Imagen */}
              {product.image_url ? (
                <Image
                  source={{ uri: product.image_url }}
                  style={{ width: '100%', height: 200, backgroundColor: color.surface2 }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{
                    width: '100%',
                    height: 120,
                    backgroundColor: color.surface2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 40 }}>🎾</Text>
                </View>
              )}

              <View style={{ padding: space[4], gap: space[3] }}>
                {/* Patrocinador */}
                {product.sponsor_name && !product.is_platform_product && (
                  <Text style={{ fontFamily: font.body, fontSize: 12, color: color.muted }}>
                    {product.sponsor_name}
                  </Text>
                )}

                {/* Nombre */}
                <Text
                  style={{
                    fontFamily: font.display,
                    fontWeight: '600',
                    fontSize: 22,
                    color: color.text,
                    lineHeight: 28,
                  }}
                >
                  {product.name}
                </Text>

                {/* Precio informativo — no es cobro */}
                {product.price_display && (
                  <Text
                    style={{
                      fontFamily: font.display,
                      fontWeight: '600',
                      fontSize: 15,
                      color: color.goldBright,
                    }}
                  >
                    {product.price_display}
                  </Text>
                )}

                {/* Descripción */}
                {product.description && (
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 14,
                      color: color.champagne,
                      lineHeight: 22,
                    }}
                  >
                    {product.description}
                  </Text>
                )}

                {/* Explicación de cómo funciona */}
                <View
                  style={{
                    backgroundColor: color.surface,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: color.lineSoft,
                    padding: 14,
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.display,
                      fontWeight: '500',
                      fontSize: 13,
                      color: color.champagne,
                    }}
                  >
                    ¿Cómo funciona?
                  </Text>
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 13,
                      color: color.muted,
                      lineHeight: 20,
                    }}
                  >
                    Al tocar "Apartar", tu interés se envía al patrocinador. Ellos te contactarán
                    directamente para completar la solicitud. No implica cargo automático.
                  </Text>
                </View>

                {/* Estados de la acción */}
                {leadState.status === 'idle' && (
                  <CTAButton
                    label={product.cta_label ?? 'Apartar'}
                    isPlatform={product.is_platform_product}
                    onPress={handleReserve}
                  />
                )}

                {leadState.status === 'submitting' && (
                  <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                    <ActivityIndicator color={color.gold} />
                    <Text style={{ fontFamily: font.body, fontSize: 13, color: color.muted, marginTop: 8 }}>
                      Enviando tu solicitud…
                    </Text>
                  </View>
                )}

                {leadState.status === 'success' && (
                  <SuccessState
                    productName={product.name}
                    deduped={leadState.deduped}
                    onClose={handleClose}
                  />
                )}

                {leadState.status === 'lead_error' &&
                  leadState.code === 'parental_consent_required' && (
                    <ParentalConsentState onClose={handleClose} />
                  )}

                {leadState.status === 'lead_error' &&
                  leadState.code !== 'parental_consent_required' && (
                    <LeadErrorState
                      message={leadState.message}
                      onRetry={() => setLeadState({ status: 'idle' })}
                      onClose={handleClose}
                    />
                  )}

                {leadState.status === 'network_error' && (
                  <ErrorState
                    message={leadState.message}
                    onRetry={() => setLeadState({ status: 'idle' })}
                  />
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Botón cerrar */}
        {leadState.status !== 'success' && (
          <Pressable
            onPress={handleClose}
            style={{
              position: 'absolute',
              top: 16,
              right: 20,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: color.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: font.body, fontSize: 16, color: color.muted }}>✕</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

// ─── Mapeo de errores del contrato real ───────────────────────────────────────

function mapErrorCode(httpStatus: number, rawCode: string | undefined): LeadErrorCode {
  if (rawCode === 'parental_consent_required') return 'parental_consent_required';
  if (rawCode === 'sponsor_not_in_tournament') return 'sponsor_not_in_tournament';
  if (rawCode === 'product_inactive') return 'product_inactive';
  if (rawCode === 'product_not_found') return 'product_not_found';

  // Fallback por status HTTP si el código no vino o vino distinto a lo esperado
  if (httpStatus === 403) return 'parental_consent_required';
  if (httpStatus === 400) return 'sponsor_not_in_tournament';
  if (httpStatus === 409) return 'product_inactive';
  if (httpStatus === 404) return 'product_not_found';
  return 'unknown';
}

function messageForErrorCode(code: LeadErrorCode, serverMessage?: string): string {
  switch (code) {
    case 'sponsor_not_in_tournament':
      return 'Este producto ya no pertenece a este torneo. Actualiza la pantalla e intenta de nuevo.';
    case 'product_inactive':
      return 'Este producto ya no está disponible. El patrocinador lo desactivó.';
    case 'product_not_found':
      return 'No encontramos este producto. Puede que ya no exista.';
    case 'parental_consent_required':
      return ''; // No se usa — ParentalConsentState tiene su propio copy fijo
    case 'unknown':
    default:
      return serverMessage ?? 'No se pudo enviar tu solicitud. Intenta de nuevo.';
  }
}

// ─── Sub-estados ──────────────────────────────────────────────────────────────

function CTAButton({
  label,
  isPlatform,
  onPress,
}: {
  label: string;
  isPlatform: boolean;
  onPress: () => void;
}) {
  if (isPlatform) {
    return (
      <LinearGradient
        colors={[color.goldBright, color.gold]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ borderRadius: radius.sm, overflow: 'hidden' }}
      >
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            paddingVertical: 14,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontWeight: '600',
              fontSize: 16,
              color: color.onGold,
              letterSpacing: 0.3,
            }}
          >
            {label}
          </Text>
        </Pressable>
      </LinearGradient>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.sm,
        backgroundColor: color.surface2,
        borderWidth: 1,
        borderColor: color.line,
        paddingVertical: 14,
        alignItems: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '600',
          fontSize: 16,
          color: color.goldBright,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Éxito. Si deduped=true, el jugador ya había apartado este producto antes —
 * se trata como éxito tranquilizador, no como error ni como sorpresa repetida.
 */
function SuccessState({
  productName,
  deduped,
  onClose,
}: {
  productName: string;
  deduped: boolean;
  onClose: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <Text style={{ fontSize: 36 }}>{deduped ? '🔖' : '✅'}</Text>
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '600',
          fontSize: 18,
          color: color.live,
          textAlign: 'center',
        }}
      >
        {deduped ? 'Ya tenías esto apartado' : '¡Solicitud enviada!'}
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 13,
          color: color.muted,
          textAlign: 'center',
          lineHeight: 20,
        }}
      >
        {deduped
          ? `Ya habías mostrado interés en "${productName}". El patrocinador ya tiene tu solicitud — no es necesario enviarla otra vez.`
          : `Tu interés en "${productName}" fue enviado. El patrocinador se pondrá en contacto contigo pronto.`}
      </Text>
      <Pressable
        onPress={onClose}
        style={{
          marginTop: 4,
          backgroundColor: color.surface2,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: color.lineSoft,
          paddingHorizontal: 24,
          paddingVertical: 10,
        }}
      >
        <Text style={{ fontFamily: font.display, fontWeight: '600', fontSize: 14, color: color.champagne }}>
          Cerrar
        </Text>
      </Pressable>
    </View>
  );
}

function ParentalConsentState({ onClose }: { onClose: () => void }) {
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.lineSoft,
        padding: 16,
        gap: 10,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 24 }}>👨‍👩‍👧</Text>
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '600',
          fontSize: 16,
          color: color.text,
          textAlign: 'center',
        }}
      >
        Se requiere autorización del tutor
      </Text>
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 13,
          color: color.muted,
          textAlign: 'center',
          lineHeight: 20,
        }}
      >
        Para participar en esta oferta, un adulto responsable debe autorizar primero tu cuenta.
        Pide a tu tutor que actualice el consentimiento en la app.
      </Text>
      <Pressable
        onPress={onClose}
        style={{
          marginTop: 4,
          backgroundColor: color.surface2,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: color.lineSoft,
          paddingHorizontal: 24,
          paddingVertical: 10,
        }}
      >
        <Text style={{ fontFamily: font.display, fontWeight: '600', fontSize: 14, color: color.champagne }}>
          Entendido
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Errores de negocio del servidor (sponsor_not_in_tournament, product_inactive,
 * product_not_found). A diferencia de ParentalConsentState, estos sugieren
 * cerrar y refrescar el catálogo en vez de reintentar la misma acción,
 * porque reintentar el mismo product_id probablemente vuelva a fallar igual.
 */
function LeadErrorState({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: 'rgba(224,114,111,0.1)',
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: 'rgba(224,114,111,0.3)',
        padding: 16,
        gap: 10,
      }}
    >
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 13,
          color: color.danger,
          lineHeight: 20,
        }}
      >
        {message}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            borderRadius: radius.sm,
            backgroundColor: color.surface2,
            borderWidth: 1,
            borderColor: color.lineSoft,
            paddingVertical: 11,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: font.display, fontWeight: '600', fontSize: 13, color: color.champagne }}>
            Cerrar
          </Text>
        </Pressable>
        <Pressable
          onPress={onRetry}
          style={{
            flex: 1,
            borderRadius: radius.sm,
            backgroundColor: color.surface2,
            borderWidth: 1,
            borderColor: color.lineSoft,
            paddingVertical: 11,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: font.display, fontWeight: '600', fontSize: 13, color: color.muted }}>
            Reintentar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Errores de red/sesión — sí tiene sentido reintentar la misma acción. */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: font.body, fontSize: 13, color: color.danger, textAlign: 'center' }}>
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        style={{
          borderRadius: radius.sm,
          backgroundColor: color.surface2,
          borderWidth: 1,
          borderColor: color.lineSoft,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontFamily: font.display, fontWeight: '600', fontSize: 14, color: color.champagne }}>
          Intentar de nuevo
        </Text>
      </Pressable>
    </View>
  );
}
