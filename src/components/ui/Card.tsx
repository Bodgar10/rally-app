/**
 * RALLY · Card
 * Variantes: standard, hero, feature.
 * Doc D §8.2 — tarjetas canónicas.
 */

import { View, StyleSheet, ViewStyle } from 'react-native';
import { color, radius, space } from '@/lib/design-tokens';

type CardVariant = 'standard' | 'hero' | 'feature';

interface CardProps {
  children:  React.ReactNode;
  variant?:  CardVariant;
  style?:    ViewStyle;
}

export function Card({ children, variant = 'standard', style }: CardProps) {
  return (
    <View style={[styles.base, styles[variant], style]}>
      {variant !== 'standard' && <View style={styles.accentBar} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  standard: {
    backgroundColor: color.surface,
    borderWidth:     1,
    borderColor:     color.lineSoft,
    borderRadius:    radius.xl,
    padding:         space[4],
  },
  hero: {
    // grad-hero: se aproxima con backgroundColor; gradiente real requiere LinearGradient
    backgroundColor: '#19171A',
    borderWidth:     1,
    borderColor:     color.line,
    borderRadius:    radius.xl2,
    padding:         space[5],
  },
  feature: {
    backgroundColor: color.surface,
    borderWidth:     1,
    borderColor:     color.line,
    borderRadius:    radius.xl,
    padding:         space[4],
  },
  accentBar: {
    // grad-rule: barra superior de acento (Doc D §2.3)
    height:          3,
    backgroundColor: color.gold,
    marginBottom:    space[3],
    marginHorizontal: -space[5],
    marginTop:       -space[5],
  },
});
