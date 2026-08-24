/**
 * RALLY · Calendario de rango
 *
 * Componente propio, sin librería. La aritmética de fechas vive en
 * @/lib/fechas y las reglas de selección en @/lib/rango-fechas, ambas con
 * tests; aquí solo queda la rejilla y los estilos.
 *
 * CONTINUIDAD DEL RANGO
 *   Los días intermedios llevan un fondo dorado translúcido SIN radio y que
 *   ocupa la celda entera, para que la barra se lea de corrido. Los extremos
 *   pintan además media banda hacia el interior, de modo que el círculo dorado
 *   conecta con la barra en vez de flotar separado. Por eso las celdas no
 *   tienen separación horizontal: cualquier hueco cortaría la barra.
 *
 * CONTROLADO
 *   No guarda estado propio más allá del mes visible. El rango entra por props
 *   y sale por `onChange`, para que la pantalla sea la dueña del dato.
 */

import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import Icon from '@/components/ui/Icon';
import {
  rejillaMes, sumarMeses, formatearMesAnio, formatearConDia,
  aFechaISO, parseFechaISO, compararPorDia, hoy,
  INICIALES_SEMANA,
} from '@/lib/fechas';
import {
  tocarDia, posicionEnRango, type RangoSeleccion,
} from '@/lib/rango-fechas';
import { color, font, fontSize, gradient, radius, space, touchTarget } from '@/lib/design-tokens';

interface Props {
  valor:     RangoSeleccion;
  onChange:  (r: RangoSeleccion) => void;
  /**
   * Bloquea los días anteriores a hoy. `true` al CREAR un torneo (no tiene
   * sentido programar algo en el pasado); `false` al EDITAR uno existente,
   * donde el organizador puede estar corrigiendo un dato de un torneo ya
   * jugado.
   */
  bloquearPasado?: boolean;
}

