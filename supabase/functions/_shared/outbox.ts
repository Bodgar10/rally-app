// _shared/outbox.ts — envío y reenvío de las filas de public.email_outbox.
//
// POR QUÉ HAY UNA BANDEJA Y NO SE MANDA Y YA
//   Los correos salen DESPUÉS de que la pareja quedó inscrita, y no bloquean
//   la respuesta: si Resend falla, la inscripción es válida igual y sería
//   absurdo revertirla. Pero entonces el fallo sería invisible — nadie sabría
//   que a María nunca le llegó nada.
//   La fila se escribe en 'pending' ANTES de intentar el envío, así que aunque
//   la función muera a media llamada queda el rastro y se puede reenviar.
//
// POR QUÉ EL PAYLOAD LLEVA TODO DENTRO
//   Al reenviar no se vuelve a consultar el torneo: se reconstruye el correo
//   con lo que se guardó. Si mientras tanto cambiaron la sede o el nombre del
//   torneo, el reenvío manda LO MISMO que el original, que es lo que el
//   organizador espera de un botón que dice "reenviar".

import type { SupabaseClient } from "./clients.ts";
import {
  enviarCorreo,
  plantillaCuentaCreada,
  plantillaCuentaMenor,
  plantillaTeInscribieron,
  type DatosTorneo,
  type Destinatario,
} from "./email.ts";

export type TipoCorreo =
  | "account_created"        // cuenta nueva de adulto → al jugador
  | "minor_account_created"  // cuenta nueva de menor  → al TUTOR
  | "registered"             // adulto ya con cuenta   → al jugador
  | "minor_registered";      // menor ya con cuenta    → al TUTOR

/** Lo que se guarda en email_outbox.payload. Autosuficiente a propósito. */
export interface PayloadOutbox {
  destinatario: Destinatario;
  torneo:       DatosTorneo;
  /**
   * Solo en los tipos 'minor_*'. El correo va al tutor pero habla del jugador,
   * así que hace falta su nombre por separado del destinatario.
   */
  nombreJugador?: string;
}

export interface FilaOutbox {
  id:       string;
  kind:     TipoCorreo;
  to_email: string;
  payload:  PayloadOutbox;
  attempts: number;
}

/**
 * Manda una fila de la bandeja y actualiza su estado.
 *
 * NUNCA lanza. Devuelve true solo si el correo salió. Quien llama está siempre
 * en un camino donde el trabajo importante ya se guardó.
 */
export async function procesarFila(
  supa: SupabaseClient,
  fila: FilaOutbox,
  siteUrl: string,
): Promise<boolean> {
  let plantilla: { subject: string; html: string; text: string };

  try {
    const { destinatario, torneo } = fila.payload;
    switch (fila.kind) {
      case "account_created":
        plantilla = plantillaCuentaCreada(destinatario, torneo, siteUrl);
        break;
      case "minor_account_created":
      case "minor_registered":
        plantilla = plantillaCuentaMenor(
          destinatario,
          // Sin nombre de jugador el correo no tiene sujeto: es payload roto,
          // y el catch de abajo lo marca como fallo no reintentable.
          fila.payload.nombreJugador ?? (() => { throw new Error("falta nombreJugador"); })(),
          torneo,
          siteUrl,
          fila.kind === "minor_account_created",
        );
        break;
      case "registered":
        plantilla = plantillaTeInscribieron(destinatario, torneo, siteUrl);
        break;
    }
  } catch (e) {
    // Payload corrupto o incompleto. No es reintentable: marcar y seguir.
    await supa.from("email_outbox").update({
      status:     "failed",
      attempts:   fila.attempts + 1,
      last_error: `template: ${String((e as Error)?.message ?? e)}`,
    }).eq("id", fila.id);
    return false;
  }

  const res = await enviarCorreo({
    to:      fila.to_email,
    subject: plantilla.subject,
    html:    plantilla.html,
    text:    plantilla.text,
  });

  await supa.from("email_outbox").update({
    status:              res.ok ? "sent" : "failed",
    attempts:            fila.attempts + 1,
    last_error:          res.error,
    sent_at:             res.ok ? new Date().toISOString() : null,
    provider_message_id: res.messageId,
  }).eq("id", fila.id);

  return res.ok;
}

/**
 * Mantiene viva la función después de responder, para que el envío termine.
 *
 * `EdgeRuntime.waitUntil` existe en el runtime de Supabase pero no en el Deno
 * de escritorio, así que se accede con guarda: si no está, se espera la
 * promesa a secas. Sin la guarda, `deno check` y las pruebas locales fallan.
 */
export function trasResponder(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) {
    rt.waitUntil(p);
  } else {
    // El await se descarta a propósito: en local basta con que arranque.
    void p;
  }
}

/** SITE_URL sin barra final. Los enlaces la añaden ellos. */
export function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
}
