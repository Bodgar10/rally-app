/**
 * src/components/landing/DemoFichaRival.tsx
 *
 * RALLY · La ficha del rival, apareciendo.
 *
 * ► ES LA CARTA MÁS FUERTE QUE TIENE LA APP Y CABE EN UNA LÍNEA
 *   "Marco Otero es zurdo y juega el revés." Quien lleva años jugando lo ve
 *   en el calentamiento; quien lleva uno, no — y se pasa el primer set sin
 *   entender por qué no le entra el cruzado de siempre.
 *
 *   No hace falta grabar los partidos ni instalar cámaras: con dos preguntas
 *   de un toque ya se puede decir la cosa más útil que un rival puede saber
 *   de otro antes de salir a la cancha.
 *
 * ► EL AVISO LLEGA DESPUÉS, A PROPÓSITO
 *   Primero los dos jugadores, y un segundo más tarde la línea roja. Si sale
 *   todo a la vez el ojo lee la tarjeta como un bloque; con el retraso, el
 *   aviso se lee como lo que es: la conclusión.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { RIVAL_DEMO } from '@/lib/landing-demo';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export default function DemoFichaRival() {
  const aviso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // En bucle lento: la portada se mira más de una vez y el aviso es lo que
    // hay que ver.
    const secuencia = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(aviso, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.delay(4200),
        Animated.timing(aviso, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    );
    secuencia.start();
    return () => secuencia.stop();
  }, [aviso]);

  return (
    <View style={s.tarjeta}>
      <Text style={s.eyebrow}>TU PRÓXIMO RIVAL</Text>
      <Text style={s.pareja}>{RIVAL_DEMO.pareja}</Text>

      <View style={s.jugadores}>
        {RIVAL_DEMO.jugadores.map((j) => (
          <View key={j.nombre} style={s.jugador}>
            <View style={s.avatar}>
              <Text style={s.inicial}>{j.nombre[0]}</Text>
            </View>
            <View style={s.datos}>
              <Text style={s.nombre} numberOfLines={1}>{j.nombre}</Text>
              <Text style={[s.como, j.mano === 'Zurdo' && s.comoZurdo]}>
                {j.mano}, {j.lado.toLowerCase()}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Animated.View
        style={[
          s.aviso,
          {
            opacity: aviso,
            transform: [{
              translateY: aviso.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
            }],
          },
        ]}
      >
        <Text style={s.avisoTexto}>{RIVAL_DEMO.aviso}</Text>
      </Animated.View>

      <Text style={s.historial}>{RIVAL_DEMO.historial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1, borderColor: color.line, borderRadius: radius.lg,
    backgroundColor: color.surface, padding: space[4], gap: space[2],
  },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  pareja: { fontFamily: font.display, fontSize: fontSize.metric, color: color.text },

  jugadores: { gap: space[2], marginTop: space[2] },
  jugador: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  avatar: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft,
  },
  inicial: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  datos: { flex: 1 },
  nombre: { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  como: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  comoZurdo: { color: color.alive, fontWeight: '600' },

  aviso: {
    marginTop: space[2], padding: space[3], borderRadius: radius.md,
    backgroundColor: 'rgba(230,180,80,0.10)',
    borderWidth: 1, borderColor: 'rgba(230,180,80,0.32)',
  },
  avisoTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 19 },

  historial: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted, marginTop: space[1] },
});
