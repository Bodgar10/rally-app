// checkout-tournament — crea el PaymentIntent de inscripción con split al organizador (destination charge).
// Devuelve client_secret para que la app (PaymentSheet RN) o la web (Stripe.js) confirmen el pago.
// La registration la materializa el webhook payment_intent.succeeded (idempotente). Aquí NO se inserta.
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient, stripeClient } from "../_shared/clients.ts";
import { getActor } from "../_shared/auth.ts";

type Mode = "full" | "half";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ ok: false, error: "unauthenticated" }, 401);

  let body: { pair_id?: string; mode?: Mode };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const pairId = body.pair_id;
  const mode: Mode = body.mode === "half" ? "half" : "full";
  if (!pairId) return json({ ok: false, error: "pair_id_required" }, 400);

  const supa = adminClient();
  const stripe = stripeClient();

  // 1) Cargar la pareja + torneo + categoría + organizador en un solo viaje.
  const { data: pair, error: pairErr } = await supa
    .from("pairs")
    .select(`
      id, tournament_id, category_id, player1_id, player2_id, payment_status,
      tournaments:tournament_id ( id, name, organizer_id, registration_fee, status ),
      categories:category_id ( id, name, fee_override, status )
    `)
    .eq("id", pairId)
    .maybeSingle();

  if (pairErr || !pair) return json({ ok: false, error: "pair_not_found" }, 404);

  // El que paga DEBE ser uno de los dos jugadores de la pareja (autorización).
  if (pair.player1_id !== actor.id && pair.player2_id !== actor.id && actor.role !== "admin") {
    return json({ ok: false, error: "not_authorized" }, 403);
  }

  // Solo se cobra una pareja en estado 'pending' (whitelist). Cualquier otro estado
  // (paid_online / paid_offline / comp) ya está liquidado o es cortesía → no re-cobrar.
  if (pair.payment_status !== "pending") {
    return json({ ok: false, error: "already_paid", payment_status: pair.payment_status }, 409);
  }

  // Supabase devuelve embeds como objeto o arreglo según la relación; normalizamos vía unknown.
  const tournament = (Array.isArray((pair as { tournaments: unknown }).tournaments)
    ? (pair as unknown as { tournaments: unknown[] }).tournaments[0]
    : (pair as unknown as { tournaments: unknown }).tournaments) as
    { id: string; name: string; organizer_id: string; registration_fee: number; status: string };
  const category = (Array.isArray((pair as { categories: unknown }).categories)
    ? (pair as unknown as { categories: unknown[] }).categories[0]
    : (pair as unknown as { categories: unknown }).categories) as
    { id: string; name: string; fee_override: number | null; status: string };

  if (!tournament?.organizer_id) return json({ ok: false, error: "tournament_not_found" }, 404);

  // 2) Organizador: debe estar 'active' en Connect.
  const { data: org } = await supa
    .from("organizers")
    .select("id, stripe_connect_account_id, connect_status, application_fee_percent")
    .eq("id", tournament.organizer_id)
    .maybeSingle();

  if (!org?.stripe_connect_account_id || org.connect_status !== "active") {
    return json({ ok: false, error: "organizer_not_ready", connect_status: org?.connect_status ?? null }, 409);
  }

  // 3) ¿El que paga es Campeón (anual activo)? → 5% de descuento = perdón de nuestra comisión.
  const { data: sub } = await supa
    .from("subscriptions")
    .select("status, billing_cycle")
    .eq("user_id", actor.id)
    .in("status", ["active", "trialing"])
    .eq("billing_cycle", "annual")
    .maybeSingle();
  const isCampeon = !!sub;

  // 4) Montos (pesos).
  const fee = Number(category?.fee_override ?? tournament.registration_fee ?? 0);
  if (!(fee > 0)) return json({ ok: false, error: "invalid_fee" }, 422);
  const feePercent = Number(org.application_fee_percent ?? 5);

  const A = mode === "half" ? Math.round(fee / 2) : fee;
  const discount = isCampeon ? Math.round((feePercent / 100) * A) : 0;
  const charged = A - discount;
  const applicationFeePesos = isCampeon ? 0 : Math.round((feePercent / 100) * A);
  const organizerAmount = charged - applicationFeePesos;

  const amountCents = Math.round(charged * 100);
  const applicationFeeCents = Math.round(applicationFeePesos * 100);

  try {
    // 5) Checkout Session con destination charge (split en el origen). Idempotente por pareja+modo.
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://rally.app";

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        currency: "mxn",
        line_items: [
          {
            price_data: {
              currency: "mxn",
              unit_amount: amountCents,
              product_data: {
                name: `Inscripción · ${tournament.name}`,
                description: `Categoría ${category.name} · ${mode === "half" ? "Solo mi parte" : "Pago completo"}`,
              },
            },
            quantity: 1,
          },
        ],
        ...(applicationFeeCents > 0 ? { payment_intent_data: {
          application_fee_amount: applicationFeeCents,
          transfer_data: { destination: org.stripe_connect_account_id as string },
          metadata: {
            kind: "tournament_registration",
            pair_id: pair.id,
            tournament_id: tournament.id,
            category_id: category.id,
            payer_id: actor.id,
            mode,
            is_campeon: String(isCampeon),
            amount_pesos: String(charged),
            application_fee_amount: String(applicationFeePesos),
            organizer_amount: String(organizerAmount),
          },
        }} : { payment_intent_data: {
          transfer_data: { destination: org.stripe_connect_account_id as string },
          metadata: {
            kind: "tournament_registration",
            pair_id: pair.id,
            tournament_id: tournament.id,
            category_id: category.id,
            payer_id: actor.id,
            mode,
            is_campeon: String(isCampeon),
            amount_pesos: String(charged),
            application_fee_amount: String(applicationFeePesos),
            organizer_amount: String(organizerAmount),
          },
        }}),
        success_url: `${siteUrl}/inscripcion-exitosa?pair_id=${pair.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/torneos/${tournament.id}`,
      },
      { idempotencyKey: `reg_${pair.id}_${mode}` },
    );

    return json({
      ok: true,
      url: session.url,
      breakdown: {
        base: A,
        discount,
        charged,
        application_fee_amount: applicationFeePesos,
        organizer_amount: organizerAmount,
        is_campeon: isCampeon,
        currency: "MXN",
      },
    });
  } catch (e) {
    return json({ ok: false, error: "stripe_error", detail: String((e as Error)?.message ?? e) }, 502);
  }
});
