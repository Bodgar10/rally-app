/**
 * HojaAyuda
 *
 * Hoja informativa genérica: un título y un cuerpo de párrafos. Nada más.
 *
 * POR QUÉ EXISTE
 *   El panel del organizador no tenía dónde poner una explicación larga. La
 *   ayuda era siempre un `<Text style={s.ayuda}>` fijo debajo del control, que
 *   funciona para una frase y no para cuatro párrafos: o se come la pantalla o
 *   nadie la lee. `ProBenefitsSheet` ya usaba el Modal de React Native, pero
 *   con su contenido dentro y en checkout — no se podía reutilizar.
 *
 *   Modal nativo a propósito: no hace falta ninguna librería para esto.
 *
 * USO
 *   const [ayuda, setAyuda] = useState(false);
 *   <HojaAyuda visible={ayuda} onClose={() => setAyuda(false)}
 *              titulo="Segundos que avanzan" parrafos={[...]} />
 */

import { Modal, View, Text, Pressable, ScrollView, Platform, StyleSheet } from 'react-native';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

export interface HojaAyudaProps {
  visible: boolean;
  onClose: () => void;
  titulo: string;
  /** Un elemento por párrafo. Se separan con aire, no con saltos de línea. */
  parrafos: string[];
}

export default function HojaAyuda({ visible, onClose, titulo, parrafos }: HojaAyudaProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.fondo}>
        <View style={s.cabecera}>
          <Text style={s.eyebrow}>Ayuda</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [s.cerrar, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar la ayuda"
          >
            <Text style={s.cerrarSigno}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.cuerpo} showsVerticalScrollIndicator={false}>
          <Text style={s.titulo}>{titulo}</Text>
          {parrafos.map((p, i) => (
            <Text key={i} style={s.parrafo}>{p}</Text>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * El botón que la abre: una interrogación discreta.
 *
 * Vive aquí y no en el sitio que la usa para que todas las ayudas del panel se
 * vean igual — si cada pantalla se dibuja la suya, en tres sprints hay tres
 * interrogaciones distintas.
 */
export function BotonAyuda({ onPress, etiqueta }: { onPress: () => void; etiqueta: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [s.boton, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
    >
      <Text style={s.botonSigno}>?</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: color.bg },

  cabecera: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space[4],
    paddingTop: Platform.OS === 'ios' ? space[4] : space[3],
    paddingBottom: space[3],
    borderBottomWidth: 1, borderBottomColor: color.line,
  },
  eyebrow: {
    flex: 1,
    fontFamily: font.display, fontSize: 11, letterSpacing: 0.22 * 11,
    color: color.gold, textTransform: 'uppercase',
  },
  cerrar: { backgroundColor: color.surface, borderRadius: radius.md, padding: 6 },
  cerrarSigno: { color: color.muted, fontSize: 16 },

  cuerpo: { padding: space[4], paddingBottom: space[6], gap: space[3] },
  titulo: {
    fontFamily: font.display, fontSize: fontSize.cardName,
    color: color.text, marginBottom: space[1],
  },
  parrafo: {
    fontFamily: font.body, fontSize: fontSize.body,
    color: color.muted, lineHeight: 22,
  },

  // Círculo del tamaño mínimo táctil aunque el trazo se vea pequeño.
  boton: {
    width: touchTarget * 0.55, height: touchTarget * 0.55,
    borderRadius: touchTarget,
    borderWidth: 1, borderColor: color.line,
    alignItems: 'center', justifyContent: 'center',
  },
  botonSigno: {
    fontFamily: font.display, fontSize: fontSize.caption,
    color: color.champagne, lineHeight: fontSize.caption + 2,
  },
});
