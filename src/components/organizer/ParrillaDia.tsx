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
 * EN EL MÓVIL, DOS PALABRAS; EN LA LAPTOP, LOS NOMBRES
 *   La celda decía solo categoría y ronda, y en 390 px es lo correcto: cuatro
 *   nombres por celda hacen la vista ilegible y lo que se busca ahí es la
 *   FORMA del día.
 *
 *   Pero el organizador no trabaja en el móvil el sábado por la tarde: trabaja
 *   en una laptop con la parrilla abierta, y ahí sobran 1400 px para decir
 *   quién juega. Obligarle a abrir una celda para saber si ese 5ª Mixto de las
 *   13:00 es el suyo es hacerle clics que no hacen falta.
 *
 *   Así que la celda crece con la pantalla: ancha enseña las dos parejas y el
 *   marcador cuando lo hay; estrecha sigue como estaba. Los nombres siguen
 *   estando a un toque en el detalle, que es donde se mueve y se corrige.
 *
 * NO HAY FILAS "SIN PARTIDOS"
 *   En una lista había que escribirlo. En una parrilla el hueco ES la celda
 *   vacía, y una franja muerta a media tarde se ve como una columna en blanco.
 *
 * LA COLUMNA DE CANCHAS NO SE MUEVE
 *   Un día de ocho horas mide 1100 px y un móvil tiene 390: la parrilla se
 *   desplaza a lo ancho, y si el número de cancha viaja con ella, al llegar a
 *   las 17:00 hay ocho filas sin etiqueta. Verificado en un viewport de 390 px:
 *   era ilegible.
 *
 *   Por eso son DOS columnas hermanas — la de canchas fuera del scroll, las
 *   horas dentro — y no un `position: sticky`, que solo existe en web. Las
 *   alturas cuadran porque las dos usan las mismas constantes.
 */

import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

import { color, font, fontSize, radius, space } from '@/lib/design-tokens';
import type { FilaCalendario } from '@/lib/calendario-franjas';
import { colorDeCategoria } from '@/lib/color-de-categoria';

/** Ancho de cada columna de hora. Cabe "5A Fuerza / Cuartos" en dos líneas. */
const ANCHO_CELDA = 104;
/** Ancho de la columna fija de canchas. */
const ANCHO_CANCHA = 62;
const ALTO_FILA = 54;

/**
 * A partir de aquí la celda enseña quién juega.
 *
 * 1100 px es una laptop con la ventana entera: por debajo —una tablet, media
 * pantalla, un móvil apaisado— las seis columnas de hora con nombres no caben
 * sin que todo se corte, y una celda con tres textos truncados es peor que una
 * con dos enteros.
 */
const ANCHO_PARA_NOMBRES = 1100;
/**
 * Lo que mide una celda cuando sí caben los nombres y el botón de anotar.
 *
 * MEDIDO CONTRA LA PIZARRA DE UN TORNEO REAL: los nombres completos van en dos
 * líneas con el "vs" en medio, y a 190 px se cortaban a la mitad —"Santiago
 * Vargas / Regina Var…"—, que es peor que no ponerlos. Un nombre y apellido
 * mexicano necesita unos 230 px al tamaño al que se lee de pie.
 */
const ANCHO_CELDA_ANCHA = 248;
const ALTO_FILA_ANCHA = 132;

