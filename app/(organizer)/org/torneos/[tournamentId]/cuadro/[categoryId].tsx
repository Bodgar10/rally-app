/**
 * RALLY · El cuadro de una categoría, desde el panel del organizador
 *
 * POR QUÉ UNA PANTALLA PROPIA Y NO UN PARÁMETRO EN LA DEL JUGADOR
 *   El enlace "Ver el cuadro" de Grupos mandaba a
 *   `/(protected)/torneos/<torneo>/<categoría>`, que es la vista pública. Tres
 *   cosas iban mal ahí, y solo una se arregla con un parámetro:
 *
 *     · El cuadro queda DEBAJO de todas las tablas de grupos. Un parámetro o un
 *       ancla podría saltárselas, sí.
 *     · La pantalla vive en `(protected)`, cuyo layout de web monta `WebShell`
 *       con el nav del JUGADOR. Eso no se quita con un parámetro: es el grupo
 *       de rutas el que lo pone.
 *     · Y el "Volver" de esa pantalla lleva al torneo del jugador, no a Grupos.
 *
 *   O sea que el organizador salía de su panel para mirar un dato de su panel.
 *   La pantalla propia cuesta poco porque `LiveBracket` YA se abastece solo con
 *   `categoryId`: aquí no se duplica ni la consulta, ni la suscripción a
 *   Realtime, ni el dibujo del cuadro. Lo que se aporta es la cabecera, el
 *   "Volver" a Grupos y el grupo de rutas correcto.
 *
 * LO PRIMERO QUE SE VE ES EL CUADRO
 *   Sin tablas de grupos, sin "mi próximo partido", sin nada intermedio. Se
 *   llega aquí desde Grupos, que es donde están las tablas: repetirlas sería
 *   pedirle que scrollee para volver a lo que acaba de dejar.
 */

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import BotonVolver from '@/components/ui/BotonVolver';
import LiveBracket from '@/components/realtime/LiveBracket';
import { color, font, fontSize, space } from '@/lib/design-tokens';
import { webContentColumnAncha, bottomInset } from '@/lib/web-layout';

export default function CuadroDelOrganizadorScreen() {
  const { tournamentId, categoryId } = useLocalSearchParams<{
    tournamentId: string; categoryId: string;
  }>();

  const [categoria, setCategoria] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  /**
   * Solo el nombre de la categoría, para la cabecera.
   *
   * El cuadro NO se consulta aquí: `LiveBracket` lo trae y se suscribe a sus
   * cambios por su cuenta. Duplicar esa consulta para "tenerla a mano" sería
   * abrir una segunda verdad sobre el mismo cuadro.
   */
  const cargar = useCallback(async () => {
    if (!categoryId) return;
    const { data } = await supabase
      .from('categories')
      .select('display_name')
      .eq('id', categoryId)
      .maybeSingle();
    setCategoria(data?.display_name ?? null);
    setCargando(false);
  }, [categoryId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  return (
    <SafeAreaView style={s.safe}>
      {/* `destino` explícito: `rutaPadre` daría `/org/torneos/<id>/cuadro`, que
          no es una pantalla — es solo un tramo de la URL. Con historial vuelve
          atrás igual; esto es para quien entra por enlace directo o recarga. */}
      <BotonVolver
        texto="Grupos"
        destino={`/(organizer)/org/torneos/${tournamentId}/grupos`}
      />

      <ScrollView contentContainerStyle={s.contenido} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>ELIMINATORIAS</Text>
        <Text style={s.titulo}>{cargando ? ' ' : (categoria ?? 'Cuadro')}</Text>

        {cargando ? (
          <View style={s.centro}><ActivityIndicator color={color.gold} /></View>
        ) : (
          <LiveBracket
            categoryId={categoryId}
            vacio="Esta categoría todavía no tiene cuadro sembrado."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: color.bg },
  centro: { paddingVertical: space[6], alignItems: 'center' },
  // Columna ancha, como el resto del panel: un cuadro de 16 llaves es una
  // rejilla, no una columna de lectura.
  contenido: {
    paddingHorizontal: space[4.5],
    paddingTop: space[2],
    paddingBottom: bottomInset,
    gap: space[3],
    ...webContentColumnAncha,
  },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  titulo:  { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
});
