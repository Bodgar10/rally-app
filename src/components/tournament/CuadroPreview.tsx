/**
 * RALLY · Vista previa del cuadro de eliminatorias
 *
 * El bracket ANTES de que existan los partidos: cajas vacías con la
 * procedencia de cada clasificado ("1º A", "2º mejor") y sus conectores.
 *
 * POR QUÉ ANTES Y NO DESPUÉS
 *   El organizador decide si cierra inscripciones mirando un texto — "pasan los
 *   5 primeros y los 3 mejores segundos" — que describe una estructura que no
 *   puede ver. Dibujarla convierte una frase en algo que se comprueba de un
 *   vistazo: cuántas rondas hay, quién entra dónde, si el cuadro está lleno.
 *
 *   Cuando exista LiveBracket (los partidos reales, con marcadores y Realtime),
 *   este sigue siendo la versión "antes de que empiece". No compiten.
 *
 * DE DÓNDE SALE LA PROCEDENCIA
 *   `computeSeeding` (src/lib/engine/seeding) hace la siembra real con los
 *   ratings de las parejas, que aquí todavía no existen. Este componente NO la
 *   replica: dibuja el esqueleto en orden de siembra estándar (1 vs Q, 2 vs
 *   Q−1…), que es la forma del cuadro, no su contenido. Si algún día divergen,
 *   manda el motor.
 */

import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export interface CuadroPreviewProps {
  /** Tamaño del cuadro. Siempre potencia de 2. */
  Q: number;
  /** Cuántos grupos alimentan el cuadro. */
  grupos: number;
  /** 1 o 2 clasificados directos por grupo. */
  advancePerGroup: number;
  /** Repescados de la posición advancePerGroup+1. */
  repescados: number;
}

// ── Medidas ─────────────────────────────────────────────────────────────────

const CAJA_ANCHO = 104;
const CAJA_ALTO  = 30;
const HUECO_V    = 10;   // entre cajas hermanas de la primera ronda
const HUECO_H    = 34;   // ancho del conector entre columnas

/**
 * El nombre sale del NÚMERO DE CAJAS de la columna, no de su índice: 8 cajas
 * son ocho parejas jugando cuartos, 4 son las semifinalistas. Así la última
 * columna, de una sola caja, es el campeón.
 */
const NOMBRE_RONDA: Record<number, string> = {
  32: 'Treintaidosavos',
  16: 'Octavos',
  8:  'Cuartos',
  4:  'Semifinales',
  2:  'Final',
  1:  'Campeón',
};

/** Letra de grupo: A, B, C… y AA en adelante por si hay más de 26. */
function letraGrupo(i: number): string {
  return i < 26
    ? String.fromCharCode(65 + i)
    : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}

/**
 * De dónde sale cada uno de los Q clasificados, en orden de siembra.
 *
 * Primero los primeros de grupo, luego los segundos directos (si pasan 2 por
 * grupo) y al final los repescados. Es el orden en que el motor los siembra:
 * mejor posición de grupo, mejor seed.
 */
function procedencias(p: CuadroPreviewProps): string[] {
  const salida: string[] = [];
  for (let g = 0; g < p.grupos; g++) salida.push(`1º ${letraGrupo(g)}`);
  if (p.advancePerGroup >= 2) {
    for (let g = 0; g < p.grupos; g++) salida.push(`2º ${letraGrupo(g)}`);
  }
  for (let r = 0; r < p.repescados; r++) {
    salida.push(p.repescados === 1 ? 'Mejor 2º' : `${r + 1}º mejor 2º`);
  }
  // Si el plan no llena el cuadro, el hueco se dibuja: es más honesto que
  // inventar una procedencia.
  while (salida.length < p.Q) salida.push('—');
  return salida.slice(0, p.Q);
}

/**
 * Orden de siembra estándar (serpiente): 1 vs Q, 2 vs Q−1, etc.
 * Mismo algoritmo que `seedOrder` en el motor de siembra.
 */
function ordenSiembra(Q: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < Q) {
    const suma = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) { next.push(s); next.push(suma - s); }
    seeds = next;
  }
  return seeds;
}

