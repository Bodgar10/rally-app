// supabase/functions/generate-format/index.ts
// Deno Edge Function — Sprint 2
// Propósito: Dado un category_id, obtiene el nº de parejas inscritas,
// corre computeFormat() y, solo si el resultado es ambiguo,
// llama a la API de Claude para proponer alternativas al organizador.
// NUNCA decide quién pasa. Solo sugiere entre opciones ambiguas.
// Auth: solo el owner del organizador del torneo.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// El engine es TypeScript puro, agnóstico de plataforma. Se consume vía un shim local
// con extensiones .ts explícitas (el bundler del deploy no resuelve imports sin extensión).
import { computeFormat } from "./engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Autenticación y extracción del caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Verificar sesión
    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser();

    if (sessionError || !user) {
      return new Response(JSON.stringify({ error: "Sesión inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Leer parámetros del body
    const { category_id } = await req.json();
    if (!category_id) {
      return new Response(
        JSON.stringify({ error: "category_id es requerido" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Obtener la categoría y su torneo
    const { data: category, error: catError } = await supabaseAdmin
      .from("categories")
      .select("id, tournament_id, division, gender, display_name, status")
      .eq("id", category_id)
      .single();

    if (catError || !category) {
      return new Response(
        JSON.stringify({ error: "Categoría no encontrada" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Verificar que el caller es owner del organizador del torneo.
    //    is_org_owner(org uuid) usa auth.uid() internamente => debe invocarse con el
    //    cliente del caller (JWT), NO con service role (donde auth.uid() es null).
    const orgId = await getTournamentOrgId(supabaseAdmin, category.tournament_id);
    const { data: ownerCheck, error: ownerError } = await supabase.rpc(
      "is_org_owner",
      { org: orgId }
    );

    if (ownerError || !ownerCheck) {
      return new Response(
        JSON.stringify({ error: "Solo el owner del organizador puede hacer esto" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 6. Contar parejas inscritas en esta categoría
    // Nota: contamos pairs donde category_id coincide, sin filtrar por payment_status
    // (paid_online, paid_offline y comp todos participan)
    const { count: numPairs, error: pairsError } = await supabaseAdmin
      .from("pairs")
      .select("id", { count: "exact", head: true })
      .eq("category_id", category_id);

    if (pairsError) {
      return new Response(
        JSON.stringify({ error: "Error contando parejas: " + pairsError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const pairCount = numPairs ?? 0;

    if (pairCount < 2) {
      return new Response(
        JSON.stringify({
          error: "Se necesitan al menos 2 parejas para generar un formato",
          numPairs: pairCount,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 7. Correr el motor de formato (DETERMINISTA — sin IA)
    const formatPlan = computeFormat(pairCount);

    // 8. Si NO es ambiguo: devolver el plan directamente
    if (!formatPlan.ambiguous) {
      return new Response(
        JSON.stringify({
          ambiguous: false,
          plan: formatPlan,
          numPairs: pairCount,
          categoryName: category.display_name,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 9. Si ES ambiguo: llamar a Claude para sugerir alternativas
    // NUNCA decide quién pasa. Solo explica las opciones para que el organizador elija.
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      // Fallback: devolver las alternativas del motor sin narrativa IA
      return new Response(
        JSON.stringify({
          ambiguous: true,
          plan: formatPlan,
          alternatives: formatPlan.alternatives ?? [],
          numPairs: pairCount,
          categoryName: category.display_name,
          aiSuggestion: null,
          warning: "Sugerencia IA no disponible: API key no configurada",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Construir el prompt para Claude — solo descripción de opciones, nunca decisión
    const alternatives = formatPlan.alternatives ?? [formatPlan];
    const optionDescriptions = alternatives
      .map((alt, i) => {
        const groupSummary = alt.groupSizes.length > 0
          ? `${alt.groupSizes.length} grupo(s) de ${alt.groupSizes.join(", ")} parejas`
          : "sin fase de grupos";
        return `Opción ${i + 1}: ${groupSummary}, pasan ${alt.advancePerGroup} por grupo` +
          (alt.bestExtraQualifiers > 0 ? ` + ${alt.bestExtraQualifiers} mejor(es) 2do(s)` : "") +
          `, fase final desde ${alt.knockoutStart}.`;
      })
      .join("\n");

    const aiPrompt = `Eres el asistente de RALLY, una plataforma de torneos de padel.
El organizador tiene ${pairCount} parejas inscritas en la categoría "${category.display_name}".
El motor de formato detectó ambigüedad y generó estas opciones de cuadro:

${optionDescriptions}

Explica brevemente (máximo 2 oraciones por opción) las ventajas de cada una para este organizador.
NO decidas cuál es mejor. NO digas cuál escoger. Solo describe en qué situación conviene cada opción.
Responde en español. Formato: una descripción por opción, empezando con "Opción 1:" y "Opción 2:".`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{ role: "user", content: aiPrompt }],
      }),
    });

    let aiSuggestion: string | null = null;
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      aiSuggestion = aiData.content?.[0]?.text ?? null;
    }

    return new Response(
      JSON.stringify({
        ambiguous: true,
        plan: formatPlan,
        alternatives: alternatives,
        numPairs: pairCount,
        categoryName: category.display_name,
        aiSuggestion,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper: obtener el organizer_id de un torneo
async function getTournamentOrgId(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  tournamentId: string
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("organizer_id")
    .eq("id", tournamentId)
    .single();

  if (error || !data) throw new Error("Torneo no encontrado");
  return data.organizer_id;
}
