/**
 * src/components/player/ProyeccionDeRanking.tsx
 *
 * RALLY · Qué te falta para subir en el ranking.
 *
 * UN RANKING ES UNA FOTO; ESTO ES UNA META
 *   Ver "vas 8º" se mira una vez y no cambia nada. Lo que convierte la foto en
 *   un motivo para inscribirse al domingo siguiente es la distancia —"te faltan
 *   451 para el top 5"— y, sobre todo, qué hacer con ella: "ganando 2 torneos
 *   lo alcanzas". Sin esa última línea, 451 es un número sin escala.
 *
 * MIRA HACIA ABAJO TAMBIÉN
 *   Quién te persigue y a cuánto. Motiva igual o más que la meta de arriba, y
 *   es lo que faltaba en la pantalla de ranking.
 *
 * SE ALIMENTA DE LA MISMA TABLA QUE YA SE PINTA
 *   No hace ninguna consulta: recibe las filas que la pantalla de ranking ya
 *   cargó. Una segunda lectura podría traer un orden distinto y entonces la
 *   proyección hablaría de un ranking que el jugador no está viendo.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { leerSuscripcion } from '@/lib/suscripcion-datos';
import {
  proyectarRanking,
  puntosDeGanarUnTorneo,
  textoDeLoQueDaUnTorneo,
  textoDeQuienPersigue,
  textoDelHito,
  textoDePosicion,
  type FilaRanking,
} from '@/lib/proyeccion-ranking';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export interface ProyeccionDeRankingProps {
  /** La tabla COMPLETA de su división, la misma que se está pintando. */
  tabla: readonly FilaRanking[];
  userId: string;
}

export function ProyeccionDeRanking({ tabla, userId }: ProyeccionDeRankingProps) {
  const router = useRouter();
  const [esPro, setEsPro] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    leerSuscripcion(userId).then((s) => { if (vivo) setEsPro(s.activa); });
    return () => { vivo = false; };
  }, [userId]);

  const p = proyectarRanking(tabla, userId);
  // Sin puntos todavía no hay nada que proyectar, y decirlo sería recordarle
  // que no ha jugado. Se calla.
  if (!p || esPro === null) return null;

  if (!esPro) {
    return (
      <Pressable
        onPress={() => router.push('/(protected)/planes')}
        accessibilityRole="button"
        style={s.caja}
      >
        <Text style={s.eyebrow}>Tu ranking</Text>
        <Text style={s.posicion}>{textoDePosicion(p)}</Text>
        <Text style={s.cerrado}>
          Cuántos puntos te faltan para subir y cuántos torneos son, en Pro.
        </Text>
        <Text style={s.enlace}>Ver planes</Text>
      </Pressable>
    );
  }

  const porTorneo = puntosDeGanarUnTorneo();
  const lineas = [textoDelHito(p), textoDeLoQueDaUnTorneo(p, porTorneo), textoDeQuienPersigue(p)]
    .filter((x): x is string => x !== null);

  return (
    <View style={s.caja}>
      <Text style={s.eyebrow}>Tu ranking</Text>
      <Text style={s.posicion}>{textoDePosicion(p)}</Text>
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
  posicion: { color: color.champagne, fontFamily: font.display, fontSize: fontSize.h1Inline },
  cerrado: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
  enlace: { color: color.goldBright, fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600' },

  linea: { flexDirection: 'row', gap: space[2] },
  vinyeta: { color: color.gold, fontFamily: font.body, fontSize: fontSize.caption },
  lineaTexto: { flex: 1, color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
});

export default ProyeccionDeRanking;
