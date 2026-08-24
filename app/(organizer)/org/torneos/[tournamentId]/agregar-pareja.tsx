// app/(organizer)/org/torneos/[tournamentId]/agregar-pareja.tsx
// Pantalla del organizador para registrar manualmente una pareja (paid_offline).
// Flujo:
//   1. Seleccionar categoría del torneo
//   2. Buscar Jugador 1 por correo → confirmar
//   3. Buscar Jugador 2 por correo → confirmar
//   4. Confirmar e insertar la pareja con payment_status = 'paid_offline'
//
// IMPORTANTE: paid_offline es un DATO y MÉTRICA, NO un ingreso en la plataforma.
// Aparece en el cuadro igual que cualquier otra pareja.
//
// Restricción: ambos jugadores DEBEN existir en public.users (tener cuenta).
// El organizador los busca por correo. Como public.users está en RLS "solo tu fila",
// la búsqueda usa el RPC find_user_by_email (SECURITY DEFINER, migración 012),
// que resuelve por correo exacto y devuelve solo campos seguros (id, email, full_name).
//
// Guard: owner del organizador (pairs_insert ya lo exige a nivel RLS).
// Stack: React Native + NativeWind + design-tokens.ts

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { color, radius, space } from "@/lib/design-tokens";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
}

interface CategoryOption {
  id: string;
  display_name: string;
  division: string;
  gender: string;
  status: string;
}

type Step = "category" | "player1" | "player2" | "confirm" | "saving" | "done" | "error";

// ─── Componente principal ──────────────────────────────────────────────────────

