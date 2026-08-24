/**
 * RALLY · Checklist "Para abrir inscripciones"
 *
 * Solo en estado `draft`. Sustituye a cualquier tutorial: enseña qué falta
 * mostrándolo, en vez de explicarlo.
 *
 * Los ítems completos van tachados y en muted; los pendientes, con círculo
 * vacío y en texto normal. La atención se va sola a lo que queda.
 *
 * El juez es RECOMENDADO, no obligatorio (`required: false`): un torneo puede
 * abrir inscripciones semanas antes de tener juez asignado — el juez solo hace
 * falta para capturar resultados. Bloquear el botón por eso impediría un caso
 * legítimo. Aparece sin tachar, pero no frena nada.
 */

import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Icon from '@/components/ui/Icon';
import { color, font, fontSize, gradient, radius, space } from '@/lib/design-tokens';

export interface ItemChecklist {
  label:    string;
  subtitle?: string;
  done:     boolean;
  /** Si es false, aparece en la lista pero no bloquea la apertura. */
  required: boolean;
}

interface Props {
  items:    ItemChecklist[];
  children: React.ReactNode; // el botón dorado
}

export default function ChecklistApertura({ items, children }: Props) {
  return (
    <View style={s.tarjeta}>
      {/* Barra grad-rule: marca esta tarjeta como la de mayor jerarquía */}
      <LinearGradient
        colors={gradient.rule.colors}
        start={gradient.rule.start}
        end={gradient.rule.end}
        style={s.barra}
      />

      <View style={s.cuerpo}>
        <Text style={s.titulo}>Para abrir inscripciones</Text>

        <View style={s.lista}>
          {items.map((item) => (
            <View key={item.label} style={s.item}>
              <View style={[s.circulo, item.done && s.circuloHecho]}>
                {item.done && <Icon name="check" size={12} color={color.bg} width={2.5} />}
              </View>

              <View style={s.itemTextos}>
                <Text style={[s.itemLabel, item.done && s.itemLabelHecho]}>
                  {item.label}
                  {!item.required && !item.done ? ' · opcional' : ''}
                </Text>
                {item.subtitle ? (
                  <Text style={[s.itemSub, item.done && s.itemSubHecho]}>{item.subtitle}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <Text style={s.explicacion}>
          Al abrirlas, el torneo se vuelve visible para los jugadores y podrán
          inscribirse. Podrás seguir editando la configuración después.
        </Text>

        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    backgroundColor: color.surface,
    borderWidth:     1,
    borderColor:     color.gold,
    borderRadius:    radius.xl,
    overflow:        'hidden',
  },
  barra:  { height: 3, width: '100%' },
  cuerpo: { padding: space[4], gap: space[3] },

  titulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, letterSpacing: 0.3 },

  lista: { gap: space[3] },
  item:  { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },

  circulo: {
    width:          20,
    height:         20,
    borderRadius:   10,
    borderWidth:    1.5,
    borderColor:    color.lineSoft,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    marginTop:      1,
  },
  circuloHecho: { backgroundColor: color.live, borderColor: color.live },

  itemTextos:     { flex: 1, minWidth: 0, gap: 2 },
  itemLabel:      { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  itemLabelHecho: { color: color.muted, textDecorationLine: 'line-through' },
  itemSub:        { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },
  itemSubHecho:   { opacity: 0.6 },

  explicacion: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
});
