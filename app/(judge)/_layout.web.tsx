/**
 * app/(judge)/_layout.web.tsx
 *
 * RALLY · Guard del grupo (judge).
 * El gemelo nativo vive en `_layout.tsx`.
 * Metro resuelve este archivo antes que `_layout.tsx` SOLO al compilar para web.
 *
 * Única diferencia con el nativo: el <Slot /> queda envuelto en CenteredContainer.
 * Aquí NO va WebShell: la vista de juez es una herramienta de captura,
 * no debe mostrar el nav del jugador.
 *
 * QUÉ SE COMPRUEBA — que tenga ALGÚN torneo donde capturar.
 *
 * ESTE GUARD ESTABA MAL Y ERA EL MOTIVO DE QUE EL JUEZ NO ENTRARA.
 *   Pedía una membresía `organizer_members.member_role = 'judge'` que el juez
 *   no tiene por qué tener. La pantalla de asignación lo dice en su cabecera
 *   —"el juez no tiene que ser de tu organización"— y `can_capture_tournament`
 *   (migración 054) opina lo mismo: admin, O owner del organizador, O fila en
 *   `tournament_judges`. Ninguna de esas tres ramas es la membresía 'judge'.
 *
 *   Verificado contra la base del torneo de prueba: los dos jueces asignados
 *   estaban en `tournament_judges` y NINGUNO en `organizer_members`, así que
 *   este guard los rebotaba al dashboard — incluido el owner, cuya membresía
 *   es 'owner' y no 'judge'. Con el menú arreglado y esto sin arreglar, la
 *   pestaña habría llevado a una redirección instantánea de vuelta.
 *
 *   `useJudgeTournaments` es ahora la fuente única: la misma que decide si la
 *   pestaña aparece. Si el menú te la enseña, entras; no puede haber
 *   desacuerdo entre las dos porque son la misma consulta.
 *
 *   Aquí NO se filtra por torneo concreto: eso lo hace el servidor en cada
 *   captura (`can_capture_tournament`), que es donde tiene que estar. Esto es
 *   una puerta de pantalla, no la autorización.
 */

import { useEffect } from 'react';
import { Slot, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import CenteredContainer from '@/components/global/CenteredContainer';
import { useJudgeTournaments } from '@/hooks/useJudgeTournaments';
import { color } from '@/lib/design-tokens';

export default function JudgeLayoutWeb() {
  const torneos = useJudgeTournaments();

  // El redirect va en un efecto, no en el render: llamar a `router.replace`
  // mientras se renderiza deja a expo-router navegando dentro de su propio
  // ciclo de pintado.
  useEffect(() => {
    if (torneos !== undefined && torneos.length === 0) {
      router.replace('/(protected)/dashboard');
    }
  }, [torneos]);

  if (torneos === undefined || torneos.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  return (
    <CenteredContainer>
      <Slot />
    </CenteredContainer>
  );
}
