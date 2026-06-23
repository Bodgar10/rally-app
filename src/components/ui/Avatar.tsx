/**
 * RALLY · Avatar
 * Círculo 42px, fondo grad-seal, inicial Oswald 600 onGold.
 * Doc D §8.12.
 */

import { View, Text, StyleSheet } from 'react-native';
import { color, font } from '@/lib/design-tokens';

interface AvatarProps {
  name:  string;
  size?: number;
}

export function Avatar({ name, size = 42 }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    // grad-seal aproximado con color sólido; gradiente real requiere LinearGradient
    backgroundColor: color.gold,
    alignItems:      'center',
    justifyContent:  'center',
  },
  initial: {
    fontFamily: font.display,
    fontWeight: '600',
    color:      color.onGold,
  },
});
