/**
 * RALLY · Layout de web
 * Decisiones de layout que SOLO aplican en web, resueltas en un único lugar.
 *
 * Regla de oro: en nativo (iOS/Android) todo lo que sale de aquí es inerte.
 * `webContentColumn` es literalmente `{}`, así que spreadearlo en un objeto
 * de estilos no añade ni una clave y no puede cambiar ni un píxel.
 * Eso convierte "nativo no cambió" en algo demostrable, no en una promesa:
 * lo fija el test de src/lib/__tests__/web-layout.test.ts.
 *
 * Por qué existe este archivo en vez de repetir `Platform.OS === 'web' && {…}`
 * en las ~28 pantallas: una sola fuente de verdad que no se puede desincronizar.
 */

import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

import { layout, space } from './design-tokens';

export interface WebLayoutValues {
  /**
   * Centra el contenido de un scroller en una columna de ancho máximo.
   *
   * Va SIEMPRE en el `contentContainerStyle` del ScrollView, nunca en su `style`:
   * el scroller debe ocupar todo el ancho de la ventana (para que la rueda del
   * mouse funcione en cualquier punto y el scrollbar quede pegado al borde),
   * y es su contenido el que se limita a `layout.contentMaxWidth`.
   *
   * NUNCA aplicar a un ScrollView con la prop `horizontal`: le caparía el ancho
   * y dejaría de desbordar (ver los chips de división en ranking.tsx y ayuda.tsx).
   *
   * En nativo vale `{}`. Importa que sea así y no un `maxWidth` cualquiera:
   * app.json declara `ios.supportsTablet: true`, y un ancho máximo caparía
   * el contenido en iPad.
   */
  webContentColumn: ViewStyle;
  /**
   * Relleno inferior al final de un scroll.
   *
   * Nativo: 48 (space[6] * 2) — el hueco que reserva el tab bar de 86px.
   * Web:    24 (space[6])     — no hay tab bar; solo aire para que la última
   *                             tarjeta no quede pegada al borde de la ventana.
   */
  bottomInset: number;
}

/**
 * Resuelve los valores para una plataforma dada.
 *
 * Es una función pura y exportada a propósito: permite que el test cubra las
 * tres plataformas sin mockear `react-native`. Mockear el módulo entero rompe
 * la cadena que el preset de jest-expo monta para NativeWind/css-interop.
 *
 * En producción solo se llama una vez, justo debajo, con `Platform.OS`.
 */
export function resolveWebLayout(os: string): WebLayoutValues {
  const isWeb = os === 'web';

  return {
    webContentColumn: isWeb
      ? { maxWidth: layout.contentMaxWidth, alignSelf: 'center', width: '100%' }
      : {},
    bottomInset: isWeb ? space[6] : space[6] * 2,
  };
}

const resolved = resolveWebLayout(Platform.OS);

/** Ver WebLayoutValues.webContentColumn */
export const webContentColumn: ViewStyle = resolved.webContentColumn;

/** Ver WebLayoutValues.bottomInset */
export const bottomInset: number = resolved.bottomInset;
