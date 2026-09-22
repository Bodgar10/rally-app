/**
 * app/(public)/landing.tsx
 *
 * RALLY · La portada, por su propia URL.
 *
 * El cuerpo vive en `@/components/landing/Landing` porque se monta desde dos
 * sitios: aquí y en la raíz de la web (`app/index.tsx`). Una ruta importando
 * otra ruta es algo que el router no promete que siga funcionando.
 *
 * Esta URL existe para poder enlazar la portada desde dentro de la app o
 * compartirla sin pasar por la raíz.
 */

import Landing from '@/components/landing/Landing';

export default function LandingScreen() {
  return <Landing />;
}
