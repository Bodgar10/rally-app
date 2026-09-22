/**
 * src/components/landing/DemoTablaViva.tsx
 *
 * RALLY · La tabla de un grupo, moviéndose sola.
 *
 * ► NO ES UNA CAPTURA DE PANTALLA, ES LA TABLA
 *   Los puestos salen de `computeTablaExpres`, el mismo motor que ordena un
 *   torneo de verdad. Cada tres segundos entra un marcador y la tabla se
 *   recalcula entera. Si el motor cambiara de criterio, esta portada cambiaría
 *   con él — que es la única forma de que una demo no acabe mintiendo.
 *
 * ► LAS FILAS SE MUEVEN, NO SE REDIBUJAN
 *   Cada pareja tiene su sitio en el eje Y y lo ANIMA hasta el nuevo. Si la
 *   lista se reordenara a secas, las filas cambiarían de contenido de golpe y
 *   no se vería a nadie adelantar a nadie — que es exactamente lo que hay que
 *   enseñar. Así se ve a la pareja subir por encima de otra, que es lo que
 *   pasa en la cancha y lo que la gente mira.
 *
 *   Por eso cada fila está posicionada en absoluto sobre un alto fijo: es la
 *   única forma de animar un cambio de orden sin que el layout dé saltos.
 *
 * ► LA LÍNEA DE CORTE NO SE MUEVE
 *   Se queda en el mismo sitio —después del cuarto— mientras las parejas
 *   cruzan por encima y por debajo. Es lo que convierte la animación en una
 *   historia: no es que la lista cambie, es que alguien entra y alguien sale.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { tablaEnElPaso, PASOS_DEMO, PAREJAS_DEMO } from '@/lib/landing-demo';
import { textoDeBalance } from '@/lib/expres-texto';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

const ALTO_FILA = 44;
const CLASIFICAN = 4;
/** Lo que tarda en entrar el siguiente marcador. */
const MS_POR_PASO = 2600;

export default function DemoTablaViva() {
  const [paso, setPaso] = useState(0);
  const filas = tablaEnElPaso(paso, CLASIFICAN);

  // Un valor animado por pareja, creado una sola vez.
  const yRef = useRef<Map<string, Animated.Value>>(new Map());
  if (yRef.current.size === 0) {
    PAREJAS_DEMO.forEach((p, i) => yRef.current.set(p.id, new Animated.Value(i * ALTO_FILA)));
  }

  useEffect(() => {
    // Vuelve a empezar al terminar: la portada se mira más de una vez.
    const id = setTimeout(
      () => setPaso((n) => (n >= PASOS_DEMO ? 0 : n + 1)),
      paso === 0 ? 1400 : MS_POR_PASO,
    );
    return () => clearTimeout(id);
  }, [paso]);

  useEffect(() => {
    const animaciones = filas.map((f) =>
      Animated.spring(yRef.current.get(f.pairId)!, {
        toValue: (f.posicion - 1) * ALTO_FILA,
        useNativeDriver: true,
        damping: 18,
        stiffness: 120,
      }),
    );
    Animated.parallel(animaciones).start();
  }, [filas]);

  const jugados = filas.reduce((a, f) => a + f.jugados, 0) / 2;

  return (
    <View style={s.tarjeta}>
      <View style={s.cabecera}>
        <Text style={s.grupo}>GRUPO A</Text>
        <Text style={s.progreso}>
          {jugados === 0 ? 'Por empezar' : `${jugados} de ${PASOS_DEMO} partidos`}
        </Text>
      </View>

      <View style={s.columnas}>
        <Text style={[s.col, s.colPos]}>#</Text>
        <Text style={[s.col, s.colNombre]}>PAREJA</Text>
        <Text style={[s.col, s.colNum]}>PJ</Text>
        <Text style={[s.col, s.colSaldo]}>SALDO</Text>
      </View>

      <View style={[s.pista, { height: PAREJAS_DEMO.length * ALTO_FILA }]}>
        {/* La línea de corte, quieta, mientras las parejas cruzan. */}
        <View style={[s.corte, { top: CLASIFICAN * ALTO_FILA }]}>
          <Text style={s.corteTexto}>PASAN A CUARTOS</Text>
        </View>

        {filas.map((f) => (
          <Animated.View
            key={f.pairId}
            style={[
              s.fila,
              f.dentro && s.filaDentro,
              { transform: [{ translateY: yRef.current.get(f.pairId)! }] },
            ]}
          >
            <Text style={[s.pos, f.dentro && s.posDentro]}>{f.posicion}</Text>
            <View style={s.nombreCaja}>
              <Text style={s.nombre} numberOfLines={1}>{f.nombre}</Text>
              {/* El desempate raro, dicho. Sale del motor, no del guion. */}
              {f.porDirecto && (
                <Text style={s.criterio}>por el partido entre ellas</Text>
              )}
            </View>
            <Text style={s.num}>{f.jugados}</Text>
            <Text style={[
              s.saldo,
              f.balance > 0 && s.saldoBien,
              f.balance < 0 && s.saldoMal,
            ]}>
              {f.jugados === 0 ? '—' : textoDeBalance(f.balance)}
            </Text>
          </Animated.View>
        ))}
      </View>

      <Text style={s.pie}>
        Los partidos no se ganan: se suman tus games y se restan los del rival.
        Todas juegan los mismos cinco, así que los saldos se comparan directo.
        Pasan cuatro.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1, borderColor: color.line, borderRadius: radius.lg,
    backgroundColor: color.surface, padding: space[4], gap: space[2],
  },
  cabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grupo: { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.champagne, letterSpacing: 1.5 },
  progreso: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted },

  columnas: {
    flexDirection: 'row', alignItems: 'center', gap: space[2],
    paddingBottom: space[1], borderBottomWidth: 1, borderBottomColor: color.lineSoft,
  },
  col: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.muted, letterSpacing: 1 },
  colPos: { width: 20 },
  colNombre: { flex: 1 },
  colNum: { width: 26, textAlign: 'right' },
  colSaldo: { width: 52, textAlign: 'right' },

  pista: { position: 'relative', marginTop: space[1] },

  corte: {
    position: 'absolute', left: 0, right: 0,
    borderTopWidth: 1, borderTopColor: color.goldMuted,
    alignItems: 'center',
  },
  corteTexto: {
    fontFamily: font.display, fontSize: 9, color: color.gold, letterSpacing: 2,
    backgroundColor: color.surface, paddingHorizontal: space[2], marginTop: -6,
  },

  fila: {
    position: 'absolute', left: 0, right: 0, height: ALTO_FILA,
    flexDirection: 'row', alignItems: 'center', gap: space[2],
    paddingHorizontal: space[2], borderRadius: radius.sm,
  },
  filaDentro: { backgroundColor: 'rgba(212,175,55,0.06)' },

  pos: { width: 20, fontFamily: font.display, fontSize: fontSize.cardName, color: color.muted },
  posDentro: { color: color.goldBright },
  nombreCaja: { flex: 1 },
  nombre: { fontFamily: font.body, fontSize: fontSize.caption, color: color.text },
  criterio: { fontFamily: font.body, fontSize: 10, color: color.champagne },
  num: { width: 26, textAlign: 'right', fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  saldo: { width: 52, textAlign: 'right', fontFamily: font.display, fontSize: fontSize.cardName, color: color.muted },
  saldoBien: { color: color.live },
  saldoMal: { color: color.danger },

  pie: {
    fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted,
    lineHeight: 17, marginTop: space[2],
  },
});
