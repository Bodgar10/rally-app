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
 *   Por eso lo cerrado no se guarda en la base: se reinicia solo. Dentro de la
 *   MISMA sesión la ✕ calla de verdad —volver a preguntar lo que alguien acaba
 *   de rechazar enseña a ignorar la tarjeta entera, incluida la siguiente— pero
 *   en la próxima apertura se vuelve a ofrecer. Y en cuanto contesta, no sale
 *   nunca más: la pregunta desaparece porque el dato ya está.
 *
 * ► "APERTURA" NO ES "VOLVER AL DASHBOARD", Y ASÍ ESTABA
 *   Esto colgaba de `useFocusEffect`, que dispara CADA VEZ que la pantalla
 *   recupera el foco: entrar a Torneos y volver ya contaba como apertura
 *   nueva. Quien cerraba la tarjeta se la encontraba otra vez tres toques
 *   después, y la app parecía no estar guardando nada.
 *
 *   La sesión ahora vive en un módulo —`cerradaEnEstaSesion`, fuera del
 *   componente— que solo se limpia cuando la app arranca de verdad (el módulo
 *   se vuelve a evaluar) o cuando vuelve de segundo plano tras un buen rato.
 *   Ese "buen rato" es `MINUTOS_PARA_VOLVER_A_PREGUNTAR`: mirar una
 *   notificación y volver no es una apertura nueva; dejar el teléfono en el
 *   bolsillo entre partido y partido, sí.
 *
 * Y CADA PREGUNTA DICE QUÉ ENCIENDE
 *   "Para buscarte pareja del lado contrario. Tus rivales lo verán, igual que
 *   tú el suyo." Eso convierte la pregunta en un intercambio. Y el aviso de que
 *   es pública va ANTES de contestar: enterarse después es lo que hace que
 *   alguien no vuelva a contestar nada.
 */

import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { guardarRespuesta, leerPerfilDeJuego } from '@/lib/lado-y-mano-datos';
import { siguientePregunta, type Pregunta, type PreguntaId } from '@/lib/lado-y-mano';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';

/**
 * Cuánto tiene que estar la app en segundo plano para que volver cuente como
 * una apertura nueva. Ver la cabecera.
 */
const MINUTOS_PARA_VOLVER_A_PREGUNTAR = 30;

/**
 * VIVE FUERA DEL COMPONENTE A PROPÓSITO.
 *
 * Dentro, se reiniciaba cada vez que el dashboard se montaba —o sea, cada vez
 * que se volvía a él— y la tarjeta cerrada reaparecía al momento. Aquí dura lo
 * que dura la app.
 */
let cerradaEnEstaSesion = false;
/** Cuándo se fue la app a segundo plano, para medir la ausencia. */
let seFueAlFondoEn: number | null = null;

export function PreguntaDelPerfil({ userId }: { userId: string }) {
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  /**
   * Las que ya contestó EN ESTA SESIÓN.
   *
   * Solo sirve para pasar a la siguiente sin esperar a releer la base. Lo
   * contestado ya está guardado: aunque esto se pierda, no vuelve a salir.
   */
  const [contestadas, setContestadas] = useState<PreguntaId[]>([]);
  /**
   * ► CERRÓ LA TARJETA. NO ES LO MISMO QUE CONTESTAR.
   *
   *   Contestar es cooperar: se le ofrece la siguiente en el momento, porque
   *   está de humor y porque las aperturas de esta app son pocas —solo días de
   *   torneo— y desaprovechar una es caro.
   *
   *   Cerrar es decir que no. Encadenarle otra pregunta ahí es exactamente
   *   cómo se enseña a ignorar la tarjeta para siempre, incluidas las que sí
   *   habría contestado. Se calla entera hasta la próxima apertura.
   */
  const [cerrada, setCerrada] = useState(cerradaEnEstaSesion);
  const [guardando, setGuardando] = useState(false);
  /**
   * ► SE DICE QUE SE GUARDÓ, Y ANTES NO SE DECÍA.
   *
   *   Al contestar, la tarjeta cambiaba de pregunta sin más. Desde fuera eso
   *   es indistinguible de "no se guardó y me está volviendo a preguntar": la
   *   primera reacción de quien lo probó fue justo esa duda. Un acuse de medio
   *   segundo con la respuesta escrita basta para que no haya duda.
   */
  const [guardado, setGuardado] = useState<string | null>(null);

  /**
   * La app vuelve de segundo plano. Si estuvo fuera lo suficiente, cuenta como
   * una apertura nueva y la tarjeta se vuelve a ofrecer: RALLY se abre los días
   * de torneo y cada apertura es una de las pocas ocasiones que hay de
   * preguntar. Si fue un vistazo a una notificación, no.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        const fuera = seFueAlFondoEn === null ? 0 : Date.now() - seFueAlFondoEn;
        seFueAlFondoEn = null;
        if (fuera >= MINUTOS_PARA_VOLVER_A_PREGUNTAR * 60_000) {
          cerradaEnEstaSesion = false;
          setCerrada(false);
        }
      } else if (seFueAlFondoEn === null) {
        seFueAlFondoEn = Date.now();
      }
    });
    return () => sub.remove();
  }, []);

  function cerrar() {
    cerradaEnEstaSesion = true;
    setCerrada(true);
  }

  useEffect(() => {
    let vivo = true;
    leerPerfilDeJuego(userId).then((p) => {
      if (vivo) setPregunta(siguientePregunta(p, contestadas));
    });
    return () => { vivo = false; };
  }, [userId, contestadas]);

  // El acuse se apaga solo. Si mientras tanto la tarjeta se desmonta, el
  // timeout se limpia y no hay set sobre un componente muerto.
  useEffect(() => {
    if (guardado === null) return;
    const id = setTimeout(() => setGuardado(null), 1400);
    return () => clearTimeout(id);
  }, [guardado]);

  if (cerrada) return null;
  // El acuse sobrevive a que ya no queden preguntas: si no, la última
  // respuesta se guardaría y la tarjeta desaparecería sin decir nada.
  if (!pregunta && guardado === null) return null;

  async function responder(valor: string, etiqueta: string) {
    setGuardando(true);
    const ok = await guardarRespuesta(userId, pregunta!.id, valor);
    setGuardando(false);
    // Si no se pudo guardar, la pregunta se queda: volverá a salir sola. No se
    // avisa — no estaba haciendo una tarea, estaba contestando de paso.
    if (ok) {
      setGuardado(etiqueta);
      setContestadas((prev) => [...prev, pregunta!.id]);
    }
  }

  if (guardado !== null) {
    return (
      <View style={s.caja}>
        <Text style={s.acuse}>Guardado: {guardado} ✓</Text>
      </View>
    );
  }

  return (
    <View style={s.caja}>
      <View style={s.cabecera}>
        <Text style={s.titulo}>{pregunta!.titulo}</Text>
        <Pressable
          onPress={cerrar}
          accessibilityRole="button"
          accessibilityLabel="Ahora no"
          hitSlop={12}
        >
          <Text style={s.cerrar}>✕</Text>
        </Pressable>
      </View>

      <View style={s.opciones}>
        {pregunta!.opciones.map((o) => (
          <Pressable
            key={o.valor}
            onPress={() => void responder(o.valor, o.etiqueta)}
            disabled={guardando}
            accessibilityRole="button"
            style={[s.boton, guardando && s.botonApagado]}
          >
            <Text style={s.botonTexto}>{o.etiqueta}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.porque}>{pregunta!.porque}</Text>
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

  acuse: { color: color.goldBright, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },
});

export default PreguntaDelPerfil;