export default function CuadroPreview(props: CuadroPreviewProps) {
  const { Q } = props;

  const columnas = useMemo(() => {
    const orden = ordenSiembra(Q);
    const proc  = procedencias(props);

    // Primera columna: los Q clasificados en orden de siembra.
    const primera = orden.map((seed) => proc[seed - 1] ?? '—');

    // Las siguientes son cajas vacías: quién llega ahí depende de quién gane.
    const cols: string[][] = [primera];
    for (let n = Q / 2; n >= 1; n /= 2) cols.push(Array(n).fill(''));
    return cols;
  }, [Q, props]);

  const alturaTotal = Q * CAJA_ALTO + (Q - 1) * HUECO_V;
  const anchoTotal  = columnas.length * CAJA_ANCHO + (columnas.length - 1) * HUECO_H;

  return (
    <View style={s.raiz}>
      {/* Scroll horizontal: un cuadro de 16 no cabe en un teléfono, y
          comprimirlo lo volvería ilegible. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: anchoTotal, height: alturaTotal + 22 }}>

          {/* Cabeceras de ronda */}
          <View style={s.cabeceras}>
            {columnas.map((col, i) => (
              <Text
                key={i}
                style={[s.cabecera, { width: CAJA_ANCHO, marginRight: i < columnas.length - 1 ? HUECO_H : 0 }]}
                numberOfLines={1}
              >
                {NOMBRE_RONDA[col.length] ?? ''}
              </Text>
            ))}
          </View>

          {/* Conectores, debajo de las cajas para que no las tapen */}
          <Svg
            width={anchoTotal} height={alturaTotal}
            style={{ position: 'absolute', top: 22, left: 0 }}
          >
            {columnas.slice(0, -1).map((col, ci) => {
              const paso = alturaTotal / col.length;
              const x1 = (ci + 1) * CAJA_ANCHO + ci * HUECO_H;
              const x2 = x1 + HUECO_H;
              return col.map((_, fi) => {
                if (fi % 2 !== 0) return null;
                const yA = fi * paso + paso / 2;
                const yB = (fi + 1) * paso + paso / 2;
                const yM = (yA + yB) / 2;
                return (
                  <Path
                    key={`${ci}-${fi}`}
                    d={`M${x1} ${yA} H${x1 + HUECO_H / 2} V${yM} H${x2} M${x1} ${yB} H${x1 + HUECO_H / 2} V${yM}`}
                    stroke={color.lineSoft}
                    strokeWidth={1}
                    fill="none"
                  />
                );
              });
            })}
          </Svg>

          {/* Cajas */}
          {columnas.map((col, ci) => {
            const paso = alturaTotal / col.length;
            const x = ci * (CAJA_ANCHO + HUECO_H);
            return col.map((texto, fi) => (
              <View
                key={`${ci}-${fi}`}
                style={[
                  s.caja,
                  ci === 0 && !!texto && texto !== '—' && s.cajaLlena,
                  {
                    left: x,
                    top: 22 + fi * paso + paso / 2 - CAJA_ALTO / 2,
                    width: CAJA_ANCHO,
                    height: CAJA_ALTO,
                  },
                ]}
              >
                <Text
                  style={[s.cajaTexto, (!texto || texto === '—') && s.cajaTextoVacio]}
                  numberOfLines={1}
                >
                  {texto || '·'}
                </Text>
              </View>
            ));
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { marginTop: space[2] },

  cabeceras: { flexDirection: 'row', height: 22 },
  cabecera: {
    fontFamily: font.display,
    fontSize: 10,
    color: color.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  caja: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.xs,
    backgroundColor: color.surface2,
    justifyContent: 'center',
    paddingHorizontal: space[2],
  },
  // Solo la primera columna tiene contenido conocido; el resto se llena al
  // jugarse. Distinguirlas evita que parezca que el cuadro ya está resuelto.
  cajaLlena: { borderColor: color.line, backgroundColor: color.surface },

  cajaTexto:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.text },
  cajaTextoVacio: { color: color.muted, opacity: 0.5, textAlign: 'center' },
});
