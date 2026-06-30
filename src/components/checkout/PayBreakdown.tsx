/**
 * PayBreakdown · Desglose de pago de inscripción
 *
 * Props:
 *   entryFee:      número total de la pareja (e.g. 1900)
 *   splitMode:     'full' | 'half' — pago completo o solo mi parte
 *   isChampion:    boolean — suscriptor anual con descuento del 5%
 *   currency?:     'MXN' (default)
 *
 * Muestra: precio base, descuento Campeón (si aplica), y total a pagar.
 * No hace cálculos de negocio propios — recibe los datos ya calculados.
 */

import { View, Text } from 'react-native';
import { color, radius, font } from '@/lib/design-tokens';

export interface PayBreakdownProps {
  entryFee: number;       // precio total de la pareja
  splitMode: 'full' | 'half';
  isChampion: boolean;    // suscriptor anual (descuento 5%)
  currency?: string;
}

const DISCOUNT_RATE = 0.05; // 5% del Campeón anual

function fmt(amount: number, currency = 'MXN') {
  return `$${Math.round(amount).toLocaleString('es-MX')}`;
}

export function PayBreakdown({
  entryFee,
  splitMode,
  isChampion,
  currency = 'MXN',
}: PayBreakdownProps) {
  const base = splitMode === 'half' ? entryFee / 2 : entryFee;
  const discount = isChampion ? Math.round(base * DISCOUNT_RATE) : 0;
  const total = base - discount;

  const rows: Array<{
    label: string;
    value: string;
    variant?: 'default' | 'discount' | 'total';
  }> = [
    {
      label:
        splitMode === 'half'
          ? 'Inscripción (tu parte)'
          : 'Inscripción por pareja',
      value: fmt(base, currency),
    },
  ];

  if (isChampion && discount > 0) {
    rows.push({
      label: '🏆 Descuento Campeón (5%)',
      value: `−${fmt(discount, currency)}`,
      variant: 'discount',
    });
  }

  rows.push({
    label: 'Total a pagar',
    value: fmt(total, currency),
    variant: 'total',
  });

  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.lineSoft,
        paddingHorizontal: 16,
        paddingBottom: 8,
        paddingTop: 6,
      }}
    >
      {rows.map((row, i) => {
        const isTotal = row.variant === 'total';
        const isDiscount = row.variant === 'discount';

        return (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 7,
              borderTopWidth: isTotal ? 1 : 0,
              borderTopColor: color.lineSoft,
              marginTop: isTotal ? 4 : 0,
              paddingTop: isTotal ? 11 : 7,
            }}
          >
            <Text
              style={{
                fontFamily: font.body,
                fontSize: 13,
                color: isDiscount ? color.goldBright : isTotal ? color.text : color.muted,
                fontWeight: isTotal ? '500' : '400',
                flex: 1,
              }}
            >
              {row.label}
            </Text>
            <Text
              style={{
                fontFamily: font.display,
                fontSize: isTotal ? 20 : 13,
                fontWeight: '600',
                color: isDiscount
                  ? color.goldBright
                  : isTotal
                  ? color.text
                  : color.text,
              }}
            >
              {row.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// Exportar también el total calculado como helper puro
export function computeTotal(
  entryFee: number,
  splitMode: 'full' | 'half',
  isChampion: boolean
): number {
  const base = splitMode === 'half' ? entryFee / 2 : entryFee;
  const discount = isChampion ? Math.round(base * DISCOUNT_RATE) : 0;
  return base - discount;
}
