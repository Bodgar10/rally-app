/**
 * src/components/organizer/SelectorDeTier.tsx
 *
 * RALLY · Elegir el tier del torneo.
 *
 * ► POR QUÉ ES UN COMPONENTE Y NO TRES COPIAS
 *   Las mismas tres opciones se pintaban a mano en `nuevo.tsx`, en
 *   `nuevo-expres.tsx` y en `tier.tsx`, cada una con sus propios estilos. Tres
 *   copias del mismo control es tres sitios donde arreglar lo mismo, y de
 *   hecho las tres se veían distinto.
 *
 * ► LAS TRES OPCIONES NO PESAN LO MISMO, Y ANTES SÍ
 *   Se pintaban como tres rectángulos idénticos con un borde gris, y la única
 *   diferencia real —×2, ×1, ×0.6 de puntos de ranking— iba enterrada al final
 *   de la línea de abajo, en gris pequeño. El Major es el torneo grande del
 *   calendario; si en la pantalla pesa lo mismo que un P2, el organizador
 *   elige el primero que ve y no el que quería.
 *
 *   Ahora la jerarquía se ve antes de leer: el Major lleva el oro de verdad
 *   —borde dorado y fondo con el gradiente de sello— y el multiplicador sale
 *   grande a la derecha, que es el dato que de verdad distingue a los tres. La
 *   jerarquía viene del dato (`destaque` en `@/lib/tier-torneo`), no de aquí:
 *   la pantalla la obedece, no la inventa.
 *
 * ► Y SEGUIR SIENDO LEGIBLE SIN ELEGIR NADA
 *   El destaque es permanente —el Major brilla siempre, esté elegido o no— y
 *   la ELECCIÓN se marca aparte, con el borde encendido y la palomita. Si el
 *   brillo fuera la marca de selección, no habría forma de ver cuál está
 *   elegido entre tres tarjetas que ya brillan distinto.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  TIER_OPCIONES, puntosDelCampeon, type OpcionTier, type TierTorneo,
} from '@/lib/tier-torneo';
import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';

interface Props {
  valor:    TierTorneo | null;
  onChange: (t: TierTorneo) => void;
  /** Las opciones que no se pueden elegir aquí, con el motivo a la vista. */
  deshabilitados?: readonly TierTorneo[];
}

export default function SelectorDeTier({ valor, onChange, deshabilitados = [] }: Props) {
  return (
    <View style={s.lista}>
      {TIER_OPCIONES.map((o) => (
        <Opcion
          key={o.valor}
          opcion={o}
          elegida={valor === o.valor}
          inerte={deshabilitados.includes(o.valor)}
          onPress={() => onChange(o.valor)}
        />
      ))}
    </View>
  );
}

function Opcion({
  opcion, elegida, inerte, onPress,
}: {
  opcion: OpcionTier; elegida: boolean; inerte: boolean; onPress: () => void;
}) {
  const esMajor = opcion.destaque === 'maximo';

  const cuerpo = (
    <>
      <View style={s.fila}>
        <View style={s.textos}>
          <Text style={s.dias}>{opcion.dias}</Text>
          <Text style={[s.titulo, esMajor && s.tituloMajor]}>{opcion.titulo}</Text>
        </View>

        {/* LO QUE SE LLEVA EL CAMPEÓN, GRANDE. Es lo que de verdad distingue
            a los tres tiers, y estaba escondido al final de una línea gris.
            Aquí ponía el multiplicador (×2, ×1, ×0.6) y no se entendía:
            multiplicado ¿por qué? El multiplicador sigue abajo, en pequeño,
            para quien sí quiera el dato exacto. */}
        <View style={s.multiCaja}>
          <Text style={[s.multi, esMajor && s.multiMajor]}>
            {puntosDelCampeon(opcion.valor).toLocaleString('es-MX')}
          </Text>
          <Text style={s.multiPie}>pts al campeón</Text>
          <Text style={s.multiPie}>{opcion.multiplicador}</Text>
        </View>
      </View>

      <Text style={s.sub}>{opcion.sub}</Text>
    </>
  );

  return (
    <Pressable
      onPress={inerte ? undefined : onPress}
      disabled={inerte}
      accessibilityRole="radio"
      accessibilityState={{ selected: elegida, disabled: inerte }}
      accessibilityLabel={
        `${opcion.titulo}, ${opcion.dias}, `
        + `${puntosDelCampeon(opcion.valor)} puntos al campeón`
      }
      style={({ pressed }) => [
        s.tarjeta,
        opcion.destaque === 'medio' && s.tarjetaMedio,
        esMajor && s.tarjetaMajor,
        elegida && s.tarjetaElegida,
        inerte && s.tarjetaInerte,
        pressed && !inerte && { opacity: 0.85 },
      ]}
    >
      {/* Solo el Major lleva fondo de gradiente: si lo llevaran los tres, no
          sería jerarquía, sería decoración. */}
      {esMajor ? (
        <LinearGradient
          colors={gradient.seal.colors}
          start={gradient.seal.start}
          end={gradient.seal.end}
          style={s.velo}
        />
      ) : null}

      {cuerpo}

      {elegida && (
        <View style={s.palomita}>
          <Text style={s.palomitaTexto}>✓</Text>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  lista: { gap: space[2] },

  tarjeta: {
    gap: space[1],
    padding: space[3.5],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.lineSoft,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  tarjetaMedio: { borderColor: color.line },
  tarjetaMajor: { borderColor: color.goldMuted },
  tarjetaElegida: { borderColor: color.gold, borderWidth: 2 },
  tarjetaInerte: { opacity: 0.45 },

  // El gradiente va MUY bajo: por encima tiene que leerse texto blanco.
  velo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.16 },

  fila: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  textos: { flex: 1, gap: 2 },

  dias: {
    fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  titulo:      { fontFamily: font.display, fontSize: fontSize.h1Inline, color: color.text },
  tituloMajor: { color: color.goldBright, letterSpacing: 0.5 },

  multiCaja: { alignItems: 'flex-end' },
  multi:      { fontFamily: font.display, fontSize: fontSize.metric, color: color.champagne },
  multiMajor: { color: color.goldBright },
  multiPie:   { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.muted },

  sub: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  palomita: {
    position: 'absolute', top: space[2], right: space[2],
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.gold,
  },
  palomitaTexto: { color: color.onGold, fontSize: 12, fontWeight: '700' },
});
