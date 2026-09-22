/**
 * src/components/landing/DemoEnVivo.tsx
 *
 * RALLY · El marcador de la cancha que te toca, subiendo.
 *
 * ► EL CASO REAL QUE ESTO RESUELVE
 *   Un jugador tenía partido a las 10:00. Se levantó a las 8:30, llegó a las
 *   9:30 y jugó a las 10:40, porque su cancha estaba ocupada por una categoría
 *   que no era la suya. La información que necesitaba no estaba en su grupo:
 *   estaba en la cancha, y en la cancha no la miraba nadie.
 *
 *   Por eso la tarjeta no enseña SU partido: enseña el de los que están dentro
 *   antes que él. Saber que van 4-3 en el segundo es saber si le da tiempo a
 *   comer algo o si tiene que estar calentando ya.
 *
 * ► EL MARCADOR SUBE DE VERDAD, JUEGO A JUEGO
 *   Es lo único que convence de que algo está en vivo: un número quieto podría
 *   ser de ayer. Sube como sube un set real —nadie gana de 0 a 6 sin que el
 *   otro haga un juego— y al llegar al final vuelve a empezar.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

/**
 * Cómo va subiendo el set. Escrito a mano y no al azar porque un marcador
 * aleatorio produce cosas que no pasan —6-0 en cuatro juegos seguidos— y la
 * portada tiene que parecerse a un partido, no a un generador de números.
 */
const JUEGOS: readonly [number, number][] = [
  [0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [3, 2], [4, 2], [4, 3], [5, 3], [5, 4], [6, 4],
];

const MS_POR_JUEGO = 1500;

export default function DemoEnVivo() {
  const [i, setI] = useState(0);
  const [a, b] = JUEGOS[i];
  const terminado = i === JUEGOS.length - 1;

  // El punto de "en vivo", latiendo.
  const latido = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(latido, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [latido]);

  useEffect(() => {
    const id = setTimeout(
      () => setI((n) => (n >= JUEGOS.length - 1 ? 0 : n + 1)),
      terminado ? 3200 : MS_POR_JUEGO,
    );
    return () => clearTimeout(id);
  }, [i, terminado]);

  return (
    <View style={s.tarjeta}>
      <View style={s.cabecera}>
        <Text style={s.eyebrow}>EN TU CANCHA AHORA</Text>
        <View style={s.vivo}>
          <Animated.View style={[s.punto, { opacity: latido }]} />
          <Text style={s.vivoTexto}>{terminado ? 'terminado' : 'en vivo'}</Text>
        </View>
      </View>

      <Text style={s.cancha}>Cancha 3 · Cuarta Mixto</Text>

      <View style={s.marcador}>
        <View style={s.lado}>
          <Text style={s.pareja} numberOfLines={1}>Rangel / Ibarra</Text>
        </View>
        <View style={s.numeros}>
          <Text style={[s.games, a > b && s.gamesArriba]}>{a}</Text>
          <Text style={s.guion}>–</Text>
          <Text style={[s.games, b > a && s.gamesArriba]}>{b}</Text>
        </View>
        <View style={[s.lado, s.ladoDer]}>
          <Text style={[s.pareja, s.parejaDer]} numberOfLines={1}>Cázares / Puga</Text>
        </View>
      </View>

      <Text style={s.tuTurno}>
        {terminado
          ? 'Cancha libre. Te toca a ti.'
          : `Vas después. Llevan ${a + b} ${a + b === 1 ? 'juego' : 'juegos'}.`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1, borderColor: color.line, borderRadius: radius.lg,
    backgroundColor: color.surface, padding: space[4], gap: space[2],
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },

  vivo: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
  punto: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.live },
  vivoTexto: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.live },

  cancha: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  marcador: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    marginTop: space[3], marginBottom: space[2],
  },
  lado: { flex: 1 },
  ladoDer: { alignItems: 'flex-end' },
  pareja: { fontFamily: font.body, fontSize: fontSize.caption, color: color.text },
  parejaDer: { textAlign: 'right' },

  numeros: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  games: { fontFamily: font.display, fontSize: fontSize.displayL, color: color.muted, lineHeight: 46 },
  gamesArriba: { color: color.goldBright },
  guion: { fontFamily: font.display, fontSize: fontSize.metric, color: color.muted },

  tuTurno: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 19 },
});
