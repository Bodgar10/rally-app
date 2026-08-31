/**
 * RALLY · El día como una pizarra: canchas × horas
 *
 * POR QUÉ UNA PARRILLA Y NO UNA LISTA
 *   La pregunta que hace el organizador es "¿qué pasa el sábado a las 11?".
 *   Una lista vertical no la responde: hay que leerla entera y reconstruir la
 *   hora en la cabeza. Con filas = canchas y columnas = horas, la respuesta es
 *   una columna, y el hueco —la celda vacía— se ve sin leer nada.
 *
 *   Es como se lee un torneo en la pizarra del club. Esa es la prueba: si el
 *   organizador tiene que traducir de la pantalla a su pizarra mental, la
 *   pantalla está mal.
 *
 * LA CELDA DICE DOS PALABRAS, NO CUATRO NOMBRES
 *   Categoría y ronda. Los nombres completos de cuatro personas por celda
 *   hacían la vista ilegible — y no son lo que se busca al mirar el día: se
 *   busca la forma del día. Los nombres están a un toque, en el detalle.
 *
 * NO HAY FILAS "SIN PARTIDOS"
 *   En una lista había que escribirlo. En una parrilla el hueco ES la celda
 *   vacía, y una franja muerta a media tarde se ve como una columna en blanco.
 */

import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';

import { color, font, fontSize, radius, space } from '@/lib/design-tokens';
import type { FilaCalendario } from '@/lib/calendario-franjas';

/** Ancho de cada columna de hora. Cabe "5A Fuerza / Cuartos" en dos líneas. */
const ANCHO_CELDA = 104;
/** Ancho de la columna fija de canchas. */
const ANCHO_CANCHA = 62;
const ALTO_FILA = 54;

interface Props {
  /** Los partidos del día. */
  filas: FilaCalendario[];
  /** Canchas del torneo. Define las filas aunque alguna esté vacía todo el día. */
  canchas: number;
  /** Resaltada: la celda a la que saltó un aviso. */
  resaltado?: string | null;
  onCelda: (fila: FilaCalendario) => void;
}

/** 'Cancha 3' → 3. Para ordenar y para colocar en su fila. */
const numeroDeCancha = (etiqueta: string | null): number | null => {
  const m = /(\d+)/.exec(etiqueta ?? '');
  return m ? Number(m[1]) : null;
};

export default function ParrillaDia({ filas, canchas, resaltado, onCelda }: Props) {
  if (filas.length === 0) {
    return <Text style={s.vacio}>No hay partidos programados este día.</Text>;
  }

  // Las horas que existen, de la primera a la última. Sin rellenar medias
  // horas: si el día va a en punto, meter columnas de :30 vacías es ruido.
  const horas = [...new Set(filas.map((f) => f.hora))].sort();

  // Cancha -> hora -> partidos. Un partido sin cancha reconocible cae en una
  // fila aparte al final en vez de desaparecer, que es lo que hacía antes.
  const rejilla = new Map<string, Map<string, FilaCalendario[]>>();
  const sinCancha: FilaCalendario[] = [];
  for (const f of filas) {
    const n = numeroDeCancha(f.cancha);
    if (n === null) { sinCancha.push(f); continue; }
    const clave = String(n);
    const porHora = rejilla.get(clave) ?? new Map<string, FilaCalendario[]>();
    porHora.set(f.hora, [...(porHora.get(f.hora) ?? []), f]);
    rejilla.set(clave, porHora);
  }

  // Todas las canchas del torneo, aunque alguna no juegue en todo el día: una
  // cancha libre entera es justo lo que hay que ver.
  const usadas = [...rejilla.keys()].map(Number);
  const total = Math.max(canchas, ...(usadas.length ? usadas : [0]));
  const filasCancha = Array.from({ length: total }, (_, i) => String(i + 1));

  return (
    <View style={s.marco}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: space[1] }}>
        <View>
          {/* Cabecera de horas */}
          <View style={s.fila}>
            <View style={[s.celdaCancha, s.cabecera]} />
            {horas.map((h) => (
              <View key={h} style={[s.celda, s.cabecera]}>
                <Text style={s.hora}>{h}</Text>
              </View>
            ))}
          </View>

          {filasCancha.map((n) => {
            const porHora = rejilla.get(n);
            const vacia = !porHora || porHora.size === 0;
            return (
              <View key={n} style={s.fila}>
                <View style={s.celdaCancha}>
                  <Text style={[s.cancha, vacia && s.canchaLibre]}>{n}</Text>
                </View>
                {horas.map((h) => {
                  const aqui = porHora?.get(h) ?? [];
                  if (aqui.length === 0) {
                    return <View key={h} style={[s.celda, s.celdaVacia]} />;
                  }
                  // Dos partidos en la misma cancha y hora es un choque real:
                  // se apilan para que se vea, en vez de esconder uno.
                  return (
                    <View key={h} style={s.celda}>
                      {aqui.map((f) => (
                        <Pressable
                          key={f.id}
                          onPress={() => onCelda(f)}
                          style={({ pressed }) => [
                            s.partido,
                            aqui.length > 1 && s.partidoChoque,
                            resaltado === f.id && s.partidoResaltado,
                            pressed && { opacity: 0.7 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${f.categoria}, ${f.etapa}, cancha ${n}, ${h}`}
                        >
                          <Text style={s.partidoCat} numberOfLines={1}>{f.categoria}</Text>
                          <Text style={s.partidoEtapa} numberOfLines={1}>{f.etapa}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {sinCancha.length > 0 && (
        <Text style={s.sinCancha}>
          {sinCancha.length} {sinCancha.length === 1 ? 'partido' : 'partidos'} sin cancha asignada.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  marco: { gap: space[2] },

  fila:  { flexDirection: 'row' },

  celdaCancha: {
    width: ANCHO_CANCHA, height: ALTO_FILA,
    alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: color.line,
  },
  celda: {
    width: ANCHO_CELDA, height: ALTO_FILA,
    padding: 2,
    borderBottomWidth: 1, borderBottomColor: color.lineSoft,
    borderRightWidth: 1, borderRightColor: color.lineSoft,
  },
  celdaVacia: { backgroundColor: 'transparent' },

  cabecera: { height: 30, borderBottomWidth: 1, borderBottomColor: color.line, justifyContent: 'center' },
  hora:     { fontFamily: font.display, fontSize: fontSize.caption, color: color.champagne, textAlign: 'center' },

  cancha:      { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  canchaLibre: { color: color.muted },

  partido: {
    flex: 1, backgroundColor: color.surface2, borderRadius: radius.sm,
    paddingHorizontal: 5, paddingVertical: 3, justifyContent: 'center',
  },
  partidoChoque:    { borderWidth: 1, borderColor: color.danger },
  partidoResaltado: { borderWidth: 1.5, borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.14)' },
  partidoCat:       { fontFamily: font.body, fontSize: 11, color: color.text },
  partidoEtapa:     { fontFamily: font.body, fontSize: 10, color: color.muted },

  vacio:     { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, paddingVertical: space[3] },
  sinCancha: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive },
});
