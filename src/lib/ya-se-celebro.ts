/**
 * RALLY · El confeti se lanza UNA vez
 *
 * Un campeón que abre la app cuatro veces esa tarde no quiere cuatro fiestas:
 * la primera emociona y la cuarta molesta. Lo que se recuerda es el trofeo, y
 * el trofeo se queda.
 *
 * Se guarda por PARTIDO —la final concreta que ganó— y no por jugador: si gana
 * otro torneo, esa es otra celebración y le toca la suya.
 *
 * Todo el módulo falla hacia el silencio: si el almacenamiento no responde se
 * da por celebrado. Equivocarse por no lanzar confeti es mucho más barato que
 * equivocarse por lanzarlo cada vez que se abre la pantalla.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const clave = (matchId: string) => `rally:campeon-celebrado:${matchId}`;

/** ¿Ya se celebró esta final? */
export async function yaSeCelebro(matchId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(clave(matchId))) !== null;
  } catch {
    return true;
  }
}

/** Dejar constancia de que se celebró. */
export async function marcarCelebrado(matchId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(clave(matchId), '1');
  } catch {
    // Sin constancia se celebraría otra vez, y eso es lo único que se evita
    // aquí. No vale la pena romper nada por ello.
  }
}
