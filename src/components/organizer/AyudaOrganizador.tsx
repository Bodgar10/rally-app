/**
 * RALLY · La ayuda del panel del organizador
 *
 * Una interrogación flotante en la esquina y una hoja con las preguntas. Vive
 * en el layout de `(organizer)`, así que está en las diecisiete pantallas del
 * panel sin que ninguna tenga que acordarse de ponerla.
 *
 * NO SABE DE QUÉ HABLA. Las preguntas, las respuestas y los destinos están en
 * `@/lib/ayuda-organizador`; esto pinta lo que haya y no cambia al añadir una.
 *
 * EL ORDEN LO PONE LA RUTA. Las de la pantalla actual arriba, bajo "Aquí"; el
 * resto debajo, visibles. Ver `preguntasPorContexto`: no se filtra, se ordena.
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname, useLocalSearchParams } from 'expo-router';

import Hoja from '@/components/ui/Hoja';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import {
  pantallaDeRuta,
  preguntasPorContexto,
  rutaDePregunta,
  type PreguntaDeAyuda,
} from '@/lib/ayuda-organizador';
import { guiaDePregunta } from '@/lib/guia-organizador';
import { empezarGuia, terminarGuia } from '@/lib/guia-store';

export default function AyudaOrganizador() {
  const router = useRouter();
  const pathname = usePathname();
  const { tournamentId } = useLocalSearchParams<{ tournamentId?: string }>();

  const [abierta, setAbierta] = useState(false);
  const [desplegada, setDesplegada] = useState<string | null>(null);

  // Fuera de un torneo no hay a dónde enlazar: las preguntas del panel hablan
  // de "este torneo". En la lista de torneos o en el alta, la ayuda se calla en
  // vez de ofrecer enlaces rotos.
  if (!tournamentId) return null;

  const pantalla = pantallaDeRuta(pathname);
  const { aqui, resto } = preguntasPorContexto(pantalla);

  const cerrar = () => { setAbierta(false); setDesplegada(null); };

  const ir = (p: PreguntaDeAyuda) => {
    cerrar();
    // Si la pregunta tiene guía, se lanza ANTES de navegar: la pantalla de
    // destino la lee en su primer render y no hay un parpadeo sin barra.
    const guia = guiaDePregunta(p.id);
    if (guia) empezarGuia(guia); else terminarGuia();
    router.push(rutaDePregunta(p, tournamentId));
  };

  const lista = (titulo: string, preguntas: PreguntaDeAyuda[]) =>
    preguntas.length === 0 ? null : (
      <View key={titulo}>
        <Text style={s.grupo}>{titulo}</Text>
        {preguntas.map((p) => {
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
                <Text style={s.chevron}>{abierto ? '−' : '+'}</Text>
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
        })}
      </View>
    );

  return (
    <>
      <Pressable
        onPress={() => setAbierta(true)}
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
        {lista('AQUÍ', aqui)}
        {lista(aqui.length ? 'TODO LO DEMÁS' : 'TODAS LAS PREGUNTAS', resto)}
      </Hoja>
    </>
  );
}

const s = StyleSheet.create({
  // Abajo a la derecha, por encima del contenido y del inset del teléfono.
  flotante: {
    position: 'absolute',
    right: space[4],
    bottom: Platform.OS === 'web' ? space[5] : space[6],
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
    // Sin esto se pierde sobre una tarjeta clara en web.
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 10px rgba(0,0,0,0.45)' }
      : { elevation: 4 }),
  },
  flotanteSigno: {
    fontFamily: font.display,
    fontSize: 18,
    color: color.champagne,
    lineHeight: 22,
  },

  grupo: {
    fontFamily: font.body, fontSize: 10, color: color.muted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginTop: space[4], marginBottom: space[2],
  },
  item: { borderBottomWidth: 1, borderBottomColor: color.lineSoft },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    paddingVertical: space[3],
    minHeight: touchTarget,
  },
  // minWidth: 0 en el lado que crece: sin esto la pregunta larga empuja al
  // signo fuera de la hoja en web.
  pregunta: {
    flex: 1, minWidth: 0,
    fontFamily: font.body, fontSize: fontSize.body,
    color: color.text, lineHeight: 20,
  },
  chevron: { fontFamily: font.body, fontSize: 18, color: color.muted },

  respuestaCaja: {
    paddingBottom: space[3], gap: space[3],
    borderLeftWidth: 2, borderLeftColor: color.line,
    paddingLeft: space[3],
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
