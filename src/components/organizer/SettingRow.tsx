/**
 * RALLY · Fila de ajuste
 *
 * Todo lo que NAVEGA en el panel del organizador usa esta forma: ícono, título,
 * valor actual debajo en muted, y chevron. Abre otra pantalla, se guarda allí,
 * y se regresa.
 *
 * Es la mitad del principio de diseño: si algo lleva chevron, navega; si es un
 * botón dorado, ejecuta. Nunca al revés.
 *
 * `disabled` deja la fila visible pero sin chevron ni respuesta al toque: se
 * usa para las filas cuya pantalla de destino todavía no existe (fase 1). El
 * valor sí se muestra, porque leerlo ya es útil aunque no se pueda editar.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';

import Icon, { type IconName } from '@/components/ui/Icon';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

interface Props {
  icon:       IconName;
  title:      string;
  /** Valor actual. Es lo que convierte la fila en información, no solo en enlace. */
  value?:     string;
  /** Tinte del ícono. `color.alive` para señalar que falta algo. */
  iconColor?: string;
  /** Contador a la derecha, antes del chevron. */
  badge?:     string;
  onPress?:   () => void;
  disabled?:  boolean;
}

export default function SettingRow({
  icon, title, value, iconColor, badge, onPress, disabled = false,
}: Props) {
  const inerte = disabled || !onPress;

  const contenido = (
    <>
      <View style={s.icono}>
        <Icon name={icon} size={20} color={iconColor ?? (inerte ? color.muted : color.champagne)} />
      </View>

      <View style={s.textos}>
        <Text style={[s.titulo, inerte && s.tituloInerte]}>{title}</Text>
        {value ? <Text style={s.valor}>{value}</Text> : null}
      </View>

      {badge ? (
        <View style={s.badge}>
          <Text style={s.badgeTexto}>{badge}</Text>
        </View>
      ) : null}

      {!inerte && <Icon name="chevron" size={18} color={color.muted} />}
    </>
  );

  if (inerte) {
    return (
      <View style={[s.fila, s.filaInerte]} accessibilityState={{ disabled: true }}>
        {contenido}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.fila, pressed && s.filaPulsada]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}. ${value}` : title}
    >
      {contenido}
    </Pressable>
  );
}

const s = StyleSheet.create({
  fila: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               space[3],
    minHeight:         touchTarget + 12,
    paddingHorizontal: space[4],
    paddingVertical:   space[3],
    backgroundColor:   color.surface,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
  },
  filaPulsada: { backgroundColor: color.surface2 },
  filaInerte:  { opacity: 0.55 },

  icono:  { width: 24, alignItems: 'center', flexShrink: 0 },
  textos: { flex: 1, minWidth: 0, gap: 2 },

  titulo:       { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  tituloInerte: { color: color.muted },
  valor:        { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  badge: {
    backgroundColor:   color.surface2,
    borderWidth:       1,
    borderColor:       color.line,
    borderRadius:      radius.pill,
    paddingHorizontal: space[2],
    paddingVertical:   2,
    flexShrink:        0,
  },
  badgeTexto: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.champagne },
});
