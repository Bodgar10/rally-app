/**
 * app/(organizer)/org/torneos/nuevo-tipo.tsx
 *
 * RALLY · La primera pregunta al crear un torneo: ¿de qué tipo?
 *
 * ES UNA PANTALLA Y NO UN CAMPO DENTRO DEL FORMULARIO
 *   Un exprés y un torneo largo piden datos distintos: uno un día y una
 *   categoría, el otro un rango de fechas y hasta ocho. Si la pregunta viviera
 *   dentro del formulario, la mitad de los campos tendría que aparecer y
 *   desaparecer según una casilla de arriba.
 *
 *   Preguntándolo antes, cada formulario queda entero y `nuevo.tsx` —el de
 *   siempre— no se toca ni una línea.
 */

import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import BotonVolver from '@/components/ui/BotonVolver';
import SelectorDeModo, { type ModoTorneo } from '@/components/expres/SelectorDeModo';
import { color, space } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';

export default function NuevoTipoScreen() {
  const router = useRouter();
  const [modo, setModo] = useState<ModoTorneo | null>(null);

  function elegir(m: ModoTorneo) {
    setModo(m);
    router.push(
      m === 'expres'
        ? '/(organizer)/org/torneos/nuevo-expres'
        : '/(organizer)/org/torneos/nuevo',
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.cont}>
        <BotonVolver texto="Volver" />
        <SelectorDeModo valor={modo} onElegir={elegir} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  cont: {
    paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: bottomInset,
    gap: space[3], ...webContentColumn,
  },
});
