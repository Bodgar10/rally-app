/**
 * RALLY · Layout del grupo de rutas del organizador — variante WEB
 * El gemelo nativo vive en `_layout.tsx`.
 * Metro resuelve este archivo antes que `_layout.tsx` SOLO al compilar para web.
 *
 * Guard idéntico al nativo: requiere membresía owner en organizer_members
 * (vía isOrganizerOwner). Sin usuario → login. Sin membresía → dashboard de jugador.
 * Única diferencia: el <Stack> queda envuelto en CenteredContainer.
 *
 * Aquí NO va WebShell: el panel de organizador tiene su propia navegación
 * interna y no debe mostrar el nav del jugador.
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { supabase }              from '@/lib/supabase/client';
import { isOrganizerOwner }      from '@/lib/auth/guards';
import CenteredContainer         from '@/components/global/CenteredContainer';
import { color }                 from '@/lib/design-tokens';

export default function OrganizerLayoutWeb() {
  const router  = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/(auth)/login'); return; }

      const isOwner = await isOrganizerOwner(user.id);
      if (!isOwner) { router.replace('/(protected)/dashboard'); return; }

      setReady(true);
    }
    check();
  }, []);

  if (!ready) return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={color.gold} />
    </View>
  );

  return (
    <CenteredContainer>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </CenteredContainer>
  );
}
