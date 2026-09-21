/**
 * src/components/landing/Revelar.tsx
 *
 * RALLY · Aparecer al entrar en pantalla.
 *
 * ► POR QUÉ NO ES UNA ANIMACIÓN AL MONTAR
 *   Todo lo de la landing se monta a la vez, así que animar al montar haría
 *   que las ocho secciones se desvanecieran juntas y el visitante llegara
 *   abajo con todo ya quieto. Lo que da vida a una portada larga es que cada
 *   bloque llegue cuando le toca.
 *
 *   El `ScrollView` de la landing publica su desplazamiento por contexto y
 *   cada bloque mide su propia posición con `onLayout`. Cuando su borde
 *   superior entra en el alto visible —menos un margen, para que no aparezca
 *   justo en el filo— se revela. Y NO se vuelve a esconder al subir: una
 *   sección que parpadea cada vez que pasas por encima marea.
 *
 * ► SIN CONTEXTO NO FALLA: APARECE Y YA
 *   Si alguien usa esto fuera de la landing, `visible` arranca en true. Un
 *   componente de adorno que deja un hueco en blanco porque le falta un
 *   proveedor es peor que uno que no anima.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent, type ViewStyle } from 'react-native';

interface Scroll {
  /** Desplazamiento actual del ScrollView. */
  y: number;
  /** Alto visible. */
  alto: number;
}

export const ScrollDeLanding = createContext<Scroll | null>(null);

/** Cuánto tiene que haber entrado el bloque para revelarse. */
const MARGEN = 80;

export default function Revelar({
  children, retraso = 0, desde = 24,
}: {
  children: React.ReactNode;
  /** Escalona los hermanos: 0, 90, 180… */
  retraso?: number;
  /** Cuántos píxeles sube al aparecer. */
  desde?: number;
}) {
  const scroll = useContext(ScrollDeLanding);
  // Sin proveedor no hay nada que esperar: se enseña.
  const [visible, setVisible] = useState(scroll === null);
  const topRef = useRef<number | null>(null);

  const opacidad = useRef(new Animated.Value(scroll === null ? 1 : 0)).current;
  const desplaza = useRef(new Animated.Value(scroll === null ? 0 : desde)).current;

  function medir(e: LayoutChangeEvent) {
    topRef.current = e.nativeEvent.layout.y;
  }

  useEffect(() => {
    if (visible || !scroll) return;
    const top = topRef.current;
    if (top === null) return;
    if (top < scroll.y + scroll.alto - MARGEN) setVisible(true);
  }, [scroll, visible]);

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(opacidad, {
        toValue: 1, duration: 520, delay: retraso, useNativeDriver: true,
      }),
      Animated.timing(desplaza, {
        toValue: 0, duration: 520, delay: retraso, useNativeDriver: true,
      }),
    ]).start();
  }, [visible, retraso, opacidad, desplaza]);

  const estilo: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: opacidad,
    transform: [{ translateY: desplaza }],
  };

  return <Animated.View onLayout={medir} style={estilo}>{children}</Animated.View>;
}