interface Props {
  /**
   * Fuerza el modo ancho o el estrecho. Sin esto manda el ancho de la ventana.
   * Existe para poder probarlo sin un navegador.
   */
  anchoForzado?: boolean;
  /** Los partidos del día. */
  filas: FilaCalendario[];
  /** Canchas del torneo. Define las filas aunque alguna esté vacía todo el día. */
  canchas: number;
  /** Resaltada: la celda a la que saltó un aviso. */
  resaltado?: string | null;
  onCelda: (fila: FilaCalendario) => void;
  /**
   * Anotar el marcador SIN SALIR DE LA PARRILLA.
   *
   * ► DOS TOQUES ERAN DOS DE MÁS
   *   Tocar la celda abría el detalle y desde ahí se capturaba. En una laptop
   *   con el torneo en marcha eso son dos clics y un diálogo intermedio por
   *   cada marcador, y el organizador anota treinta y uno en una tarde.
   *
   *   El detalle sigue estando: es donde se mueve un partido y donde se ve
   *   todo. Lo que cambia es que anotar —lo que se hace treinta veces— deja de
   *   pasar por él.
   *
   * Solo en modo ancho: en el móvil no cabe un botón dentro de la celda sin
   * comerse los dos textos que la hacen útil.
   */
  onCapturar?: (fila: FilaCalendario) => void;
  /** Si ese partido admite marcador. Sin las dos parejas no hay nada que anotar. */
  sePuedeCapturar?: (fila: FilaCalendario) => boolean;
  /**
   * Las categorías del torneo, en el orden en que las enseña la pantalla. De
   * aquí sale el color de cada una — ver `colorDeCategoria`.
   */
  categorias?: readonly string[];
}

/** 'Cancha 3' → 3. Para ordenar y para colocar en su fila. */
const numeroDeCancha = (etiqueta: string | null): number | null => {
  const m = /(\d+)/.exec(etiqueta ?? '');
  return m ? Number(m[1]) : null;
};

