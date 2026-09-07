/**
 * RALLY · La tarjeta de un torneo con algo que atender
 *
 * LA MISMA PIEZA PARA LAS DOS FACETAS DE TRABAJO. El organizador y el juez
 * resultaron ser la misma tarjeta con distinto contenido: un rótulo, el torneo,
 * una línea de contexto y UNA cosa que atender. Lo que cambia es quién calcula
 * ese aviso —`torneos-organizador` y `torneos-juez`— y esto solo lo pinta.
 *
 * Las reglas de qué se dice, cuándo se calla y qué significa `urge` viven en
 * `@/lib/tarjeta-de-torneo`, escritas una vez para las dos.
 */

import { View, Text, Pressable } from 'react-native';

import { color, radius, space, font, fontSize } from '@/lib/design-tokens';
import type { AvisoDeTorneo } from '@/lib/tarjeta-de-torneo';

export default function TarjetaDeTorneo({
  eyebrow,
  titulo,
  subtitulo,
  aviso,
  onPress,
  accessibilityLabel,
}: {
  eyebrow?: string;
  titulo: string;
  subtitulo?: string;
  aviso: AvisoDeTorneo | null;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          backgroundColor: color.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          // El borde en oro es la señal de lejos: se ve antes de leer nada.
          borderColor: aviso?.urge ? color.gold : color.line,
          padding: space[4],
          marginBottom: space[2],
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      {/* minWidth: 0 en el lado que crece — sin esto un nombre largo empuja al
          chevron fuera de la tarjeta en web. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? (
            <Text
              style={{
                fontFamily: font.body, fontSize: 10, color: color.muted,
                textTransform: 'uppercase', letterSpacing: 0.6,
                marginBottom: space[1],
              }}
            >
              {eyebrow}
            </Text>
          ) : null}

          <Text
            numberOfLines={2}
            style={{
              fontFamily: font.display, fontSize: fontSize.cardName,
              color: color.text, marginBottom: 2,
            }}
          >
            {titulo}
          </Text>

          {subtitulo ? (
            <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
              {subtitulo}
            </Text>
          ) : null}
        </View>

        <Text style={{ fontFamily: font.body, fontSize: 22, color: color.muted, lineHeight: 24 }}>
          ›
        </Text>
      </View>

      {/* LO QUE HAY QUE ATENDER. En oro cuando hay gente esperando; en gris
          cuando es trabajo normal. Si no hay nada, no se pinta. */}
      {aviso && (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: space[2],
            marginTop: space[3], paddingTop: space[3],
            borderTopWidth: 1, borderTopColor: color.lineSoft,
          }}
        >
          <View
            style={{
              width: 6, height: 6, borderRadius: 3,
              backgroundColor: aviso.urge ? color.gold : color.muted,
            }}
          />
          <Text
            style={{
              flex: 1, minWidth: 0,
              fontFamily: font.body, fontSize: fontSize.caption,
              color: aviso.urge ? color.gold : color.muted,
            }}
          >
            {aviso.texto}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** El rótulo de una sección de trabajo. Mismo peso para las dos facetas. */
export function EtiquetaDeSeccion({ texto }: { texto: string }) {
  return (
    <View style={{ marginTop: space[5], marginBottom: space[2] }}>
      <Text
        style={{
          fontFamily: font.body, fontSize: 11, color: color.muted,
          textTransform: 'uppercase', letterSpacing: 1.2,
        }}
      >
        {texto}
      </Text>
    </View>
  );
}