export default function AgregarParejaScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  const [step, setStep] = useState<Step>("category");
  const [tournament, setTournament] = useState<{ name: string } | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null);
  const [player1, setPlayer1] = useState<UserProfile | null>(null);
  const [player2, setPlayer2] = useState<UserProfile | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<UserProfile | null | "not_found">(null);
  const [errorMsg, setErrorMsg] = useState("");

  // ── Cargar datos iniciales ──
  useEffect(() => {
    if (!tournamentId) return;
    loadInitialData();
  }, [tournamentId]);

  const loadInitialData = useCallback(async () => {
    const { data: t } = await supabase
      .from("tournaments")
      .select("name")
      .eq("id", tournamentId)
      .single();

    if (t) setTournament(t);

    // Solo categorías abiertas (status = 'open')
    const { data: cats } = await supabase
      .from("categories")
      .select("id, display_name, division, gender, status")
      .eq("tournament_id", tournamentId)
      .eq("status", "open")
      .order("division");

    if (cats) setCategories(cats);
  }, [tournamentId]);

  // ── Buscar usuario por correo (vía RPC SECURITY DEFINER; RLS de users es "solo tu fila") ──
  const handleSearch = useCallback(async () => {
    const email = searchEmail.trim().toLowerCase();
    if (!email) return;
    Keyboard.dismiss();
    setSearching(true);
    setSearchResult(null);

    const { data, error } = await supabase
      .rpc("find_user_by_email", { p_email: email })
      .maybeSingle();

    setSearching(false);

    if (error || !data) {
      setSearchResult("not_found");
      return;
    }

    setSearchResult(data as UserProfile);
  }, [searchEmail]);

  // ── Confirmar selección de jugador ──
  const handleConfirmPlayer = useCallback(
    (user: UserProfile) => {
      if (step === "player1") {
        setPlayer1(user);
        setSearchEmail("");
        setSearchResult(null);
        setStep("player2");
      } else if (step === "player2") {
        if (user.id === player1?.id) {
          Alert.alert("Error", "Los dos jugadores de la pareja deben ser personas distintas.");
          return;
        }
        setPlayer2(user);
        setSearchEmail("");
        setSearchResult(null);
        setStep("confirm");
      }
    },
    [step, player1]
  );

  // ── Guardar la pareja ──
  const handleSave = useCallback(async () => {
    if (!selectedCategory || !player1 || !player2) return;
    setStep("saving");

    // Insertar la pareja con payment_status = 'paid_offline'.
    // RLS pairs_insert permite al owner del organizador insertar directamente.
    const { error } = await supabase.from("pairs").insert({
      tournament_id: tournamentId,
      category_id: selectedCategory.id,
      player1_id: player1.id,
      player2_id: player2.id,
      payment_status: "paid_offline",
      // schedule_preference no se captura aquí; default 'any'
    });

    if (error) {
      // Manejar el caso de pareja duplicada en la misma categoría
      if (error.code === "23505") {
        setErrorMsg(
          "Uno de estos jugadores ya está inscrito en esta categoría. No se puede duplicar."
        );
      } else {
        setErrorMsg(error.message);
      }
      setStep("error");
      return;
    }

    setStep("done");
  }, [selectedCategory, player1, player2, tournamentId]);

  // ─────────────────────────────── RENDERS ───────────────────────────────────────

  if (step === "saving") {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, alignItems: "center", justifyContent: "center", gap: space[4] }}>
        <ActivityIndicator color={color.gold} size="large" />
        <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 14 }}>
          Guardando pareja…
        </Text>
      </View>
    );
  }

  if (step === "done") {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, padding: space[5], alignItems: "center", justifyContent: "center", gap: space[4] }}>
        <Text style={{ color: color.live, fontFamily: "Oswald", fontSize: 28, fontWeight: "600" }}>
          ¡Pareja agregada!
        </Text>
        <Text style={{ color: color.text, fontFamily: "Inter", fontSize: 14, textAlign: "center" }}>
          {player1?.full_name ?? player1?.email} y {player2?.full_name ?? player2?.email}
          {"\n"}ya están inscritos en {selectedCategory?.display_name}.
        </Text>
        <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12, textAlign: "center" }}>
          Esta inscripción es un dato de seguimiento. No registra ingreso en la plataforma.
        </Text>
        <View style={{ flexDirection: "row", gap: space[3], marginTop: space[2] }}>
          <Pressable
            onPress={() => {
              // Reiniciar para agregar otra pareja
              setStep("category");
              setSelectedCategory(null);
              setPlayer1(null);
              setPlayer2(null);
              setSearchEmail("");
              setSearchResult(null);
            }}
            style={{
              borderWidth: 1,
              borderColor: color.line,
              paddingHorizontal: space[4],
              paddingVertical: space[3],
              borderRadius: radius.sm,
            }}
          >
            <Text style={{ color: color.gold, fontFamily: "Inter", fontSize: 13, fontWeight: "600" }}>
              Agregar otra
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={{
              backgroundColor: color.gold,
              paddingHorizontal: space[4],
              paddingVertical: space[3],
              borderRadius: radius.sm,
            }}
          >
            <Text style={{ color: color.onGold, fontFamily: "Inter", fontSize: 13, fontWeight: "600" }}>
              Volver al panel
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "error") {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, padding: space[5], alignItems: "center", justifyContent: "center", gap: space[4] }}>
        <Text style={{ color: color.danger, fontFamily: "Oswald", fontSize: 20 }}>Error</Text>
        <Text style={{ color: color.text, fontFamily: "Inter", fontSize: 14, textAlign: "center" }}>
          {errorMsg}
        </Text>
        <Pressable
          onPress={() => {
            setErrorMsg("");
            setStep("confirm");
          }}
          style={{ backgroundColor: color.surface2, paddingHorizontal: space[5], paddingVertical: space[3], borderRadius: radius.sm }}
        >
          <Text style={{ color: color.gold, fontFamily: "Inter", fontWeight: "600" }}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space[5], gap: space[4] }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={{ marginBottom: space[2] }}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: space[3] }}>
          <Text style={{ color: color.gold, fontFamily: "Inter", fontSize: 13 }}>← Atrás</Text>
        </Pressable>
        <Text style={{ color: color.champagne, fontFamily: "Oswald", fontSize: 11,
          textTransform: "uppercase", letterSpacing: 2 }}>
          {tournament?.name}
        </Text>
        <Text style={{ color: color.text, fontFamily: "Oswald", fontSize: 22, fontWeight: "600" }}>
          Agregar pareja manual
        </Text>
        <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 13, marginTop: 4 }}>
          El pago se recibió fuera de la plataforma.
        </Text>
      </View>

      {/* Indicador de pasos */}
      <StepIndicator currentStep={step} />

      {/* ── PASO 1: Elegir categoría ── */}
      {step === "category" && (
        <View style={{ gap: space[3] }}>
          <SectionLabel text="1. Selecciona la categoría" />
          {categories.length === 0 ? (
            <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 13 }}>
              No hay categorías abiertas en este torneo.
            </Text>
          ) : (
            categories.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => {
                  setSelectedCategory(cat);
                  setStep("player1");
                }}
                style={{
                  backgroundColor: color.surface,
                  borderRadius: radius.xl,
                  padding: space[4],
                  borderWidth: 1,
                  borderColor: color.lineSoft,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: color.text, fontFamily: "Oswald", fontSize: 16 }}>
                  {cat.display_name}
                </Text>
                <Text style={{ color: color.gold, fontFamily: "Inter", fontSize: 13 }}>
                  Elegir →
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* ── PASO 2: Buscar Jugador 1 ── */}
      {step === "player1" && (
        <PlayerSearchStep
          stepLabel="2. Jugador 1 (primer titular)"
          searchEmail={searchEmail}
          onChangeEmail={setSearchEmail}
          onSearch={handleSearch}
          searching={searching}
          searchResult={searchResult}
          onConfirm={handleConfirmPlayer}
          hint="Busca por correo electrónico. El jugador debe tener cuenta en RALLY."
        />
      )}

      {/* ── PASO 3: Buscar Jugador 2 ── */}
      {step === "player2" && (
        <>
          {/* Resumen del jugador 1 ya elegido */}
          <SelectedPlayerCard
            label="Jugador 1"
            user={player1!}
            onClear={() => {
              setPlayer1(null);
              setSearchEmail("");
              setSearchResult(null);
              setStep("player1");
            }}
          />
          <PlayerSearchStep
            stepLabel="3. Jugador 2 (pareja)"
            searchEmail={searchEmail}
            onChangeEmail={setSearchEmail}
            onSearch={handleSearch}
            searching={searching}
            searchResult={searchResult}
            onConfirm={handleConfirmPlayer}
            hint="Busca al segundo jugador de la pareja."
          />
        </>
      )}

      {/* ── PASO 4: Confirmar e insertar ── */}
      {step === "confirm" && selectedCategory && player1 && player2 && (
        <View style={{ gap: space[3] }}>
          <SectionLabel text="4. Confirmar inscripción" />

          {/* Resumen */}
          <View style={{
            backgroundColor: color.surface,
            borderRadius: radius.xl,
            padding: space[4],
            borderWidth: 1,
            borderColor: color.line,
            gap: space[3],
          }}>
            <ConfirmRow label="Categoría" value={selectedCategory.display_name} />
            <ConfirmRow label="Jugador 1" value={player1.full_name ?? player1.email} />
            <ConfirmRow label="Jugador 2" value={player2.full_name ?? player2.email} />
            <ConfirmRow label="Pago" value="Recibido fuera de la plataforma" />
          </View>

          <View style={{
            backgroundColor: color.surface2,
            borderRadius: radius.lg,
            padding: space[3],
          }}>
            <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12, lineHeight: 18 }}>
              Esta inscripción es un dato de seguimiento y métrica. No registra ingreso económico en RALLY.
              La pareja participará en el cuadro igual que cualquier otra.
            </Text>
          </View>

          <Pressable
            onPress={handleSave}
            style={{
              backgroundColor: color.gold,
              padding: space[4],
              borderRadius: radius.sm,
              alignItems: "center",
            }}
          >
            <Text style={{ color: color.onGold, fontFamily: "Inter", fontSize: 15, fontWeight: "600" }}>
              Confirmar e inscribir
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setStep("category");
              setSelectedCategory(null);
              setPlayer1(null);
              setPlayer2(null);
              setSearchEmail("");
              setSearchResult(null);
            }}
            style={{ alignItems: "center", paddingVertical: space[2] }}
          >
            <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 13 }}>
              Cancelar y empezar de nuevo
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const steps: Step[] = ["category", "player1", "player2", "confirm"];
  const currentIndex = steps.indexOf(currentStep);

  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: space[2] }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <View style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: i <= currentIndex ? color.gold : color.surface2,
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Text style={{
              color: i <= currentIndex ? color.onGold : color.muted,
              fontFamily: "Inter",
              fontSize: 11,
              fontWeight: "600",
            }}>
              {i + 1}
            </Text>
          </View>
          {i < steps.length - 1 && (
            <View style={{ flex: 1, height: 1, backgroundColor: i < currentIndex ? color.gold : color.lineSoft }} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text style={{
      color: color.champagne,
      fontFamily: "Oswald",
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      marginBottom: 2,
    }}>
      {text}
    </Text>
  );
}

