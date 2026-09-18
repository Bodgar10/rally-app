/**
 * src/components/player/PreguntaDelPerfil.tsx
 *
 * RALLY · Una pregunta, dos botones, y se va.
 *
 * NO ES UN ONBOARDING, Y ESA ES LA IDEA
 *   Había una pantalla de onboarding con tres preguntas de golpe que, además,
 *   no estaba conectada a ninguna ruta: nadie la abría nunca. Un formulario al
 *   entrar frena justo a quien solo quería apuntarse a un torneo el domingo.
 *
 *   Esto es una tarjeta del dashboard con UNA pregunta. Se toca un botón y
 *   desaparece. La próxima vez sale la siguiente, y cuando no quedan, no sale
 *   nada nunca más.
 *
 * ► VUELVE A PREGUNTAR CADA VEZ QUE SE ABRE LA APP, Y ESO ES DELIBERADO
 *   RALLY no se usa a diario: se abre los días de torneo. Cada apertura es una
 *   de las poquísimas oportunidades que hay de recoger estos datos, y los
 *   primeros torneos de un jugador son casi todas. Insistir aquí no es
 *   machacar: es aprovechar una ventana que se cierra sola.
 *
 *   Por eso `saltadas` se reinicia al volver a la pantalla (useFocusEffect) en
 *   vez de guardarse. Dentro de la MISMA sesión la ✕ calla de verdad —volver a
 *   preguntar lo que alguien acaba de rechazar enseña a ignorar la tarjeta
 *   entera, incluida la siguiente— pero en la próxima apertura se vuelve a
 *   ofrecer. Y en cuanto contesta, no sale nunca más: la pregunta desaparece
 *   porque el dato ya está.
 *
 * Y CADA PREGUNTA DICE QUÉ ENCIENDE
 *   "Para buscarte pareja del lado contrario. Tus rivales lo verán, igual que
 *   tú el suyo." Eso convierte la pregunta en un intercambio. Y el aviso de que
 *   es pública va ANTES de contestar: enterarse después es lo que hace que
 *   alguien no vuelva a contestar nada.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { guardarRespuesta, leerPerfilDeJuego } from '@/lib/lado-y-mano-datos';
import { siguientePregunta, type Pregunta, type PreguntaId } from '@/lib/lado-y-mano';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

export function PreguntaDelPerfil({ userId }: { userId: string }) {
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const [saltadas, setSaltadas] = useState<PreguntaId[]>([]);
  const [guardando, setGuardando] = useState(false);

  // AL VOLVER A LA PANTALLA SE OLVIDA LO SALTADO.
  //
  //   RALLY se abre los días de torneo, no a diario: cada apertura es una de
  //   las poquísimas ocasiones que hay de recoger esto. Dentro de la misma
  //   sesión la ✕ calla de verdad; en la siguiente apertura se vuelve a
  //   ofrecer. Lo contestado no vuelve nunca, porque ya está en la base.
  useFocusEffect(
    useCallback(() => {
      setSaltadas([]);
    }, []),
  );

  useEffect(() => {
    let vivo = true;
    leerPerfilDeJuego(userId).then((p) => {
      if (vivo) setPregunta(siguientePregunta(p, saltadas));
    });
    return () => { vivo = false; };
  }, [userId, saltadas]);

  if (!pregunta) return null;

  async function responder(valor: string) {
    setGuardando(true);
    const ok = await guardarRespuesta(userId, pregunta!.id, valor);
    setGuardando(false);
    // Si no se pudo guardar, la pregunta se queda: volverá a salir sola. No se
    // avisa — no estaba haciendo una tarea, estaba contestando de paso.
    if (ok) setSaltadas((prev) => [...prev, pregunta!.id]);
  }

  return (
    <View style={s.caja}>
      <View style={s.cabecera}>
        <Text style={s.titulo}>{pregunta.titulo}</Text>
        <Pressable
          onPress={() => setSaltadas((prev) => [...prev, pregunta.id])}
          accessibilityRole="button"
          accessibilityLabel="Ahora no"
          hitSlop={12}
        >
          <Text style={s.cerrar}>✕</Text>
        </Pressable>
      </View>

      <View style={s.opciones}>
        {pregunta.opciones.map((o) => (
          <Pressable
            key={o.valor}
            onPress={() => void responder(o.valor)}
            disabled={guardando}
            accessibilityRole="button"
            style={[s.boton, guardando && s.botonApagado]}
          >
            <Text style={s.botonTexto}>{o.etiqueta}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.porque}>{pregunta.porque}</Text>
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
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  titulo: { flex: 1, color: color.text, fontFamily: font.body, fontSize: fontSize.cardName },
  cerrar: { color: color.muted, fontFamily: font.body, fontSize: fontSize.body },

  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  boton: {
    flexGrow: 1,
    minHeight: touchTarget,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[3],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: color.surface,
  },
  botonApagado: { opacity: 0.5 },
  botonTexto: { color: color.goldBright, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },

  porque: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17 },
});

export default PreguntaDelPerfil;
