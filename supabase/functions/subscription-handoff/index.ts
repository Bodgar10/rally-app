// subscription-handoff — la app autenticada acuña un token de un SOLO USO (15 min) ligado al usuario,
// y devuelve la URL web de planes con el token. La web lo canjea para abrir Checkout ya autenticada.
// Esto mantiene la venta WEB-FIRST (evita IAP) sin pedir login de nuevo en el navegador.
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/clients.ts";
import { getActor } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ ok: false, error: "unauthenticated" }, 401);

  const supa = adminClient();
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://rally-app-theta-three.vercel.app";

  // Token aleatorio robusto.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await supa
    .from("subscription_handoff_tokens")
    .insert({ token, user_id: actor.id, expires_at: expiresAt });
  if (error) return json({ ok: false, error: "db_insert_failed", detail: error.message }, 500);

  return json({ ok: true, url: `${siteUrl}/planes?handoff=${token}`, expires_at: expiresAt });
});
