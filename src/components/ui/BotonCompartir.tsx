/**
 * src/components/ui/BotonCompartir.tsx
 *
 * RALLY · Mandar algo por WhatsApp.
 *
 * DISCRETO A PROPÓSITO
 *   Un botón de compartir grande y dorado se lee como "difunde nuestra app" y
 *   es justo lo que hace que nadie lo toque. Este es una línea de texto al pie
 *   de la tarjeta: quien quiere presumir lo encuentra, y a quien no le interesa
 *   no le estorba.
 *
 * SI NO SE PUEDE COMPARTIR, NO SE ENSEÑA
 *   `Share` existe en todas las plataformas donde corre la app, pero en web
 *   depende del navegador. Si falla, se calla — un botón que no hace nada es
 *   peor que no tenerlo.
 */

import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text } from 'react-native';
import type { TarjetaCompartible } from '@/lib/tarjetas-compartibles';
import { color, font, fontSize, space, touchTarget } from '@/lib/design-tokens';

export interface BotonCompartirProps {
  tarjeta: TarjetaCompartible | null;
  /** El texto del enlace. Por defecto, "Compartir". */
  etiqueta?: string;
}

export function BotonCompartir({ tarjeta, etiqueta = 'Compartir' }: BotonCompartirProps) {
  const [oculto, setOculto] = useState(false);

  if (!tarjeta || oculto) return null;

  async function compartir() {
    try {
      await Share.share({ message: tarjeta!.mensaje, title: tarjeta!.titulo });
    } catch {
      // El sistema no pudo abrir el diálogo. Se esconde el botón en vez de
      // enseñar un error: no es una tarea que el jugador estuviera intentando
      // terminar, y un aviso aquí sería ruido por algo que da igual.
      setOculto(true);
    }
  }

  return (
    <Pressable onPress={compartir} accessibilityRole="button" style={s.boton}>
      <Text style={s.texto}>{etiqueta}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  boton: { minHeight: touchTarget, justifyContent: 'center', paddingTop: space[1] },
  texto: {
    color: color.goldBright,
    fontFamily: font.body,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
});

export default BotonCompartir;
