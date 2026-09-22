/**
 * src/components/landing/DemoFinal.tsx
 *
 * RALLY · El camino de una tarde, contado como lo cuenta la app.
 *
 * ► LA PRIMERA VERSIÓN MEZCLABA DOS FASES QUE LA APP NUNCA MEZCLA
 *   Enseñaba "Ya estás en cuartos" y debajo "Vas 3.º de tu grupo". En la app
 *   eso no pasa nunca, y no por descuido: en cuanto entras al cuadro, tu
 *   puesto de grupo deja de significar nada. Ya no compites contra los siete
 *   de tu grupo, compites contra un rival concreto. `MiSituacion` se calla
 *   —`yaEstaEnElCuadro`— y toma el relevo `YaEstasEnLaSiguiente`, que habla de
 *   la RONDA y no de la tabla.
 *
 *   Así que la demo recorre ahora las dos fases por separado, con el corte
 *   donde la app lo tiene.
 *
 * ► Y LA ESCALA ES LA DE VERDAD
 *   Los colores, el tamaño del titular y el sello de la final salen de
 *   `@/lib/escala-de-ronda`, el mismo módulo que usan `YaEstasEnLaSiguiente` y
 *   `MyNextMatch`. Cuartos en oro, semifinales con fondo y borde pleno, la
 *   final en granate con su sello.
 *
 *   Inventar aquí una escala propia habría sido prometer en la portada un
 *   trato que la app no da — y de los dos fallos posibles, ese es el caro: se
 *   descubre el domingo, en la cancha.
 *
 * ► LA BARRA DE HITOS SE FUE
 *   Era un invento de portada: la app no tiene ninguna barra de progreso hacia
 *   la final, y además era justo la que decía la incoherencia. Lo que sí tiene
 *   es que la tarjeta CREZCA con la ronda, y eso es lo que se enseña.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Confeti from '@/components/player/Confeti';
import { tratoDeRonda, type TratoDeRonda } from '@/lib/escala-de-ronda';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

interface Momento {
  /** El rótulo de arriba. */
  eyebrow: string;
  /** Titular. En semis y final es la palabra sola, como en la app. */
  titular: string;
  detalle: string;
  /** El `matches.stage` del que sale el trato. */
  stage: string;
  /**
   * La línea pequeña del final.
   *
   * En grupos habla de la tabla; en el cuadro, del partido. NUNCA de las dos,
   * que es lo que estaba mal.
   */
  pie: string;
  fiesta?: boolean;
}

const MOMENTOS: readonly Momento[] = [
  // ── Fase de grupos: aquí SÍ se habla del grupo ────────────────────────
  {
    eyebrow: 'QUINTA VARONIL · FASE DE GRUPOS',
    titular: 'Todavía puedes entrar',
    detalle: 'Te quedan 2 partidos. Cada game cuenta: pasan las 4 de mejor saldo.',
    stage: 'group',
    pie: 'Vas 5.º de tu grupo con −2 de saldo en 3 partidos.',
  },
  {
    eyebrow: 'QUINTA VARONIL · FASE DE GRUPOS',
    titular: 'Ya clasificaste',
    // El texto de `situacionDe('clinched')`, tal cual.
    detalle: 'Espera los resultados de los demás para saber cuándo juegas.',
    stage: 'group',
    pie: 'Terminaste 3.º de tu grupo con +4 de saldo.',
  },
  // ── En el cuadro: el grupo deja de existir ────────────────────────────
  {
    eyebrow: 'ESTÁS EN',
    titular: 'CUARTOS DE FINAL',
    detalle: 'Hoy a las 17:00 · Cancha 2',
    stage: 'quarter',
    pie: 'Contra Cázares / Puga.',
  },
  {
    eyebrow: 'ESTÁS EN',
    titular: 'SEMIFINALES',
    detalle: 'Hoy a las 17:30 · Cancha 1',
    stage: 'semi',
    pie: 'Ganaste los cuartos 6-3.',
  },
  {
    eyebrow: 'ESTÁS EN',
    titular: 'LA FINAL',
    detalle: 'Hoy a las 18:00 · Cancha 1',
    stage: 'final',
    pie: 'Llegaste sin ceder un set.',
  },
  {
    eyebrow: 'QUINTA VARONIL',
    titular: 'CAMPEONES',
    detalle: 'Ganaste el torneo.',
    stage: 'final',
    pie: '+600 puntos de ranking.',
    fiesta: true,
  },
];

const MS = 3400;

export default function DemoFinal() {
  const [i, setI] = useState(0);
  const m = MOMENTOS[i];
  const t: TratoDeRonda = tratoDeRonda(m.stage);

  useEffect(() => {
    const id = setTimeout(() => setI((n) => (n + 1) % MOMENTOS.length), MS);
    return () => clearTimeout(id);
  }, [i]);

  return (
    <View
      style={[
        s.tarjeta,
        { borderColor: t.borde, backgroundColor: t.fondoPlano, padding: t.padding },
      ]}
    >
      {/* El fondo degradado a partir de semifinales, como en la app. */}
      {t.fondo && (
        <LinearGradient
          colors={[...t.fondo.colors] as [string, string, ...string[]]}
          start={t.fondo.start}
          end={t.fondo.end}
          style={s.fondo}
        />
      )}

      {/* La barra de acento de arriba: crece con la ronda. */}
      {t.acento.colors ? (
        <LinearGradient
          colors={[...t.acento.colors] as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.acento, { height: t.acento.alto }]}
        />
      ) : (
        <View style={[s.acento, { height: t.acento.alto, backgroundColor: t.acento.plano }]} />
      )}

      {/* El confeti de la app: por detrás, corto y sin robar un toque. */}
      {m.fiesta && <Confeti />}

      <Text style={[s.eyebrow, { color: t.colorEyebrow }]}>{m.eyebrow}</Text>
      <Text style={[s.titular, { fontSize: t.tamanoTitular, color: t.colorTitular }]}>
        {m.titular}
      </Text>
      <Text style={[s.detalle, { color: t.colorTexto }]}>{m.detalle}</Text>
      <Text style={[s.pie, { color: t.colorTenue }]}>{m.pie}</Text>

      {/* El sello que solo tiene la final. */}
      {t.sello && (
        <View style={s.sello}>
          <Text style={s.selloTexto}>{t.sello.toUpperCase()}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1, borderRadius: radius.lg, gap: space[1.5],
    overflow: 'hidden', minHeight: 230, justifyContent: 'center',
  },
  fondo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  acento: { position: 'absolute', top: 0, left: 0, right: 0 },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, letterSpacing: 2 },
  titular: { fontFamily: font.display, lineHeight: 46 },
  detalle: { fontFamily: font.body, fontSize: fontSize.body, lineHeight: 21 },
  pie: { fontFamily: font.body, fontSize: fontSize.minAbsolute, marginTop: space[2] },

  sello: {
    alignSelf: 'flex-start', marginTop: space[3],
    paddingHorizontal: space[2.5], paddingVertical: space[1],
    borderRadius: radius.sm, borderWidth: 1, borderColor: color.goldBright,
  },
  selloTexto: {
    fontFamily: font.display, fontSize: 9, color: color.goldBright, letterSpacing: 1.8,
  },
});
