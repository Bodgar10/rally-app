/**
 * RALLY · Layout del grupo de rutas protegidas (jugador)
 * Guard: requiere sesión activa.
 * Si no hay sesión → redirige a login.
 * Aquí vive el tab bar del jugador (Doc D §8.6).
 */

import { View, ActivityIndicator } from 'react-native';
import { Tabs } from 'expo-router';

import { useSessionGuard } from '@/hooks/useSessionGuard';
import { color } from '@/lib/design-tokens';

// Importar íconos de Tabler (outline) — Doc D §7
// TODO: Instalar @tabler/icons-react-native cuando se configure
// Por ahora usamos Text como placeholder de ícono

function TabIcon({ label, active }: { label: string; active: boolean }) {
  const { Text } = require('react-native');
  return (
    <Text style={{ fontSize: 10, color: active ? color.gold : color.muted }}>
      {label}
    </Text>
  );
}

export default function ProtectedLayout() {
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          // Doc D §8.6 — Tab bar
          height: 86,
          backgroundColor: 'rgba(10,10,12,0.92)',
          borderTopWidth: 1,
          borderTopColor: color.line,
        },
        tabBarActiveTintColor:   color.gold,
        tabBarInactiveTintColor: color.muted,
        tabBarLabelStyle: {
          fontSize: 9.5,
          fontFamily: 'Inter-Medium',
          marginBottom: 6,
        },
      }}
    >
      {/* Tab 1 — Home (Dashboard) */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon label="🏠" active={focused} />,
        }}
      />
      {/* Tab 2 — Mis Torneos */}
      <Tabs.Screen
        name="torneos/index"
        options={{
          title: 'Torneos',
          tabBarIcon: ({ focused }) => <TabIcon label="🏆" active={focused} />,
        }}
      />
      {/* Tab 3 — Mi Ranking */}
      <Tabs.Screen
        name="ranking"
        options={{
          title: 'Ranking',
          tabBarIcon: ({ focused }) => <TabIcon label="📊" active={focused} />,
        }}
      />
      {/* Tab 4 — Pro (suscripción del jugador) */}
      <Tabs.Screen
        name="planes"
        options={{
          title: 'Pro',
          tabBarIcon: ({ focused }) => <TabIcon label="⚡" active={focused} />,
        }}
      />
      {/* Tab 5 — Perfil */}
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => <TabIcon label="👤" active={focused} />,
        }}
      />

      {/* --- Rutas navegables que NO son pestañas (href: null las oculta del tab bar) --- */}
      <Tabs.Screen name="onboarding" options={{ href: null }} />
      <Tabs.Screen name="torneos/[tournamentId]" options={{ href: null }} />
      <Tabs.Screen name="inscripcion/[tournamentId]/index" options={{ href: null }} />
      <Tabs.Screen name="inscripcion/[tournamentId]/pago" options={{ href: null }} />
      <Tabs.Screen name="inscripcion/[tournamentId]/patrocinadores" options={{ href: null }} />
    </Tabs>
  );
}
