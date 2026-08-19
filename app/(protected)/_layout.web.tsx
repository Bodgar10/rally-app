/**
 * RALLY · Layout del grupo de rutas protegidas (jugador) — variante WEB
 * El gemelo nativo vive en `_layout.tsx` y conserva el tab bar de iOS/Android.
 * Metro resuelve este archivo antes que `_layout.tsx` SOLO al compilar para web.
 *
 * Misma política de acceso que el nativo, sin duplicar lógica:
 * ambos usan `useSessionGuard` como fuente única de verdad.
 *   undefined → todavía verificando (spinner)
 *   null      → sin sesión (ya redirigió a login)
 *   Session   → sesión válida
 *
 * Única diferencia con el nativo: la capa visual.
 * En vez de <Tabs>, aquí va <Slot /> envuelto en <WebShell>, que aporta
 * la navegación (horizontal en escritorio, hamburguesa en web móvil)
 * y centra el contenido en una columna de ancho máximo.
 */

import { View, ActivityIndicator } from 'react-native';
import { Slot } from 'expo-router';

import { useSessionGuard } from '@/hooks/useSessionGuard';
import WebShell from '@/components/global/WebShell';
import { color } from '@/lib/design-tokens';

export default function ProtectedLayoutWeb() {
  const session = useSessionGuard();

  // Cargando mientras se verifica la sesión
  if (session === undefined) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={color.gold} size="large" />
      </View>
    );
  }

  if (!session) return null; // ya redirigió a login

  // Sin declarar pantallas: <Slot /> renderiza la ruta activa
  // y WebShell aporta la navegación.
  return (
    <WebShell>
      <Slot />
    </WebShell>
  );
}
