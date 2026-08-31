// supabase/functions/close-registration/index.ts
// Orquesta el cierre de UNA categoría: engine (formato + fixtures) -> RPC atómica.
// NO reimplementa lógica de torneo. Idempotente y todo-o-nada (vía RPC).

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { handleOptions, json } from "../_shared/cors.ts";
import {
  computeFormat,
  generateRoundRobin,
  repartirPorBloque,
  type FormatPlan,
  type Fixture,
} from "./engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;

// `json` y `handleOptions` vienen de _shared/cors.ts, igual que en las otras
// diez funciones que llama la app.
//
// EL BUG QUE ARREGLA: "Sin conexión con el servidor" al cerrar inscripciones.
//   Esta función tenía su propio helper `json` SIN cabeceras CORS y sin
//   manejar OPTIONS. La petición del navegador lleva Authorization, apikey y
//   Content-Type: application/json — las tres obligan a preflight —, y el
//   OPTIONS caía en el `if (req.method !== "POST")` de abajo, que devolvía 405
//   pelado. Sin Access-Control-Allow-Origin el navegador bloquea la petición
//   real y `fetch` LANZA, así que en la pantalla no llegaba ni un código de
//   error: solo un throw que el catch traducía como falta de red.
//
//   Era la única de las cinco funciones que llama la app sin CORS. En nativo
//   nunca se notó porque ahí no hay preflight.
//
//   El helper compartido pone las cabeceras en TODA respuesta, así que las
//   ramas de error también salen legibles: un 400 sin CORS se vería igual de
//   mudo que este 405.

