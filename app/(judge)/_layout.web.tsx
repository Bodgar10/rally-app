/**
 * app/(judge)/_layout.web.tsx
 *
 * RALLY · Guard del grupo (judge) — variante WEB
 * El gemelo nativo vive en `_layout.tsx`.
 * Metro resuelve este archivo antes que `_layout.tsx` SOLO al compilar para web.
 *
 * REGLAS DE ACCESO (modelo "Airbnb") — idénticas al nativo:
 * - El juez NO tiene users.role = 'judge'.
 * - Es un player con una membresía member_role = 'judge' en organizer_members.
 * - Este guard verifica esa membresía. Si no la tiene → redirect a dashboard.
 *
 * Única diferencia con el nativo: el <Slot /> queda envuelto en CenteredContainer.
 * Aquí NO va WebShell: la vista de juez es una herramienta de captura,
 * no debe mostrar el nav del jugador.
 */

import { useEffect, useState } from 'react';
import { Slot, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import CenteredContainer from '@/components/global/CenteredContainer';
import { color } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';

type AuthState = 'loading' | 'authorized' | 'unauthorized';

export default function JudgeLayoutWeb() {
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    async function checkJudgeAccess() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setAuthState('unauthorized');
          return;
        }

        // Verificar membresía judge en organizer_members
        const { data, error } = await supabase
          .from('organizer_members')
          .select('id')
          .eq('user_id', user.id)
          .eq('member_role', 'judge')
          .limit(1);

        if (error) {
          console.error('[JudgeLayoutWeb] error al verificar membresía:', error);
          setAuthState('unauthorized');
          return;
        }

        if (data && data.length > 0) {
          setAuthState('authorized');
        } else {
          setAuthState('unauthorized');
        }
      } catch (e) {
        console.error('[JudgeLayoutWeb] excepción:', e);
        setAuthState('unauthorized');
      }
    }

    checkJudgeAccess();
  }, []);

  if (authState === 'loading') {
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

  if (authState === 'unauthorized') {
    // Redirect fuera del render para evitar loops
    router.replace('/(protected)/dashboard');
    return null;
  }

  return (
    <CenteredContainer>
      <Slot />
    </CenteredContainer>
  );
}
