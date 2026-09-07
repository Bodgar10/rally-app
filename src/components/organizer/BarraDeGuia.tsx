/**
 * RALLY · La barra de la guía activa
 *
 * Se pinta abajo, sobre la pantalla, y dice el paso que toca. Vive en el layout
 * junto a la interrogación: si viviera dentro de cada pantalla habría que
 * acordarse de ponerla trece veces, y la mitad de las veces se olvidaría.
 *
 * SE ABANDONA POR PANTALLA, NO POR TIEMPO. Si la ruta actual no es la del paso
 * pendiente, la guía se apaga sola: el usuario se fue a otro sitio y seguir
 * hablándole de Fechas desde una barra fija sería ruido. Ver
 * `@/lib/guia-organizador` para por qué esto no puede quedarse colgado.
 *
 * El apagado va en un efecto y no en el render porque cambia estado global:
 * hacerlo mientras React pinta es exactamente el aviso de "cannot update a
 * component while rendering a different component".
 */

import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';

import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { terminarGuia } from '@/lib/guia-store';
import { useGuiaEnPantalla } from '@/hooks/useGuiaEnPantalla';

/**
 * Lo que hay que dejarle libre abajo al contenido mientras hay guía.
 *
 * El layout lo usa como `paddingBottom`. Sin esto la barra tapaba el botón que
 * el último paso pide pulsar — ver `useGuiaEnPantalla`.
 */
export const ALTO_BARRA_GUIA = 76;

export default function BarraDeGuia() {
  const situacion = useGuiaEnPantalla();

  const acabo = situacion !== null && situacion.tipo !== 'paso';
  useEffect(() => {
    if (acabo) terminarGuia();
  }, [acabo]);

  if (!situacion || situacion.tipo !== 'paso') return null;

  return (
    <View style={s.barra} accessibilityLiveRegion="polite">
      <View style={s.textos}>
        <Text style={s.contador}>
          Paso {situacion.numero} de {situacion.total}
        </Text>
        <Text style={s.texto}>{situacion.paso.texto}</Text>
      </View>

      <Pressable
        onPress={terminarGuia}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Salir de la guía"
        style={({ pressed }) => [s.cerrar, pressed && { opacity: 0.7 }]}
      >
        <Text style={s.cerrarSigno}>✕</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  barra: {
    position: 'absolute',
    left: space[4],
    // A la izquierda de la interrogación flotante, que ocupa la esquina.
    right: space[4] + touchTarget + space[3],
    bottom: Platform.OS === 'web' ? space[2] : space[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.gold,
    borderRadius: radius.lg,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 10px rgba(0,0,0,0.45)' }
      : { elevation: 4 }),
  },
  // minWidth: 0 en el lado que crece, o el texto largo empuja la ✕ fuera.
  textos: { flex: 1, minWidth: 0, gap: 2 },
  contador: {
    fontFamily: font.body, fontSize: 10, color: color.gold,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  texto: {
    fontFamily: font.body, fontSize: fontSize.caption,
    color: color.text, lineHeight: 18,
  },
  cerrar: { padding: 4 },
  cerrarSigno: { color: color.muted, fontSize: 14 },
});
