/**
 * src/components/campeon/ContadorDeAhorro.tsx
 *
 * RALLY · "Llevas $570 ahorrados de $990."
 *
 * ESTE COMPONENTE ES LA RENOVACIÓN
 *   Un Campeón decide si renueva en diciembre, y lo decide con una sensación,
 *   no con una hoja de cálculo. El descuento de $48 por torneo no deja ninguna
 *   sensación: pasa por el checkout y se olvida. Acumulado y con una barra que
 *   sube, sí — y cuando la barra se llena, la frase que sale es literalmente
 *   "este año Campeón te salió gratis".
 *
 * NO SE ENSEÑA A QUIEN NO ES CAMPEÓN
 *   Ahí no es un contador, es publicidad, y el sitio de la publicidad es el
 *   checkout —donde está pagando de más— y no su perfil. Devuelve null.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { leerAhorroCampeon } from '@/lib/ahorro-campeon-datos';
import {
  progresoDelTope,
  textoDeLoQueFalta,
  textoDelContador,
  topeAlcanzado,
  type AhorroCampeon,
} from '@/lib/ahorro-campeon';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

export function ContadorDeAhorro({ userId }: { userId: string }) {
  const [ahorro, setAhorro] = useState<AhorroCampeon | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // `leerAhorroCampeon` nunca lanza: si falla devuelve "no eres Campeón" y
      // el bloque no se pinta. Un contador roto en el perfil no es una
      // urgencia, y un error donde debería ir un ahorro se lee como un cobro mal.
      const a = await leerAhorroCampeon(userId);
      if (vivo) setAhorro(a);
    })();
    return () => { vivo = false; };
  }, [userId]);

  if (!ahorro?.es_campeon) return null;

  const texto = textoDelContador(ahorro);
  const falta = textoDeLoQueFalta(ahorro);
  const progreso = progresoDelTope(ahorro);
  const lleno = topeAlcanzado(ahorro);

  return (
    <View style={[s.caja, lleno && s.cajaLlena]}>
      <Text style={s.eyebrow}>Tu ahorro con Campeón</Text>
      <Text style={[s.texto, lleno && s.textoLleno]}>{texto}</Text>

      <View style={s.barra}>
        <View style={[s.relleno, { width: `${Math.round(progreso * 100)}%` }, lleno && s.rellenoLleno]} />
      </View>

      {falta && <Text style={s.falta}>{falta}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  caja: {
    gap: space[2],
    padding: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  cajaLlena: { borderColor: 'rgba(66,214,164,0.35)', backgroundColor: 'rgba(66,214,164,0.10)' },

  eyebrow: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  texto: { color: color.goldBright, fontFamily: font.display, fontSize: fontSize.h1Inline },
  textoLleno: { color: color.live },

  barra: { height: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  relleno: { height: 6, borderRadius: radius.pill, backgroundColor: color.gold },
  rellenoLleno: { backgroundColor: color.live },

  falta: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
});

export default ContadorDeAhorro;
