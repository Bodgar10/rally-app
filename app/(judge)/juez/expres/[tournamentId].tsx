/**
 * app/(judge)/juez/expres/[tournamentId].tsx
 *
 * RALLY · Capturar los marcadores de un exprés.
 *
 * ► TODO EL TRABAJO LO HACE `PartidosYCaptura`
 *   Esta pantalla era la única que tenía la agenda —qué se juega, a qué hora,
 *   en qué cancha— y la captura. El panel del organizador solo enseñaba las
 *   tablas, así que para anotar un marcador había que venir aquí, aunque en un
 *   exprés el que suele apuntar ES el organizador: está en el club esa tarde y
 *   muchas veces no hay juez asignado.
 *
 *   La agenda se sacó a un componente compartido y ahora la usan los dos. Aquí
 *   solo queda el marco: la cabecera y el botón de volver. Copiarla habría
 *   garantizado que dentro de un mes la del juez y la del organizador
 *   enseñaran cosas distintas del mismo partido.
 */

import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import BotonVolver from '@/components/ui/BotonVolver';
import PartidosYCaptura from '@/components/expres/PartidosYCaptura';
import { color, font, fontSize, space } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

export default function JuezExpresScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />
        <Text style={s.h1}>Capturar</Text>
        {tournamentId && <PartidosYCaptura tournamentId={tournamentId} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  cont: {
    paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: bottomInset,
    gap: space[2], ...webContentColumn,
  },
  h1: {
    color: color.champagne, fontFamily: font.display, fontSize: fontSize.screenH1,
    textTransform: 'uppercase', letterSpacing: 1,
  },
});
