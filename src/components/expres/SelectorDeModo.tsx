/**
 * src/components/expres/SelectorDeModo.tsx
 *
 * RALLY · La primera pregunta del alta: ¿qué tipo de torneo es esto?
 *
 * POR QUÉ VA PRIMERO Y NO ENTERRADA EN UN AJUSTE
 *   Un exprés y un torneo largo no son el mismo formulario con casillas
 *   distintas: cambian el número de categorías, cómo se juega cada partido,
 *   cómo se ordena la tabla y cuántos días dura. Preguntarlo al final
 *   obligaría a rehacer todo lo contestado antes.
 *
 * SE DESCRIBEN POR LO QUE EL ORGANIZADOR RECONOCE
 *   No por "modo exprés" y "modo largo", que no significan nada para quien
 *   nunca ha usado la app. Se describen por la tarde de domingo y por el fin
 *   de semana de tres días, que es como los llama él.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export type ModoTorneo = 'expres' | 'largo';

export interface SelectorDeModoProps {
  valor?: ModoTorneo | null;
  onElegir: (modo: ModoTorneo) => void;
}

const OPCIONES: {
  modo: ModoTorneo;
  titulo: string;
  cuando: string;
  detalle: string[];
}[] = [
  {
    modo: 'expres',
    titulo: 'Exprés',
    cuando: 'Una tarde',
    detalle: [
      'Una sola categoría, dos grupos que se turnan las canchas',
      'Cada pareja juega 5 partidos cortos: unas 2 h 30 de pádel',
      'Los partidos son a 6 games y no tienen ganador: manda el saldo',
      'Pasan 4 de cada grupo a cuartos, y esa tarde sale campeón',
    ],
  },
  {
    modo: 'largo',
    titulo: 'De varios días',
    cuando: 'Dos o tres días',
    detalle: [
      'Hasta ocho categorías a la vez',
      'Fase de grupos entre semana o el sábado',
      'Eliminatorias el domingo',
      'Partidos a sets, con ganador',
    ],
  },
];

export default function SelectorDeModo({ valor = null, onElegir }: SelectorDeModoProps) {
  return (
    <View style={s.cont}>
      <Text style={s.pregunta}>¿Qué torneo vas a montar?</Text>

      {OPCIONES.map((o) => {
        const activo = valor === o.modo;
        return (
          <Pressable
            key={o.modo}
            onPress={() => onElegir(o.modo)}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            style={[s.tarjeta, activo && s.tarjetaActiva]}
          >
            <View style={s.cabecera}>
              <Text style={[s.titulo, activo && s.tituloActivo]}>{o.titulo}</Text>
              <Text style={s.cuando}>{o.cuando}</Text>
            </View>
            {o.detalle.map((d) => (
              <View key={d} style={s.punto}>
                <Text style={s.vinyeta}>·</Text>
                <Text style={s.detalle}>{d}</Text>
              </View>
            ))}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  cont: { gap: space[3] },
  pregunta: {
    color: color.champagne,
    fontFamily: font.display,
    fontSize: fontSize.screenH1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tarjeta: {
    gap: space[1.5],
    padding: space[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: color.surface,
  },
  tarjetaActiva: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.10)' },
  cabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  titulo: { color: color.text, fontFamily: font.display, fontSize: fontSize.metric },
  tituloActivo: { color: color.goldBright },
  cuando: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  punto: { flexDirection: 'row', gap: space[2] },
  vinyeta: { color: color.gold, fontFamily: font.body, fontSize: fontSize.body },
  detalle: { flex: 1, color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
});
