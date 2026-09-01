/**
 * RALLY · Volver sin quedarse quieto
 *
 * EL MISMO FALLO, DOCE VECES
 *   `router.back()` no hace NADA cuando no hay historial que deshacer, y eso
 *   pasa más de lo que parece: se llegó con `replace`, se abrió la URL directa
 *   en web, se recargó con F5, se entró desde un enlace compartido. El botón se
 *   pintaba igual y no respondía al tocarlo.
 *
 *   `BotonVolver` ya lo resolvía para los botones "← Volver". Pero el mismo
 *   `router.back()` a secas seguía suelto en doce sitios que NO son ese botón:
 *   los "Cancelar" de los formularios y las vueltas de después de guardar. Ahí
 *   el fallo es peor de leer, porque el usuario acaba de pulsar "Guardar", la
 *   pantalla no se mueve y no hay forma de saber si se guardó.
 *
 * POR QUÉ UN HOOK Y NO COPIAR LAS CUATRO LÍNEAS
 *   Porque copiadas se desincronizan: `BotonVolver` tenía la lógica dentro y
 *   nada garantizaba que el siguiente sitio la repitiera igual — de hecho los
 *   doce no la repetían en absoluto. Ahora la regla vive una vez y
 *   `BotonVolver` también la consume.
 *
 * `rutaPadre` es la parte pensada y está aparte, en `@/lib/navegacion`, con sus
 * propios tests: este hook solo la enchufa al router.
 */

import { useCallback } from 'react';
import { usePathname, useRouter } from 'expo-router';

import { rutaPadre } from '@/lib/navegacion';

/**
 * Devuelve la función de volver: atrás si se puede, y si no, al padre.
 *
 * `destino` solo hace falta cuando el padre de la URL no es el sitio del que se
 * viene. Sin él se usa `rutaPadre(pathname)`, que acierta en casi todas.
 *
 * `replace` y no `push` para el fallback: si no había historial, apilar una
 * entrada nueva dejaría un "atrás" del navegador que devuelve justo a la
 * pantalla de la que el usuario acaba de salir.
 */
export function useVolver(): (destino?: string) => void {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback((destino?: string) => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(destino ?? rutaPadre(pathname));
  }, [router, pathname]);
}

export default useVolver;