function PlayerSearchStep({
  stepLabel,
  searchEmail,
  onChangeEmail,
  onSearch,
  searching,
  searchResult,
  onConfirm,
  hint,
}: {
  stepLabel: string;
  searchEmail: string;
  onChangeEmail: (v: string) => void;
  onSearch: () => void;
  searching: boolean;
  searchResult: UserProfile | "not_found" | null;
  onConfirm: (u: UserProfile) => void;
  hint: string;
}) {
  return (
    <View style={{ gap: space[3] }}>
      <SectionLabel text={stepLabel} />
      <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12 }}>{hint}</Text>

      {/* Input de búsqueda */}
      <View style={{ gap: space[2] }}>
        <TextInput
          value={searchEmail}
          onChangeText={onChangeEmail}
          placeholder="correo@ejemplo.com"
          placeholderTextColor={color.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={onSearch}
          style={{
            backgroundColor: color.surface2,
            borderRadius: radius.sm,
            padding: space[4],
            color: color.text,
            fontFamily: "Inter",
            fontSize: 14,
            borderWidth: 1,
            borderColor: color.lineSoft,
          }}
        />
        <Pressable
          onPress={onSearch}
          disabled={searching || !searchEmail.trim()}
          style={{
            backgroundColor: searching || !searchEmail.trim() ? color.surface2 : color.gold,
            padding: space[3],
            borderRadius: radius.sm,
            alignItems: "center",
          }}
        >
          {searching ? (
            <ActivityIndicator color={color.gold} size="small" />
          ) : (
            <Text style={{
              color: !searchEmail.trim() ? color.muted : color.onGold,
              fontFamily: "Inter",
              fontSize: 14,
              fontWeight: "600",
            }}>
              Buscar jugador
            </Text>
          )}
        </Pressable>
      </View>

      {/* Resultado de búsqueda */}
      {searchResult === "not_found" && (
        <View style={{
          backgroundColor: color.surface,
          borderRadius: radius.lg,
          padding: space[4],
          borderWidth: 1,
          borderColor: color.danger,
          gap: space[2],
        }}>
          <Text style={{ color: color.danger, fontFamily: "Inter", fontSize: 14, fontWeight: "600" }}>
            Jugador no encontrado
          </Text>
          <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12 }}>
            El correo no tiene cuenta en RALLY. El jugador debe registrarse primero.
          </Text>
        </View>
      )}

      {searchResult && searchResult !== "not_found" && (
        <View style={{
          backgroundColor: color.surface,
          borderRadius: radius.xl,
          padding: space[4],
          borderWidth: 1,
          borderColor: color.live,
          gap: space[3],
        }}>
          <View>
            <Text style={{ color: color.text, fontFamily: "Oswald", fontSize: 16 }}>
              {searchResult.full_name ?? "Sin nombre"}
            </Text>
            <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12 }}>
              {searchResult.email}
            </Text>
          </View>
          <Pressable
            onPress={() => onConfirm(searchResult as UserProfile)}
            style={{
              backgroundColor: color.gold,
              padding: space[3],
              borderRadius: radius.sm,
              alignItems: "center",
            }}
          >
            <Text style={{ color: color.onGold, fontFamily: "Inter", fontSize: 14, fontWeight: "600" }}>
              Seleccionar
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SelectedPlayerCard({
  label,
  user,
  onClear,
}: {
  label: string;
  user: UserProfile;
  onClear: () => void;
}) {
  return (
    <View style={{
      backgroundColor: color.surface,
      borderRadius: radius.lg,
      padding: space[3],
      borderWidth: 1,
      borderColor: color.line,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <View>
        <Text style={{ color: color.champagne, fontFamily: "Oswald", fontSize: 10,
          textTransform: "uppercase", letterSpacing: 1 }}>
          {label}
        </Text>
        <Text style={{ color: color.text, fontFamily: "Inter", fontSize: 13, marginTop: 2 }}>
          {user.full_name ?? user.email}
        </Text>
      </View>
      <Pressable onPress={onClear} style={{ padding: space[2] }}>
        <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12 }}>Cambiar</Text>
      </Pressable>
    </View>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
      <Text style={{ color: color.muted, fontFamily: "Inter", fontSize: 12, flex: 1 }}>{label}</Text>
      <Text style={{ color: color.text, fontFamily: "Inter", fontSize: 13, fontWeight: "500",
        flex: 2, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}
