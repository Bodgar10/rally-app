// _shared/idempotency.ts — deduplicación de eventos de webhook por event.id.
import type { SupabaseClient } from "./clients.ts";

/**
 * Intenta registrar el evento. Devuelve true si es NUEVO (procesar),
 * false si ya fue procesado (reintento de Stripe → ignorar).
 */
export async function claimEvent(
  supa: SupabaseClient,
  eventId: string,
  type: string,
  source: "billing" | "connect",
): Promise<boolean> {
  const { data, error } = await supa
    .from("stripe_processed_events")
    .insert({ event_id: eventId, type, source })
    .select("event_id")
    .maybeSingle();
  if (error) {
    // 23505 = unique_violation → ya procesado. Cualquier otro error: trátalo como ya-procesado
    // para no re-disparar efectos ante fallos transitorios (Stripe reintentará si devolvemos !=2xx).
    return false;
  }
  return !!data;
}
