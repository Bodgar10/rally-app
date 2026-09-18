/**
 * src/components/campeon/AvisoDeAhorro.tsx
 *
 * RALLY · Lo que se dice en el momento exacto de pagar una inscripción.
 *
 * DOS MENSAJES DISTINTOS PARA DOS PERSONAS DISTINTAS
 *
 *   Al Campeón se le confirma el ahorro: es lo que compró y hay que
 *   entregárselo a la vista, no en un cargo silencioso.
 *
 *   Al que no lo es se le enseña, UNA VEZ, los dos importes: "con Campeón
 *   pagarías $902 en vez de $950". Es el único sitio de la app donde el 5%
 *   convence, porque es el único momento en que le duele. En cualquier otra
 *   pantalla el mismo mensaje es publicidad, y repetirlo lo vuelve ruido que
 *   se aprende a saltar.
 *
 * Y AL CAMPEÓN CON EL TOPE AGOTADO SE LE DICE TAMBIÉN
 *   Verlo sin descuento y sin explicación es peor que no haberlo prometido.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { textoDeLoQueSePierde, textoEnElPago } from '@/lib/ahorro-campeon';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export interface AvisoDeAhorroProps {
  /** Lo que se cobraría sin descuento. */
  base: number;
  /** Descuento realmente aplicado. 0 si no es Campeón o si agotó el tope. */
  ahorro: number;
  esCampeon: boolean;
  /** Solo para el que no es Campeón: llevarlo a planes. */
  onVerPlanes?: () => void;
}

export function AvisoDeAhorro({ base, ahorro, esCampeon, onVerPlanes }: AvisoDeAhorroProps) {
  if (esCampeon) {
    const bueno = ahorro > 0;
    return (
      <View style={[s.caja, bueno ? s.cajaBuena : s.cajaNeutra]}>
        <Text style={[s.texto, bueno && s.textoBueno]}>{textoEnElPago(base, ahorro)}</Text>
      </View>
    );
  }

  return (
    <View style={[s.caja, s.cajaOferta]}>
      <Text style={s.texto}>{textoDeLoQueSePierde(base)}</Text>
      {onVerPlanes && (
        <Pressable onPress={onVerPlanes} accessibilityRole="button">
          <Text style={s.enlace}>Ver Campeón</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  caja: {
    gap: space[1],
    padding: space[3],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  cajaBuena: { borderColor: 'rgba(66,214,164,0.32)', backgroundColor: 'rgba(66,214,164,0.10)' },
  cajaNeutra: { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  cajaOferta: { borderColor: color.line, backgroundColor: 'rgba(212,175,55,0.08)' },

  texto: { color: color.text, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
  textoBueno: { color: color.live },
  enlace: {
    color: color.goldBright,
    fontFamily: font.body,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
});

export default AvisoDeAhorro;
