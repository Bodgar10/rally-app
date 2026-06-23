/**
 * RALLY · Layout de rutas públicas (sin guard de sesión).
 * Accesibles sin login: términos, privacidad, reembolso, cancelar, ayuda.
 */

import { Stack } from 'expo-router';
import { color } from '@/lib/design-tokens';

export default function PublicLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown:      false,
        animation:        'slide_from_bottom',
        contentStyle:     { backgroundColor: color.bg },
      }}
    />
  );
}
