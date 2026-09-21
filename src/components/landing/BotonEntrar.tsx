/**
 * src/components/landing/BotonEntrar.tsx
 *
 * RALLY · El botón que lleva a entrar.
 *
 * ► TODOS VAN AL MISMO SITIO Y NINGUNO DICE LO MISMO
 *   La landing tiene cinco, repartidos por la página, y cada uno recoge la
 *   promesa de la sección que acaba de leerse: debajo de la tabla en vivo
 *   dice "Ver los torneos abiertos"; debajo de la ficha del rival, "Saber
 *   contra quién juego". El destino es siempre el login.
 *
 *   El mismo texto cinco veces convierte el botón en decoración: el ojo
 *   aprende a saltárselo. Cambiando la frase, cada uno vuelve a ser una
 *   respuesta a lo que el visitante acaba de pensar.
 *
 * ► `replace` Y NO `push`
 *   Desde la portada, volver atrás tiene que salir de la app, no devolver a
 *   una portada que ya cumplió su función.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { color, font, fontSize, gradient, radius, space, touchTarget } from '@/lib/design-tokens';

export default function BotonEntrar({
  texto, pie, variante = 'oro',
}: {
  texto: string;
  /** Línea pequeña debajo. Lo que quita el miedo a pulsar. */
  pie?: string;
  variante?: 'oro' | 'borde';
}) {
  const router = useRouter();
  const esOro = variante === 'oro';

  return (
    <View style={s.caja}>
      <Pressable
        onPress={() => router.replace('/(auth)/login')}
        accessibilityRole="button"
        accessibilityLabel={texto}
        style={({ pressed }) => [s.boton, !esOro && s.botonBorde, pressed && { opacity: 0.88 }]}
      >
        {esOro && (
          <LinearGradient
            colors={gradient.gold.colors}
            start={gradient.gold.start}
            end={gradient.gold.end}
            style={s.fondo}
          />
        )}
        <Text style={[s.texto, !esOro && s.textoBorde]}>{texto}</Text>
      </Pressable>
      {pie ? <Text style={s.pie}>{pie}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  caja: { gap: space[2], alignItems: 'center' },
  boton: {
    minHeight: touchTarget + 8, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space[6], borderRadius: radius.md, overflow: 'hidden',
    alignSelf: 'stretch',
  },
  botonBorde: { borderWidth: 1, borderColor: color.goldMuted },
  fondo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  texto: {
    fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.onGold,
    letterSpacing: 0.5,
  },
  textoBorde: { color: color.goldBright },
  pie: {
    fontFamily: font.body, fontSize: fontSize.caption, color: color.muted,
    textAlign: 'center',
  },
});
