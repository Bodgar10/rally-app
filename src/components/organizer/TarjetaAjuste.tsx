/**
 * RALLY · Tarjeta de ajuste del panel del organizador
 *
 * ERA `SettingRow`, UNA FILA. Y una fila es un formato de móvil.
 *   El panel son doce destinos. Apilados a una columna sumaban más de una
 *   pantalla y media, así que el organizador tenía que scrollear para saber qué
 *   había — en un monitor de 1300px donde sobraba sitio a los lados. Y como
 *   cada fila tenía que caber en una línea, el texto se había ido encogiendo:
 *   el valor actual acabó en `caption`, 12px.
 *
 *   La tarjeta apila lo mismo en vertical (ícono, título, valor) en vez de en
 *   horizontal. Eso la hace ESTRECHA, y estrecha significa que caben dos o tres
 *   por fila: el panel entero se ve de una vez y el texto puede crecer en vez
 *   de encoger.
 *
 * SIGUE SIENDO LO QUE ERA
 *   El principio no cambia: si lleva chevron, NAVEGA; si es un botón dorado,
 *   ejecuta. La tarjeta conserva su chevron por eso, aunque en una rejilla
 *   cante menos que en una fila.
 *
 *   `disabled` también: visible, sin chevron y sin respuesta al toque, para los
 *   destinos que todavía no existen. El valor se sigue enseñando, porque leerlo
 *   ya es útil aunque no se pueda editar.
 *
 * EL ANCHO NO LO DECIDE ELLA
 *   La tarjeta crece hasta llenar lo que le den (`flexGrow`) con un mínimo
 *   razonable (`flexBasis`). Quien la coloca decide cuántas columnas hay, y con
 *   `flexWrap` eso lo decide en realidad el ancho de la ventana: una en un
 *   teléfono, tres en un escritorio, sin breakpoints ni saltos.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';

import Icon, { type IconName } from '@/components/ui/Icon';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

/**
 * Ancho mínimo antes de saltar de línea. TRES es el tope, a propósito.
 *
 * Con 270 entraban CUATRO en la columna ancha (1200 menos el padding deja
 * ~1164, y 4×270 + 3 huecos = 1104), y a cuatro cada tarjeta cae a 285px: el
 * título de 17px y el valor a dos líneas empiezan a apretarse, que es justo lo
 * que la tarjeta venía a evitar. Con 300 no caben cuatro (1224 > 1164) y sí
 * tres (916), así que la rejilla topa en tres sin necesidad de un breakpoint.
 *
 * Sigue sin capar el móvil: 300 < los 354 de un iPhone de 390, así que abajo se
 * ve una por fila y a lo ancho.
 */
export const ANCHO_MINIMO_TARJETA = 300;

interface Props {
  icon:       IconName;
  title:      string;
  /** Valor actual. Es lo que convierte la tarjeta en información, no en enlace. */
  value?:     string;
  /** Tinte del ícono. `color.alive` para señalar que falta algo. */
  iconColor?: string;
  /** Contador arriba a la derecha. */
  badge?:     string;
  onPress?:   () => void;
  disabled?:  boolean;
}

export default function TarjetaAjuste({
  icon, title, value, iconColor, badge, onPress, disabled = false,
}: Props) {
  const inerte = disabled || !onPress;

  const contenido = (
    <>
      <View style={s.cabecera}>
        <Icon name={icon} size={22} color={iconColor ?? (inerte ? color.muted : color.champagne)} />
        {badge ? (
          <View style={s.badge}>
            <Text style={s.badgeTexto}>{badge}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.titulos}>
        <Text style={[s.titulo, inerte && s.tituloInerte]} numberOfLines={2}>{title}</Text>
        {!inerte && <Icon name="chevron" size={16} color={color.muted} />}
      </View>

      {/* Dos líneas: los valores largos —"Vie, Sáb y Dom · 34 h", el resumen de
          categorías— se cortaban con puntos suspensivos justo donde estaba el
          dato. En una tarjeta hay alto de sobra para dejarlos respirar. */}
      {value ? <Text style={s.valor} numberOfLines={2}>{value}</Text> : null}
    </>
  );

  if (inerte) {
    return (
      <View style={[s.tarjeta, s.tarjetaInerte]} accessibilityState={{ disabled: true }}>
        {contenido}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.tarjeta, pressed && s.tarjetaPulsada]}
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}. ${value}` : title}
    >
      {contenido}
    </Pressable>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    flexGrow:        1,
    flexBasis:       ANCHO_MINIMO_TARJETA,
    minWidth:        0,
    gap:             space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3.5],
    backgroundColor: color.surface,
    borderWidth:     1,
    borderColor:     color.lineSoft,
    borderRadius:    radius.md,
  },
  tarjetaPulsada: { backgroundColor: color.surface2 },
  tarjetaInerte:  { opacity: 0.55 },

  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },

  titulos: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  // `cardName` (17) y no `body` (14): es el nombre de la tarjeta, y esta
  // pantalla es la portada del torneo. Cabe porque la tarjeta ya no compite
  // con el valor por la misma línea.
  titulo:       { flex: 1, fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  tituloInerte: { color: color.muted },
  // Sube de `caption` (12) a `body` (14): es el dato, no una nota al pie.
  valor:        { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },

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
