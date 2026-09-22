/**
 * src/components/landing/DemoRankingGlobal.tsx
 *
 * RALLY · Un ranking, no uno por torneo.
 *
 * ► ES LA DIFERENCIA MÁS GRANDE Y NO SE ESTABA CONTANDO
 *   Hoy cada torneo lleva su propia tabla, así que ganar cuatro torneos de
 *   cuatro organizadores distintos son cuatro victorias sueltas que no suman
 *   a nada. No hay forma de responder "¿quién es el mejor de quinta?" porque
 *   no hay un sitio donde esa pregunta exista.
 *
 *   `ranking_public` sí lo es: una vista de red que CRUZA ORGANIZADORES. Da
 *   igual quién montó el torneo — los puntos caen en el mismo sitio. Eso
 *   convierte cada inscripción en un movimiento hacia arriba, y es lo que
 *   hace que valga la pena entrar a torneos que no son los de siempre.
 *
 * ► LA MEDALLA SOLO PARA LOS TRES PRIMEROS
 *   Oro, plata y bronce, y a partir del cuarto el número a secas. Si todas
 *   las filas llevaran adorno, el podio dejaría de ser un podio.
 *
 * ► Y SE ENSEÑA UNA FILA "TÚ", MÁS ABAJO
 *   Un ranking donde solo salen los tres de arriba es un cartel. Lo que hace
 *   que alguien quiera subir es verse dentro, con su número y su distancia
 *   al de encima — que es exactamente lo que la app le enseña.
 */

import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';

interface Fila {
  pos: number;
  nombre: string;
  puntos: number;
  torneos: number;
  yo?: boolean;
}

const TABLA: readonly Fila[] = [
  { pos: 1, nombre: 'Andrés Rivera', puntos: 7480, torneos: 9 },
  { pos: 2, nombre: 'Mauricio Solís', puntos: 6920, torneos: 8 },
  { pos: 3, nombre: 'Iván Barrera', puntos: 6150, torneos: 11 },
  { pos: 4, nombre: 'Javier Quintana', puntos: 5730, torneos: 7 },
  { pos: 12, nombre: 'Tú', puntos: 3240, torneos: 4, yo: true },
];

/** Oro, plata y bronce. A partir del cuarto, nada. */
const MEDALLA: Record<number, string> = {
  1: color.goldBright,
  2: '#C9CBD1',
  3: '#C08A5A',
};

export default function DemoRankingGlobal() {
  return (
    <View style={s.tarjeta}>
      <View style={s.cabecera}>
        <Text style={s.eyebrow}>RANKING · QUINTA VARONIL</Text>
        <Text style={s.alcance}>Todos los organizadores</Text>
      </View>

      {TABLA.map((f, i) => {
        const medalla = MEDALLA[f.pos];
        // El salto del 4.º al 12.º se dice, no se disimula.
        const haySalto = i > 0 && f.pos - TABLA[i - 1].pos > 1;
        return (
          <View key={f.pos}>
            {haySalto && <Text style={s.salto}>· · ·</Text>}
            <View style={[s.fila, f.yo && s.filaYo, !!medalla && s.filaPodio]}>
              {medalla ? (
                <View style={[s.medalla, { borderColor: medalla }]}>
                  <Text style={[s.medallaNum, { color: medalla }]}>{f.pos}</Text>
                </View>
              ) : (
                <Text style={[s.pos, f.yo && s.posYo]}>{f.pos}</Text>
              )}

              <View style={s.datos}>
                <Text style={[s.nombre, f.yo && s.nombreYo]} numberOfLines={1}>
                  {f.nombre}
                </Text>
                <Text style={s.torneos}>{f.torneos} torneos</Text>
              </View>

              <Text style={[s.puntos, f.pos === 1 && s.puntosLider, f.yo && s.puntosYo]}>
                {f.puntos.toLocaleString('es-MX')}
              </Text>
            </View>
          </View>
        );
      })}

      <LinearGradient
        colors={[...gradient.gold.colors] as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.regla}
      />

      <Text style={s.nota}>
        Un solo ranking para toda la red. Juegues donde juegues y lo monte quien
        lo monte, los puntos caen en el mismo sitio.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    borderWidth: 1, borderColor: color.line, borderRadius: radius.lg,
    backgroundColor: color.surface, padding: space[4], gap: space[1],
  },
  cabecera: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: space[2],
  },
  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 1.8 },
  alcance: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.gold },

  salto: {
    fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
    textAlign: 'center', paddingVertical: space[1], letterSpacing: 3,
  },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    paddingVertical: space[2], paddingHorizontal: space[2], borderRadius: radius.sm,
  },
  filaPodio: { backgroundColor: 'rgba(212,175,55,0.05)' },
  filaYo: { backgroundColor: 'rgba(212,175,55,0.12)', borderWidth: 1, borderColor: color.goldMuted },

  medalla: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  medallaNum: { fontFamily: font.display, fontSize: fontSize.caption, fontWeight: '700' },
  pos: { width: 26, textAlign: 'center', fontFamily: font.display, fontSize: fontSize.cardName, color: color.muted },
  posYo: { color: color.goldBright },

  datos: { flex: 1 },
  nombre: { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  nombreYo: { color: color.goldBright, fontWeight: '600' },
  torneos: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted },

  puntos: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.muted },
  puntosLider: { color: color.goldBright, fontSize: fontSize.metric },
  puntosYo: { color: color.champagne },

  regla: { height: 2, borderRadius: 1, marginTop: space[3] },
  nota: {
    fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted,
    lineHeight: 17, marginTop: space[2],
  },
});
