/**
 * RALLY · Root Layout
 * Provider raíz: fuentes (Oswald + Inter), NativeWind,
 * sesión Supabase y gate de autenticación.
 * Expo Router v3 — slot-based layout.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import * as Font from 'expo-font';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';
import { color } from '@/lib/design-tokens';

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [_session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Cargar fuentes (Doc D §3 — Oswald + Inter)
  useEffect(() => {
    async function loadFonts() {
      await Font.loadAsync({
        'Oswald':        require('../assets/fonts/Oswald-Regular.ttf'),
        'Oswald-Medium': require('../assets/fonts/Oswald-Medium.ttf'),
        'Oswald-SemiBold': require('../assets/fonts/Oswald-SemiBold.ttf'),
        'Oswald-Bold':   require('../assets/fonts/Oswald-Bold.ttf'),
        'Inter':         require('../assets/fonts/Inter-Regular.ttf'),
        'Inter-Medium':  require('../assets/fonts/Inter-Medium.ttf'),
        'Inter-SemiBold':require('../assets/fonts/Inter-SemiBold.ttf'),
      });
      setFontsLoaded(true);
    }
    loadFonts().catch(console.error);
  }, []);

  // Escuchar cambios de sesión Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Splash mientras cargan fuentes o se verifica la sesión
  if (!fontsLoaded || !sessionChecked) {
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

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
