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
import { usePathname, useRouter } from 'expo-router';

import { color, font, fontSize, space, touchTarget } from '@/lib/design-tokens';
import { webContentColumn } from '@/lib/web-layout';
import { rutaPadre } from '@/lib/navegacion';

interface Props {
  /** Sin la flecha. "Mis torneos" → "← Mis torneos". */
  texto: string;
  /** Por defecto `router.back()`. Pasar solo si hay que ir a otro sitio. */
  onPress?: () => void;
  /**
   * A dónde ir cuando NO hay historial. Por defecto, el padre de la ruta
   * actual (ver `rutaPadre`), que acierta en casi todas. Pasar solo cuando el
   * padre de la URL no es el sitio del que se viene.
   */
  destino?: string;
  /** true si el botón vive DENTRO del contentContainer del scroller. */
  enScroller?: boolean;
}

export default function BotonVolver({ texto, onPress, destino, enScroller = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Atrás si se puede; si no, al padre.
   *
   * `router.back()` a secas era un no-op siempre que no hubiera historial:
   * entrando por `replace` (la puerta del juez), por URL directa o tras un F5
   * en web. El botón se veía igual y no pasaba nada al tocarlo.
   *
   * `replace` y no `push` para el fallback: si no había historial, apilar una
   * entrada nueva dejaría un "atrás" del navegador que devuelve justo a la
   * pantalla de la que el usuario acaba de salir.
   */
  function volver() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(destino ?? rutaPadre(pathname));
  }

  return (
    <Pressable
      onPress={onPress ?? volver}
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
