/**
 * RALLY · Layout del grupo de rutas de autenticación
 * Rutas: login, registro, recuperar, nueva-contrasena, callback
 * Si ya hay sesión activa → redirige al dashboard.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';

export default function AuthLayout() {
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
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
