/**
 * src/components/player/FichaDelRival.tsx
 *
 * RALLY · Contra quién juegas, media hora antes.
 *
 * ES LA PANTALLA QUE SE VA A COMPARTIR
 *   Un jugador que ve "38% contra Martínez / Ruiz — se han visto 3 veces, 1-2"
 *   le manda la captura a su pareja. Eso es adquisición gratis, y es la razón
 *   por la que esta ficha vale más que muchas estadísticas más sofisticadas.
 *
 * ► CUANDO NO SE PUEDE MEDIR, NO SE PONE UN NÚMERO
 *   Con un rival recién llegado, Glicko empuja la probabilidad hacia el 50% —
 *   pero un "51%" se lee como "está parejo", y lo que pasa es que NO SE SABE.
 *   Son cosas distintas y la pantalla las distingue: sin los cuatro medidos, se
 *   dice que todavía no hay con qué. El resto de la ficha —el historial, quién
 *   manda, si son pareja fija— sigue saliendo, porque eso son hechos y no
 *   estimaciones.
 *
 * QUÉ SE VE SIN PAGAR
 *   El nombre del rival y que hay una ficha. Nada más: el pronóstico, el
 *   historial y quién manda son de pago, porque son exactamente el trabajo que
 *   la suscripción compra. Y este es el mejor sitio para pedirla — media hora
 *   antes de un partido, con el rival delante, es cuando más se quiere saber.
 *
 * NO HAY "PUNTOS FUERTES DEL RIVAL"
 *   Haría falta saber qué pasa DENTRO del punto —saques, errores, dónde se
 *   ganó la bola— y la unidad mínima del sistema es el game. Inventarlo sería
 *   la clase de dato que el jugador comprueba en la cancha y no vuelve a creer.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { armarFichaDelRival, type EntradaFicha } from '@/lib/scouting-datos';
import { leerSuscripcion } from '@/lib/suscripcion-datos';
import {
  lineasDeLaFicha,
  textoDelPronostico,
  textoDeProbabilidad,
  type FichaDelRival as Ficha,
} from '@/lib/scouting';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export interface FichaDelRivalProps extends EntradaFicha {
  /** Cómo se llaman ellos, para el título. */
  tituloRival: string;
  /** El jugador que mira, para saber si tiene suscripción. */
  userId: string;
}

export function FichaDelRival({ tituloRival, userId, ...entrada }: FichaDelRivalProps) {
  const router = useRouter();
  const [ficha, setFicha] = useState<Ficha | null | 'cargando'>('cargando');
  const [esPro, setEsPro] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerSuscripcion(userId).then((sub) => { if (vivo) setEsPro(sub.activa); });
    return () => { vivo = false; };
  }, [userId]);

  useEffect(() => {
    let vivo = true;
    armarFichaDelRival(entrada).then((f) => { if (vivo) setFicha(f); });
    return () => { vivo = false; };
    // Las dependencias son los ids: `nombres` es un Map nuevo en cada render
    // del padre y volvería a consultar sin que haya cambiado nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrada.nosotros[0], entrada.nosotros[1], entrada.ellos[0], entrada.ellos[1], entrada.division]);

  if (ficha === 'cargando') {
    return (
      <View style={s.caja}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }
  if (!ficha) return null;

  const porcentaje = textoDeProbabilidad(ficha);
  const lineas = lineasDeLaFicha(ficha);

  if (!esPro) {
    return (
      <Pressable
        onPress={() => router.push('/(protected)/planes')}
        accessibilityRole="button"
        style={s.caja}
      >
        <Text style={s.eyebrow}>Contra quién juegas</Text>
        <Text style={s.rival} numberOfLines={2}>{tituloRival}</Text>
        <Text style={s.cerrado}>
          Tus opciones de ganar, el historial entre ustedes y quién manda en su pareja están en Pro.
        </Text>
        <Text style={s.enlace}>Ver planes</Text>
      </Pressable>
    );
  }

  return (
    <View style={s.caja}>
      <Text style={s.eyebrow}>Contra quién juegas</Text>
      <Text style={s.rival} numberOfLines={2}>{tituloRival}</Text>

      <View style={s.pronostico}>
        {porcentaje && <Text style={s.porcentaje}>{porcentaje}</Text>}
        <Text style={[s.titular, !porcentaje && s.titularSolo]}>{textoDelPronostico(ficha)}</Text>
      </View>

      {lineas.map((l) => (
        <View key={l} style={s.linea}>
          <Text style={s.vinyeta}>·</Text>
          <Text style={s.lineaTexto}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  caja: {
    gap: space[1.5],
    padding: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  eyebrow: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rival: { color: color.text, fontFamily: font.body, fontSize: fontSize.cardName },

  pronostico: { flexDirection: 'row', alignItems: 'baseline', gap: space[3], marginTop: space[1] },
  porcentaje: { color: color.goldBright, fontFamily: font.display, fontSize: fontSize.displayL },
  titular: { flex: 1, color: color.champagne, fontFamily: font.display, fontSize: fontSize.h1Inline },
  titularSolo: { color: color.muted, fontSize: fontSize.body, fontFamily: font.body },

  cerrado: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.caption,
    lineHeight: 18,
    marginTop: space[1],
  },
  enlace: {
    color: color.goldBright,
    fontFamily: font.body,
    fontSize: fontSize.caption,
    fontWeight: '600',
    marginTop: space[1],
  },

  linea: { flexDirection: 'row', gap: space[2] },
  vinyeta: { color: color.gold, fontFamily: font.body, fontSize: fontSize.caption },
  lineaTexto: { flex: 1, color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
});

export default FichaDelRival;
