/**
 * RALLY · Badge / Pill de estado
 * Doc D §8.4 — pills semánticos: live, alive, danger, gold.
 */

import { View, Text, StyleSheet } from 'react-native';
import { color, radius, font } from '@/lib/design-tokens';

type BadgeType = 'live' | 'alive' | 'danger' | 'gold' | 'muted';

interface BadgeProps {
  label:  string;
  type?:  BadgeType;
  dot?:   boolean;
}

const config: Record<BadgeType, { bg: string; border: string; text: string }> = {
  live:   { bg: 'rgba(66,214,164,0.12)',  border: 'rgba(66,214,164,0.3)',  text: color.live },
  alive:  { bg: 'rgba(230,180,80,0.13)',  border: 'rgba(230,180,80,0.3)',  text: color.alive },
  danger: { bg: 'rgba(224,114,111,0.13)', border: 'rgba(224,114,111,0.3)', text: color.danger },
  gold:   { bg: 'rgba(212,175,55,0.14)',  border: color.line,              text: color.goldBright },
  muted:  { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', text: color.muted },
};

export function Badge({ label, type = 'muted', dot = false }: BadgeProps) {
  const c = config[type];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg, borderColor: c.border }]}>
      {dot && <View style={[styles.dot, { backgroundColor: c.text }]} />}
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    borderWidth:    1,
    borderRadius:   radius.pill,
    paddingHorizontal: 10,
    paddingVertical:   4,
    alignSelf:      'flex-start',
  },
  dot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  label: {
    fontFamily:  font.body,
    fontSize:    11,
    fontWeight:  '600',
  },
});
