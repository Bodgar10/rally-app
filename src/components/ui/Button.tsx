/**
 * RALLY · Button
 * Variantes: primary (gold), secondary (ghost), danger, text/link.
 * Doc D §8.1 — Una acción principal por pantalla.
 */

import { Pressable, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { color, radius, font, touchTarget } from '@/lib/design-tokens';

type Variant = 'primary' | 'secondary' | 'danger' | 'link';
type Size    = 'md' | 'sm';

interface ButtonProps {
  label:      string;
  onPress:    () => void;
  variant?:   Variant;
  size?:      Size;
  loading?:   boolean;
  disabled?:  boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  disabled  = false,
  fullWidth = true,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={[
        styles.base,
        styles[variant],
        size === 'sm' && styles.sm,
        fullWidth && styles.fullWidth,
        { opacity: isDisabled ? 0.45 : 1 },
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading
        ? <ActivityIndicator color={variant === 'primary' ? color.onGold : color.gold} />
        : <Text style={[styles.label, styles[`${variant}Label` as keyof typeof styles]]}>{label}</Text>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight:      touchTarget,
    borderRadius:   radius.sm,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fullWidth: { width: '100%' },
  sm:        { minHeight: 36, paddingHorizontal: 14 },

  // Variantes de fondo/borde
  primary:   { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.line },
  danger:    { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.danger },
  link:      { backgroundColor: 'transparent', borderWidth: 0, minHeight: 36 },

  // Variantes de texto
  label:         { fontFamily: font.body, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  primaryLabel:  { color: color.onGold },
  secondaryLabel:{ color: color.champagne },
  dangerLabel:   { color: color.danger },
  linkLabel:     { color: color.gold },
});
