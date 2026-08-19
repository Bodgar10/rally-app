/**
 * RALLY · Layout del grupo de rutas de autenticación — variante WEB
 * El gemelo nativo vive en `_layout.tsx`.
 * Metro resuelve este archivo antes que `_layout.tsx` SOLO al compilar para web.
 *
 * Guard inverso idéntico al nativo: si ya hay sesión activa → redirige al dashboard.
 * Única diferencia: el <Stack> queda envuelto en CenteredContainer para que
 * login/registro no se estiren a todo el ancho del monitor.
 *
 * Aquí NO va WebShell: en las pantallas de auth no debe haber navegación
 * de jugador, porque el usuario todavía no tiene sesión.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import CenteredContainer from '@/components/global/CenteredContainer';

export default function AuthLayoutWeb() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // Ya tiene sesión → no debe estar en las pantallas de auth
        router.replace('/(protected)/dashboard');
        return;
      }
      setChecked(true);
    }
    checkSession();
  }, []);

  if (!checked) return null; // espera silenciosa mientras redirige

  return (
    <CenteredContainer>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      />
    </CenteredContainer>
  );
}
