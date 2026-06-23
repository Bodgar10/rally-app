/**
 * RALLY · Layout del grupo de rutas del organizador.
 * Guard: requiere membresía owner en organizer_members.
 * Si no tiene membresía → redirige al dashboard de jugador.
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { supabase }              from '@/lib/supabase/client';
import { isOrganizerOwner }      from '@/lib/auth/guards';
import { color }                 from '@/lib/design-tokens';

export default function OrganizerLayout() {
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
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
