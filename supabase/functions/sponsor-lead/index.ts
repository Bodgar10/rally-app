// supabase/functions/sponsor-lead/index.ts
// El usuario "aparta" un producto -> se crea un sponsor_lead.
// - Autentica el JWT; user_id sale del JWT (getActor), NUNCA del body.
// - Guard de menores en servidor (Doc C §5.2/§5.3): menor sin parental_consent_at -> 403.
// - Valida que el producto está activo y pertenece a un sponsor vinculado al torneo.
// - Anti-spam: no crea un lead idéntico (mismo user/torneo/producto) en una ventana corta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEDUP_WINDOW_HOURS = 24;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function getActor(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ error: "unauthenticated" }, 401);

  let body: { tournament_id?: string; product_id?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const tournament_id = body?.tournament_id;
  const product_id = body?.product_id;
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  if (!tournament_id) return json({ error: "tournament_id_required" }, 400);
  if (!product_id) return json({ error: "product_id_required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- Guard de menores (Doc C §5.2/§5.3): decide en servidor ---
  const { data: actorRow, error: actorErr } = await admin
    .from("users")
    .select("birthdate, parental_consent_at")
    .eq("id", actor.id)
    .single();
  if (actorErr || !actorRow) return json({ error: "actor_not_found" }, 404);

  if (actorRow.birthdate) {
    const bd = new Date(actorRow.birthdate as string);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 18);
    const isMinor = bd > cutoff; // nació hace menos de 18 años
    if (isMinor && !actorRow.parental_consent_at) {
      return json({ error: "parental_consent_required" }, 403);
    }
  }

  // --- Validar producto activo + sponsor vinculado al torneo ---
  const { data: product, error: prodErr } = await admin
    .from("sponsor_products")
    .select("id, sponsor_id, active")
    .eq("id", product_id)
    .single();
  if (prodErr || !product) return json({ error: "product_not_found" }, 404);
  if (product.active === false) return json({ error: "product_inactive" }, 409);

  const { data: link, error: linkErr } = await admin
    .from("tournament_sponsors")
    .select("id")
    .eq("tournament_id", tournament_id)
    .eq("sponsor_id", product.sponsor_id)
    .maybeSingle();
  if (linkErr) return json({ error: "link_check_failed", detail: linkErr.message }, 500);
  if (!link) return json({ error: "sponsor_not_in_tournament" }, 400);

  // --- Anti-spam / idempotencia: lead idéntico reciente -> devolver el existente ---
  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data: existing } = await admin
    .from("sponsor_leads")
    .select("id, status, created_at")
    .eq("user_id", actor.id)
    .eq("tournament_id", tournament_id)
    .eq("product_id", product_id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return json({ ok: true, deduped: true, lead: existing });
  }

  // --- Crear el lead (user_id SIEMPRE del JWT, nunca del body) ---
  const { data: lead, error: insErr } = await admin
    .from("sponsor_leads")
    .insert({
      user_id: actor.id,
      tournament_id,
      sponsor_id: product.sponsor_id,
      product_id,
      status: "new",
      note,
    })
    .select("id, status, created_at")
    .single();
  if (insErr) return json({ error: "lead_insert_failed", detail: insErr.message }, 500);

  return json({ ok: true, deduped: false, lead });
});
