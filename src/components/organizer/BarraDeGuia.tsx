/**
 * RALLY · La tarjeta de la guía activa
 *
 * Dice el paso que toca, abajo y sobre la pantalla. Vive en el layout junto a
 * la interrogación: si viviera dentro de cada pantalla habría que acordarse de
 * ponerla trece veces, y la mitad de las veces se olvidaría.
 *
 * ES UNA TARJETA, con el lenguaje del resto de la app: esquinas redondeadas,
 * `color.surface`, separada del borde y con la barra de acento en oro. Antes
 * era una franja pegada al borde inferior con borde claro — funcionaba, pero
 * no se parecía a nada de lo que tiene alrededor y se leía como un aviso del
 * sistema en vez de como parte del producto.
 *
 * SE ABANDONA POR PANTALLA, NO POR TIEMPO. Si la ruta actual no es la del paso
 * pendiente, la guía se apaga sola: el usuario se fue a otro sitio y seguir
 * hablándole de Fechas desde una barra fija sería ruido. Ver
 * `@/lib/guia-organizador` para por qué esto no puede quedarse colgado.
 *
 * El apagado va en un efecto y no en el render porque cambia estado global:
 * hacerlo mientras React pinta es exactamente el aviso de "cannot update a
 * component while rendering a different component".
 */

import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { usePathname } from 'expo-router';

import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { terminarGuia, cumplirPaso, avisoDeRelevoVisto, useGuiaActiva } from '@/lib/guia-store';
import { textoDeSituacion, pasoQueSeCumpleAlSalir } from '@/lib/guia-organizador';
import { pantallaDeRuta } from '@/lib/ayuda-organizador';
import { useGuiaEnPantalla } from '@/hooks/useGuiaEnPantalla';

/**
 * Lo que hay que dejarle libre abajo al contenido mientras hay guía.
 *
 * El layout lo usa como `paddingBottom`. Sin esto la barra tapaba el botón que
 * el último paso pide pulsar — ver `useGuiaEnPantalla`.
 */
// Medido a 390px con el peor caso: acento (3) + texto en dos líneas + el
// aviso de relevo + los dos paddings, y el hueco que la separa del borde.
export const ALTO_BARRA_GUIA = 108;

export default function BarraDeGuia() {
  const situacion = useGuiaEnPantalla();

  // ── CUÁNDO SE APAGA ──────────────────────────────────────────────────────
  //
  // 'terminada' apaga siempre: no queda nada que decir.
  const terminada = situacion?.tipo === 'terminada';
  useEffect(() => {
    if (terminada) terminarGuia();
  }, [terminada]);

  // 'fuera' apaga SOLO SI LA RUTA CAMBIÓ, y esto no es un detalle: sin la
  // condición, cumplir el último paso de una pantalla mataba la guía antes de
  // poder pasar a la siguiente.
  //
  //   Guardas las canchas → se cumple el paso 1 → el paso 2 vive en Horarios →
  //   pero todavía estás en Canchas → 'fuera' → guía muerta, y el organizador
  //   nunca se entera de que le faltaba la mitad del dato.
  //
  // Irse es un acto de navegación, así que se mide en la navegación. Mientras
  // la ruta no cambie, 'fuera' solo calla la barra.
  const pathname = usePathname();
  const rutaPrevia = useRef(pathname);
  const fuera = situacion?.tipo === 'fuera';
  const { guia, hechos } = useGuiaActiva();

  useEffect(() => {
    const previa = rutaPrevia.current;
    const cambio = previa !== pathname;
    rutaPrevia.current = pathname;
    if (!cambio) return;

    // UN PASO DE SOLO MIRAR SE CUMPLE AL SALIR de su pantalla. Va ANTES de
    // decidir si se abandonó: irse de un paso que ya estaba satisfecho es
    // terminar la guía, no dejarla tirada.
    if (guia) {
      const visto = pasoQueSeCumpleAlSalir(guia, hechos, pantallaDeRuta(previa));
      if (visto) { cumplirPaso(visto.id); return; }
    }

    if (fuera) terminarGuia();
  }, [pathname, fuera, guia, hechos]);

  // "Dejamos la guía anterior": se dice una vez y se suelta, para que no
  // acompañe a la guía nueva durante toda su vida.
  const { pisoAOtra } = useGuiaActiva();
  useEffect(() => {
    if (!pisoAOtra) return;
    const t = setTimeout(avisoDeRelevoVisto, 6000);
    return () => clearTimeout(t);
  }, [pisoAOtra]);

  const texto = situacion && textoDeSituacion(situacion);
  if (!situacion || !texto || (situacion.tipo !== 'paso' && situacion.tipo !== 'transito')) {
    return null;
  }

  return (
    // TARJETA, NO FRANJA. Antes era una banda pegada al borde inferior con
    // borde claro: no se parecía a nada del resto de la app, que está hecha de
    // tarjetas con esquinas redondeadas separadas del borde. Ahora usa lo
    // mismo — `radius.lg`, `color.surface`, el oro solo para lo activo — y se
    // lee como una tarjeta más, que es lo que es.
    <View
      style={s.tarjeta}
      accessibilityLiveRegion="polite"
    >
      {/* La barra de acento del proyecto: oro para el paso que toca, apagada
          cuando solo se está diciendo por dónde se va. */}
      <View style={[s.acento, situacion.tipo === 'transito' && s.acentoApagado]} />

      <View style={s.cuerpo}>
        <View style={s.textos}>
          <Text style={[s.contador, situacion.tipo === 'transito' && s.contadorApagado]}>
            Paso {situacion.numero} de {situacion.total}
          </Text>
          <Text style={s.texto}>{texto}</Text>
          {pisoAOtra && (
            <Text style={s.relevo}>Dejamos la guía anterior.</Text>
          )}
        </View>

        <Pressable
          onPress={terminarGuia}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Salir de la guía"
          style={({ pressed }) => [s.cerrar, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.cerrarSigno}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    position: 'absolute',
    left: space[4],
    // A la izquierda de la interrogación flotante, que ocupa la esquina.
    right: space[4] + touchTarget + space[3],
    // Separada del borde, como cualquier tarjeta de la app.
    bottom: Platform.OS === 'web' ? space[5] : space[6],
    backgroundColor: color.surface,
    // Borde discreto y ACENTO en oro, que es como el dashboard marca sus
    // tarjetas destacadas. El oro por los cuatro lados competía con el botón
    // dorado de la pantalla, que suele ser justo lo que el paso pide pulsar.
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    // La barra de acento llega hasta el borde redondeado.
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }
      : { elevation: 6 }),
  },

  acento: { height: 3, backgroundColor: color.gold },
  acentoApagado: { backgroundColor: color.line },

  cuerpo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  // minWidth: 0 en el lado que crece, o el texto largo empuja la ✕ fuera.
  textos: { flex: 1, minWidth: 0, gap: 2 },
  contador: {
    fontFamily: font.display, fontSize: 10, color: color.gold,
    textTransform: 'uppercase', letterSpacing: 1.4,
  },
  contadorApagado: { color: color.muted },
  texto: {
    fontFamily: font.body, fontSize: fontSize.caption,
    color: color.text, lineHeight: 18,
  },
  relevo: {
    fontFamily: font.body, fontSize: 11, color: color.muted,
    marginTop: 2,
  },
  cerrar: {
    backgroundColor: color.surface2,
    borderRadius: radius.md,
    padding: 6,
  },
  cerrarSigno: { color: color.muted, fontSize: 14 },
});
