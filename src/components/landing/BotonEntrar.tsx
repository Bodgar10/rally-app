/**
 * src/components/landing/BotonEntrar.tsx
 *
 * RALLY · El botón que saca de la portada.
 *
 * ► TODOS HACEN LO MISMO Y NINGUNO DICE LO MISMO
 *   La portada tiene siete, repartidos por la página, y cada uno recoge la
 *   promesa de la sección que acaba de leerse: debajo de la tabla en vivo dice
 *   "Entrar a mi grupo"; debajo de la ficha del rival, "Saber contra quién
 *   juego".
 *
 *   El mismo texto siete veces convierte el botón en decoración: el ojo
 *   aprende a saltárselo. Cambiando la frase, cada uno vuelve a ser una
 *   respuesta a lo que el visitante acaba de pensar.
 *
 * ► EL DESTINO SE DECIDE AL PULSAR, NO AL PINTAR
 *   Quien ya tiene sesión va al dashboard; quien no, al login. Se mira la
 *   sesión EN EL TOQUE y no al montar la portada por dos razones:
 *
 *     · Son siete botones. Resolverlo al montar sería siete consultas —o un
 *       contexto más— para un dato que solo importa cuando alguien pulsa.
 *     · La portada no debe esperar a nadie para pintarse. Si la sesión se
 *       resolviera antes, el primer render dependería de la red.
 *
 *   Y si esa consulta falla, se va al login: pedir una contraseña de más es
 *   recuperable; mandar al dashboard a quien no tiene sesión es una pantalla
 *   vacía y un rebote.
 *
 * ► `replace` Y NO `push`
 *   Desde la portada, atrás tiene que salir de la app, no devolver a una
 *   portada que ya cumplió su función.
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { supabase } from '@/lib/supabase/client';
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
  const [yendo, setYendo] = useState(false);
  const esOro = variante === 'oro';

  async function entrar() {
    if (yendo) return;
    setYendo(true);
    try {
      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? '/(protected)/dashboard' : '/(auth)/login');
    } catch {
      // Ver la cabecera: ante la duda, al login.
      router.replace('/(auth)/login');
    }
  }

  return (
    <View style={s.caja}>
      <Pressable
        onPress={() => void entrar()}
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
        {yendo
          ? <ActivityIndicator color={esOro ? color.onGold : color.goldBright} />
          : <Text style={[s.texto, !esOro && s.textoBorde]}>{texto}</Text>}
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
