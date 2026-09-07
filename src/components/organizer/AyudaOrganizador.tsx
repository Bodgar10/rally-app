/**
 * RALLY · La ayuda del panel del organizador
 *
 * Una interrogación flotante en la esquina y una hoja con las preguntas. Vive
 * en el layout de `(organizer)`, así que está en las diecisiete pantallas del
 * panel sin que ninguna tenga que acordarse de ponerla.
 *
 * NO SABE DE QUÉ HABLA. Las preguntas, las respuestas, los momentos y los
 * destinos están en `@/lib/ayuda-organizador`; esto pinta lo que haya.
 *
 * TRES DECISIONES QUE NO SON DE ESTILO
 *
 *   1. LA BURBUJA SE ANUNCIA SOLA. Un círculo gris en una esquina es mobiliario:
 *      quien no sabe que hay ayuda no va a tocarlo. Cuándo sale, abajo.
 *
 *   2. LA HOJA ABRE POR GRUPOS, NO POR PREGUNTAS. Dieciocho seguidas son un
 *      muro; cuatro rótulos con su conteo se leen de un vistazo y el
 *      organizador sabe perfectamente en qué momento del torneo está.
 *
 *   3. Y SE PUEDE ESCRIBIR. Con dieciocho, teclear "cuota" es más rápido que
 *      leer. Buscar aplana los grupos: cuando hay una consulta, lo que importa
 *      es la coincidencia, no dónde vivía.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname, useLocalSearchParams } from 'expo-router';

import Hoja from '@/components/ui/Hoja';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { inputFontSize } from '@/lib/web-layout';
import {
  PREGUNTAS,
  MOMENTOS,
  pantallaDeRuta,
  preguntasPorContexto,
  preguntasPorMomento,
  rutaDePregunta,
  type PreguntaDeAyuda,
} from '@/lib/ayuda-organizador';
import { guiaDePregunta } from '@/lib/guia-organizador';
import { empezarGuia, terminarGuia } from '@/lib/guia-store';
import { useGuiaEnPantalla } from '@/hooks/useGuiaEnPantalla';

/**
 * CUÁNDO SALE LA BURBUJA — cuando lleva un rato varado, y UNA vez por sesión.
 *
 * De las tres opciones posibles, la primera visita es la peor: es cuando menos
 * perdido está y cuando más ruido hace, porque todavía está leyendo la
 * pantalla. Y "cada tantas visitas" convierte la ayuda en un anuncio que
 * reaparece.
 *
 * Varado = QUINCE SEGUNDOS EN LA MISMA PANTALLA SIN NAVEGAR. Navegar reinicia
 * el reloj, porque quien se mueve sabe a dónde va. Quien lleva quince segundos
 * quieto en "Horarios de la fase de grupos" o no entiende qué es, o no
 * encuentra el control — las dos cosas las contesta la hoja.
 *
 * Y se calla para siempre en cuanto la cierra o abre la ayuda por su cuenta:
 * ya sabe que existe, que era todo lo que había que enseñarle.
 */
const SEGUNDOS_VARADO = 15;

/** Módulo y no estado: sobrevive a cambiar de pantalla, muere con la sesión. */
let burbujaGastada = false;