serve(async (req) => {
  // ANTES del check de método: un OPTIONS no es una llamada mal hecha, es el
  // navegador preguntando si puede llamar.
  const opt = handleOptions(req);
  if (opt) return opt;

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1) Autenticar al que llama (JWT del header) y resolver su user id.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const actorId = userData.user.id;

  // 2) Body: una categoría. chosen_format opcional (caso ambiguo ya resuelto por el organizador).
  let body: { category_id?: string; chosen_format?: FormatPlan };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const categoryId = body.category_id;
  if (!categoryId) return json({ error: "category_id_required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 3) Pre-chequeo de dueño (respuesta 403 limpia; el RPC lo vuelve a verificar de forma autoritativa).
  const { data: cat } = await admin
    .from("categories")
    .select("id, status, tournament_id, tournaments(organizer_id)")
    .eq("id", categoryId)
    .single();
  if (!cat) return json({ error: "category_not_found" }, 404);
  const organizerId = (cat as unknown as { tournaments: { organizer_id: string } }).tournaments.organizer_id;

  const { data: ownerRow } = await admin
    .from("organizer_members")
    .select("user_id")
    .eq("organizer_id", organizerId)
    .eq("user_id", actorId)
    .eq("member_role", "owner")
    .maybeSingle();
  if (!ownerRow) return json({ error: "forbidden" }, 403);

  // 4) Cargar parejas válidas de la categoría. payment_status vive en pairs (verificado 0.C).
  const { data: pairs, error: pairsErr } = await admin
    .from("pairs")
    .select("id, created_at, payment_status")
    .eq("category_id", categoryId)
    .in("payment_status", ["paid_online", "paid_offline", "comp"])
    .order("created_at", { ascending: true }); // orden estable -> determinismo
  if (pairsErr) return json({ error: "pairs_query_failed", detail: pairsErr.message }, 500);

  const validPairs = pairs ?? [];
  if (validPairs.length < 2) return json({ error: "not_enough_pairs", count: validPairs.length }, 400);

  // 5) ENGINE: plan de formato. Si es ambiguo y el organizador no eligió -> devolver para decisión.
  const plan: FormatPlan = body.chosen_format ?? computeFormat(validPairs.length);
  if (plan.ambiguous && !body.chosen_format) {
    // La decisión la toma el organizador (UI/Sonnet) entre plan.alternatives.
    return json({ status: "needs_decision", plan, alternatives: plan.alternatives ?? [] });
  }

  // 5.b) El plan tiene que cuadrar con las parejas que hay.
  //
  //   `chosen_format` viene del CLIENTE. Con tamaños que no suman, el reparto
  //   dejaría parejas fuera de todo grupo o crearía grupos a medias, y ninguna
  //   de las dos cosas se puede deshacer después: la RPC materializa partidos.
  //   Un grupo de una pareja no es un grupo, es alguien que pagó y no juega.
  const sumaTamanos = plan.groupSizes.reduce((a, s) => a + s, 0);
  if (plan.groupSizes.length === 0 || sumaTamanos !== validPairs.length) {
    return json({
      error: "plan_mismatch",
      detail: `El formato reparte ${sumaTamanos} parejas en ${plan.groupSizes.length} grupos, ` +
              `y la categoría tiene ${validPairs.length}.`,
      group_sizes: plan.groupSizes,
      pair_count: validPairs.length,
    }, 400);
  }
  const tamanoMinimo = Math.min(...plan.groupSizes);
  if (tamanoMinimo < 2) {
    return json({
      error: "invalid_group_size",
      detail: `Un grupo de ${tamanoMinimo} pareja(s) no juega ningún partido.`,
      group_sizes: plan.groupSizes,
    }, 400);
  }

  // 6) Bloque elegido por cada pareja (migración 051). Es lo que hace que un
  //    grupo se pueda jugar de corrido en una cancha.
  //
  //    Si la consulta falla NO se aborta el cierre: se reparte sin bloques,
  //    como antes, y se dice en la respuesta. Cerrar inscripciones es lo que
  //    desbloquea el torneo entero; un horario se reacomoda después.
  const { data: elecciones, error: eleccionesErr } = await admin
    .from("pair_block_choices")
    .select("pair_id, bloque_id")
    .in("pair_id", validPairs.map((p) => p.id));

  const bloquePorPareja = new Map<string, string>();
  for (const e of elecciones ?? []) bloquePorPareja.set(e.pair_id, e.bloque_id);

  // 7) Repartir POR BLOQUE, respetando los tamaños del plan.
  const buckets = repartirPorBloque(
    validPairs,
    (p) => bloquePorPareja.get(p.id) ?? null,
    plan.groupSizes,
  );

  // 8) ENGINE: fixtures por grupo. Fixture = { round, pairAId, pairBId } (verificado 0.A).
  const groupNames = "ABCDEFGHIJKLMNOP".split("");
  const p_groups = buckets.map((bucket, idx) => {
    const ids = bucket.items.map((p) => p.id);
    const rr: Fixture[] = generateRoundRobin(ids);
    const matches = rr.map((m) => ({
      pair_a: m.pairAId,
      pair_b: m.pairBId,
      round_label: `R${m.round}`,
    }));
    return { name: groupNames[idx], pair_ids: ids, matches };
  });

  // Lo que el organizador tiene que ver del reparto. No se guarda en ninguna
  // tabla —no hay columna de bloque en `groups`—, así que viaja en la respuesta.
  const mezclados = buckets
    .map((b, idx) => ({ name: groupNames[idx], bloque_id: b.bloqueId, desde: b.desde }))
    .filter((g) => Object.keys(g.desde).length > 1);

  const sinBloque = validPairs.filter((p) => !bloquePorPareja.has(p.id)).length;

  // 9) Materialización atómica vía RPC (todo o nada + guard de idempotencia/owner del lado BD).
  const { data: result, error: rpcErr } = await admin.rpc("close_registration_for_category", {
    p_actor: actorId,
    p_category_id: categoryId,
    p_plan: plan,
    p_groups,
  });
  if (rpcErr) {
    const code = rpcErr.message?.includes("not_owner") ? 403
               : rpcErr.message?.includes("category_not_found") ? 404 : 500;
    return json({ error: "rpc_failed", detail: rpcErr.message }, code);
  }

  return json({
    ok: true,
    result,
    // Cómo quedó el reparto respecto a los horarios que eligió la gente.
    bloques: {
      // Grupos con parejas de más de un bloque. El bloque que se les asigna es
      // el de la mayoría; a las demás hay que avisarles del cambio de hora.
      grupos_mezclados: mezclados,
      // Parejas que nunca eligieron bloque: el torneo no tenía horarios
      // capturados cuando se inscribieron, o el apartado falló.
      parejas_sin_bloque: sinBloque,
      // La consulta de elecciones falló y se repartió a ciegas.
      sin_datos: eleccionesErr ? (eleccionesErr.message ?? "error") : null,
    },
  });
});
