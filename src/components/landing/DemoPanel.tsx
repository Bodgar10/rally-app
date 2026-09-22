/**
 * src/components/landing/DemoPanel.tsx
 *
 * RALLY · Todo lo que un organizador tiene dentro, en una tarjeta.
 *
 * ► LA SECCIÓN PROMETÍA MUCHO Y ENSEÑABA UNA COSA
 *   "Pones los inscritos y sale el sorteo, los grupos, las rondas y el
 *   horario" — y debajo solo se veía el horario. Quien organiza torneos no se
 *   cree eso con una lista de cinco filas: lo que quiere saber es si esto
 *   aguanta el domingo entero, y eso son cuatro pantallas, no una.
 *
 *   Así que se enseñan las cuatro: los grupos con su tabla, el calendario, la
 *   captura y el cuadro. Con sus pestañas a la vista, porque la pestaña es
 *   parte del mensaje: dice "hay más" sin tener que escribirlo.
 *
 * ► PASAN SOLAS PERO SE PUEDEN TOCAR
 *   Va rotando para que quien solo mira vea las cuatro sin hacer nada. Y son
 *   pulsables, porque en cuanto alguien se interesa por una quiere quedarse en
 *   ella, y un carrusel que te arranca de donde estabas mirando es de las
 *   cosas que más molestan de una portada.
 *
 *   Al tocar, la rotación se PARA del todo. No se reanuda a los diez segundos:
 *   quien tocó ya dijo lo que quería mirar.
 *
 * ► EL CUADRO SE DIBUJA CON CAJAS, NO CON UNA IMAGEN
 *   Tres columnas y las líneas que las unen. Una imagen habría sido más rápido
 *   de hacer y habría envejecido con el primer cambio de color, además de
 *   pesar diez veces más que esto.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { AGENDA_DEMO } from '@/lib/landing-demo';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

const PESTANAS = ['Grupos', 'Horarios', 'Capturar', 'Cuadro'] as const;
const MS = 4200;
/** Alto fijo: si cada vista midiera lo suyo, la tarjeta daría saltos. */
const ALTO = 280;