export default function AyudaOrganizador() {
  const router = useRouter();
  const pathname = usePathname();
  const { tournamentId } = useLocalSearchParams<{ tournamentId?: string }>();
  const guiada = useGuiaEnPantalla();

  const [abierta, setAbierta] = useState(false);
  const [desplegada, setDesplegada] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  const [burbuja, setBurbuja] = useState(false);

  // Hay una guía hablando: dos globos a la vez en la misma esquina compiten y
  // no se entiende cuál contesta a qué.
  const hayGuia = guiada?.tipo === 'paso' || guiada?.tipo === 'transito';

  const puedeSalir = Boolean(tournamentId) && !burbujaGastada && !abierta && !hayGuia;
  useEffect(() => {
    if (!puedeSalir) return;
    // El temporizador se rearma con `pathname`: navegar reinicia el reloj.
    const t = setTimeout(() => {
      if (!burbujaGastada) setBurbuja(true);
    }, SEGUNDOS_VARADO * 1000);
    return () => clearTimeout(t);
  }, [pathname, puedeSalir]);

  const gastarBurbuja = () => { burbujaGastada = true; setBurbuja(false); };

  // Fuera de un torneo no hay a dónde enlazar: las preguntas del panel hablan
  // de "este torneo". En la lista de torneos o en el alta, la ayuda se calla en
  // vez de ofrecer enlaces rotos.
  if (!tournamentId) return null;

  const pantalla = pantallaDeRuta(pathname);
  const { aqui } = preguntasPorContexto(pantalla);
  const buscando = busqueda.trim() !== '';
  const grupos = preguntasPorMomento(busqueda);
  const encontradas = grupos.reduce((n, g) => n + g.preguntas.length, 0);

  const abrir = () => { gastarBurbuja(); setAbierta(true); };
  const cerrar = () => {
    setAbierta(false); setDesplegada(null); setBusqueda(''); setGrupoAbierto(null);
  };

  const ir = (p: PreguntaDeAyuda) => {
    cerrar();
    // Si la pregunta tiene guía, se lanza ANTES de navegar: la pantalla de
    // destino la lee en su primer render y no hay un parpadeo sin barra.
    const guia = guiaDePregunta(p.id);
    if (guia) empezarGuia(guia); else terminarGuia();
    router.push(rutaDePregunta(p, tournamentId));
  };

  const pregunta = (p: PreguntaDeAyuda) => {
    const abierto = desplegada === p.id;
    return (
      <View key={p.id} style={s.item}>
        <Pressable
          onPress={() => setDesplegada(abierto ? null : p.id)}
          accessibilityRole="button"
          accessibilityState={{ expanded: abierto }}
          style={({ pressed }) => [s.fila, pressed && { opacity: 0.75 }]}
        >
          <Text style={s.pregunta}>{p.pregunta}</Text>
          <Text style={s.signo}>{abierto ? '−' : '+'}</Text>
        </Pressable>

        {abierto && (
          <View style={s.respuestaCaja}>
            <Text style={s.respuesta}>{p.respuesta}</Text>
            {/* SIEMPRE termina en la pantalla donde se hace: explicar sin
                llevar obliga a buscar la tarjeta en una rejilla de trece. */}
            <Pressable
              onPress={() => ir(p)}
              accessibilityRole="link"
              style={({ pressed }) => [s.enlace, pressed && { opacity: 0.75 }]}
            >
              <Text style={s.enlaceTexto}>{p.enlace} →</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      {/* ── La burbuja ────────────────────────────────────────────────── */}
      {burbuja && !abierta && (
        <View style={s.burbuja} accessibilityLiveRegion="polite">
          <Pressable
            onPress={abrir}
            accessibilityRole="button"
            style={({ pressed }) => [s.burbujaTexto, pressed && { opacity: 0.8 }]}
          >
            <Text style={s.burbujaFrase}>¿No encuentras dónde cambiar algo?</Text>
            <Text style={s.burbujaPie}>Toca aquí y te llevo.</Text>
          </Pressable>
          <Pressable
            onPress={gastarBurbuja}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Cerrar el aviso de ayuda"
            style={({ pressed }) => [s.burbujaCerrar, pressed && { opacity: 0.6 }]}
          >
            <Text style={s.burbujaCerrarSigno}>✕</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel="Ayuda del organizador"
        style={({ pressed }) => [s.flotante, pressed && { opacity: 0.8 }]}
      >
        <Text style={s.flotanteSigno}>?</Text>
      </Pressable>

      <Hoja
        visible={abierta}
        onClose={cerrar}
        eyebrow="Ayuda"
        titulo="¿Qué necesitas hacer?"
      >
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Busca: cuota, jueces, empate…"
          placeholderTextColor={color.muted}
          style={s.buscador}
          autoCorrect={false}
          accessibilityLabel="Buscar en la ayuda"
          returnKeyType="search"
        />

        {/* Buscando, los grupos estorban: importa la coincidencia. */}
        {buscando ? (
          encontradas === 0 ? (
            <Text style={s.vacio}>
              Nada con “{busqueda.trim()}”. Prueba con otra palabra, o mira los
              grupos borrando la búsqueda.
            </Text>
          ) : (
            <View>
              <Text style={s.grupoTitulo}>
                {encontradas === 1 ? '1 RESULTADO' : `${encontradas} RESULTADOS`}
              </Text>
              {grupos.flatMap((g) => g.preguntas).map(pregunta)}
            </View>
          )
        ) : (
          <>
            {/* Lo de esta pantalla, desplegado: es lo que más probable que
                busque quien abre la ayuda desde aquí. */}
            {aqui.length > 0 && (
              <View>
                <Text style={s.grupoTitulo}>AQUÍ</Text>
                {aqui.map(pregunta)}
              </View>
            )}

            {MOMENTOS.map((m) => {
              const delMomento = PREGUNTAS.filter((p) => p.momento === m.id);
              const desplegado = grupoAbierto === m.id;
              return (
                <View key={m.id}>
                  <Pressable
                    onPress={() => setGrupoAbierto(desplegado ? null : m.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: desplegado }}
                    style={({ pressed }) => [s.grupo, pressed && { opacity: 0.75 }]}
                  >
                    <Text style={s.grupoNombre}>{m.titulo}</Text>
                    <Text style={s.grupoCuenta}>{delMomento.length}</Text>
                    <Text style={s.signo}>{desplegado ? '−' : '+'}</Text>
                  </Pressable>
                  {desplegado && delMomento.map(pregunta)}
                </View>
              );
            })}
          </>
        )}
      </Hoja>
    </>
  );
}

const ABAJO = Platform.OS === 'web' ? space[5] : space[6];

const s = StyleSheet.create({
  // Abajo a la derecha, por encima del contenido y del inset del teléfono.
  flotante: {
    position: 'absolute',
    right: space[4],
    bottom: ABAJO,
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 10px rgba(0,0,0,0.45)' }
      : { elevation: 4 }),
  },
  flotanteSigno: {
    fontFamily: font.display, fontSize: 18,
    color: color.champagne, lineHeight: 22,
  },

  // Justo encima de la interrogación, apuntando a ella.
  burbuja: {
    position: 'absolute',
    right: space[4],
    bottom: ABAJO + touchTarget + space[2],
    maxWidth: 300,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.gold,
    borderRadius: radius.lg,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 10px rgba(0,0,0,0.45)' }
      : { elevation: 4 }),
  },
  burbujaTexto: { flex: 1, minWidth: 0, gap: 2 },
  burbujaFrase: {
    fontFamily: font.body, fontSize: fontSize.caption,
    color: color.text, lineHeight: 18,
  },
  burbujaPie: { fontFamily: font.body, fontSize: 11, color: color.champagne },
  burbujaCerrar: { padding: 2 },
  burbujaCerrarSigno: { color: color.muted, fontSize: 13 },

  buscador: {
    marginTop: space[3],
    backgroundColor: color.surface,
    borderWidth: 1, borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    height: touchTarget,
    color: color.text,
    fontFamily: font.body,
    fontSize: inputFontSize(fontSize.body),
  },
  vacio: {
    fontFamily: font.body, fontSize: fontSize.caption,
    color: color.muted, lineHeight: 19, marginTop: space[4],
  },

  grupo: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    paddingVertical: space[3], minHeight: touchTarget,
    borderBottomWidth: 1, borderBottomColor: color.lineSoft,
  },
  grupoNombre: {
    flex: 1, minWidth: 0,
    fontFamily: font.body, fontSize: fontSize.body, color: color.text,
  },
  grupoCuenta: {
    fontFamily: font.body, fontSize: 11, color: color.muted,
    backgroundColor: color.surface, borderRadius: radius.pill,
    paddingHorizontal: space[2], paddingVertical: 2,
    overflow: 'hidden',
  },
  grupoTitulo: {
    fontFamily: font.body, fontSize: 10, color: color.muted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginTop: space[4], marginBottom: space[2],
  },

  item: { borderBottomWidth: 1, borderBottomColor: color.lineSoft },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    paddingVertical: space[3], paddingLeft: space[3],
    minHeight: touchTarget,
  },
  // minWidth: 0 en el lado que crece: sin esto la pregunta larga empuja al
  // signo fuera de la hoja en web.
  pregunta: {
    flex: 1, minWidth: 0,
    fontFamily: font.body, fontSize: fontSize.body,
    color: color.text, lineHeight: 20,
  },
  signo: { fontFamily: font.body, fontSize: 18, color: color.muted },

  respuestaCaja: {
    paddingBottom: space[3], gap: space[3],
    borderLeftWidth: 2, borderLeftColor: color.line,
    paddingLeft: space[3], marginLeft: space[3],
    marginBottom: space[2],
  },
  respuesta: {
    fontFamily: font.body, fontSize: fontSize.caption,
    color: color.muted, lineHeight: 19,
  },
  enlace: {
    alignSelf: 'flex-start',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: color.line,
    paddingVertical: space[2], paddingHorizontal: space[3],
    minHeight: touchTarget - 8,
    justifyContent: 'center',
  },
  enlaceTexto: {
    fontFamily: font.body, fontSize: fontSize.caption,
    color: color.champagne,
  },
});
