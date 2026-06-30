// connect-account-link — regenera un account link de onboarding para una cuenta Express ya creada.
// Útil cuando el link anterior expiró o el organizador no terminó el KYC. Auth: solo OWNER.
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

  const { data: org } = await supa
    .from("organizers")
    .select("stripe_connect_account_id")
    .eq("id", organizerId)
    .maybeSingle();

  const accountId = org?.stripe_connect_account_id as string | null;
  if (!accountId) {
    return json({ ok: false, error: "no_connect_account", hint: "llama primero a connect-onboard" }, 409);
  }

  try {
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
