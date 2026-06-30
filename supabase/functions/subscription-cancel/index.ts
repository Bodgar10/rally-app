// subscription-cancel — PROFECO: cancela la suscripción del usuario en ≤2 clics, validado en servidor.
// Marca cancel_at_period_end=true en Stripe (acceso hasta fin de periodo). Sin obstáculos previos.
import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient, stripeClient } from "../_shared/clients.ts";
import { getActor } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ ok: false, error: "unauthenticated" }, 401);

  // Motivo de cancelación (PROFECO/analytics). El body es OPCIONAL: la cancelación no depende de él.
  let reason: string | null = null;
  let feedback: string | null = null;
  try {
    const body = await req.json();
    reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    feedback = typeof body?.feedback === "string" && body.feedback.trim() ? body.feedback.trim() : null;
  } catch {
    // sin body / JSON inválido → seguimos sin motivo
  }

  const supa = adminClient();
  const stripe = stripeClient();

  const { data: sub } = await supa
    .from("subscriptions")
    .select("stripe_subscription_id, status, cancel_at_period_end, current_period_end")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return json({ ok: false, error: "no_active_subscription" }, 404);
  }

  // Ya programada para cancelar: idempotente, responde OK.
  if (sub.cancel_at_period_end) {
    return json({
      ok: true,
      already_scheduled: true,
      access_until: sub.current_period_end,
    });
  }

  try {
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id as string, {
      cancel_at_period_end: true,
    });

    const accessUntil = updated.current_period_end
      ? new Date(updated.current_period_end * 1000).toISOString()
      : sub.current_period_end;

    // Reflejo local inmediato (el webhook confirmará).
    await supa
      .from("subscriptions")
      .update({ cancel_at_period_end: true, current_period_end: accessUntil })
      .eq("user_id", actor.id);

    // Registrar el motivo (best-effort). Si falla, NO se revierte la cancelación (ya está hecha en Stripe).
    if (reason) {
      const { error: reasonErr } = await supa
        .from("cancellation_reasons")
        .insert({ user_id: actor.id, reason, feedback });
      if (reasonErr) {
        console.error("[subscription-cancel] no se pudo registrar el motivo:", reasonErr.message);
      }
    }

    return json({ ok: true, canceled_at_period_end: true, access_until: accessUntil });
  } catch (e) {
    return json({ ok: false, error: "stripe_error", detail: String((e as Error)?.message ?? e) }, 502);
  }
});
