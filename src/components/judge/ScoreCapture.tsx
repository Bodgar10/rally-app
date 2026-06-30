/**
 * src/components/judge/ScoreCapture.tsx
 *
 * RALLY · Captura de marcador completo por el juez.
 *
 * REGLAS:
 * - Al confirmar, invoca la Edge Function `match-result` (Opus).
 * - NO escribe en matches/match_sets directamente.
 * - Maneja estados de carga, error de marcador inválido y éxito.
 * - Ultra simple: nombre pares + inputs de games por set.
 * - Solo primitivos React Native. Colores solo de design-tokens.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { color, font, radius } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

interface SetScore {
  gamesA: string;
  gamesB: string;
  isSuperTiebreak: boolean;
  tiebreakA: string;
  tiebreakB: string;
}

const emptySet = (): SetScore => ({
  gamesA: '',
  gamesB: '',
  isSuperTiebreak: false,
  tiebreakA: '',
  tiebreakB: '',
});

export interface ScoreCaptureProps {
  matchId: string;
  pairAId: string;
  pairBId: string;
  pairAName: string; // "Jugador1 / Jugador2"
  pairBName: string;
  /** Callback cuando el resultado fue aceptado exitosamente. */
  onSuccess: () => void;
}

// ───────────────────────────────────────────
// Componente
// ───────────────────────────────────────────

