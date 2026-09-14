/**
 * RALLY · Confeti, una vez y corto
 *
 * SIN DEPENDENCIA NUEVA. `Animated` es del core de React Native y corre igual
 * en iOS, Android y web; una librería de confeti serían cientos de KB para dos
 * segundos que ocurren una vez en la vida de un torneo.
 *
 * LAS REGLAS QUE SE IMPONE
 *   · UNA VEZ. Quien llama decide si ya se celebró (ver `yaSeCelebro`): al
 *     recargar la app el campeón no vuelve a recibir la fiesta, solo el trofeo.
 *   · CORTO. 1.8s y desmonta. No queda nada girando en la pantalla.
 *   · SE PUEDE IGNORAR. `pointerEvents="none"` y por detrás del contenido: cae
 *     sobre la tarjeta sin tapar un solo dato ni robar un toque.
 *   · SOBRIO. Los cuatro colores del producto, rectángulos de 6px. Ni emojis,
 *     ni brillos, ni sonido.
 *
 * Y si el dispositivo tiene las animaciones reducidas por accesibilidad, no se
 * pinta: quien pidió que la pantalla no se mueva no quiere confeti.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';

import { color } from '@/lib/design-tokens';

/** Oro, oro brillante, champán y el granate. Nada que no esté en los tokens. */
const COLORES = [color.gold, color.goldBright, color.champagne, color.wine];

const PIEZAS = 18;
const DURACION = 1800;

/** Una pieza: dónde empieza, cuánto tarda y cuánto gira. Fijo por montaje. */
interface Pieza {
  x: number;
  retraso: number;
  giro: number;
  color: string;
  ancho: number;
  alto: number;
}

function repartir(): Pieza[] {
  return Array.from({ length: PIEZAS }, (_, i) => ({
    // Repartidas a lo ancho con un empujón pseudoaleatorio, pero estable
    // dentro del montaje: no hace falta azar de verdad para esto.
    x: (i / PIEZAS) * 100 + ((i * 37) % 11) - 5,
    retraso: (i * 53) % 420,
    giro: ((i * 91) % 2 === 0 ? 1 : -1) * (180 + ((i * 67) % 360)),
    color: COLORES[i % COLORES.length],
    ancho: 5 + ((i * 13) % 4),
    alto: 8 + ((i * 29) % 5),
  }));
}

export default function Confeti({ alto = 220 }: { alto?: number }) {
  const [piezas] = useState(repartir);
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const avance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reducido) => { if (vivo) setPermitido(!reducido); })
      // Si no se puede preguntar, se celebra: es el caso normal en web.
      .catch(() => { if (vivo) setPermitido(true); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!permitido) return;
    Animated.timing(avance, {
      toValue: 1,
      duration: DURACION,
      easing: Easing.linear,
      // En web el driver nativo no existe; en nativo sí y ahorra puente.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [permitido, avance]);

  if (!permitido) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: alto, overflow: 'hidden' }}
    >
      {piezas.map((p, i) => {
        // Cada pieza arranca un poco después que la anterior: el tramo útil de
        // su recorrido es el que queda tras su retraso.
        const inicio = p.retraso / DURACION;
        const caida = avance.interpolate({
          inputRange: [0, inicio, 1],
          outputRange: [-20, -20, alto],
          extrapolate: 'clamp',
        });
        const giro = avance.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.giro}deg`],
        });
        // Se apaga antes de llegar abajo: así no se ve el corte del recorte.
        const opacidad = avance.interpolate({
          inputRange: [0, inicio, 0.75, 1],
          outputRange: [0, 1, 1, 0],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: `${Math.max(0, Math.min(97, p.x))}%`,
              width: p.ancho,
              height: p.alto,
              borderRadius: 1,
              backgroundColor: p.color,
              opacity: opacidad,
              transform: [{ translateY: caida }, { rotate: giro }],
            }}
          />
        );
      })}
    </View>
  );
}
