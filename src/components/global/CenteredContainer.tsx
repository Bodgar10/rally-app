/**
 * RALLY · CenteredContainer
 * Contenedor de ANCHO COMPLETO para WEB únicamente.
 * Lo usan los `_layout.web.tsx` de los grupos que NO llevan navegación
 * de jugador: (auth), (public), (organizer) y (judge).
 *
 * YA NO CENTRA (pese al nombre, que se conserva para no tocar 4 layouts).
 * Antes metía el contenido en una columna de 720px, y eso dejaba muerta la
 * rueda del mouse en los márgenes negros: el scroller no llegaba hasta el
 * borde de la ventana. Ahora ocupa todo el ancho y el centrado lo aporta
 * cada pantalla con `...webContentColumn` en el contentContainerStyle de su
 * scroller — mismo cambio que hizo WebShell para (protected).
 *
 * Sigue existiendo porque aporta el fondo base y el flex:1 del grupo.
 *
 * Nunca se importa desde código nativo.
 */

import { View, StyleSheet } from 'react-native';

import { color } from '@/lib/design-tokens';

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
    flex:  1,
    width: '100%',
  },
});
