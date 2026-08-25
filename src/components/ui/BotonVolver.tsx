/**
 * RALLY · Botón de volver
 *
 * EL BUG QUE RESUELVE
 *   El link de volver vivía suelto en cada pantalla, casi siempre como HERMANO
 *   del ScrollView. Y desde que los scrollers ocupan todo el ancho y centran su
 *   contenido con `webContentColumn`, un hermano del scroller NO hereda esa
 *   columna: se pegaba al borde izquierdo de la ventana mientras el título
 *   quedaba centrado. Se veía en 18 de 22 pantallas.
 *
 *   Aquí la columna va dentro del componente, así que la próxima pantalla nace
 *   alineada sin que nadie tenga que acordarse.
 *
 * DÓNDE PONERLO
 *   Por defecto, como HERMANO del scroller (el caso mayoritario): aporta su
 *   propio padding y su columna centrada, y queda fijo mientras el contenido
 *   scrollea.
 *
 *   Con `enScroller`, cuando va DENTRO del contentContainer, que ya aporta
 *   ambas cosas. Se ve idéntico; la única diferencia es que scrollea con el
 *   contenido.
 *
 * La flecha la pone el componente: pasar solo el texto.
 */

import { Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { color, font, fontSize, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn } from '@/lib/web-layout';

interface Props {
  /** Sin la flecha. "Mis torneos" → "← Mis torneos". */
  texto: string;
  /** Por defecto `router.back()`. Pasar solo si hay que ir a otro sitio. */
  onPress?: () => void;
  /** true si el botón vive DENTRO del contentContainer del scroller. */
  enScroller?: boolean;
}

export default function BotonVolver({ texto, onPress, enScroller = false }: Props) {
  const router = useRouter();

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => [
        s.base,
        enScroller ? s.dentro : s.fuera,
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Volver a ${texto}`}
    >
      {/* numberOfLines: el texto puede ser el nombre del torneo, que es largo. */}
      <Text style={s.texto} numberOfLines={1}>← {texto}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: { justifyContent: 'center', minHeight: touchTarget },

  // Hermano del scroller: aporta el padding y la columna que no hereda.
  fuera: {
    paddingHorizontal: space[4.5],
    paddingTop:        space[2],
    ...webContentColumn,
  },
  // Dentro del contentContainer: el padding y la columna ya vienen dados.
  dentro: { alignSelf: 'flex-start' },

  texto: { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
});
