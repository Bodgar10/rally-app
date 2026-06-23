// app/(organizer)/org/torneos/[tournamentId]/cerrar-inscripciones.tsx
// Pantalla del organizador para cerrar inscripciones de un torneo.
// Muestra: lista de categorías con nº de parejas + preview de formato.
// Si el formato es ambiguo, muestra las opciones de la sugerencia IA
// y deja que el organizador elija antes de llamar a close-registration.
// Guard: owner del organizador.
// Stack: React Native + NativeWind + design-tokens.ts (sin hex literales, sin div/span/button).

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { color, radius, space } from "@/lib/design-tokens";

// ─── Tipos locales ───────────────────────────────────────────────────────────

type PaymentStatus = "paid_online" | "paid_offline" | "comp";

interface CategorySummary {
  id: string;
  display_name: string;
  division: string;
  gender: string;
  status: string;
  pairCount: number;
}

interface FormatPlan {
  formatType: "round_robin" | "groups_then_knockout" | "knockout_only";
  groupSizes: number[];
  advancePerGroup: number;
  bestExtraQualifiers: number;
  knockoutStart: "final" | "semi" | "quarter" | "r16" | "r32";
  ambiguous: boolean;
  alternatives?: FormatPlan[];
}

interface FormatResult {
  ambiguous: boolean;
  plan: FormatPlan;
  alternatives?: FormatPlan[];
  numPairs: number;
  categoryName: string;
  aiSuggestion?: string | null;
}

