/**
 * src/components/landing/DemoFormatos.tsx
 *
 * RALLY · Los dos torneos que se pueden montar.
 *
 * ► LA PORTADA ENSEÑABA UNO Y PARECÍA QUE ERA EL ÚNICO
 *   Todas las demos salían de un exprés —16 parejas, una tarde, suma 6— y
 *   quien organiza torneos de fin de semana podía irse pensando que esto solo
 *   sirve para tardes cortas. Es justo al revés: el motor largo es el que
 *   lleva un torneo real de 165 parejas con ocho categorías.
 *
 *   Los dos formatos son de verdad distintos —no es el mismo torneo con otra
 *   duración— y por eso se enseñan enfrentados: cambia cuánto dura, cuánta
 *   gente cabe y CÓMO SE PUNTÚA, que es lo que más despista si no se dice.
 *
 * ► EL EXPRÉS PRIMERO, AUNQUE SEA EL PEQUEÑO
 *   Es el que alguien puede montar este domingo sin pedirle permiso a nadie.
 *   El de varios días necesita club, calendario y gente; el exprés necesita
 *   una tarde. Para convencer a un organizador nuevo, el que se prueba
 *   primero pesa más que el más grande.
 */

import { StyleSheet, Text, View } from 'react-native';

import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

interface Formato {
  etiqueta: string;
  titulo: string;
  duracion: string;
  filas: [string, string][];
  destacado?: boolean;
}

const FORMATOS: readonly Formato[] = [
  {
    etiqueta: 'EXPRÉS',
    titulo: 'Una tarde',
    duracion: '5 a 7 horas · un solo día',
    filas: [
      ['Parejas', '16 en dos grupos'],
      ['Partidos', '5 por pareja, a 6 games'],
      ['Se gana', 'por saldo de games'],
      ['Cuadro', 'cuartos, semis y final'],
    ],
    destacado: true,
  },
  {
    etiqueta: 'DE VARIOS DÍAS',
    titulo: 'Fin de semana',
    duracion: '2 o 3 días · varias categorías',
    filas: [
      ['Parejas', 'sin límite, por categoría'],
      ['Partidos', 'sets completos'],
      ['Se gana', 'partidos, con súper muerte'],
      ['Cuadro', 'hasta ronda de 32'],
    ],
  },
];

export default function DemoFormatos() {
  return (
    <View style={s.fila}>
      {FORMATOS.map((f) => (
        <View key={f.etiqueta} style={[s.tarjeta, f.destacado && s.tarjetaOro]}>
          <Text style={[s.etiqueta, f.destacado && s.etiquetaOro]}>{f.etiqueta}</Text>
          <Text style={s.titulo}>{f.titulo}</Text>
          <Text style={s.duracion}>{f.duracion}</Text>

          <View style={s.separador} />

          {f.filas.map(([k, v]) => (
            <View key={k} style={s.dato}>
              <Text style={s.clave}>{k}</Text>
              <Text style={s.valor}>{v}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  // En móvil se apilan solos: `flexWrap` con un ancho mínimo por tarjeta.
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },

  tarjeta: {
    flexGrow: 1, flexBasis: 240,
    padding: space[4], borderRadius: radius.md,
    borderWidth: 1, borderColor: color.lineSoft, backgroundColor: color.surface,
  },
  tarjetaOro: { borderColor: color.goldMuted, backgroundColor: 'rgba(212,175,55,0.05)' },

  etiqueta: {
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.muted,
    letterSpacing: 2,
  },
  etiquetaOro: { color: color.goldBright },
  titulo: { fontFamily: font.display, fontSize: fontSize.metric, color: color.text, marginTop: 2 },
  duracion: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  separador: { height: 1, backgroundColor: color.lineSoft, marginVertical: space[3] },

  dato: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], paddingVertical: space[1] },
  clave: {
    width: 68, fontFamily: font.display, fontSize: 10, color: color.muted,
    letterSpacing: 1, paddingTop: 2,
  },
  valor: { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.text, lineHeight: 18 },
});
