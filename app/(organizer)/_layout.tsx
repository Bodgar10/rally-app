/**
 * RALLY · Layout del grupo de rutas del organizador.
 * Guard: requiere membresía owner en organizer_members.
 * Si no tiene membresía → redirige al dashboard de jugador.
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { supabase }              from '@/lib/supabase/client';
import { isOrganizerOwner }      from '@/lib/auth/guards';
import { color }                 from '@/lib/design-tokens';
import AyudaOrganizador          from '@/components/organizer/AyudaOrganizador';
import BarraDeGuia, { ALTO_BARRA_GUIA } from '@/components/organizer/BarraDeGuia';
import { useGuiaEnPantalla }     from '@/hooks/useGuiaEnPantalla';

export default function OrganizerLayout() {
  const router  = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/(auth)/login'); return; }

      const isOwner = await isOrganizerOwner(user.id);
      if (!isOwner) { router.replace('/(protected)/dashboard'); return; }

      setReady(true);
    }
    check();
  }, []);

  const tipoGuia = useGuiaEnPantalla()?.tipo;
  const conGuia = tipoGuia === 'paso' || tipoGuia === 'transito';

  if (!ready) return (
    <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={color.gold} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* El hueco que la barra necesita, y solo mientras hay guía. */}
      <View style={{ flex: 1, paddingBottom: conGuia ? ALTO_BARRA_GUIA : 0 }}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
      </View>
      {/* LA AYUDA VIVE EN EL LAYOUT, no en cada pantalla: son diecisiete y
          media docena se olvidaría. `AyudaOrganizador` decide sola si tiene
          sentido pintarse (fuera de un torneo se calla) y `BarraDeGuia` solo
          aparece si hay una guía corriendo en ESTA pantalla.

          La barra va FUERA del View con padding y no dentro: en Yoga, un hijo
          absoluto se posiciona contra la caja de padding del padre, así que
          desde dentro `bottom` la devolvería encima del contenido — que es
          justo el hueco que el padding acaba de abrir. */}
      <AyudaOrganizador />
      <BarraDeGuia />
    </View>
  );
}
