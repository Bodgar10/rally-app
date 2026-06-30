// checkout-subscription — crea la sesión de Stripe Checkout (mode=subscription) para Pro mensual / Campeón anual.
// Resuelve al usuario por JWT (web autenticada) o por token de handoff (header x-handoff-token, un solo uso).
// REUSO PASAS (Billing). La caja PROFECO se renderiza en la web; aquí solo se arma la sesión.
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient, stripeClient } from "../_shared/clients.ts";
import { getActor } from "../_shared/auth.ts";

type Cycle = "monthly" | "annual";

async function resolveUser(req: Request): Promise<{ id: string } | null> {
  // 1) JWT normal.
  const actor = await getActor(req);
  if (actor) return { id: actor.id };

  // 2) Token de handoff de un solo uso.
  const handoff = req.headers.get("x-handoff-token");
  if (!handoff) return null;
  const supa = adminClient();
  const { data } = await supa
    .from("subscription_handoff_tokens")
    .select("user_id, used_at, expires_at")
    .eq("token", handoff)
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return null;

  // Marcar usado (un solo uso). Best-effort.
  await supa
    .from("subscription_handoff_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", handoff)
    .is("used_at", null);

  return { id: data.user_id as string };
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const user = await resolveUser(req);
  if (!user) return json({ ok: false, error: "unauthenticated" }, 401);

  let body: { billing_cycle?: Cycle };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const cycle: Cycle = body.billing_cycle === "annual" ? "annual" : "monthly";

  const priceId = cycle === "annual"
    ? Deno.env.get("STRIPE_PRICE_CAMPEON_ANNUAL")
    : Deno.env.get("STRIPE_PRICE_PRO_MONTHLY");
  if (!priceId) return json({ ok: false, error: "price_not_configured", cycle }, 500);

  const supa = adminClient();
  const stripe = stripeClient();
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://rally-app-theta-three.vercel.app";

  // Datos del usuario + customer existente.
  const { data: profile } = await supa
    .from("users").select("email, full_name").eq("id", user.id).maybeSingle();
  const { data: existingSub } = await supa
    .from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();

  try {
    // Reusar o crear el customer de Stripe.
    let customerId = existingSub?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      // Upsert mínimo para no perder el customer si el usuario abandona el checkout.
      // plan/billing_cycle son NOT NULL sin default → se setean con el ciclo elegido; status usa su default 'incomplete'.
      await supa.from("subscriptions").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          plan: cycle === "annual" ? "campeon" : "pro",
          billing_cycle: cycle,
        },
        { onConflict: "user_id" },
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/planes?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/planes?status=cancel`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { user_id: user.id, billing_cycle: cycle },
      },
      metadata: { user_id: user.id, billing_cycle: cycle },
    });

    return json({ ok: true, url: session.url, session_id: session.id });
  } catch (e) {
    return json({ ok: false, error: "stripe_error", detail: String((e as Error)?.message ?? e) }, 502);
  }
});
