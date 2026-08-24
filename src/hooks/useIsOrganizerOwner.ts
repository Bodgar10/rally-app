/**
 * RALLY · useIsOrganizerOwner
 *
 * ¿El usuario actual es owner de algún organizador? Con caché a nivel de módulo:
 * una sola consulta por sesión, compartida por todos los consumidores.
 *
 * Por qué la caché: el acceso a "Organizar" vive en el nav de WebShell (presente
 * en TODAS las pantallas del jugador en web) y en el header del dashboard. Sin
 * caché sería una consulta a `organizer_members` por cada navegación. Y el
 * destino del botón depende de esta respuesta, así que resolverla ya en el
 * primer toque evita el parpadeo de "landing → redirect al panel" para alguien
 * que entra a su panel varias veces al día durante un torneo.
 *
 * INVALIDACIÓN — dos caminos, ambos obligatorios:
 *   1. Automático al cambiar la sesión (abajo, vía onAuthStateChange): cubre
 *      logout, login de otro usuario y expiración de token. No depende de que
 *      nadie se acuerde de llamar a nada.
 *   2. Manual con `invalidateOrganizerOwnerCache()` tras un alta exitosa en
 *      organizador/nuevo.tsx. Sin esto, quien acaba de crear su marca seguiría
 *      con la respuesta cacheada `false` y el botón lo devolvería a la landing.
 *
 * No duplica lógica de guards: delega en `isOrganizerOwner` de @/lib/auth/guards.
 */

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import { isOrganizerOwner } from '@/lib/auth/guards';

/** Respuesta ya resuelta, atada al usuario que la produjo. */
let cache: { userId: string; isOwner: boolean } | null = null;

/** Consulta en vuelo, para que N consumidores simultáneos compartan un viaje. */
let inFlight: { userId: string; promise: Promise<boolean> } | null = null;

/** Tira la caché. Llamar tras un alta de organizador. */
export function invalidateOrganizerOwnerCache(): void {
  cache = null;
  inFlight = null;
}

// Invalidación automática ante cualquier cambio de sesión. Se registra una sola
// vez, al cargar el módulo. TOKEN_REFRESHED se ignora a propósito: el usuario
// es el mismo y la respuesta sigue siendo válida.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    invalidateOrganizerOwnerCache();
  }
});

/** Resuelve el valor, reusando caché o consulta en vuelo si las hay. */
async function resolveIsOwner(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return false;

  if (cache?.userId === userId) return cache.isOwner;
  if (inFlight?.userId === userId) return inFlight.promise;

  const promise = isOrganizerOwner(userId).then((isOwner) => {
    cache = { userId, isOwner };
    inFlight = null;
    return isOwner;
  }).catch((e) => {
    // Sin caché en caso de error: el siguiente consumidor reintenta.
    inFlight = null;
    throw e;
  });

  inFlight = { userId, promise };
  return promise;
}

/**
 * `undefined` mientras se resuelve; `true`/`false` una vez conocida.
 *
 * Quien lo consuma debe tratar `undefined` como "todavía no sé": en el nav eso
 * significa mostrar el item igual (el destino se decide al tocarlo), no ocultarlo.
 */
export function useIsOrganizerOwner(): boolean | undefined {
  const [isOwner, setIsOwner] = useState<boolean | undefined>(
    () => cache?.isOwner,
  );

  useEffect(() => {
    let vivo = true;

    resolveIsOwner()
      .then((v) => { if (vivo) setIsOwner(v); })
      .catch(() => { if (vivo) setIsOwner(false); });

    // Re-resolver si la sesión cambia mientras el componente sigue montado.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        resolveIsOwner()
          .then((v) => { if (vivo) setIsOwner(v); })
          .catch(() => { if (vivo) setIsOwner(false); });
      }
    });

    return () => {
      vivo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return isOwner;
}
