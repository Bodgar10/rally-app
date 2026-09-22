/**
 * src/components/landing/Parrafo.tsx
 *
 * RALLY · Un párrafo con lo importante en claro.
 *
 * ► POR QUÉ NO ES UN `<Text>` Y YA
 *   Los párrafos de la portada eran bloques grises uniformes y pequeños. Todo
 *   al mismo peso es lo mismo que nada al mismo peso: el ojo no encuentra
 *   dónde agarrarse, así que o lo lee entero o no lo lee — y en una portada no
 *   lo lee entero.
 *
 *   Aquí la mayoría va en gris tenue y dos o tres fragmentos en claro. Quien
 *   pasa de largo se lleva solo los fragmentos claros, y por eso tienen que
 *   significar algo sueltos; quien se para, lee la frase entera.
 *
 * ► SE ANIDA UN `<Text>` DENTRO DE OTRO, QUE ES COMO SE HACE
 *   Un `<Text>` hijo hereda el estilo del padre y solo pisa lo que cambia. Con
 *   `<View>`s en fila el texto no fluiría: cada fragmento sería su propia caja
 *   y las palabras no se partirían por donde toca al final del renglón.
 *
 * ► Y EL TAMAÑO SUBE
 *   El párrafo estaba a 12 px, el tamaño de un pie de foto, debajo de un
 *   titular de 42. Ese salto no es jerarquía, es un hueco: lo de abajo no
 *   parece la explicación de lo de arriba, parece letra pequeña.
 */

import { StyleSheet, Text } from 'react-native';

import { partirRealzado, textoPlano } from '@/lib/texto-realzado';
import { color, font, fontSize } from '@/lib/design-tokens';

export default function Parrafo({ children }: { children: string }) {
  const trozos = partirRealzado(children);

  return (
    <Text style={s.base} accessibilityLabel={textoPlano(children)}>
      {trozos.map((t, i) => (
        <Text key={i} style={t.fuerte ? s.fuerte : undefined}>{t.texto}</Text>
      ))}
    </Text>
  );
}

const s = StyleSheet.create({
  base: {
    fontFamily: font.body,
    fontSize: fontSize.h1Inline,
    color: color.muted,
    lineHeight: 29,
    maxWidth: 520,
  },
  // Claro y con peso. No un color nuevo: el mismo blanco cálido del texto
  // primario, que es justo lo que lo separa del gris de alrededor.
  fuerte: { color: color.text, fontWeight: '600' },
});
