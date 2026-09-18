/**
 * ConsentBox · Caja de consentimiento PROFECO 2025
 * [REUSO PASAS — portado de Next.js a React Native]
 *
 * OBLIGATORIO en el checkout de suscripción (reforma PROFECO):
 *   - Monto exacto
 *   - Periodicidad
 *   - Fecha del próximo cobro
 *   - Cómo cancelar
 *   - Checkbox de aceptación explícita
 *
 * Multa por incumplimiento: hasta $3M MXN.
 *
 * Props:
 *   billingCycle: 'monthly' | 'annual'
 *   nextBillingDate: string (ISO) — calculado fuera
 *   checked: boolean
 *   onToggle: () => void
 */

import { View, Text, Pressable } from 'react-native';
import { color, radius, font } from '@/lib/design-tokens';
import { PRECIOS } from '@/lib/precios-suscripcion';

/**
 * EL PRECIO SALE DE `precios-suscripcion`, NO SE ESCRIBE AQUÍ.
 *
 * Esta caja es el consentimiento que el jugador acepta ANTES de que Stripe le
 * cobre. Tenía el precio escrito a mano —$149 y $1,900— y cuando el precio
 * cambió, aquí se habría quedado el viejo: el texto legal diría un número y el
 * cargo sería otro. Un consentimiento así no vale.
 */
const PLANS = {
  monthly: {
    label: `${PRECIOS.monthly.plan} mensual`,
    price: PRECIOS.monthly.etiqueta,
    period: PRECIOS.monthly.periodo,
    renewal: PRECIOS.monthly.renovacion,
  },
  annual: {
    label: `${PRECIOS.annual.plan} anual`,
    price: PRECIOS.annual.etiqueta,
    period: PRECIOS.annual.periodo,
    renewal: PRECIOS.annual.renovacion,
  },
} as const;

export interface ConsentBoxProps {
  billingCycle: 'monthly' | 'annual';
  nextBillingDate: string; // e.g. "25 de julio de 2026"
  checked: boolean;
  onToggle: () => void;
}

export function ConsentBox({
  billingCycle,
  nextBillingDate,
  checked,
  onToggle,
}: ConsentBoxProps) {
  const plan = PLANS[billingCycle];

  return (
    <Pressable onPress={onToggle} style={{ marginBottom: 16 }}>
      <View
        style={{
          backgroundColor: checked
            ? 'rgba(212,175,55,0.06)'
            : color.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: checked ? color.line : color.lineSoft,
          padding: 14,
          flexDirection: 'row',
          gap: 12,
        }}
      >
        {/* Checkbox */}
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: checked ? color.gold : color.muted,
            backgroundColor: checked ? color.gold : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {checked && (
            <Text style={{ color: color.onGold, fontSize: 12, fontWeight: '700' }}>
              ✓
            </Text>
          )}
        </View>

        {/* Texto del consentimiento */}
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 12,
            color: color.muted,
            lineHeight: 18,
            flex: 1,
          }}
        >
          Acepto que{' '}
          <Text style={{ color: color.text, fontWeight: '500' }}>
            RALLY me cobrará {plan.price} {plan.renewal}
          </Text>{' '}
          de forma automática hasta que cancele. El próximo cobro será el{' '}
          <Text style={{ color: color.text, fontWeight: '500' }}>
            {nextBillingDate}
          </Text>
          . Puedo cancelar en cualquier momento desde mi perfil en máximo 2
          pasos, sin cargos adicionales.
        </Text>
      </View>
    </Pressable>
  );
}
