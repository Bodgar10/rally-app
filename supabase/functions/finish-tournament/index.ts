// supabase/functions/finish-tournament/index.ts
// Cierre del torneo por un usuario autenticado (owner/admin).
// 1) Autentica el JWT (getActor). 2) Llama la RPC finish_tournament con el actor.
// 3) Al volver OK, dispara compute-ranking-points y cron-recompute-ratings
//    (ambos idempotentes) con { tournament_id } + x-cron-secret (+ apikey para el gateway).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

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

async function invokeCompute(fn: string, body: unknown) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
        "x-cron-secret": CRON_SECRET,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { fn, status: res.status, ok: res.ok, body: parsed };
  } catch (e) {
    return { fn, status: 0, ok: false, body: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const actor = await getActor(req);
  if (!actor) return json({ error: "unauthenticated" }, 401);

  let body: { tournament_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const tournament_id = body?.tournament_id;
  if (!tournament_id) return json({ error: "tournament_id_required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await admin.rpc("finish_tournament", {
    p_actor: actor.id,
    p_tournament_id: tournament_id,
  });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("tournament_not_found")) return json({ error: "tournament_not_found" }, 404);
    if (msg.includes("not_authorized")) return json({ error: "not_authorized" }, 403);
    if (msg.includes("invalid_status_transition"))
      return json({ error: "invalid_status_transition", detail: error.details ?? null }, 409);
    return json({ error: "finish_failed", detail: error.message }, 500);
  }

  // Idempotentes: re-disparar el cierre es seguro. Se invocan siempre que la RPC volvió OK.
  //
  // ► EL `actor_id` NO ES OPCIONAL, Y FALTABA.
  //   `apply_tournament_ranking_points` (migración 018) autoriza EXPLÍCITAMENTE
  //   contra `p_actor`: tiene que ser admin o owner del organizador. No puede
  //   usar `auth.uid()` porque vía service_role es NULL — está escrito en su
  //   propio comentario.
  //
  //   Esta llamada iba con el secreto de cron y SIN actor. El secreto
  //   autenticaba la LLAMADA, pero dentro no había nadie a nombre de quien
  //   escribir, así que la RPC levantaba `not_authorized` y
  //   `compute-ranking-points` devolvía 400. Cada torneo que se cerró desde
  //   aquí quedó 'finished' con CERO puntos repartidos.
  //
  //   El actor ya estaba a mano: es el mismo que acaba de pasar el control de
  //   `finish_tournament`, o sea admin u owner por construcción.
  const ranking = await invokeCompute("compute-ranking-points", {
    tournament_id,
    actor_id: actor.id,
  });
  const ratings = await invokeCompute("cron-recompute-ratings", { tournament_id });

  // ► EL CIERRE NO SE DA POR BUENO SI LOS PUNTOS NO SE ESCRIBIERON.
  //   Antes esto devolvía siempre `ok: true` y el detalle del fallo viajaba
  //   dentro de `ranking_points`, donde nadie lo miraba. El organizador veía
  //   "Torneo terminado ✓" y los jugadores se quedaban sin puntos para
  //   siempre, sin que nadie se enterara de nada.
  //
  //   El torneo SÍ quedó cerrado —eso ya pasó y no se deshace—, así que no es
  //   un 500: es un 207, cerrado a medias. Volver a pulsar reintenta, porque
  //   las tres piezas son idempotentes.
  const puntosOk = ranking.ok && (ranking.body as { ok?: boolean } | null)?.ok === true;

  return json({
    ok: puntosOk,
    finish: data,
    ranking_points: ranking,
    ratings,
    ...(puntosOk ? {} : {
      error: "ranking_points_failed",
      detail:
        "El torneo quedó cerrado, pero los puntos de ranking no se repartieron. " +
        "Vuelve a pulsar Terminar torneo para reintentarlo.",
    }),
  }, puntosOk ? 200 : 207);
});
