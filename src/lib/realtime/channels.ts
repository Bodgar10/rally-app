/**
 * src/lib/realtime/channels.ts
 *
 * RALLY · Convención única de nombres de canal Realtime
 * y helpers de suscripción/desuscripción para Supabase Realtime.
 *
 * REGLAS:
 * - Un canal por scope (torneo / categoría / grupo / pareja).
 * - Nunca suscribirse a tablas completas sin filtro de fila.
 * - Toda suscripción tiene guard Platform.OS: no usar APIs solo-web.
 * - Llamar siempre a `unsubscribe()` en el cleanup de useEffect.
 */

import { Platform } from 'react-native';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

// ───────────────────────────────────────────
// 1. Nombres de canal (convención única)
// ───────────────────────────────────────────

/** Canal de eventos generales de un torneo (calendario, estado). */
export const tournamentChannel = (tournamentId: string) =>
  `tournament:${tournamentId}` as const;

/** Canal de una categoría (standings, clinch, bracket). */
export const categoryChannel = (categoryId: string) =>
  `category:${categoryId}` as const;

/** Canal de un grupo específico (standings en vivo). */
export const groupChannel = (groupId: string) =>
  `group:${groupId}` as const;

/** Canal personal de una pareja (mi próximo partido). */
export const pairChannel = (pairId: string) =>
  `pair:${pairId}` as const;

// ───────────────────────────────────────────
// 2. Tipos
// ───────────────────────────────────────────

export type RealtimeTable =
  | 'group_standings'
  | 'matches'
  | 'match_sets';

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface SubscribeOptions<T extends Record<string, unknown>> {
  /** Nombre único del canal (usar helpers de arriba). */
  channelName: string;
  /** Tabla de Postgres a escuchar. */
  table: RealtimeTable;
  /** Evento a capturar. Default '*'. */
  event?: RealtimeEvent;
  /**
   * Filtro de fila tipo PostgREST.
   * Ejemplo: `group_id=eq.${groupId}`
   * SIEMPRE filtrar por un ID concreto; nunca suscribirse sin filtro.
   */
  filter: string;
  /** Callback con el payload completo. */
  onData: (payload: RealtimePostgresChangesPayload<T>) => void;
  /** Callback opcional de error de canal. */
  onError?: (err: Error) => void;
  /**
   * El canal confirmó `SUBSCRIBED`: a partir de aquí llegan cambios de verdad.
   *
   * Existe para poder ENSEÑARLO. Una suscripción que no se abre no falla de
   * forma visible: el componente se pinta igual y sencillamente no se entera de
   * nada nunca. Con esto, la pantalla puede encender su "en vivo" solo cuando
   * hay canal, en vez de prometerlo.
   */
  onSubscribed?: () => void;
}

// ───────────────────────────────────────────
// 3. Helper principal: subscribeToTable
// ───────────────────────────────────────────

/**
 * Suscribe a cambios de una tabla con filtro de fila.
 *
 * - Guard Platform.OS: en entornos sin WebSocket nativo devuelve noop.
 * - Retorna la función de cleanup; llamarla en el return del useEffect.
 *
 * @example
 * useEffect(() => {
 *   const unsub = subscribeToTable({
 *     channelName: groupChannel(groupId),
 *     table: 'group_standings',
 *     filter: `group_id=eq.${groupId}`,
 *     onData: (payload) => { ... },
 *   });
 *   return unsub;
 * }, [groupId]);
 */
export function subscribeToTable<T extends Record<string, unknown>>(
  options: SubscribeOptions<T>
): () => void {
  const { channelName, table, event = '*', filter, onData, onError, onSubscribed } = options;

  // Guard: React Native Web expone WebSocket pero la superficie de Supabase
  // Realtime funciona igual; guard solo para entornos sin conexión real (ej. SSR).
  if (typeof globalThis.WebSocket === 'undefined' && Platform.OS === 'web') {
    console.warn(`[realtime] WebSocket no disponible en este entorno. Canal: ${channelName}`);
    return () => {};
  }

  let channel: RealtimeChannel | null = null;

  try {
    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          filter,
        },
        (payload) => {
          onData(payload as RealtimePostgresChangesPayload<T>);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') onSubscribed?.();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const error = err ?? new Error(`Canal ${channelName} falló: ${status}`);
          console.error('[realtime]', error);
          onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      });
  } catch (err) {
    console.error('[realtime] Error al crear canal:', err);
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return () => {};
  }

  // Cleanup: remover canal de la instancia de Supabase
  return () => {
    if (channel) {
      supabase.removeChannel(channel).catch((e) =>
        console.warn('[realtime] Error al remover canal:', e)
      );
      channel = null;
    }
  };
}

// ───────────────────────────────────────────
// 4. Helper para múltiples suscripciones
// ───────────────────────────────────────────

/**
 * Combina varias llamadas a subscribeToTable en un solo cleanup.
 * Útil cuando una pantalla necesita escuchar varias tablas a la vez.
 *
 * @example
 * return combineUnsubs(
 *   subscribeToTable({ ... }),
 *   subscribeToTable({ ... }),
 * );
 */
export function combineUnsubs(...unsubs: Array<() => void>): () => void {
  return () => unsubs.forEach((u) => u());
}
