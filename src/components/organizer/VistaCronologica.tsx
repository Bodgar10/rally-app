/**
 * RALLY · El día completo, franja a franja
 *
 * Vivía dentro de `calendario.tsx`, que solo pintaba el último día. Sale aquí
 * porque el viernes y el sábado —los días de grupos— necesitan exactamente la
 * misma vista, y una segunda copia habría divergido a la primera corrección.
 *
 * DOS COSAS QUE NO SON DECORACIÓN
 *   · Las franjas vacías se muestran. Ver el hueco es el valor: en Cimepa el
 *     viernes de 14:00 a 17:00 trabajaron 3 de 8 canchas y nadie lo supo.
 *   · Cada franja dice cuántas canchas ocupa de las que hay. "3 partidos" no
 *     significa nada sin saber si había 4 canchas o 12.
 *
 *   Los partidos seguidos de la misma categoría y ronda van plegados en un
 *   bloque: ocho octavos de 5ª Fuerza a la misma hora eran ocho tarjetas
 *   idénticas que llenaban la pantalla sin decir nada que no dijera una.
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { color, font, fontSize, radius, space } from '@/lib/design-tokens';
import {
  agruparEnBloques, fraseOcupacion, esHuecoNotable,
  type Franja, type FilaCalendario,
} from '@/lib/calendario-franjas';

export const TEXTO_PENDIENTE = 'Pendiente del resultado anterior';

interface Props {
  franjas: Franja[];
  /** Canchas del torneo. Sin ellas la ocupación se dice sin cociente. */
  canchas: number | null;
  /** Toca un partido. Sin esto, las filas no son pulsables. */
  onPartido?: (fila: FilaCalendario) => void;
}

export default function VistaCronologica({ franjas, canchas, onPartido }: Props) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const alternar = (k: string) => setAbiertos((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <>
      {franjas.map((f) => {
        const hueco = esHuecoNotable(f.ocupadas, canchas);
        return (
          <View key={f.hora} style={s.franja}>
            <View style={s.franjaCabecera}>
              <Text style={[s.franjaHora, f.filas.length === 0 && s.franjaHueca]}>{f.hora}</Text>
              <Text style={[s.ocupacion, hueco && s.ocupacionFloja]}>
                {fraseOcupacion(f.ocupadas, canchas)}
              </Text>
            </View>

            {f.filas.length === 0 ? (
              <Text style={s.hueco}>Sin partidos</Text>
            ) : (
              agruparEnBloques(f.filas).map((b) => {
                const clave = `${f.hora}#${b.clave}`;
                const abierto = abiertos.has(clave);
                const uno = b.filas.length === 1;

                return (
                  <View key={clave} style={s.bloque}>
                    <Pressable
                      onPress={() => !uno && alternar(clave)}
                      disabled={uno}
                      style={({ pressed }) => [s.bloqueCabecera, pressed && !uno && { opacity: 0.8 }]}
                      accessibilityRole={uno ? undefined : 'button'}
                      accessibilityState={uno ? undefined : { expanded: abierto }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.bloqueCat}>{b.categoria}</Text>
                        <Text style={s.bloqueDetalle}>
                          {b.etapa} · {b.filas.length} {b.filas.length === 1 ? 'partido' : 'partidos'} · {b.canchas}
                        </Text>
                      </View>
                      {!uno && <Text style={s.chevron}>{abierto ? '▾' : '▸'}</Text>}
                    </Pressable>

                    {(abierto || uno) && (
                      <View style={s.bloqueCuerpo}>
                        {b.filas.map((p) => (
                          <Pressable
                            key={p.id}
                            onPress={onPartido ? () => onPartido(p) : undefined}
                            disabled={!onPartido}
                            style={({ pressed }) => [s.partido, pressed && onPartido && { opacity: 0.7 }]}
                            accessibilityRole={onPartido ? 'button' : undefined}
                            accessibilityLabel={onPartido
                              ? `Mover ${p.categoria}, ${p.cancha}, ${p.hora}`
                              : undefined}
                          >
                            <Text style={s.partidoCancha}>{p.cancha}</Text>
                            {p.parejaA && p.parejaB ? (
                              <Text style={s.partidoParejas}>{p.parejaA}  vs  {p.parejaB}</Text>
                            ) : (
                              <Text style={s.partidoSinParejas}>{TEXTO_PENDIENTE}</Text>
                            )}
                            {onPartido && <Text style={s.mover}>Mover</Text>}
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        );
      })}
    </>
  );
}

const s = StyleSheet.create({
  franja:         { gap: space[1], marginBottom: space[3] },
  franjaCabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[2] },
  franjaHora:     { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  franjaHueca:    { color: color.muted },
  ocupacion:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  ocupacionFloja: { color: color.alive },

  hueco:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, fontStyle: 'italic', paddingLeft: space[2] },

  bloque:         { backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.lineSoft },
  bloqueCabecera: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2] },
  bloqueCat:      { fontFamily: font.display, fontSize: fontSize.body, color: color.text },
  bloqueDetalle:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  chevron:        { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },

  bloqueCuerpo:      { borderTopWidth: 1, borderTopColor: color.lineSoft, paddingHorizontal: space[3], paddingVertical: space[2], gap: space[1] },
  partido:           { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  partidoCancha:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, minWidth: 74 },
  partidoParejas:    { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  partidoSinParejas: { flex: 1, fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, fontStyle: 'italic' },
  mover:             { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },
});
