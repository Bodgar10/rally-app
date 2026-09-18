/**
 * RALLY · Feature flags
 *
 * SUBSCRIPTION_CTA_DIRECT — controla si el CTA de suscripción puede mostrar
 * precio + checkout directo dentro de la app.
 *   - false (MX/iOS): el banner es SOLO informativo, sin precio ni checkout
 *     in-app (Doc C §2.7 — evitar reglas de IAP de la App Store).
 *   - true (US/EU/web): se permite precio y CTA directo a planes.
 */

import { Platform } from 'react-native';

// ─── Flag de región: CTA de suscripción ──────────────────────────────────────
//
// REGLA CRÍTICA (Doc C §2.7 + §11 del proyecto):
//   - En México/iOS: el CTA in-app de suscripción es SOLO INFORMATIVO.
//     No muestra precio, no tiene botón de checkout dentro de la app.
//     Solo un link que abre la web en el navegador.
//   - En EE.UU./UE o en la web: puede ser directo (precio + checkout).
//
// Fuente de la región:
//   OPCIÓN A (actual): env var EXPO_PUBLIC_SUBSCRIPTION_REGION
//     - "MX" → informativo (iOS México)
//     - "US", "EU" → directo
//     - no definida → MX (comportamiento seguro por defecto)
//   OPCIÓN B (futura): locale del dispositivo o respuesta del servidor.
//
// ⚠️ DECISIÓN PENDIENTE DEL EQUIPO: confirmar la fuente de `region` antes
// de publicar en producción. Ver recordatorio manual en S4-SON-07.

type SubscriptionRegion = 'MX' | 'US' | 'EU' | 'OTHER';

function getSubscriptionRegion(): SubscriptionRegion {
  // OPCIÓN A: desde env var (configurable por build/deploy)
  const envRegion = process.env.EXPO_PUBLIC_SUBSCRIPTION_REGION?.toUpperCase();
  if (envRegion === 'US') return 'US';
  if (envRegion === 'EU') return 'EU';
  if (envRegion === 'MX') return 'MX';
  // Default seguro: MX (México, región inicial del producto)
  return 'MX';
}

/**
 * SUBSCRIPTION_CTA_DIRECT
 *
 * true  → el CTA in-app puede mostrar precio y enlazar al checkout web
 *         (regiones donde el steering a pago externo es permitido, o en la web)
 *
 * false → el CTA in-app es SOLO INFORMATIVO: muestra beneficios, sin precio,
 *         sin checkout. El único botón abre la web en el navegador.
 *         (México/iOS — regla App Store MX vigente a Jun 2026)
 *
 * Las inscripciones a torneos NO están afectadas por este flag:
 * son servicio real → siempre se cobran por Stripe Connect dentro de la app.
 */
export function isSubscriptionCTADirect(): boolean {
  // En la web siempre directo (no hay restricción de App Store)
  if (Platform.OS === 'web') return true;

  const region = getSubscriptionRegion();
  // Solo US y EU permiten el CTA directo en app nativa (y solo si la normativa
  // de esa región lo permite → revisar antes de habilitar).
  return region === 'US' || region === 'EU';
}

// ─── Flag: prioridad de inscripción ──────────────────────────────────────────
//
// APAGADA A PROPÓSITO, Y NO PORQUE ESTÉ A MEDIAS.
//
//   "Los suscriptores se inscriben antes" solo vale algo si hay fila de espera.
//   Hoy, en el pádel amateur, los torneos TARDAN en llenarse: la ventana de
//   prioridad no le quitaría el sitio a nadie y lo único que haría es molestar
//   a quien llegó a inscribirse y se encuentra la puerta cerrada por un motivo
//   que no entiende.
//
//   El día que un exprés se llene en horas, esto pasa de molestia a una de las
//   razones más fuertes para suscribirse. Por eso el código está entero y
//   probado —la columna, las dos comprobaciones y las dos pantallas— y lo único
//   que falta para encenderlo es poner esto en true.
//
//   Se deja apagado en LECTURA, no en escritura: la migración 080 y las
//   comprobaciones del servidor siguen activas. Con `prioridad_hasta` en null,
//   que es como están todos los torneos, no hacen nada.
export function isPrioridadInscripcionOn(): boolean {
  return process.env.EXPO_PUBLIC_PRIORIDAD_INSCRIPCION === 'true';
}

export interface FeatureFlags {
  SUBSCRIPTION_CTA_DIRECT: boolean;
  PRIORIDAD_INSCRIPCION: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    SUBSCRIPTION_CTA_DIRECT: isSubscriptionCTADirect(),
    PRIORIDAD_INSCRIPCION: isPrioridadInscripcionOn(),
  };
}