export default function CalendarioRango({ valor, onChange, bloquearPasado = false }: Props) {
  // El mes visible arranca en el inicio ya elegido, para que al reabrir el
  // calendario se vea el rango en vez de tener que navegar hasta él.
  const [visible, setVisible] = useState(() => {
    const d = parseFechaISO(valor.inicio) ?? new Date();
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });

  const celdas = useMemo(() => rejillaMes(visible.anio, visible.mes), [visible]);
  const limite = useMemo(() => (bloquearPasado ? hoy() : null), [bloquearPasado]);

  function irA(delta: number) {
    setVisible((v) => sumarMeses(v.anio, v.mes, delta));
  }

  return (
    <View style={s.raiz}>
      {/* ── Calendario ───────────────────────────────────────── */}
      <View style={s.tarjeta}>
        {/* Cabecera con navegación de mes */}
        <View style={s.cabecera}>
          <Pressable
            onPress={() => irA(-1)}
            style={s.flecha}
            accessibilityRole="button"
            accessibilityLabel="Mes anterior"
            hitSlop={8}
          >
            <View style={s.flechaIzq}>
              <Icon name="chevron" size={18} color={color.champagne} />
            </View>
          </Pressable>

          <Text style={s.mesAnio}>{formatearMesAnio(visible.anio, visible.mes)}</Text>

          <Pressable
            onPress={() => irA(1)}
            style={s.flecha}
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
            hitSlop={8}
          >
            <Icon name="chevron" size={18} color={color.champagne} />
          </Pressable>
        </View>

        {/* L M M J V S D */}
        <View style={s.semana}>
          {INICIALES_SEMANA.map((inicial, i) => (
            <View key={i} style={s.celda}>
              <Text style={s.inicial}>{inicial}</Text>
            </View>
          ))}
        </View>

        {/* Rejilla 6×7 */}
        <View style={s.rejilla}>
          {celdas.map((celda) => {
            const iso      = aFechaISO(celda.fecha);
            const posicion = posicionEnRango(iso, valor);
            const pasado   = limite !== null && compararPorDia(celda.fecha, limite) < 0;
            const inerte   = !celda.delMes || pasado;

            const esExtremo = posicion === 'inicio' || posicion === 'fin' || posicion === 'unico';

            return (
              <Pressable
                key={iso}
                style={s.celda}
                disabled={inerte}
                onPress={() => onChange(tocarDia(valor, iso))}
                accessibilityRole="button"
                accessibilityLabel={formatearConDia(iso)}
                accessibilityState={{ disabled: inerte, selected: esExtremo }}
              >
                {/* Banda del rango — va DEBAJO del círculo y sin radio, para
                    que los días intermedios formen una barra continua. */}
                {posicion === 'intermedio' && <View style={s.banda} />}
                {posicion === 'inicio'     && <View style={[s.banda, s.bandaDerecha]} />}
                {posicion === 'fin'        && <View style={[s.banda, s.bandaIzquierda]} />}

                {esExtremo ? (
                  <LinearGradient
                    colors={gradient.gold.colors}
                    start={gradient.gold.start}
                    end={gradient.gold.end}
                    style={s.circulo}
                  >
                    <Text style={s.diaExtremo}>{celda.fecha.getDate()}</Text>
                  </LinearGradient>
                ) : (
                  <Text
                    style={[
                      s.dia,
                      !celda.delMes && s.diaOtroMes,
                      pasado && celda.delMes && s.diaPasado,
                    ]}
                  >
                    {celda.fecha.getDate()}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Resumen Inicio / Fin ─────────────────────────────── */}
      <View style={s.resumen}>
        <View style={[s.resumenTarjeta, valor.inicio && s.resumenTarjetaLlena]}>
          <Text style={s.resumenLabel}>Inicio</Text>
          <Text style={[s.resumenValor, !valor.inicio && s.resumenVacio]}>
            {valor.inicio ? formatearConDia(valor.inicio) : 'Elige un día'}
          </Text>
        </View>

        <View style={[s.resumenTarjeta, valor.fin && s.resumenTarjetaLlena]}>
          <Text style={s.resumenLabel}>Fin</Text>
          <Text style={[s.resumenValor, !valor.fin && s.resumenVacio]}>
            {valor.fin ? formatearConDia(valor.fin) : 'Elige un día'}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** 100/7 con decimales: sin esto la última columna se desalinea. */
const ANCHO_CELDA = `${100 / 7}%` as const;

const s = StyleSheet.create({
  raiz: { gap: space[3] },

  tarjeta: {
    backgroundColor: color.surface,
    borderWidth:     1,
    borderColor:     color.lineSoft,
    borderRadius:    radius.lg,
    paddingVertical: space[3],
    overflow:        'hidden',
  },

  cabecera: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: space[3],
    marginBottom:      space[3],
  },
  flecha: {
    width:          touchTarget,
    height:         touchTarget,
    alignItems:     'center',
    justifyContent: 'center',
  },
  // El chevron apunta a la derecha; se voltea para el mes anterior.
  flechaIzq: { transform: [{ scaleX: -1 }] },
  mesAnio: {
    fontFamily:    font.display,
    fontSize:      fontSize.cardName,
    color:         color.text,
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },

  semana:  { flexDirection: 'row' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },

  // Sin gap horizontal: cualquier hueco cortaría la barra del rango.
  celda: {
    width:          ANCHO_CELDA,
    aspectRatio:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },

  inicial: {
    fontFamily:    font.display,
    fontSize:      fontSize.caption,
    color:         color.muted,
    letterSpacing: 0.5,
  },

  banda: {
    position:        'absolute',
    top:             0,
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  // Media banda hacia el interior, para que el círculo conecte con la barra.
  bandaDerecha:   { left: '50%' },
  bandaIzquierda: { right: '50%' },

  circulo: {
    width:          '78%',
    aspectRatio:    1,
    borderRadius:   999,
    alignItems:     'center',
    justifyContent: 'center',
  },

  dia:        { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  diaOtroMes: { color: color.muted, opacity: 0.35 },
  diaPasado:  { color: color.muted, opacity: 0.4 },
  diaExtremo: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '700', color: color.onGold },

  resumen: { flexDirection: 'row', gap: space[2] },
  resumenTarjeta: {
    flex:            1,
    backgroundColor: color.surface,
    borderWidth:     1,
    borderColor:     color.lineSoft,
    borderRadius:    radius.md,
    padding:         space[3],
    gap:             2,
  },
  resumenTarjetaLlena: { borderColor: color.line },
  resumenLabel: {
    fontFamily:    font.display,
    fontSize:      fontSize.eyebrow,
    color:         color.champagne,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  resumenValor: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  resumenVacio: { color: color.muted, fontFamily: font.body, fontSize: fontSize.body },
});