export default function ParrillaDia({
  filas, canchas, resaltado, onCelda, onCapturar, sePuedeCapturar, categorias = [],
  anchoForzado,
}: Props) {
  const { width } = useWindowDimensions();
  const ancha = anchoForzado ?? width >= ANCHO_PARA_NOMBRES;
  const anchoCelda = ancha ? ANCHO_CELDA_ANCHA : ANCHO_CELDA;
  const altoFila = ancha ? ALTO_FILA_ANCHA : ALTO_FILA;

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
      <View style={s.fila}>
        {/* Columna fija: los números de cancha. Fuera del scroll a propósito. */}
        <View>
          <View style={[s.celdaCancha, s.cabecera]} />
          {filasCancha.map((n) => {
            const vacia = !rejilla.get(n) || rejilla.get(n)!.size === 0;
            return (
              <View key={n} style={[s.celdaCancha, { height: altoFila }]}>
                <Text style={[s.cancha, vacia && s.canchaLibre]}>{n}</Text>
              </View>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: space[1] }}>
        <View>
          {/* Cabecera de horas */}
          <View style={s.fila}>
            {horas.map((h) => (
              <View key={h} style={[s.celda, s.cabecera, { width: anchoCelda }]}>
                <Text style={s.hora}>{h}</Text>
              </View>
            ))}
          </View>

          {filasCancha.map((n) => {
            const porHora = rejilla.get(n);
            return (
              <View key={n} style={s.fila}>
                {horas.map((h) => {
                  const aqui = porHora?.get(h) ?? [];
                  if (aqui.length === 0) {
                    return <View key={h} style={[s.celda, s.celdaVacia]} />;
                  }
                  // Dos partidos en la misma cancha y hora es un choque real:
                  // se apilan para que se vea, en vez de esconder uno.
                  return (
                    <View key={h} style={[s.celda, { width: anchoCelda, height: altoFila }]}>
                      {aqui.map((f) => (
                        <Pressable
                          key={f.id}
                          onPress={() => onCelda(f)}
                          style={({ pressed }) => [
                            s.partido,
                            // TERMINADO EN VERDE. La parrilla pintaba igual el
                            // partido que ya se jugó y el que falta, así que
                            // saber por dónde va el día obligaba a abrirlos uno
                            // a uno. Es la misma pregunta que el organizador
                            // hace cada media hora.
                            f.estado === 'finished' && s.partidoHecho,
                            aqui.length > 1 && s.partidoChoque,
                            resaltado === f.id && s.partidoResaltado,
                            pressed && { opacity: 0.7 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={
                            `${f.categoria}, ${f.etapa}, cancha ${n}, ${h}` +
                            (f.estado === 'finished' ? ', terminado' : '')
                          }
                        >
                          {/* LA BANDA DE COLOR DE SU CATEGORÍA.
                              Sesenta celdas que dicen "5ª Mixto" obligan a
                              leerlas todas para ver dónde está cada una. Con
                              la banda, la forma del día se ve sin leer. */}
                          <View
                            style={[
                              s.banda,
                              { backgroundColor: colorDeCategoria(f.categoriaId, categorias) },
                            ]}
                          />

                          <View style={s.cabeceraCelda}>
                            <Text
                              style={[s.partidoCat, f.estado === 'finished' && s.partidoCatHecho]}
                              numberOfLines={1}
                            >
                              {f.estado === 'finished' ? '✓ ' : ''}{f.categoria}
                            </Text>
                            {/* EL MARCADOR ARRIBA Y A LA DERECHA, donde se
                                busca: es lo primero que mira el organizador
                                para saber si ese partido ya está. */}
                            {/* LA RONDA, SIEMPRE. Una celda que solo dice
                                "5ª Mixto" no distingue un partido de grupos de
                                la final: en la tarde del torneo eso es
                                exactamente lo que se busca, y en las celdas que
                                aún no tienen parejas es lo ÚNICO que se puede
                                decir. En ancho va en la misma línea que la
                                categoría para no gastar un renglón de nombres;
                                en estrecho no cabe y sigue en el suyo. */}
                            {ancha && <Text style={s.partidoEtapaInline} numberOfLines={1}>{f.etapa}</Text>}
                            {ancha && f.marcador && (
                              <Text style={s.marcador} numberOfLines={1}>{f.marcador}</Text>
                            )}
                          </View>
                          {!ancha && <Text style={s.partidoEtapa} numberOfLines={1}>{f.etapa}</Text>}

                          {/* QUIÉN JUEGA, cuando hay sitio. Sin esto el
                              organizador abre la celda solo para saber si ese
                              "5ª Mixto" de las 13:00 es el que busca. */}
                          {ancha && (f.parejaA || f.parejaB) && (
                            <View style={s.parejas}>
                              {/* LA CORONA EN EL QUE GANÓ. Con el marcador
                                  solo, hay que saber qué pareja va primero
                                  para leer quién ganó; con la corona no hay
                                  que leer nada. */}
                              <Text
                                style={[s.pareja, f.ganadorId === f.parejaAId && s.parejaGana]}
                                numberOfLines={1}
                              >
                                {f.ganadorId === f.parejaAId ? '👑 ' : ''}{f.parejaA ?? '—'}
                              </Text>
                              {/* El "vs" en medio: sin él las dos líneas se
                                  leen como una lista de cuatro personas y hay
                                  que contar para saber quién va con quién. */}
                              <Text style={s.versus}>vs</Text>
                              <Text
                                style={[s.pareja, f.ganadorId === f.parejaBId && s.parejaGana]}
                                numberOfLines={1}
                              >
                                {f.ganadorId === f.parejaBId ? '👑 ' : ''}{f.parejaB ?? '—'}
                              </Text>
                            </View>
                          )}

                          {/* SIN PAREJAS TODAVÍA: el hueco se nombra. Un
                              cuartos que aún no sabe quién lo juega es una
                              celda legítima del día —tiene cancha y hora—, y
                              dejarla medio vacía la hace parecer un error del
                              calendario. */}
                          {ancha && !f.parejaA && !f.parejaB && (
                            <Text style={s.porDefinir}>Por definir</Text>
                          )}

                          {/* ANOTAR, SIN PASAR POR EL DETALLE.
                              Es lo que se hace treinta veces en una tarde; el
                              detalle es para mover, que se hace dos. */}
                          {ancha && onCapturar && sePuedeCapturar?.(f) && (
                            <Pressable
                              onPress={() => onCapturar(f)}
                              style={({ pressed }) => [
                                s.anotar,
                                f.estado === 'finished' && s.anotarHecho,
                                pressed && { opacity: 0.7 },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={
                                (f.estado === 'finished' ? 'Editar el resultado de ' : 'Anotar el resultado de ')
                                + `${f.parejaA ?? ''} contra ${f.parejaB ?? ''}`
                              }
                            >
                              <Text style={s.anotarTexto}>
                                {f.estado === 'finished' ? 'Editar' : 'Anotar'}
                              </Text>
                            </Pressable>
                          )}
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
      </View>

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
    // El borde inferior cuadra la columna fija con las filas de horas, que lo
    // llevan en `celda`. Sin él las dos mitades se desalinean al ojo.
    borderBottomWidth: 1, borderBottomColor: color.lineSoft,
    borderRightWidth: 1, borderRightColor: color.line,
  },
  celda: {
    width: ANCHO_CELDA, height: ALTO_FILA,
    padding: 2,
    borderBottomWidth: 1, borderBottomColor: color.lineSoft,
    borderRightWidth: 1, borderRightColor: color.lineSoft,
  },
  celdaVacia: { backgroundColor: 'transparent' },

  // Las dos parejas, cuando la pantalla da para decirlas.
  // La banda vive pegada al borde izquierdo de la celda, como la pestaña de
  // una carpeta.
  banda: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.sm,
  },
  cabeceraCelda: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },

  parejas: { marginTop: 3, gap: 1 },
  // La ronda cede el ancho antes que la categoría: "5ª Mixto" es lo que
  // identifica la celda, "semifinal" es la segunda pregunta.
  partidoEtapaInline: { flexShrink: 1, fontFamily: font.body, fontSize: 10, color: color.muted },
  porDefinir: { marginTop: 3, fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  // Legible de pie y a medio metro, que es como se mira esto en el club.
  pareja:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.text },
  parejaGana: { color: color.goldBright, fontWeight: '600' },
  versus:  { fontFamily: font.body, fontSize: 9, color: color.muted, marginVertical: 1 },
  marcador: {
    marginLeft: 'auto',
    fontFamily: font.display, fontSize: fontSize.minAbsolute, color: color.live,
  },

  // Discreto a propósito: la parrilla se lee de un vistazo y treinta botones de
  // oro la convertirían en una lista de botones.
  anotar: {
    marginTop: 'auto', alignSelf: 'flex-start',
    paddingHorizontal: space[2], paddingVertical: 2,
    borderRadius: radius.sm, borderWidth: 1, borderColor: color.goldMuted,
  },
  anotarHecho: { borderColor: color.lineSoft },
  anotarTexto: { fontFamily: font.body, fontSize: fontSize.minAbsolute, color: color.gold },

  cabecera: { height: 30, borderBottomWidth: 1, borderBottomColor: color.line, justifyContent: 'center' },
  hora:     { fontFamily: font.display, fontSize: fontSize.caption, color: color.champagne, textAlign: 'center' },

  cancha:      { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  canchaLibre: { color: color.muted },

  partido: {
    flex: 1, backgroundColor: color.surface2, borderRadius: radius.sm,
    // El relleno izquierdo deja sitio a la banda de categoría, que va absoluta
    // pegada al borde: sin él el texto le pasaría por encima.
    paddingLeft: 9, paddingRight: 5, paddingVertical: 3, justifyContent: 'center',
  },
  // `color.live` es el token de "en vivo / victoria / positivo" (Doc D §2.2).
  // El fondo va tenue: la celda es pequeña y un verde sólido taparía el texto.
  partidoHecho:     { backgroundColor: 'rgba(66,214,164,0.14)', borderWidth: 1, borderColor: 'rgba(66,214,164,0.35)' },
  partidoChoque:    { borderWidth: 1, borderColor: color.danger },
  partidoResaltado: { borderWidth: 1.5, borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.14)' },
  partidoCat:       { flexShrink: 0, fontFamily: font.body, fontSize: 11, color: color.text },
  partidoCatHecho:  { color: color.live },
  partidoEtapa:     { fontFamily: font.body, fontSize: 10, color: color.muted },

  vacio:     { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, paddingVertical: space[3] },
  sinCancha: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive },
});