export default function DemoPanel() {
  const [i, setI] = useState(0);
  const [fijado, setFijado] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (fijado) return;
    const id = setTimeout(() => setI((n) => (n + 1) % PESTANAS.length), MS);
    return () => clearTimeout(id);
  }, [i, fijado]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 340, useNativeDriver: true }).start();
  }, [i, fade]);

  return (
    <View style={s.tarjeta}>
      <View style={s.pestanas}>
        {PESTANAS.map((p, n) => (
          <Pressable
            key={p}
            onPress={() => { setI(n); setFijado(true); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === n }}
            style={[s.pestana, i === n && s.pestanaViva]}
          >
            <Text style={[s.pestanaTexto, i === n && s.pestanaTextoVivo]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <Animated.View style={[s.lienzo, { opacity: fade }]}>
        {i === 0 && <Grupos />}
        {i === 1 && <Horarios />}
        {i === 2 && <Capturar />}
        {i === 3 && <Cuadro />}
      </Animated.View>
    </View>
  );
}

/** 1 · La tabla de un grupo, como la ve el organizador. */
function Grupos() {
  const filas = [
    { pos: 1, nombre: 'Rivera / Solís', pj: 4, saldo: '+9' },
    { pos: 2, nombre: 'Barrera / Quintana', pj: 4, saldo: '+5' },
    { pos: 3, nombre: 'Del Valle / Otero', pj: 4, saldo: '+2' },
    { pos: 4, nombre: 'Escobar / Lira', pj: 4, saldo: '+2' },
    { pos: 5, nombre: 'Cantú / Mejía', pj: 4, saldo: '−4' },
  ];
  return (
    <View style={s.vista}>
      <Text style={s.titulo}>Grupo A · 8 parejas</Text>
      {filas.map((f) => (
        <View key={f.pos} style={[s.fila, f.pos <= 4 && s.filaDentro]}>
          <Text style={[s.pos, f.pos <= 4 && s.posDentro]}>{f.pos}</Text>
          <Text style={s.nombre} numberOfLines={1}>{f.nombre}</Text>
          <Text style={s.pj}>{f.pj}</Text>
          <Text style={[s.saldo, f.saldo.startsWith('+') && s.saldoBien]}>{f.saldo}</Text>
        </View>
      ))}
      <Text style={s.nota}>
        3.º y 4.º empatan a +2. La tabla los separa por el partido entre ellas.
      </Text>
    </View>
  );
}

/** 2 · El calendario, con su hora y su cancha. */
function Horarios() {
  return (
    <View style={s.vista}>
      <Text style={s.titulo}>40 partidos · 4 canchas · 12:00 a 19:00</Text>
      {AGENDA_DEMO.map((p) => (
        <View key={`${p.hora}-${p.cancha}`} style={s.fila}>
          <Text style={s.hora}>{p.hora}</Text>
          <Text style={s.cancha}>{p.cancha}</Text>
          <Text style={s.etiqueta} numberOfLines={1}>Grupo {p.grupo} · {p.ronda}</Text>
        </View>
      ))}
      <Text style={s.nota}>
        Y te avisa si la tarde no cabe antes de que la publiques.
      </Text>
    </View>
  );
}

/** 3 · La captura: dos casillas, y la segunda se completa sola. */
function Capturar() {
  return (
    <View style={[s.vista, s.vistaCentrada]}>
      <Text style={s.titulo}>Grupo A · Ronda 3 · Cancha 2</Text>
      <View style={s.capturaNombres}>
        <Text style={s.capturaPareja} numberOfLines={1}>Rivera / Solís</Text>
        <Text style={s.capturaVs}>games</Text>
        <Text style={[s.capturaPareja, s.capturaParejaDer]} numberOfLines={1}>Cantú / Mejía</Text>
      </View>
      <View style={s.casillas}>
        <View style={s.casilla}><Text style={s.casillaNum}>4</Text></View>
        <Text style={s.casillaGuion}>–</Text>
        <View style={s.casilla}><Text style={s.casillaNum}>2</Text></View>
      </View>
      <Text style={s.nota}>
        Escribes un lado y el otro se completa hasta seis. Un 4-3 no entra.
      </Text>
    </View>
  );
}

/** 4 · El cuadro: cuartos, semis y final, dibujado con cajas. */
function Cuadro() {
  const cuartos = [
    ['Rivera / Solís', 'Fuentes / Zamora'],
    ['Navarro / Peña', 'Del Valle / Otero'],
    ['Barrera / Quintana', 'Alcántara / Vega'],
    ['Escobar / Lira', 'Cantú / Mejía'],
  ];
  return (
    <View style={s.vista}>
      <View style={s.cuadro}>
        <Columna titulo="CUARTOS">
          {cuartos.map((par, n) => (
            <View key={n} style={s.llave}>
              {par.map((x) => (
                <Text key={x} style={[s.jugador, x === par[0] && s.jugadorGana]} numberOfLines={1}>
                  {x}
                </Text>
              ))}
            </View>
          ))}
        </Columna>

        <Columna titulo="SEMIS">
          <View style={[s.llave, s.llaveSemi]}>
            <Text style={[s.jugador, s.jugadorGana]} numberOfLines={1}>Rivera / Solís</Text>
            <Text style={s.jugador} numberOfLines={1}>Navarro / Peña</Text>
          </View>
          <View style={[s.llave, s.llaveSemi]}>
            <Text style={[s.jugador, s.jugadorGana]} numberOfLines={1}>Barrera / Quintana</Text>
            <Text style={s.jugador} numberOfLines={1}>Escobar / Lira</Text>
          </View>
        </Columna>

        <Columna titulo="FINAL">
          <View style={[s.llave, s.llaveFinal]}>
            <Text style={[s.jugador, s.jugadorFinal]} numberOfLines={1}>Rivera / Solís</Text>
            <Text style={[s.jugador, s.jugadorFinal]} numberOfLines={1}>Barrera / Quintana</Text>
          </View>
        </Columna>
      </View>
      <Text style={s.nota}>
        El cuadro se arma solo con los que clasifican, cruzando 1.º contra 4.º.
      </Text>
    </View>
  );
}

function Columna({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={s.columna}>
      <Text style={s.columnaTitulo}>{titulo}</Text>
      <View style={s.columnaCuerpo}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1, borderColor: color.line, borderRadius: radius.lg,
    backgroundColor: color.surface, padding: space[3], gap: space[3],
  },

  pestanas: { flexDirection: 'row', gap: space[1] },
  pestana: {
    flex: 1, paddingVertical: space[2], borderRadius: radius.sm, alignItems: 'center',
  },
  pestanaViva: { backgroundColor: 'rgba(212,175,55,0.12)' },
  pestanaTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  pestanaTextoVivo: { color: color.goldBright, fontWeight: '600' },

  lienzo: { height: ALTO },
  vista: { flex: 1, gap: space[1] },
  vistaCentrada: { justifyContent: 'center', gap: space[3] },

  titulo: {
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne,
    letterSpacing: 1.4, marginBottom: space[1],
  },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[2],
    paddingVertical: space[1.5], paddingHorizontal: space[2], borderRadius: radius.sm,
  },
  filaDentro: { backgroundColor: 'rgba(212,175,55,0.06)' },
  pos: { width: 16, fontFamily: font.display, fontSize: fontSize.caption, color: color.muted },
  posDentro: { color: color.goldBright },
  nombre: { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.text },
  pj: { width: 20, textAlign: 'right', fontFamily: font.body, fontSize: 11, color: color.muted },
  saldo: { width: 34, textAlign: 'right', fontFamily: font.display, fontSize: fontSize.caption, color: color.danger },
  saldoBien: { color: color.live },

  hora: { width: 44, fontFamily: font.display, fontSize: fontSize.caption, color: color.text },
  cancha: { width: 62, fontFamily: font.body, fontSize: 11, color: color.muted },
  etiqueta: { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },

  capturaNombres: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  capturaPareja: { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.text },
  capturaParejaDer: { textAlign: 'right' },
  capturaVs: { fontFamily: font.body, fontSize: 10, color: color.muted },
  casillas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3] },
  casilla: {
    width: 64, height: 64, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: color.goldMuted, borderRadius: radius.md,
    backgroundColor: color.bg,
  },
  casillaNum: { fontFamily: font.display, fontSize: fontSize.displayL, color: color.text },
  casillaGuion: { fontFamily: font.display, fontSize: fontSize.metric, color: color.muted },

  cuadro: { flexDirection: 'row', gap: space[2], flex: 1 },
  columna: { flex: 1, gap: space[2] },
  columnaTitulo: {
    fontFamily: font.display, fontSize: 9, color: color.muted, letterSpacing: 1.4,
    textAlign: 'center',
  },
  columnaCuerpo: { flex: 1, justifyContent: 'space-around', gap: space[1] },
  llave: {
    borderLeftWidth: 2, borderLeftColor: color.lineSoft,
    paddingLeft: space[2], paddingVertical: 2, gap: 1,
  },
  llaveSemi: { borderLeftColor: color.goldMuted },
  llaveFinal: { borderLeftColor: color.goldBright },
  jugador: { fontFamily: font.body, fontSize: 10, color: color.muted },
  jugadorGana: { color: color.text },
  jugadorFinal: { color: color.goldBright, fontSize: 11 },

  nota: {
    fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted,
    lineHeight: 16, marginTop: space[2],
  },
});
