/**
 * RALLY · Selector de pestañas dentro de una pantalla
 *
 * POR QUÉ UNO NUEVO
 *   `Tabs` de expo-router es la navegación inferior, a nivel de RUTA: no sirve
 *   para partir el contenido de una pantalla. `PillChip` (ranking) es una
 *   insignia de solo lectura. No había nada reutilizable, así que esto es el
 *   idioma que el proyecto ya usa para lo horizontal —ScrollView + Pressable—
 *   convertido en componente para que no se reinvente en la siguiente pantalla.
 */

import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

export interface Pestana {
  id: string;
  etiqueta: string;
  /** Número al lado del nombre: partidos, parejas, lo que cuente. */
  cuenta?: number;
}

export interface SelectorPestanasProps {
  pestanas: Pestana[];
  activa: string;
  onCambiar: (id: string) => void;
}

export default function SelectorPestanas({ pestanas, activa, onCambiar }: SelectorPestanasProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.fila}
      // Sin esto el ScrollView horizontal se estira a lo alto y empuja el
      // contenido de debajo.
      style={s.contenedor}
    >
      {pestanas.map((p) => {
        const sel = p.id === activa;
        return (
          <Pressable
            key={p.id}
            onPress={() => onCambiar(p.id)}
            style={({ pressed }) => [s.pestana, sel && s.activa, pressed && { opacity: 0.75 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={p.etiqueta}
          >
            <Text style={[s.texto, sel && s.textoActivo]} numberOfLines={1}>
              {p.etiqueta}
            </Text>
            {p.cuenta !== undefined && (
              <Text style={[s.cuenta, sel && s.cuentaActiva]}>{p.cuenta}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  contenedor: { flexGrow: 0 },
  fila:       { gap: space[2], paddingVertical: space[1] },

  pestana: {
    flexDirection: 'row', alignItems: 'center', gap: space[1],
    minHeight: touchTarget * 0.8,
    paddingHorizontal: space[3],
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: color.line,
    backgroundColor: color.surface,
  },
  activa: { backgroundColor: color.gold, borderColor: color.gold },

  texto:       { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  textoActivo: { fontFamily: font.display, color: color.bg },

  cuenta:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.7 },
  cuentaActiva: { color: color.bg, opacity: 0.7 },
});
