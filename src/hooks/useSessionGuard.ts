/**
 * RALLY · useSessionGuard
 * Guard de sesión compartido por los layouts del grupo (protected),
 * tanto el nativo (_layout.tsx) como el de web (_layout.web.tsx).
 * Fuente única de verdad de la política de acceso del jugador:
 * si no hay sesión activa → redirige a login.
 *
 * Devuelve:
 *   undefined → todavía verificando (mostrar spinner)
 *   null      → sin sesión (ya se disparó el redirect; no renderizar nada)
 *   Session   → sesión válida (renderizar el layout)
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

export function useSessionGuard(): Session | null | undefined {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // Verificar sesión al montar
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        router.replace('/(auth)/login');
      }
    });

    // Escuchar cambios (logout, expiración)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        router.replace('/(auth)/login');
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return session;
}

export default useSessionGuard;
