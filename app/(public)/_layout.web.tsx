/**
 * RALLY · Layout de rutas públicas (sin guard de sesión) — variante WEB
 * El gemelo nativo vive en `_layout.tsx`.
 * Metro resuelve este archivo antes que `_layout.tsx` SOLO al compilar para web.
 *
 * Sin guard, igual que el nativo: términos, privacidad, reembolso,
 * cómo cancelar y ayuda son accesibles sin login.
 * Única diferencia: el <Stack> queda envuelto en CenteredContainer.
 *
 * Aquí NO va WebShell: estas páginas las puede ver alguien sin sesión,
 * así que no llevan navegación de jugador.
 */

import { Stack } from 'expo-router';

import CenteredContainer from '@/components/global/CenteredContainer';
import { color } from '@/lib/design-tokens';

export default function PublicLayoutWeb() {
  return (
    <CenteredContainer>
      <Stack
        screenOptions={{
          headerShown:      false,
          animation:        'slide_from_bottom',
          contentStyle:     { backgroundColor: color.bg },
        }}
      />
    </CenteredContainer>
  );
}
