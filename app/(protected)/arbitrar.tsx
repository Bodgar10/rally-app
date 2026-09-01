/**
 * RALLY · La puerta del juez  (URL: /arbitrar)
 *
 * SE LLAMA `arbitrar` Y NO `juez` POR UNA COLISIÓN DE RUTAS
 *   Los grupos entre paréntesis no salen en la URL, así que
 *   `app/(protected)/juez.tsx` y `app/(judge)/juez/index.tsx` competirían por
 *   el mismo `/juez`. La lista de torneos del juez ya vive en la segunda y es
 *   la que tiene que quedarse con ese path; esta es solo el trampolín del tab.
 *
 * POR QUÉ EXISTE ESTA PANTALLA SI YA HAY UNA EN `(judge)`
 *   El tab bar del jugador lo monta `app/(protected)/_layout.tsx`, y `<Tabs>`
 *   solo puede declarar pestañas que sean rutas SUYAS. `(judge)` es otro grupo
 *   de rutas, hermano, así que no puede ser una pestaña por mucho que ese sea
 *   el sitio donde el juez espera encontrarlo. Esta pantalla es la pestaña, y
 *   lo único que hace es mandar al destino correcto.
 *
 *   Con `router.replace`, no `push`: si vuelve atrás desde la captura, sale al
 *   tab anterior y no a un trampolín que lo relanza en bucle.
 *
 * A DÓNDE MANDA
 *   · Con torneos → SIEMPRE a la lista, aunque solo haya uno.
 *   · Ninguno     → al dashboard. No debería llegar nadie: la pestaña no se
 *                   pinta sin torneos. Pasa si te quitan de juez con la app
 *                   abierta, y entonces esto es la red, no el camino.
 *
 * POR QUÉ SE DEJÓ DE SALTAR LA LISTA CON UN SOLO TORNEO
 *   Antes, con un torneo asignado, el tab entraba directo a sus partidos: una
 *   lista de un elemento parecía un toque de peaje. Pero eso rompía el paso
 *   anterior, no lo ahorraba:
 *
 *     · El juez NUNCA elegía torneo, así que la pantalla de partidos no tenía
 *       a dónde volver. Su "Volver" acababa sacándolo del panel entero.
 *     · Y el modelo mental dependía de un dato que cambia: con un torneo el tab
 *       llevaba a los partidos, con dos a la lista. La misma pestaña hacía dos
 *       cosas distintas según el fin de semana.
 *
 *   Home → Juez → Mis torneos → Partidos, siempre. El toque de más compra que
 *   "atrás" signifique lo mismo todas las veces.
 */

import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { useJudgeTournaments } from '@/hooks/useJudgeTournaments';
import { color, font, fontSize } from '@/lib/design-tokens';

export default function PuertaDelJuez() {
  const torneos = useJudgeTournaments();

  useEffect(() => {
    if (torneos === undefined) return;           // todavía resolviendo
    if (torneos.length === 0) {
      router.replace('/(protected)/dashboard');
      return;
    }
    router.replace('/(judge)/juez');
  }, [torneos]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator color={color.gold} />
      <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
        Abriendo tu panel de juez…
      </Text>
    </View>
  );
}
