// webhooks-stripe-connect — eventos de cuentas conectadas (Connect). Endpoint SEPARADO del Billing.
// Idempotente por event.id. Firma verificada con STRIPE_CONNECT_WEBHOOK_SECRET.
// DESPLEGAR CON --no-verify-jwt (lo llama Stripe). Doc C §2.6.
import { adminClient, stripeClient, stripeCryptoProvider, Stripe } from "../_shared/clients.ts";
import { claimEvent } from "../_shared/idempotency.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");
  if (!sig || !secret) return new Response("missing_signature", { status: 400 });

  const stripe = stripeClient();
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret, undefined, stripeCryptoProvider);
  } catch (e) {
    return new Response(`invalid_signature: ${String((e as Error)?.message ?? e)}`, { status: 400 });
  }

  const supa = adminClient();

  // Idempotencia: si ya procesamos este event.id, 200 y salir.
  const isNew = await claimEvent(supa, event.id, event.type, "connect");
  if (!isNew) return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });

  try {
    switch (event.type) {
      // Onboarding KYC completado / cambios de capacidades → mover connect_status.
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        const ready = acct.charges_enabled && acct.payouts_enabled && acct.details_submitted;
        const status = ready
          ? "active"
          : acct.requirements && (acct.requirements.disabled_reason ? "restricted" : "onboarding");
        await supa
          .from("organizers")
          .update({ connect_status: status })
          .eq("stripe_connect_account_id", acct.id);
        break;
      }

      // Pago de inscripción confirmado (split ya aplicado en el origen) → marcar registration paid_online.
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await upsertRegistrationFromPI(supa, pi);
        break;
      }

      case "payment_intent.payment_failed": {
        // No-op de datos: el cliente reintenta. Se deja registrado en stripe_processed_events.
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
        if (piId) {
          // Reembolso de inscripción (cancelación de torneo, Doc C §2.5). Marca la registration.
          await supa
            .from("registrations")
            .update({ payment_status: "comp" }) // 'comp' = no cuenta como ingreso; ajustar si se agrega estado 'refunded'
            .eq("stripe_payment_intent_id", piId);
        }
        break;
      }

      default:
        // payout.* y otros: registrados para auditoría vía stripe_processed_events; sin efecto de datos por ahora.
        break;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (e) {
    // Si fallamos el procesamiento, devolvemos 500 para que Stripe reintente.
    // OJO: ya marcamos el evento como procesado; en caso de fallo real, revisar manualmente.
    return new Response(`handler_error: ${String((e as Error)?.message ?? e)}`, { status: 500 });
  }
});

// Crea/actualiza la registration al confirmarse el pago. Idempotente por stripe_payment_intent_id (unique).
async function upsertRegistrationFromPI(
  supa: ReturnType<typeof adminClient>,
  pi: Stripe.PaymentIntent,
) {
  const md = pi.metadata ?? {};
  if (md.kind !== "tournament_registration") return; // ignora PIs ajenos a inscripciones

  const pairId = md.pair_id;
  const tournamentId = md.tournament_id;
  if (!pairId || !tournamentId) return;

  const amount = Number(md.amount_pesos ?? "0");
  const applicationFee = Number(md.application_fee_amount ?? "0");
  const organizerAmount = Number(md.organizer_amount ?? "0");

  // Upsert idempotente: conflicto en stripe_payment_intent_id → no duplica.
  await supa
    .from("registrations")
    .upsert(
      {
        pair_id: pairId,
        tournament_id: tournamentId,
        amount,
        payment_status: "paid_online",
        stripe_payment_intent_id: pi.id,
        application_fee_amount: applicationFee,
        organizer_amount: organizerAmount,
      },
      { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true },
    );

  // Reflejar el estado en la pareja (alimenta standings/clasificación en vivo).
  await supa.from("pairs").update({ payment_status: "paid_online" }).eq("id", pairId);
}
