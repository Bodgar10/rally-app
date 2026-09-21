/**
 * src/components/landing/DemoAgenda.tsx
 *
 * RALLY · La tarde, armándose sola.
 *
 * ► LO QUE SE ENSEÑA ES EL TRABAJO QUE DESAPARECE
 *   Un organizador arma esto a mano: reparte parejas en dos grupos, cruza a
 *   todos contra todos sin repetir rival, y encaja los partidos en las canchas
 *   que tiene y en las horas que le caben. Con 16 parejas son 40 partidos.
 *
 *   Por eso las filas entran una a una y con su hora y su cancha ya puestas:
 *   la animación no es un adorno, es el minuto de trabajo que la app se come.
 *
 * ► LAS HORAS SON LAS QUE SALEN DEL PLANIFICADOR
 *   Dos grupos alternando cuatro canchas cada media hora. No es un horario
 *   bonito inventado para la portada: es la forma de una tarde real.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { AGENDA_DEMO } from '@/lib/landing-demo';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export default function DemoAgenda() {
  const [visibles, setVisibles] = useState(0);

  useEffect(() => {
    const id = setTimeout(
      () => setVisibles((n) => (n >= AGENDA_DEMO.length ? 0 : n + 1)),
      visibles === 0 ? 1200 : visibles >= AGENDA_DEMO.length ? 3600 : 620,
    );
    return () => clearTimeout(id);
  }, [visibles]);

  return (
    <View style={s.tarjeta}>
      <View style={s.cabecera}>
        <Text style={s.eyebrow}>EL CALENDARIO</Text>
        <Text style={s.contador}>
          {visibles === 0 ? '16 parejas' : `${visibles * 8} de 40 partidos`}
        </Text>
      </View>

      <View style={s.lista}>
        {AGENDA_DEMO.map((p, i) => (
          <Fila key={`${p.hora}-${p.cancha}`} visible={i < visibles} p={p} />
        ))}
      </View>

      <Text style={s.pie}>
        Pones los inscritos y sale la tarde entera: los dos grupos, las cinco
        rondas de cada pareja, y quién juega a qué hora y en qué cancha.
      </Text>
    </View>
  );
}

function Fila({ visible, p }: {
  visible: boolean;
  p: typeof AGENDA_DEMO[number];
}) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: visible ? 1 : 0,
      duration: visible ? 380 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, v]);

  return (
    <Animated.View
      style={[
        s.fila,
        {
          opacity: v,
          transform: [{
            translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }),
          }],
        },
      ]}
    >
      <View style={s.cuando}>
        <Text style={s.hora}>{p.hora}</Text>
        <Text style={s.cancha}>{p.cancha}</Text>
      </View>
      <Text style={s.etiqueta}>Grupo {p.grupo} · {p.ronda}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1, borderColor: color.line, borderRadius: radius.lg,
    backgroundColor: color.surface, padding: space[4], gap: space[2],
  },
  cabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  contador: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.gold },

  lista: { gap: space[1.5], marginTop: space[2], minHeight: 5 * 46 },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    paddingVertical: space[2], paddingHorizontal: space[3],
    borderRadius: radius.sm, borderWidth: 1, borderColor: color.lineSoft,
    backgroundColor: color.bg,
  },
  cuando: { width: 60 },
  hora: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  cancha: { fontFamily: font.body, fontSize: 10, color: color.muted },
  etiqueta: { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },

  pie: {
    fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted,
    lineHeight: 17, marginTop: space[2],
  },
});