type Screen =
  | "loading"
  | "overview"       // lista de categorías con nº de parejas
  | "format_preview" // preview del formato de una categoría
  | "choose_format"  // el organizador elige entre opciones ambiguas
  | "closing"        // spinner mientras close-registration trabaja
  | "done"           // éxito
  | "error";

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CerrarInscripcionesScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  const [screen, setScreen] = useState<Screen>("loading");
  const [tournament, setTournament] = useState<{ name: string; status: string } | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategorySummary | null>(null);
  const [formatResult, setFormatResult] = useState<FormatResult | null>(null);
  const [chosenPlanIndex, setChosenPlanIndex] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [sessionToken, setSessionToken] = useState<string>("");

  // ── Cargar datos iniciales ──
  useEffect(() => {
    if (!tournamentId) return;
    loadData();
  }, [tournamentId]);

  const loadData = useCallback(async () => {
    setScreen("loading");

    // Obtener token de sesión para llamar Edge Functions
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setErrorMsg("Sesión expirada. Vuelve a iniciar sesión.");
      setScreen("error");
      return;
    }
    setSessionToken(session.access_token);

    // Obtener torneo
    const { data: t, error: te } = await supabase
      .from("tournaments")
      .select("name, status")
      .eq("id", tournamentId)
      .single();

    if (te || !t) {
      setErrorMsg("Torneo no encontrado.");
      setScreen("error");
      return;
    }
    setTournament(t);

    // Obtener categorías y contar parejas por cada una.
    // pairs.category_id existe (verificado en PASO 0); la relación anidada cuenta las parejas.
    const { data: cats, error: ce } = await supabase
      .from("categories")
      .select(`
        id,
        display_name,
        division,
        gender,
        status,
        pairs(id)
      `)
      .eq("tournament_id", tournamentId)
      .order("division");

    if (ce || !cats) {
      setErrorMsg("Error cargando categorías: " + (ce?.message ?? ""));
      setScreen("error");
      return;
    }

    const summaries: CategorySummary[] = cats.map((c: any) => ({
      id: c.id,
      display_name: c.display_name,
      division: c.division,
      gender: c.gender,
      status: c.status,
      // pairs es un array de objetos {id} → contar
      pairCount: Array.isArray(c.pairs) ? c.pairs.length : 0,
    }));

    setCategories(summaries);
    setScreen("overview");
  }, [tournamentId]);

  // ── Solicitar preview del formato para una categoría ──
  const handlePreviewFormat = useCallback(async (cat: CategorySummary) => {
    setSelectedCategory(cat);
    setScreen("loading");

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-format`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
          },
          body: JSON.stringify({ category_id: cat.id }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Error generando formato");
      }

      const result: FormatResult = await response.json();
      setFormatResult(result);
      setChosenPlanIndex(0);
      setScreen(result.ambiguous ? "choose_format" : "format_preview");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Error desconocido");
      setScreen("error");
    }
  }, [sessionToken]);

  // ── Confirmar y cerrar inscripciones ──
  const handleCloseRegistration = useCallback(async () => {
    if (!selectedCategory || !formatResult) return;

    Alert.alert(
      "¿Cerrar inscripciones?",
      `Esto cerrará las inscripciones de "${selectedCategory.display_name}" y generará el cuadro con ${formatResult.numPairs} parejas. No se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar inscripciones",
          style: "destructive",
          onPress: () => doCloseRegistration(),
        },
      ]
    );
  }, [selectedCategory, formatResult, chosenPlanIndex]);

  const doCloseRegistration = useCallback(async () => {
    setScreen("closing");

    // El plan elegido (si era ambiguo, el organizador eligió)
    const chosenPlan = formatResult?.ambiguous
      ? (formatResult.alternatives ?? [formatResult.plan])[chosenPlanIndex]
      : formatResult?.plan;

    try {
      // Invocar la Edge Function close-registration (entregada por Opus).
      // El body usa chosen_format: así lo lee close-registration (caso ambiguo ya resuelto).
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/close-registration`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
          },
          body: JSON.stringify({
            category_id: selectedCategory!.id,
            chosen_format: chosenPlan,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Error al cerrar inscripciones");
      }

      setScreen("done");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Error cerrando inscripciones");
      setScreen("error");
    }
  }, [selectedCategory, formatResult, chosenPlanIndex, sessionToken]);

  // ─────────────────────────────────── RENDERS ───────────────────────────────────

  if (screen === "loading" || screen === "closing") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.bg,
          alignItems: "center",
          justifyContent: "center",
          gap: space[4],
        }}
      >
        <ActivityIndicator color={color.gold} size="large" />
        <Text
          style={{ color: color.muted, fontFamily: "Inter", fontSize: 14 }}
        >
          {screen === "closing" ? "Cerrando inscripciones…" : "Cargando…"}
        </Text>
      </View>
    );
  }

  if (screen === "error") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.bg,
          padding: space[5],
          alignItems: "center",
          justifyContent: "center",
          gap: space[4],
        }}
      >
        <Text
          style={{ color: color.danger, fontFamily: "Oswald", fontSize: 20 }}
        >
          Error
        </Text>
        <Text
          style={{
            color: color.text,
            fontFamily: "Inter",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          {errorMsg}
        </Text>
        <Pressable
          onPress={() => {
            setErrorMsg("");
            setScreen("overview");
            loadData();
          }}
          style={{
            backgroundColor: color.surface2,
            paddingHorizontal: space[5],
            paddingVertical: space[3],
            borderRadius: radius.sm,
          }}
        >
          <Text style={{ color: color.gold, fontFamily: "Inter", fontWeight: "600" }}>
            Volver
          </Text>
        </Pressable>
      </View>
    );
  }

  if (screen === "done") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: color.bg,
          padding: space[5],
          alignItems: "center",
          justifyContent: "center",
          gap: space[4],
        }}
      >
        <Text
          style={{ color: color.live, fontFamily: "Oswald", fontSize: 28, fontWeight: "600" }}
        >
          ¡Listo!
        </Text>
        <Text
          style={{
            color: color.text,
            fontFamily: "Inter",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          Inscripciones cerradas. El cuadro ha sido generado para{" "}
          {selectedCategory?.display_name}.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{
            backgroundColor: color.gold,
            paddingHorizontal: space[5],
            paddingVertical: space[3],
            borderRadius: radius.sm,
          }}
        >
          <Text style={{ color: color.onGold, fontFamily: "Inter", fontWeight: "600" }}>
            Volver al panel
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── OVERVIEW: lista de categorías ──
  if (screen === "overview") {
    const closeable = categories.filter((c) => c.status === "open" && c.pairCount >= 2);
    const notReady = categories.filter((c) => c.status === "open" && c.pairCount < 2);
    const alreadyClosed = categories.filter((c) => c.status !== "open");

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bg }}
        contentContainerStyle={{ padding: space[5], gap: space[4] }}
      >
        {/* Header */}
        <View style={{ marginBottom: space[2] }}>
          <Text
            style={{ color: color.champagne, fontFamily: "Oswald", fontSize: 11,
              textTransform: "uppercase", letterSpacing: 2, marginBottom: space[1] }}
          >
            Inscripciones · {tournament?.name}
          </Text>
          <Text
            style={{ color: color.text, fontFamily: "Oswald", fontSize: 22, fontWeight: "600" }}
          >
            Cerrar inscripciones
          </Text>
          <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 13, marginTop: 4 }}>
            Elige la categoría que quieres cerrar. Se generará el cuadro automáticamente.
          </Text>
        </View>

        {/* Categorías listas para cerrar */}
        {closeable.length > 0 && (
          <View style={{ gap: space[3] }}>
            <Text
              style={{ color: color.champagne, fontFamily: "Oswald", fontSize: 11,
                textTransform: "uppercase", letterSpacing: 1.4 }}
            >
              Listas para cerrar
            </Text>
            {closeable.map((cat) => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                onPress={() => handlePreviewFormat(cat)}
                actionable
              />
            ))}
          </View>
        )}

        {/* Categorías con pocas parejas */}
        {notReady.length > 0 && (
          <View style={{ gap: space[3] }}>
            <Text
              style={{ color: color.alive, fontFamily: "Oswald", fontSize: 11,
                textTransform: "uppercase", letterSpacing: 1.4 }}
            >
              Pocas parejas (mínimo 2)
            </Text>
            {notReady.map((cat) => (
              <CategoryCard key={cat.id} cat={cat} actionable={false} />
            ))}
          </View>
        )}

        {/* Categorías ya cerradas */}
        {alreadyClosed.length > 0 && (
          <View style={{ gap: space[3] }}>
            <Text
              style={{ color: color.muted, fontFamily: "Oswald", fontSize: 11,
                textTransform: "uppercase", letterSpacing: 1.4 }}
            >
              Ya cerradas
            </Text>
            {alreadyClosed.map((cat) => (
              <CategoryCard key={cat.id} cat={cat} actionable={false} closed />
            ))}
          </View>
        )}

        {categories.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: space[6] }}>
            <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 14 }}>
              Este torneo no tiene categorías aún.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ── FORMAT PREVIEW: formato no ambiguo ──
  if (screen === "format_preview" && formatResult) {
    const plan = formatResult.plan;
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bg }}
        contentContainerStyle={{ padding: space[5], gap: space[4] }}
      >
        <Pressable
          onPress={() => setScreen("overview")}
          style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginBottom: space[2] }}
        >
          <Text style={{ color: color.gold, fontFamily: "Inter", fontSize: 13 }}>← Atrás</Text>
        </Pressable>

        <Text style={{ color: color.champagne, fontFamily: "Oswald", fontSize: 11,
          textTransform: "uppercase", letterSpacing: 2 }}>
          {selectedCategory?.display_name}
        </Text>
        <Text style={{ color: color.text, fontFamily: "Oswald", fontSize: 22, fontWeight: "600" }}>
          Formato sugerido
        </Text>

        {/* Resumen del plan */}
        <View
          style={{
            backgroundColor: color.surface,
            borderRadius: radius.xl,
            padding: space[4],
            borderWidth: 1,
            borderColor: color.line,
            gap: space[3],
          }}
        >
          <FormatRow label="Parejas inscritas" value={String(formatResult.numPairs)} />
          <FormatRow label="Grupos" value={
            plan.groupSizes.length > 0
              ? `${plan.groupSizes.length} grupo(s) de ${[...new Set(plan.groupSizes)].join("/")} parejas`
              : "Sin fase de grupos"
          } />
          <FormatRow label="Pasan por grupo" value={String(plan.advancePerGroup)} />
          {plan.bestExtraQualifiers > 0 && (
            <FormatRow
              label="Mejores segundos que pasan"
              value={String(plan.bestExtraQualifiers)}
            />
          )}
          <FormatRow label="Fase final" value={knockoutLabel(plan.knockoutStart)} />
        </View>

        <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12, textAlign: "center" }}>
          El cuadro se generará automáticamente al confirmar.
        </Text>

        {/* Botón primario */}
        <Pressable
          onPress={handleCloseRegistration}
          style={{
            backgroundColor: color.gold,
            padding: space[4],
            borderRadius: radius.sm,
            alignItems: "center",
            marginTop: space[2],
          }}
        >
          <Text style={{ color: color.onGold, fontFamily: "Inter", fontSize: 15, fontWeight: "600" }}>
            Cerrar inscripciones
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── CHOOSE FORMAT: formato ambiguo → el organizador elige ──
  if (screen === "choose_format" && formatResult) {
    const options = formatResult.alternatives ?? [formatResult.plan];

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: color.bg }}
        contentContainerStyle={{ padding: space[5], gap: space[4] }}
      >
        <Pressable
          onPress={() => setScreen("overview")}
          style={{ flexDirection: "row", alignItems: "center", gap: space[2], marginBottom: space[2] }}
        >
          <Text style={{ color: color.gold, fontFamily: "Inter", fontSize: 13 }}>← Atrás</Text>
        </Pressable>

        <Text style={{ color: color.champagne, fontFamily: "Oswald", fontSize: 11,
          textTransform: "uppercase", letterSpacing: 2 }}>
          {selectedCategory?.display_name} · {formatResult.numPairs} parejas
        </Text>
        <Text style={{ color: color.text, fontFamily: "Oswald", fontSize: 22, fontWeight: "600" }}>
          Elige el formato
        </Text>
        <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 13 }}>
          El motor encontró más de una opción válida. Tú eliges cuál usar.
        </Text>

        {/* Sugerencia IA (si existe) */}
        {formatResult.aiSuggestion && (
          <View
            style={{
              backgroundColor: color.surface,
              borderRadius: radius.xl,
              padding: space[4],
              borderWidth: 1,
              borderColor: color.line,
            }}
          >
            <Text style={{ color: color.champagne, fontFamily: "Oswald", fontSize: 11,
              textTransform: "uppercase", letterSpacing: 1.4, marginBottom: space[2] }}>
              Análisis
            </Text>
            <Text style={{ color: color.text, fontFamily: "Inter", fontSize: 13, lineHeight: 20 }}>
              {formatResult.aiSuggestion}
            </Text>
          </View>
        )}

        {/* Opciones seleccionables */}
        {options.map((opt, i) => {
          const isSelected = chosenPlanIndex === i;
          return (
            <Pressable
              key={i}
              onPress={() => setChosenPlanIndex(i)}
              style={{
                backgroundColor: isSelected ? color.surface2 : color.surface,
                borderRadius: radius.xl,
                padding: space[4],
                borderWidth: 1,
                borderColor: isSelected ? color.gold : color.lineSoft,
                gap: space[2],
              }}
            >
              <Text style={{ color: isSelected ? color.goldBright : color.text,
                fontFamily: "Oswald", fontSize: 16, fontWeight: "600" }}>
                Opción {i + 1}
              </Text>
              <FormatRow label="Grupos" value={
                opt.groupSizes.length > 0
                  ? `${opt.groupSizes.length} de ${[...new Set(opt.groupSizes)].join("/")} parejas`
                  : "Sin grupos"
              } />
              <FormatRow label="Pasan" value={
                `${opt.advancePerGroup} por grupo` +
                (opt.bestExtraQualifiers > 0 ? ` + ${opt.bestExtraQualifiers} mejor 2do` : "")
              } />
              <FormatRow label="Fase final" value={knockoutLabel(opt.knockoutStart)} />
            </Pressable>
          );
        })}

        {/* Botón confirmar */}
        <Pressable
          onPress={handleCloseRegistration}
          style={{
            backgroundColor: color.gold,
            padding: space[4],
            borderRadius: radius.sm,
            alignItems: "center",
            marginTop: space[2],
          }}
        >
          <Text style={{ color: color.onGold, fontFamily: "Inter", fontSize: 15, fontWeight: "600" }}>
            Usar Opción {chosenPlanIndex + 1} y cerrar
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return null;
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  onPress,
  actionable = true,
  closed = false,
}: {
  cat: CategorySummary;
  onPress?: () => void;
  actionable?: boolean;
  closed?: boolean;
}) {
  return (
    <Pressable
      onPress={actionable ? onPress : undefined}
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.xl,
        padding: space[4],
        borderWidth: 1,
        borderColor: actionable ? color.line : color.lineSoft,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        opacity: closed ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: color.text, fontFamily: "Oswald", fontSize: 16, fontWeight: "500" }}>
          {cat.display_name}
        </Text>
        <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12 }}>
          {cat.pairCount} {cat.pairCount === 1 ? "pareja" : "parejas"} inscritas
        </Text>
      </View>

      {actionable && (
        <View
          style={{
            backgroundColor: color.gold,
            paddingHorizontal: space[3],
            paddingVertical: space[2],
            borderRadius: radius.sm,
          }}
        >
          <Text style={{ color: color.onGold, fontFamily: "Inter", fontSize: 12, fontWeight: "600" }}>
            Ver formato
          </Text>
        </View>
      )}

      {closed && (
        <View
          style={{
            backgroundColor: color.surface2,
            paddingHorizontal: space[3],
            paddingVertical: space[2],
            borderRadius: radius.sm,
          }}
        >
          <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12 }}>
            Cerrada
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function FormatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12 }}>{label}</Text>
      <Text style={{ color: color.text, fontFamily: "Inter", fontSize: 13, fontWeight: "500" }}>
        {value}
      </Text>
    </View>
  );
}

function knockoutLabel(k: string): string {
  const map: Record<string, string> = {
    final: "Final directa",
    semi: "Semifinales",
    quarter: "Cuartos de final",
    r16: "Octavos (R16)",
    r32: "R32",
  };
  return map[k] ?? k;
}