export default function ScoreCapture({
  matchId,
  pairAId,
  pairBId,
  pairAName,
  pairBName,
  onSuccess,
}: ScoreCaptureProps) {
  const [sets, setSets] = useState<SetScore[]>([emptySet(), emptySet()]);
  const [winnerPairId, setWinnerPairId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ───────────────────────────────────────────
  // Manipulación de sets
  // ───────────────────────────────────────────

  function updateSet(idx: number, field: keyof SetScore, value: string | boolean) {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    setValidationError(null);
  }

  function addSet() {
    if (sets.length < 3) setSets((prev) => [...prev, emptySet()]);
  }

  function removeLastSet() {
    if (sets.length > 2) setSets((prev) => prev.slice(0, -1));
  }

  // ───────────────────────────────────────────
  // Submit → Edge Function match-result
  // ───────────────────────────────────────────

  async function handleSubmit() {
    setValidationError(null);

    if (!winnerPairId) {
      setValidationError('Selecciona al ganador del partido.');
      return;
    }

    // Construir payload de sets
    const setsPayload = sets.map((s, i) => ({
      set_number: i + 1,
      games_a: parseInt(s.gamesA, 10),
      games_b: parseInt(s.gamesB, 10),
      is_super_tiebreak: s.isSuperTiebreak,
      tiebreak_a: s.isSuperTiebreak ? parseInt(s.tiebreakA, 10) || null : null,
      tiebreak_b: s.isSuperTiebreak ? parseInt(s.tiebreakB, 10) || null : null,
    }));

    // Validación básica de números
    for (const [i, s] of setsPayload.entries()) {
      if (isNaN(s.games_a) || isNaN(s.games_b)) {
        setValidationError(`Set ${i + 1}: ingresa los games correctamente.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión activa.');

      // Llamar a la Edge Function de Opus
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/match-result`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            match_id: matchId,
            winner_pair_id: winnerPairId,
            sets: setsPayload,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        // La Edge Function retorna el motivo de rechazo (marcador inválido, etc.)
        const msg = json?.error ?? json?.message ?? 'Resultado rechazado por el servidor.';
        setValidationError(msg);
        return;
      }

      // Éxito
      onSuccess();
    } catch (e) {
      console.error('[ScoreCapture] submit error:', e);
      setValidationError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // ───────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────

  return (
    <View style={{ gap: 16 }}>
      {/* Selector de ganador */}
      <View>
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 10,
            fontWeight: '500',
            color: color.champagne,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 8,
          }}
        >
          Ganador
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { id: pairAId, name: pairAName },
            { id: pairBId, name: pairBName },
          ].map((p) => {
            const selected = winnerPairId === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => { setWinnerPairId(p.id); setValidationError(null); }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: radius.lg,
                  borderWidth: 1.5,
                  borderColor: selected ? color.gold : color.lineSoft,
                  backgroundColor: selected ? 'rgba(212,175,55,0.12)' : color.surface,
                  alignItems: 'center',
                }}
                accessibilityRole="radio"
                accessibilityLabel={`Ganador: ${p.name}`}
                accessibilityState={{ checked: selected }}
              >
                <Text
                  style={{
                    fontFamily: font.body,
                    fontSize: 12,
                    fontWeight: selected ? '600' : '400',
                    color: selected ? color.goldBright : color.text,
                    textAlign: 'center',
                  }}
                  numberOfLines={2}
                >
                  {p.name}
                  {selected ? '\n🏆' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Marcador por sets */}
      <View>
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 10,
            fontWeight: '500',
            color: color.champagne,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 8,
          }}
        >
          Marcador
        </Text>

        <View style={{ gap: 10 }}>
          {sets.map((s, idx) => (
            <View
              key={idx}
              style={{
                backgroundColor: color.surface,
                borderRadius: radius.lg,
                padding: 12,
                borderWidth: 1,
                borderColor: color.lineSoft,
                gap: 8,
              }}
            >
              {/* Header del set */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: font.display, fontSize: 12, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Set {idx + 1}
                </Text>
                {idx === 2 && (
                  <Pressable
                    onPress={() => updateSet(idx, 'isSuperTiebreak', !s.isSuperTiebreak)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: s.isSuperTiebreak ? 'rgba(212,175,55,0.14)' : color.surface2,
                      borderRadius: radius.pill,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                    accessibilityRole="checkbox"
                    accessibilityLabel="Super muerte"
                    accessibilityState={{ checked: s.isSuperTiebreak }}
                  >
                    <Text style={{ fontFamily: font.body, fontSize: 10, color: s.isSuperTiebreak ? color.gold : color.muted }}>
                      {s.isSuperTiebreak ? '✓ ' : ''}Super muerte
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Inputs games */}
              {!s.isSuperTiebreak ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ScoreInput
                    value={s.gamesA}
                    onChangeText={(v) => updateSet(idx, 'gamesA', v)}
                    label={pairAName.split('/')[0]?.trim() ?? 'A'}
                    maxLength={2}
                  />
                  <Text style={{ color: color.muted, fontFamily: font.display, fontSize: 18 }}>–</Text>
                  <ScoreInput
                    value={s.gamesB}
                    onChangeText={(v) => updateSet(idx, 'gamesB', v)}
                    label={pairBName.split('/')[0]?.trim() ?? 'B'}
                    maxLength={2}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ScoreInput
                    value={s.tiebreakA}
                    onChangeText={(v) => updateSet(idx, 'tiebreakA', v)}
                    label={pairAName.split('/')[0]?.trim() ?? 'A'}
                    maxLength={3}
                  />
                  <Text style={{ color: color.muted, fontFamily: font.display, fontSize: 18 }}>–</Text>
                  <ScoreInput
                    value={s.tiebreakB}
                    onChangeText={(v) => updateSet(idx, 'tiebreakB', v)}
                    label={pairBName.split('/')[0]?.trim() ?? 'B'}
                    maxLength={3}
                  />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Agregar / quitar set */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          {sets.length < 3 && (
            <Pressable
              onPress={addSet}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: color.line,
                alignItems: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel="Agregar tercer set"
            >
              <Text style={{ fontFamily: font.body, fontSize: 12, color: color.gold, fontWeight: '600' }}>
                + Tercer set
              </Text>
            </Pressable>
          )}
          {sets.length > 2 && (
            <Pressable
              onPress={removeLastSet}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: color.lineSoft,
                alignItems: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel="Quitar tercer set"
            >
              <Text style={{ fontFamily: font.body, fontSize: 12, color: color.muted }}>✕ Quitar</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Error de validación */}
      {validationError && (
        <View
          style={{
            backgroundColor: 'rgba(224,114,111,0.10)',
            borderRadius: radius.sm,
            padding: 12,
            borderWidth: 1,
            borderColor: 'rgba(224,114,111,0.25)',
          }}
        >
          <Text style={{ fontFamily: font.body, fontSize: 12, color: color.danger }}>
            {validationError}
          </Text>
        </View>
      )}

      {/* Botón confirmar */}
      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => ({
          backgroundColor: submitting || pressed ? color.goldDeep : color.gold,
          borderRadius: radius.sm,
          paddingVertical: 14,
          alignItems: 'center',
          opacity: submitting ? 0.7 : 1,
        })}
        accessibilityRole="button"
        accessibilityLabel="Confirmar resultado"
        accessibilityState={{ disabled: submitting }}
      >
        {submitting ? (
          <ActivityIndicator color={color.onGold} />
        ) : (
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 15,
              fontWeight: '600',
              color: color.onGold,
            }}
          >
            Confirmar resultado
          </Text>
        )}
      </Pressable>
    </View>
  );
}

// ───────────────────────────────────────────
// Sub-componente: input de score numérico
// ───────────────────────────────────────────

function ScoreInput({
  value,
  onChangeText,
  label,
  maxLength = 2,
}: {
  value: string;
  onChangeText: (v: string) => void;
  label: string;
  maxLength?: number;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        maxLength={maxLength}
        style={{
          backgroundColor: color.surface2,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.lineSoft,
          color: color.text,
          fontFamily: font.display,
          fontSize: 28,
          fontWeight: '600',
          textAlign: 'center',
          width: '100%',
          paddingVertical: 12,
          minHeight: 56,
        }}
        placeholderTextColor={color.muted}
        placeholder="0"
        accessibilityLabel={`Games de ${label}`}
      />
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 10,
          color: color.muted,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
