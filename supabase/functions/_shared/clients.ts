// _shared/clients.ts — clientes compartidos. Los secrets viven en Edge Functions, NUNCA en el bundle.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

/** Cliente Supabase con service_role: BYPASSEA RLS. auth.uid() es NULL aquí. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function stripeClient(): Stripe {
  return new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    // @ts-ignore — usar la versión fijada en tu cuenta Stripe; ajustar si difiere.
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/** Necesario para verificar firmas de webhook en Deno (Web Crypto es async). */
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();

export { Stripe };
export type { SupabaseClient };
