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
 * ► QUIEN YA ENTRÓ EN ESTE DISPOSITIVO VA A SU DASHBOARD
 *   La portada es para quien todavía no sabe qué es esto. A quien ya tiene
 *   sesión guardada, enseñársela es ponerle un folleto delante de sus torneos.
 *
 *   ► Y SE COMPRUEBA DESPUÉS DE PINTAR, NO ANTES.
 *     Esperar a `getSession()` para decidir qué montar devolvería el spinner
 *     que esta pantalla existe para quitar, y se lo comería TODO EL MUNDO —
 *     incluido el visitante nuevo, que es justo a quien la portada va dirigida
 *     y el único que no tiene sesión que esperar.
 *
 *     Así que se monta la portada ya y, si aparece una sesión, se redirige.
 *     El visitante ve la página al instante; quien tiene sesión ve un
 *     parpadeo camino de donde iba de todas formas. El coste cae en quien
 *     menos le importa.
 *
 *   `BotonEntrar` vuelve a mirar la sesión al pulsarse. Es redundante aquí
 *   —quien ve la portada no tiene— pero no en `/landing`, que sí se puede
 *   abrir con sesión a propósito.
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
    let vivo = true;

    async function decidir() {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;

      if (data.session) {
        // Ya entró en este dispositivo: a sus torneos, no al folleto.
        router.replace('/(protected)/dashboard');
      } else if (!ES_WEB) {
        // Sin sesión en la app instalada: al login. En web no se hace nada,
        // porque la portada ya está montada debajo y es su sitio.
        router.replace('/(auth)/login');
      }
    }

    decidir();
    return () => { vivo = false; };
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
