/**
 * src/components/landing/DemoFinal.tsx
 *
 * RALLY · De "todavía puedes" a "estás en la final".
 *
 * ► ES EL MOMENTO POR EL QUE SE JUEGA UN TORNEO, Y LA APP LO SABE ANTES QUE TÚ
 *   El motor de clinch calcula, partido a partido, si ya no te pueden sacar.
 *   Eso significa que la app puede decirte "ya estás en cuartos" en el instante
 *   en que se captura el resultado que lo asegura — muchas veces mientras estás
 *   comiendo algo y ni siquiera estabas mirando.
 *
 *   La demo recorre los tres estados en los que se pasa una tarde: la carrera,
 *   el pase asegurado y la final. Con su confeti, que es el mismo componente
 *   que celebra un campeonato de verdad.
 *
 * ► EL CONFETI ES EL DE LA APP, NO UNO DE PORTADA
 *   `Confeti` respeta "reducir animaciones" del sistema, dura 1,8 s y no tapa
 *   un solo dato. Meter aquí una librería de fuegos artificiales habría sido
 *   prometer en la portada una fiesta que la app no da.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Confeti from '@/components/player/Confeti';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

interface Estado {
  titular: string;
  detalle: string;
  tono: string;
  /** La barra de abajo, 0 a 1. */
  avance: number;
  pie: string;
  fiesta?: boolean;
}

const ESTADOS: readonly Estado[] = [
  {
    titular: 'Todavía puedes entrar',
    detalle: 'Te quedan 2 partidos. Cada game cuenta: pasan las 4 de mejor saldo.',
    tono: color.champagne,
    avance: 0.45,
    pie: 'Vas 5.º de tu grupo con −2 de saldo en 3 partidos.',
  },
  {
    titular: 'Ya estás en cuartos',
    detalle: 'Te queda 1 partido, pero tu sitio ya no depende de él.',
    tono: color.live,
    avance: 0.75,
    pie: 'Vas 3.º de tu grupo con +4 de saldo en 4 partidos.',
  },
  {
    titular: 'Estás en la final',
    detalle: 'Hoy a las 18:00 en la Cancha 1. Te lo has ganado.',
    tono: color.goldBright,
    avance: 1,
    pie: 'Ganaste cuartos y semifinal sin ceder un set.',
    fiesta: true,
  },
];

const MS = 3800;

export default function DemoFinal() {
  const [i, setI] = useState(0);
  const e = ESTADOS[i];

  useEffect(() => {
    const id = setTimeout(() => setI((n) => (n + 1) % ESTADOS.length), MS);
    return () => clearTimeout(id);
  }, [i]);

  return (
    <View style={[s.tarjeta, { borderColor: e.tono }]}>
      {/* El confeti de la app: por detrás y sin robar un toque. */}
      {e.fiesta && <Confeti />}

      <Text style={s.eyebrow}>QUINTA VARONIL · EXPRÉS DOMINICAL</Text>
      <Text style={[s.titular, { color: e.tono }]}>{e.titular}</Text>
      <Text style={s.detalle}>{e.detalle}</Text>

      {/* Cuánto llevas del camino a la final. Se mueve con el estado, así que
          la barra cuenta la misma historia que el texto. */}
      <View style={s.barra}>
        <View style={[s.barraLlena, { width: `${e.avance * 100}%`, backgroundColor: e.tono }]} />
      </View>
      <View style={s.hitos}>
        <Text style={[s.hito, e.avance >= 0.45 && { color: e.tono }]}>Grupos</Text>
        <Text style={[s.hito, e.avance >= 0.75 && { color: e.tono }]}>Cuartos</Text>
        <Text style={[s.hito, e.avance >= 0.9 && { color: e.tono }]}>Semis</Text>
        <Text style={[s.hito, e.avance >= 1 && { color: e.tono }]}>Final</Text>
      </View>

      <Text style={s.pie}>{e.pie}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1, borderRadius: radius.lg, backgroundColor: color.surface,
    padding: space[4], gap: space[1.5], overflow: 'hidden', minHeight: 230,
  },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.muted, letterSpacing: 1.6 },
  titular: { fontFamily: font.display, fontSize: fontSize.metric },
  detalle: { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 21 },

  barra: {
    height: 4, borderRadius: 2, backgroundColor: color.lineSoft,
    marginTop: space[3], overflow: 'hidden',
  },
  barraLlena: { height: 4, borderRadius: 2 },
  hitos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[1] },
  hito: { fontFamily: font.display, fontSize: 10, color: color.muted, letterSpacing: 1 },

  pie: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted, marginTop: space[2] },
});
