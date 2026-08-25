// email-resend — reenvía un correo de la bandeja que no salió.
//
// POR QUÉ ES UNA FUNCIÓN Y NO UN UPDATE DESDE EL CLIENTE
//   email_outbox no tiene policies de escritura a propósito. Si el cliente
//   pudiera escribir ahí, podría marcar como 'sent' un correo que nunca salió,
//   y la bandeja dejaría de servir para lo único que sirve: saber qué falló.
//   El reenvío revalida aquí que quien lo pide es dueño del torneo.
//
// POR QUÉ NO SE RECONSTRUYE EL CORREO DESDE LA BASE
//   Se reenvía el payload archivado, tal cual. Si entre medias cambiaron la
//   sede o el nombre del torneo, "reenviar" manda LO MISMO que se intentó
//   mandar, que es lo que el organizador espera de ese botón. Reconstruirlo
//   mandaría un correo distinto del que dice estar reenviando.
//
// Variables de entorno: RESEND_API_KEY, EMAIL_FROM, SITE_URL.

import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";
import { getActor, isOrgOwner } from "../_shared/auth.ts";
import { procesarFila, siteUrl, type FilaOutbox } from "../_shared/outbox.ts";

/** Tope de reintentos. Un correo a un dominio inexistente no mejora al insistir. */
const MAX_INTENTOS = 5;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ ok: false, error: "unauthenticated" }, 401);

  let body: { outbox_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (!body.outbox_id) return json({ ok: false, error: "missing_outbox_id" }, 400);

  const supa = adminClient();

  const { data: fila } = await supa
    .from("email_outbox")
    .select("id, kind, to_email, payload, attempts, status, tournament_id")
    .eq("id", body.outbox_id)
    .maybeSingle();

  if (!fila) return json({ ok: false, error: "outbox_row_not_found" }, 404);

  // Ya salió: no se reenvía por accidente. Un doble clic en "reenviar" sobre
  // algo que sí llegó no debe generar un duplicado.
  if (fila.status === "sent") {
    return json({ ok: false, error: "already_sent" }, 409);
  }

  if ((fila.attempts ?? 0) >= MAX_INTENTOS) {
    return json({ ok: false, error: "too_many_attempts", attempts: fila.attempts }, 429);
  }

  // adminClient bypasea la RLS, así que la propiedad se revalida a mano —
  // la policy de SELECT de email_outbox no protege a una service key.
  if (!fila.tournament_id) return json({ ok: false, error: "orphan_row" }, 409);

  const { data: torneo } = await supa
    .from("tournaments").select("organizer_id").eq("id", fila.tournament_id).maybeSingle();

  if (!torneo) return json({ ok: false, error: "tournament_not_found" }, 404);
  if (!(await isOrgOwner(torneo.organizer_id, actor))) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  // Aquí SÍ se espera el envío: el organizador está mirando el botón y quiere
  // saber si esta vez salió. No es el camino de alta, donde bloquear sería malo.
  const ok = await procesarFila(supa, fila as unknown as FilaOutbox, siteUrl());

  if (!ok) {
    const { data: tras } = await supa
      .from("email_outbox").select("last_error, attempts").eq("id", fila.id).maybeSingle();
    return json({ ok: false, error: "send_failed", detail: tras?.last_error ?? null, attempts: tras?.attempts ?? null }, 502);
  }

  return json({ ok: true, outbox_id: fila.id });
});
