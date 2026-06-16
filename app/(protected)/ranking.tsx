/**
 * RALLY · Mi Ranking — Stub (Sprint 5)
 * Esta pantalla se completa cuando se implementen los motores
 * de rating y puntos de ranking (Sprint 5).
 * Por ahora muestra un placeholder con el diseño correcto.
 */

import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { color, space, font, fontSize } from '@/lib/design-tokens';

export default function RankingScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>MI RANKING</Text>
        <Text style={styles.title}>Próximamente</Text>
        <Text style={styles.body}>
          Tu ranking por categoría aparecerá aquí cuando completes tu primer torneo.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4.5] },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[2] },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[2], textAlign: 'center' },
  body:    { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', lineHeight: 20 },
});
