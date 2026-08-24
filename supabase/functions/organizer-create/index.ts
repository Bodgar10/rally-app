// organizer-create — alta de organizador en autoservicio.
// Auth: cualquier usuario autenticado (no hace falta ser owner: precisamente
// viene a serlo). NO mueve dinero. Idempotente: si ya es owner de un club,
// la RPC devuelve ese con already_existed = true sin crear nada.
//
// POR QUÉ userClient() Y NO adminClient() (única desviación del patrón de
// connect-onboard, y es obligatoria):
//   public.create_organizer es SECURITY DEFINER y resuelve al usuario con
//   auth.uid() internamente. Su grant es SOLO a `authenticated` — a
//   service_role se le revocó a propósito. Invocarla con adminClient() daría
//   auth.uid() = NULL y la RPC respondería 'unauthenticated'.
//   Por eso la llamada va con el JWT del usuario. Lo único que sigue usando
//   privilegios de servicio es getActor(), para validar el token.
import { handleOptions, json } from "../_shared/cors.ts";
import { userClient } from "../_shared/clients.ts";
import { getActor } from "../_shared/auth.ts";

/**
 * Mapa de los códigos que lanza la RPC (raise exception '<code>') a HTTP.
 * La validación vive SOLO en la RPC: duplicarla aquí crearía dos fuentes de
 * verdad que se desincronizan a la primera que alguien toque una sin la otra.
 */
const RPC_ERROR_STATUS: Record<string, number> = {
  unauthenticated:        401,
  invalid_name:           400,
  invalid_email:          400,
  slug_generation_failed: 500,
};

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ ok: false, error: "unauthenticated" }, 401);

  let body: { name?: string; contact_email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const supa = userClient(req);

  // Los campos ausentes se mandan como cadena vacía a propósito: la RPC ya
  // los rechaza con invalid_name / invalid_email, que es lo que queremos
  // devolver. No se pre-valida aquí (ver comentario de RPC_ERROR_STATUS).
  const { data, error } = await supa.rpc("create_organizer", {
    p_name:          body.name ?? "",
    p_contact_email: body.contact_email ?? "",
  });

  if (error) {
    // El código viaja en error.message; el texto humano en error.details
    // (la RPC lo pone con `using detail = '...'`).
    const code = Object.keys(RPC_ERROR_STATUS).find((c) => error.message?.includes(c));
    if (code) {
      return json({ ok: false, error: code, detail: error.details ?? null }, RPC_ERROR_STATUS[code]);
    }
    return json({ ok: false, error: "create_failed", detail: error.message }, 500);
  }

  // create_organizer es RETURNS TABLE, así que PostgREST devuelve un ARREGLO
  // de filas aunque siempre sea una sola. Normalizamos.
  const row = (Array.isArray(data) ? data[0] : data) as
    { organizer_id?: string; slug?: string; already_existed?: boolean } | null | undefined;

  if (!row?.organizer_id) {
    return json({ ok: false, error: "create_failed", detail: "empty_rpc_result" }, 500);
  }

  return json({
    ok:              true,
    organizer_id:    row.organizer_id,
    slug:            row.slug,
    already_existed: row.already_existed ?? false,
  });
});
