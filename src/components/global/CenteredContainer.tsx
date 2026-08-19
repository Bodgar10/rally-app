/**
 * RALLY · CenteredContainer
 * Contenedor de centrado para WEB únicamente.
 * Lo usan los `_layout.web.tsx` de los grupos que NO llevan navegación
 * de jugador: (auth), (public), (organizer) y (judge).
 *
 * Mete el contenido en una columna de ancho máximo (layout.contentMaxWidth)
 * para que en monitores anchos no se estire de borde a borde. El grupo
 * (protected) no lo usa: ahí el centrado ya lo aporta WebShell,
 * que además monta la barra de navegación.
 *
 * Nunca se importa desde código nativo.
 */

import { View, StyleSheet } from 'react-native';

import { color, layout } from '@/lib/design-tokens';

export default function CenteredContainer({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: color.bg },
  column: {
    flex:      1,
    width:     '100%',
    maxWidth:  layout.contentMaxWidth,
    alignSelf: 'center',
  },
});
