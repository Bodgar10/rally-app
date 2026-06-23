/**
 * RALLY · SectionLabel
 * Doc D §3.1 — Section label: Oswald 500 13px UPPERCASE tracking .14em champagne.
 * Opcional: link "Ver todo" a la derecha.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, fontSize, space } from '@/lib/design-tokens';

interface SectionLabelProps {
  title:       string;
  actionLabel?: string;
  onAction?:   () => void;
}

export function SectionLabel({ title, actionLabel, onAction }: SectionLabelProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={styles.action} accessibilityRole="button">
          <Text style={styles.actionText}>{actionLabel} ›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      space[5],
    marginBottom:   space[2.5],
    paddingHorizontal: 4,
  },
  title: {
    fontFamily:    font.display,
    fontSize:      fontSize.section,
    color:         color.champagne,
    letterSpacing: 2,
  },
  action: { paddingVertical: 4 },
  actionText: {
    fontFamily: font.body,
    fontSize:   fontSize.caption,
    color:      color.gold,
  },
});
