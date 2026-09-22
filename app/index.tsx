/**
 * RALLY · Entrada principal
 *
 * ► EN WEB, LA RAÍZ **ES** LA PORTADA. NO REDIRIGE A ELLA.
 *   Antes esto era una pantalla de carga que decidía a dónde mandarte. Aunque
 *   el destino fuera el correcto, quien abría la web veía un spinner y un
 *   salto de URL antes de ver nada — y una portada que empieza con un parpadeo
 *   ya perdió el primer segundo, que es el único que tiene garantizado.
 *
 *   Ahora `/` monta la portada directamente: sale pintada de inmediato, la URL
 *   no cambia y se puede compartir el enlace de la raíz sin que rebote.
 *
 *   Del login se encargan los botones. Es lo que pidió el producto y además es
 *   lo correcto: a nadie se le pide la contraseña antes de decirle qué es esto.
 *
 * ► CON SESIÓN TAMBIÉN SE VE LA PORTADA, Y EL BOTÓN CAMBIA DE DESTINO
 *   Se valoró mandar al dashboard a quien ya tiene sesión, y se descartó: la
 *   regla es "quien abre la web ve la portada", y una regla con excepciones
 *   invisibles es la que produce los "a mí no me sale eso".
 *
 *   Lo que sí se respeta es no hacerle repetir el login: `BotonEntrar` mira la
 *   sesión al pulsarse y lleva al dashboard si la hay. Un toque, no dos.
 *
 * ► EN NATIVO NO HAY PORTADA
 *   A quien ya se descargó la app no hay que venderle la app. Ahí se mantiene
 *   el comportamiento de siempre: con sesión al dashboard, sin sesión al login.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color } from '@/lib/design-tokens';
import Landing from '@/components/landing/Landing';

const ES_WEB = Platform.OS === 'web';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // En web no se redirige nada: la portada ya está montada debajo.
    if (ES_WEB) return;

    async function redirect() {
      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? '/(protected)/dashboard' : '/(auth)/login');
    }
    redirect();
  }, [router]);

  if (ES_WEB) return <Landing />;

  // Nativo: pantalla de carga mientras se evalúa la sesión.
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
