// connect-onboard — crea (si falta) la cuenta conectada Express del organizador y devuelve el account link (KYC).
// Auth: solo el OWNER del organizador. NO mueve dinero. Idempotente: reusa la cuenta si ya existe.
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient, stripeClient } from "../_shared/clients.ts";
import { getActor, isOrgOwner } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ ok: false, error: "unauthenticated" }, 401);

  let body: { organizer_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const organizerId = body.organizer_id;
  if (!organizerId) return json({ ok: false, error: "organizer_id_required" }, 400);

  if (!(await isOrgOwner(organizerId, actor))) {
    return json({ ok: false, error: "not_authorized" }, 403);
  }

  const supa = adminClient();
  const stripe = stripeClient();
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://rally-app-theta-three.vercel.app";

  const { data: org, error: orgErr } = await supa
    .from("organizers")
    .select("id, name, contact_email, stripe_connect_account_id, connect_status")
    .eq("id", organizerId)
    .maybeSingle();
  if (orgErr || !org) return json({ ok: false, error: "organizer_not_found" }, 404);

  try {
    let accountId = org.stripe_connect_account_id as string | null;

    // 1) Crear la cuenta Express si aún no existe.
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "MX",
        email: org.contact_email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: { organizer_id: organizerId, organizer_name: org.name ?? "" },
      });
      accountId = account.id;

      const { error: updErr } = await supa
        .from("organizers")
        .update({ stripe_connect_account_id: accountId, connect_status: "onboarding" })
        .eq("id", organizerId);
      if (updErr) return json({ ok: false, error: "db_update_failed", detail: updErr.message }, 500);
    }

    // 2) Generar el account link (flujo KYC de Stripe).
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/org/onboarding-connect?status=refresh`,
      return_url: `${siteUrl}/org/onboarding-connect?status=return`,
      type: "account_onboarding",
    });

    return json({ ok: true, account_id: accountId, url: link.url });
  } catch (e) {
    return json({ ok: false, error: "stripe_error", detail: String((e as Error)?.message ?? e) }, 502);
  }
});
