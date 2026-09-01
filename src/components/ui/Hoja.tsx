/**
 * RALLY · Hoja
 *
 * La hoja genérica del proyecto: cabecera con título, cuerpo scrolleable y
 * cierre. Es `HojaAyuda` sin su contenido cableado — misma forma, mismos
 * umbrales, mismo comportamiento en ancho y en angosto — para lo que no son
 * párrafos de ayuda.
 *
 * POR QUÉ EXISTE
 *   La captura de resultado se montaba con un `<Modal presentationStyle=
 *   "pageSheet">` propio en DOS sitios (la pantalla del juez y la de grupos),
 *   cada uno con su cabecera a mano. En web eso no es una hoja: `pageSheet` es
 *   una prop de iOS y react-native-web la ignora, así que el modal se comía la
 *   ventana entera de borde a borde. En un móvil, además, el contenido quedaba
 *   por debajo del pliegue sin manera de llegar a él.
 *
 *   Aquí la hoja es una sola cosa: tarjeta centrada sobre un velo en pantalla
 *   ancha, hoja de altura acotada en angosto, y SIEMPRE con el cuerpo dentro de
 *   un ScrollView que llega hasta el final.
 *
 * ANCHO
 *   `ancho` deja elegir la medida de la tarjeta en escritorio. La ayuda usa una
 *   columna de lectura estrecha; un formulario con marcador y nombres necesita
 *   más. No es un número mágico por pantalla: son dos medidas nombradas.
 */

import {
  Modal, View, Text, Pressable, ScrollView, Platform, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { color, font, fontSize, radius, space, touchTarget, layout } from '@/lib/design-tokens';

/** Medida de lectura: párrafos seguidos, ~75 caracteres por línea. */
export const HOJA_LECTURA = 600;

/** Medida de formulario: dos columnas de marcador con sus nombres al lado. */
export const HOJA_FORMULARIO = 720;

export interface HojaProps {
  visible: boolean;
  onClose: () => void;
  /** Línea pequeña en versalitas sobre el título. */
  eyebrow?: string;
  titulo: string;
  /** Bajo el título, dentro de la cabecera fija. Contexto que no scrollea. */
  subtitulo?: React.ReactNode;
  ancho?: number;
  children: React.ReactNode;
}

export default function Hoja({
  visible,
  onClose,
  eyebrow,
  titulo,
  subtitulo,
  ancho = HOJA_LECTURA,
  children,
}: HojaProps) {
  const { width } = useWindowDimensions();

  // Mismo umbral que WebShell y HojaAyuda: si el proyecto ya llama "ancho" a
  // >= 900, esto no inventa otra frontera.
  const esAncha = width >= layout.desktopBreakpoint;

  const contenido = (
    <>
      <View style={s.cabecera}>
        <View style={{ flex: 1, gap: 2 }}>
          {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
          <Text style={s.titulo} numberOfLines={2}>{titulo}</Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [s.cerrar, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        >
          <Text style={s.cerrarSigno}>✕</Text>
        </Pressable>
      </View>

      {subtitulo ? <View style={s.subtitulo}>{subtitulo}</View> : null}

      {/* `keyboardShouldPersistTaps`: sin esto, en un formulario el primer
          toque solo cierra el teclado y el botón no recibe nada — el juez
          tiene que tocar dos veces y parece que la app no responde. */}
      <ScrollView
        contentContainerStyle={s.cuerpo}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </>
  );

  if (esAncha) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={s.velo} onPress={onClose} accessibilityLabel="Cerrar">
          {/* Come el toque para que pulsar DENTRO no cierre la hoja. */}
          <Pressable style={[s.tarjeta, { maxWidth: ancho }]} onPress={() => {}}>
            {contenido}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // ── Angosto (incluida la web móvil, que es donde captura el juez) ─────────
  //
  // `transparent` + hoja al fondo, NO `presentationStyle="pageSheet"`: esa prop
  // solo hace algo en iOS nativo, y en web dejaba el modal a pantalla completa
  // sin bordes ni forma de ver qué había debajo.
  //
  // `maxHeight: '85%'` y no `flex: 1`: deja ver un dedo de la pantalla de atrás
  // —que es lo que dice "esto es una hoja, se cierra"— y, sobre todo, obliga al
  // ScrollView interior a hacerse cargo del desbordamiento en vez de estirar la
  // hoja fuera de la ventana. Ese estiramiento era el motivo de que en móvil el
  // botón de confirmar quedara fuera de alcance.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.veloAbajo}>
        <Pressable style={s.zonaCierre} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={s.hojaAbajo}>{contenido}</View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  velo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[4],
  },
  tarjeta: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },

  veloAbajo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  /** El hueco de arriba también cierra: es el gesto que ya espera cualquiera. */
  zonaCierre: { flex: 1, minHeight: space[6] },
  hojaAbajo: {
    maxHeight: '85%',
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.line,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },

  cabecera: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space[3],
    paddingHorizontal: space[4],
    paddingTop: Platform.OS === 'ios' ? space[4] : space[3],
    paddingBottom: space[3],
    borderBottomWidth: 1, borderBottomColor: color.line,
  },
  eyebrow: {
    fontFamily: font.display, fontSize: 10, letterSpacing: 1.6,
    color: color.champagne, textTransform: 'uppercase',
  },
  titulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  cerrar: {
    backgroundColor: color.surface, borderRadius: radius.md,
    minWidth: touchTarget * 0.8, minHeight: touchTarget * 0.8,
    alignItems: 'center', justifyContent: 'center',
  },
  cerrarSigno: { color: color.muted, fontSize: 16 },

  subtitulo: {
    paddingHorizontal: space[4], paddingVertical: space[3],
    borderBottomWidth: 1, borderBottomColor: color.lineSoft,
  },

  cuerpo: { padding: space[4], paddingBottom: space[6], gap: space[3] },
});
