// webhooks-stripe — Billing de la suscripción del jugador (REUSO PASAS) + CFDI (gigstack, NET-NEW).
// Sincroniza subscriptions (status/period/cancel) y, al cobrarse una factura, emite CFDI AL JUGADOR.
// Idempotente por event.id. Firma con STRIPE_WEBHOOK_SECRET. DESPLEGAR CON --no-verify-jwt.
import { adminClient, stripeClient, stripeCryptoProvider, Stripe } from "../_shared/clients.ts";
import { claimEvent } from "../_shared/idempotency.ts";
import { emitSubscriptionCfdi } from "../_shared/gigstack.ts";

function cycleFromPrice(priceId: string | null): "monthly" | "annual" | null {
  if (!priceId) return null;
  if (priceId === Deno.env.get("STRIPE_PRICE_CAMPEON_ANNUAL")) return "annual";
  if (priceId === Deno.env.get("STRIPE_PRICE_PRO_MONTHLY")) return "monthly";
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !secret) return new Response("missing_signature", { status: 400 });

  const stripe = stripeClient();
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, stripeCryptoProvider);
  } catch (e) {
    return new Response(`invalid_signature: ${String((e as Error)?.message ?? e)}`, { status: 400 });
  }

  const supa = adminClient();
  const isNew = await claimEvent(supa, event.id, event.type, "billing");
  if (!isNew) return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id ?? null;
        const priceId = sub.items.data[0]?.price?.id ?? null;
        const cycle = cycleFromPrice(priceId);
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        const patch: Record<string, unknown> = {
          stripe_subscription_id: sub.id,
          stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
          status: sub.status, // active | trialing | past_due | canceled | unpaid | incomplete...
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_end: periodEnd,
        };
        if (cycle) patch.billing_cycle = cycle;
        if (cycle) patch.plan = cycle === "annual" ? "campeon" : "pro";

        if (userId) {
          await supa.from("subscriptions").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
        } else {
          // Sin metadata user_id: resolver por stripe_subscription_id existente.
          await supa.from("subscriptions").update(patch).eq("stripe_subscription_id", sub.id);
        }
        break;
      }

      // Factura cobrada → asegurar activo + emitir CFDI al jugador (idempotente por invoice id).
      case "invoice.payment_succeeded":
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Solo facturas de suscripción.
        if (!invoice.subscription) break;

        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
        const amountTotal = (invoice.amount_paid ?? invoice.total ?? 0) / 100; // centavos → pesos

        // Resolver el usuario por customer.
        const { data: subRow } = await supa
          .from("subscriptions")
          .select("user_id, tax_rfc, tax_legal_name")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        const userId = subRow?.user_id ?? null;

        // ¿Ya facturamos esta invoice? (dedup duro además del event.id)
        const { data: already } = await supa
          .from("subscription_invoices")
          .select("stripe_invoice_id, cfdi_status")
          .eq("stripe_invoice_id", invoice.id)
          .maybeSingle();
        if (already && already.cfdi_status === "emitted") break;

        // Registrar/asegurar la fila de la factura.
        await supa.from("subscription_invoices").upsert(
          {
            stripe_invoice_id: invoice.id,
            user_id: userId,
            stripe_customer_id: customerId,
            amount_total: amountTotal,
            currency: invoice.currency ?? "mxn",
          },
          { onConflict: "stripe_invoice_id", ignoreDuplicates: false },
        );

        // Emitir CFDI (no bloqueante: si falla, queda 'failed' para reintento manual/cron).
        const email = invoice.customer_email ?? "";
        let cfdiStatus = "skipped";
        let providerId: string | null = null;
        let cfdiError: string | null = null;

        if (email) {
          const res = await emitSubscriptionCfdi({
            email,
            amountPesos: amountTotal,
            rfc: subRow?.tax_rfc ?? null,
            legalName: subRow?.tax_legal_name ?? null,
            conceptDescription: "Suscripción RALLY (acceso a análisis y ranking)",
          });
          if (res.skipped) cfdiStatus = "skipped";
          else if (res.ok) { cfdiStatus = "emitted"; providerId = res.providerId ?? null; }
          else { cfdiStatus = "failed"; cfdiError = res.error ?? "unknown"; }
        }

        await supa.from("subscription_invoices").update({
          cfdi_status: cfdiStatus,
          cfdi_provider_id: providerId,
          cfdi_error: cfdiError,
          updated_at: new Date().toISOString(),
        }).eq("stripe_invoice_id", invoice.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
        if (customerId) {
          await supa.from("subscriptions").update({ status: "past_due" }).eq("stripe_customer_id", customerId);
        }
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (e) {
    return new Response(`handler_error: ${String((e as Error)?.message ?? e)}`, { status: 500 });
  }
});
