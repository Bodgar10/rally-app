/**
 * src/components/player/TuNivel.tsx
 *
 * RALLY · Tu nivel y la curva de cómo has mejorado.
 *
 * ESTO YA ESTABA CALCULADO Y NO SE VEÍA
 *   El cron de Glicko lleva tiempo escribiendo `rating_history`: una fila por
 *   partido, con el rating antes y después. Es exactamente "la gráfica de cómo
 *   he mejorado" que el jugador quiere, ya guardada, y se usaba solo por dentro
 *   para sembrar cuadros. Esta pantalla no calcula nada nuevo: dibuja lo que ya
 *   había.
 *
 * LA DIVISIÓN MANDA SOBRE EL NÚMERO
 *   "1612" no significa nada. "Cuarta fuerza, te faltan 88 puntos para tercera"
 *   sí, porque las divisiones son el idioma en el que ya se inscribe a los
 *   torneos. El número va, pero de acompañante.
 *
 * ► Y SI EL NÚMERO NO ES FIABLE NO SE ENSEÑA
 *   Glicko arranca en 1500 con incertidumbre 350 y el motor no lo da por bueno
 *   hasta que baja de 100. Con tres partidos, ese 1500 es el valor de fábrica.
 *   Enseñarlo como nivel sería inventar precisión, y el jugador lo descubre el
 *   día que pierde contra alguien "de su nivel". Mientras tanto se dice lo que
 *   hay —"todavía te estamos midiendo"— y se cuentan sus partidos, que además
 *   le da un motivo para jugar más.
 *
 * QUÉ SE VE SIN PAGAR Y QUÉ NO
 *   Gratis va la DIVISIÓN —"Tercera fuerza"—, porque es identidad y es lo que
 *   engancha: el jugador se reconoce ahí. De pago van el número, la curva y
 *   los tres datos de abajo, que es lo que de verdad cuesta construir y lo que
 *   se vuelve más valioso cuanto más juega.
 *
 *   La división se regala a propósito y no por generosidad: enseñar el marco
 *   vacío es lo que hace que quiera ver lo que falta. Un bloque entero
 *   bloqueado no se mira, se salta.
 *
 * LA CURVA NO SE SUAVIZA
 *   Se dibuja partido a partido, con sus bajadas. Una línea limpia que solo
 *   sube sería más bonita y sería mentira: el valor de esta gráfica es que el
 *   jugador reconozca el fin de semana en que se hundió.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { leerNivelYCurva, type NivelYCurva } from '@/lib/nivel-jugador-datos';
import { leerSuscripcion } from '@/lib/suscripcion-datos';
import {
  CURVA_ALTO,
  CURVA_ANCHO,
  areaDeCurva,
  numeroVisible,
  pathDeCurva,
  textoDeCambio,
  textoDeNivel,
  textoDeSiguientePaso,
  type PuntoDeCurva,
} from '@/lib/nivel-jugador';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';
import BotonCompartir from '@/components/ui/BotonCompartir';
import { tarjetaDeNivel } from '@/lib/tarjetas-compartibles';
import { NOMBRE_DIVISION } from '@/lib/nivel-jugador';

export function TuNivel({ userId }: { userId: string }) {
  const router = useRouter();
  const [datos, setDatos] = useState<NivelYCurva | null>(null);
  const [esPro, setEsPro] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([leerNivelYCurva(userId), leerSuscripcion(userId)]).then(([d, sub]) => {
      if (!vivo) return;
      setDatos(d);
      setEsPro(sub.activa);
    });
    return () => { vivo = false; };
  }, [userId]);

  if (!datos) {
    return (
      <View style={s.caja}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  const { nivel, curva, progreso } = datos;
  const numero = numeroVisible(nivel);
  const linea = pathDeCurva(curva);
  const area = areaDeCurva(curva);

  return (
    <View style={s.caja}>
      <Text style={s.eyebrow}>Tu nivel</Text>

      <View style={s.cabecera}>
        <Text style={[s.titulo, !nivel.fiable && s.tituloProvisional]}>{textoDeNivel(nivel)}</Text>
        {esPro && numero !== null && <Text style={s.numero}>{numero}</Text>}
      </View>

      {esPro && <Text style={s.paso}>{textoDeSiguientePaso(nivel)}</Text>}

      {/* Sin suscripción se enseña el marco y lo que falta, no un bloque
          bloqueado: uno entero cerrado no se mira, se salta. */}
      {!esPro && (
        <Pressable onPress={() => router.push('/(protected)/planes')} accessibilityRole="button">
          <Text style={s.paso}>
            Tu nivel exacto, cuántos puntos te faltan para subir y la gráfica de tu progreso
            están en Pro.
          </Text>
          <Text style={s.enlace}>Ver planes</Text>
        </Pressable>
      )}

      {esPro && linea && area && (
        <>
          <Svg width="100%" height={CURVA_ALTO} viewBox={`0 0 ${CURVA_ANCHO} ${CURVA_ALTO}`} style={s.grafica}>
            <Defs>
              <LinearGradient id="bajoLaCurva" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color.gold} stopOpacity="0.28" />
                <Stop offset="1" stopColor={color.gold} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#bajoLaCurva)" />
            <Path d={linea} stroke={color.goldBright} strokeWidth={2} fill="none" />
          </Svg>

          {progreso && (
            <View style={s.pie}>
              <Dato etiqueta="desde que empezaste" valor={textoDeCambio(progreso.delta)} bueno={progreso.delta > 0} />
              <Dato etiqueta="tu techo" valor={String(progreso.techo)} />
              <Dato etiqueta="último torneo" valor={textoDeCambio(progreso.ultimoTorneo)} bueno={progreso.ultimoTorneo > 0} />
            </View>
          )}

          {/* Solo se ofrece si subió: nadie comparte que bajó, y ofrecérselo
              es recordarle un mal fin de semana al abrir la app. */}
          {progreso && (
            <BotonCompartir
              tarjeta={tarjetaDeNivel(NOMBRE_DIVISION[nivel.division], progreso.delta, nivel.partidos)}
              etiqueta="Compartir mi progreso"
            />
          )}
        </>
      )}
    </View>
  );
}

function Dato({ etiqueta, valor, bueno }: { etiqueta: string; valor: string; bueno?: boolean }) {
  return (
    <View style={s.dato}>
      <Text style={[s.datoValor, bueno === true && s.datoBueno, bueno === false && s.datoMalo]}>{valor}</Text>
      <Text style={s.datoEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  caja: {
    gap: space[1.5],
    padding: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  eyebrow: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  titulo: { color: color.champagne, fontFamily: font.display, fontSize: fontSize.metric },
  tituloProvisional: { color: color.muted, fontSize: fontSize.h1Inline },
  numero: { color: color.goldBright, fontFamily: font.display, fontSize: fontSize.metric },
  paso: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
  enlace: {
    color: color.goldBright,
    fontFamily: font.body,
    fontSize: fontSize.caption,
    fontWeight: '600',
    marginTop: space[1],
  },

  grafica: { marginTop: space[2] },

  pie: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[1] },
  dato: { alignItems: 'center', flex: 1 },
  datoValor: { color: color.text, fontFamily: font.display, fontSize: fontSize.cardName },
  datoBueno: { color: color.live },
  datoMalo: { color: color.danger },
  datoEtiqueta: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, textAlign: 'center' },
});

export default TuNivel;
