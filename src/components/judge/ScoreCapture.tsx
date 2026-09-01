/**
 * src/components/judge/ScoreCapture.tsx
 *
 * RALLY · Captura de marcador por el juez.
 *
 * EL GANADOR SE DERIVA, NO SE PREGUNTA
 *   Antes lo primero que pedía la pantalla era elegir al ganador, y debajo el
 *   marcador. Con 6-2 3-6 7-5 el sistema ya sabe quién ganó: preguntarlo es
 *   pedir un dato que se puede deducir, y además se podía contestar mal — el
 *   servidor comparaba las dos cosas y devolvía `winner_mismatch`, o sea que
 *   el juez recibía un error por contradecir un marcador que él mismo acababa
 *   de teclear.
 *
 *   Ahora el ganador aparece SOLO, debajo de los sets, como consecuencia. Se
 *   sigue mandando `winner_pair_id` porque el contrato de `match-result` lo
 *   exige y lo contrasta; simplemente ya no puede no coincidir, porque sale
 *   del mismo `validateScore` que corre el servidor.
 *
 *   Se usa el MOTOR, no una regla escrita aquí: `validateScore` de
 *   `@/lib/engine/score` es la misma función, con la misma configuración, que
 *   el servidor ejecuta para decidir. Reimplementarla en el cliente sería
 *   inventar una segunda verdad que se despegaría a la primera excepción
 *   (super muerte, 7-6, un set de más).
 *
 * LO QUE SE FUE
 *   El selector de ganador (dos botones grandes con un trofeo dentro), el
 *   texto que explicaba que el servidor lo comprobaba, y la sección "Marcador"
 *   con una tarjeta por set de 12px de padding. Ocupaban una pantalla entera
 *   para pedir cuatro números.
 *
 * LO QUE HAY AHORA
 *   Una fila por set: número, dos casillas, y a la derecha el aviso de que ese
 *   set está mal si lo está. Debajo, la línea de resultado. Y el error, que
 *   era el texto más chico de la pantalla y ahora es un bloque que se lee.
 *
 * EL CONTRATO DE LA SUPER MUERTE no cambia — ver `payloadDeSets`.
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { color, font, radius } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { mensajeDeCaptura } from '@/lib/captura-errores';
import { validateScore } from '@/lib/engine/score';
import type { SetScore as SetDelMotor } from '@/lib/engine/types';

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

/** Set ya guardado, tal como viene de `match_sets`. */
export interface SetGuardado {
  set_number: number;
  games_a: number;
  games_b: number;
  is_super_tiebreak: boolean;
  tiebreak_a: number | null;
  tiebreak_b: number | null;
}

export interface ScoreCaptureProps {
  matchId: string;
  pairAId: string;
  pairBId: string;
  pairAName: string; // "Jugador1 / Jugador2"
  pairBName: string;
  /**
   * Marcador ya capturado, para CORREGIRLO. La RPC regraba sets y standings,
   * así que reabrir un partido y volver a enviarlo es una corrección legítima.
   */
  setsIniciales?: SetGuardado[];
  /**
   * Ganador ya guardado. Se conserva en la interfaz por compatibilidad con
   * quien monta el componente, pero YA NO SE USA para precargar nada: el
   * ganador sale del marcador. Si se cargan unos sets, sale el mismo.
   */
  ganadorInicial?: string | null;
  /** Callback cuando el resultado fue aceptado exitosamente. */
  onSuccess: () => void;
}

/** `match_sets` (snake, números) -> estado del formulario (strings). */
function aFormulario(guardados: SetGuardado[]): SetScore[] {
  return [...guardados]
    .sort((a, b) => a.set_number - b.set_number)
    .map((g) => ({
      // En un super muerte los games son el marcador 1-0 y no se muestran:
      // el formulario pide PUNTOS. Ver el contrato en payloadDeSets.
      gamesA: g.is_super_tiebreak ? '' : String(g.games_a),
      gamesB: g.is_super_tiebreak ? '' : String(g.games_b),
      isSuperTiebreak: g.is_super_tiebreak,
      tiebreakA: g.tiebreak_a != null ? String(g.tiebreak_a) : '',
      tiebreakB: g.tiebreak_b != null ? String(g.tiebreak_b) : '',
    }));
}

/**
 * Estado del formulario -> payload de `match-result` (snake, números).
 *
 * FORMATO DE LA SUPER MUERTE — el contrato con el engine:
 *   Los PUNTOS van en tiebreak_a/tiebreak_b. `games_a/games_b` llevan el
 *   marcador 1-0 del lado que ganó, nunca los puntos.
 *
 *   `computeStandings` con superTiebreakGames:'one' (el default) ignora
 *   games_a/b en un super muerte y deriva 1-0 de los tiebreaks, y
 *   `superSetWinner` lee `tiebreakA ?? gamesA`. Mandar los puntos en games
 *   inflaría la diferencia de games que desempata la tabla.
 *
 *   Los tests del engine (score.test.ts, 'contrato de super muerte') fijan
 *   este formato.
 */
function payloadDeSets(sets: SetScore[]) {
  return sets.map((s, i) => {
    if (s.isSuperTiebreak) {
      const tA = parseInt(s.tiebreakA, 10);
      const tB = parseInt(s.tiebreakB, 10);
      const validos = !isNaN(tA) && !isNaN(tB);
      return {
        set_number: i + 1,
        games_a: validos && tA > tB ? 1 : 0,
        games_b: validos && tB > tA ? 1 : 0,
        is_super_tiebreak: true,
        tiebreak_a: isNaN(tA) ? null : tA,
        tiebreak_b: isNaN(tB) ? null : tB,
      };
    }
    return {
      set_number: i + 1,
      games_a: parseInt(s.gamesA, 10),
      games_b: parseInt(s.gamesB, 10),
      is_super_tiebreak: false,
      tiebreak_a: null,
      tiebreak_b: null,
    };
  });
}

/** ¿Están los dos números de este set? Vacío ≠ inválido: es "todavía no". */
function completo(s: SetScore): boolean {
  const a = s.isSuperTiebreak ? s.tiebreakA : s.gamesA;
  const b = s.isSuperTiebreak ? s.tiebreakB : s.gamesB;
  return a.trim() !== '' && b.trim() !== '';
}

/** Estado del formulario -> entrada del motor, solo con los sets completos. */
function aMotor(sets: SetScore[]): SetDelMotor[] {
  return sets.filter(completo).map((s) => {
    if (s.isSuperTiebreak) {
      const tA = parseInt(s.tiebreakA, 10);
      const tB = parseInt(s.tiebreakB, 10);
      return {
        gamesA: tA > tB ? 1 : 0,
        gamesB: tB > tA ? 1 : 0,
        isSuperTiebreak: true,
        tiebreakA: tA,
        tiebreakB: tB,
      };
    }
    return {
      gamesA: parseInt(s.gamesA, 10),
      gamesB: parseInt(s.gamesB, 10),
      isSuperTiebreak: false,
    };
  });
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
  setsIniciales,
  onSuccess,
}: ScoreCaptureProps) {
  const corrigiendo = !!setsIniciales && setsIniciales.length > 0;
  const [sets, setSets] = useState<SetScore[]>(() =>
    corrigiendo ? aFormulario(setsIniciales!) : [emptySet(), emptySet()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  /**
   * EL VEREDICTO, recalculado en cada tecla.
   *
   * `sets.filter(completo)` y no `sets`: mientras el juez teclea el primer
   * número, el set está a medias y el motor lo llamaría inválido. Un formulario
   * que grita antes de que termines de escribir no se lee, se ignora.
   */
  const veredicto = useMemo(() => {
    const completos = aMotor(sets);
    if (completos.length === 0) return null;
    return validateScore(completos);
  }, [sets]);

  const ganadorId = veredicto?.winnerSide
    ? (veredicto.winnerSide === 'A' ? pairAId : pairBId)
    : null;
  const ganadorNombre = veredicto?.winnerSide
    ? (veredicto.winnerSide === 'A' ? pairAName : pairBName)
    : null;

  const listo = !!ganadorId && !submitting;

  /**
   * El error de un SET concreto, para ponerlo en su fila.
   *
   * Los mensajes del motor empiezan por "Set N…", así que se reparten por
   * número. Lo que no case con un set (partido incompleto, sets de más) queda
   * para el pie, que es donde se lee el estado global.
   */
  const errorPorSet = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of veredicto?.errors ?? []) {
      const n = /^Set (\d+)/.exec(e) ?? /^Super muerte del set (\d+)/.exec(e);
      if (n) m.set(Number(n[1]) - 1, e);
    }
    return m;
  }, [veredicto]);

  /** Lo que no es de un set concreto. Vacío si el marcador está bien. */
  const errorGeneral = useMemo(() => {
    const sueltos = (veredicto?.errors ?? []).filter(
      (e) => !/^Set \d+/.test(e) && !/^Super muerte del set \d+/.test(e),
    );
    return sueltos.length ? sueltos.join(' · ') : null;
  }, [veredicto]);

  // ───────────────────────────────────────────
  // Manipulación de sets
  // ───────────────────────────────────────────

  function updateSet(idx: number, field: keyof SetScore, value: string | boolean) {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    setErrorServidor(null);
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
    // El botón está apagado sin ganador, así que esto es la red por si el
    // marcador cambia entre el toque y el envío.
    if (!ganadorId) return;

    setErrorServidor(null);
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión activa.');

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
            winner_pair_id: ganadorId,
            sets: payloadDeSets(sets),
          }),
        }
      );

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        // La clave de la Edge Function se traduce y el `detail` del engine se
        // conserva: es lo que le dice al juez QUÉ set está mal.
        setErrorServidor(mensajeDeCaptura(json));
        return;
      }

      onSuccess();
    } catch (e) {
      console.error('[ScoreCapture] submit error:', e);
      setErrorServidor('Error de conexión. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // ───────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────

  return (
    <View style={{ gap: 14 }}>
      {/* Cabecera: quién juega. Los nombres van ARRIBA y una sola vez, en el
          mismo orden que las columnas de abajo. Antes se repetían debajo de
          cada casilla de cada set, recortados al primer jugador. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ width: 26 }} />
        <Text style={estilos.nombreColumna} numberOfLines={2}>{pairAName}</Text>
        <View style={{ width: 14 }} />
        <Text style={estilos.nombreColumna} numberOfLines={2}>{pairBName}</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Una fila por set */}
      <View style={{ gap: 8 }}>
        {sets.map((s, idx) => {
          const malo = errorPorSet.get(idx);
          return (
            <View key={idx} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={estilos.numeroSet}>{idx + 1}</Text>

                <ScoreInput
                  value={s.isSuperTiebreak ? s.tiebreakA : s.gamesA}
                  onChangeText={(v) => updateSet(idx, s.isSuperTiebreak ? 'tiebreakA' : 'gamesA', v)}
                  malo={!!malo}
                  maxLength={s.isSuperTiebreak ? 3 : 2}
                  accessibilityLabel={`Set ${idx + 1}, ${s.isSuperTiebreak ? 'puntos' : 'games'} de ${pairAName}`}
                />
                <Text style={estilos.guion}>–</Text>
                <ScoreInput
                  value={s.isSuperTiebreak ? s.tiebreakB : s.gamesB}
                  onChangeText={(v) => updateSet(idx, s.isSuperTiebreak ? 'tiebreakB' : 'gamesB', v)}
                  malo={!!malo}
                  maxLength={s.isSuperTiebreak ? 3 : 2}
                  accessibilityLabel={`Set ${idx + 1}, ${s.isSuperTiebreak ? 'puntos' : 'games'} de ${pairBName}`}
                />

                {/* La super muerte solo cabe en el tercer set y solo se ofrece
                    ahí: en el primero no es una opción, es un error. */}
                {idx === 2 ? (
                  <Pressable
                    onPress={() => updateSet(idx, 'isSuperTiebreak', !s.isSuperTiebreak)}
                    style={[estilos.chipSuper, s.isSuperTiebreak && estilos.chipSuperOn]}
                    accessibilityRole="checkbox"
                    accessibilityLabel="El tercer set fue super muerte"
                    accessibilityState={{ checked: s.isSuperTiebreak }}
                  >
                    <Text style={[estilos.chipSuperTexto, s.isSuperTiebreak && estilos.chipSuperTextoOn]}>
                      {s.isSuperTiebreak ? '✓ SM' : 'SM'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ width: 34 }} />
                )}
              </View>

              {malo && <Text style={estilos.errorSet}>{malo}</Text>}
            </View>
          );
        })}
      </View>

      {/* Agregar / quitar tercer set */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {sets.length < 3 && (
          <Pressable
            onPress={addSet}
            style={estilos.botonSecundario}
            accessibilityRole="button"
            accessibilityLabel="Agregar tercer set"
          >
            <Text style={estilos.botonSecundarioTexto}>+ Tercer set</Text>
          </Pressable>
        )}
        {sets.length > 2 && (
          <Pressable
            onPress={removeLastSet}
            style={estilos.botonSecundario}
            accessibilityRole="button"
            accessibilityLabel="Quitar tercer set"
          >
            <Text style={estilos.botonSecundarioTextoApagado}>✕ Quitar tercer set</Text>
          </Pressable>
        )}
      </View>

      {/* ── EL GANADOR, COMO CONSECUENCIA ──────────────────────────
          Ocupa el sitio donde antes estaba la pregunta. Mientras no haya un
          marcador que decida, dice qué falta — nunca se queda mudo, porque un
          hueco en blanco donde debería salir un nombre parece un fallo. */}
      <View
        style={[
          estilos.veredicto,
          ganadorNombre ? estilos.veredictoOk : errorGeneral ? estilos.veredictoMal : null,
        ]}
        accessibilityLiveRegion="polite"
      >
        {ganadorNombre ? (
          <>
            <Text style={estilos.veredictoEtiqueta}>GANA</Text>
            <Text style={estilos.veredictoNombre} numberOfLines={2}>{ganadorNombre}</Text>
            <Text style={estilos.veredictoDetalle}>
              {veredicto!.setsA}–{veredicto!.setsB} en sets
            </Text>
          </>
        ) : (
          <Text style={estilos.veredictoPendiente}>
            {errorGeneral ?? 'Captura el marcador y aquí sale quién ganó.'}
          </Text>
        )}
      </View>

      {/* Error del servidor. Grande, en su bloque: era la letra más chica de la
          pantalla y es lo único que el juez necesita leer cuando algo falla. */}
      {errorServidor && (
        <View style={estilos.errorCaja}>
          <Text style={estilos.errorTexto}>{errorServidor}</Text>
        </View>
      )}

      {/* Confirmar */}
      <Pressable
        onPress={handleSubmit}
        disabled={!listo}
        style={({ pressed }) => [
          estilos.botonPrincipal,
          !listo && estilos.botonPrincipalOff,
          pressed && listo && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={corrigiendo ? 'Guardar corrección' : 'Confirmar resultado'}
        accessibilityState={{ disabled: !listo }}
      >
        {submitting ? (
          <ActivityIndicator color={color.onGold} />
        ) : (
          <Text style={[estilos.botonPrincipalTexto, !listo && estilos.botonPrincipalTextoOff]}>
            {corrigiendo ? 'Guardar corrección' : 'Confirmar resultado'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

// ───────────────────────────────────────────
// Sub-componente: casilla de números
// ───────────────────────────────────────────

function ScoreInput({
  value,
  onChangeText,
  malo,
  maxLength,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  malo: boolean;
  maxLength: number;
  accessibilityLabel: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="number-pad"
      maxLength={maxLength}
      style={[estilos.casilla, malo && estilos.casillaMala]}
      placeholderTextColor={color.muted}
      placeholder="–"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

// ───────────────────────────────────────────
// Estilos
// ───────────────────────────────────────────

const estilos = {
  nombreColumna: {
    flex: 1,
    fontFamily: font.body as string,
    fontSize: 11,
    color: color.champagne,
    textAlign: 'center' as const,
  },

  numeroSet: {
    width: 26,
    fontFamily: font.display as string,
    fontSize: 12,
    color: color.muted,
    textAlign: 'center' as const,
  },

  casilla: {
    flex: 1,
    backgroundColor: color.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.lineSoft,
    color: color.text,
    fontFamily: font.display as string,
    fontSize: 24,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
    paddingVertical: 10,
    minHeight: 52,
  },
  casillaMala: { borderColor: color.danger },

  guion: { width: 14, textAlign: 'center' as const, color: color.muted, fontFamily: font.display as string, fontSize: 16 },

  chipSuper: {
    width: 34, minHeight: 34, alignItems: 'center' as const, justifyContent: 'center' as const,
    borderRadius: radius.pill, backgroundColor: color.surface2,
  },
  chipSuperOn: { backgroundColor: 'rgba(212,175,55,0.16)' },
  chipSuperTexto: { fontFamily: font.body as string, fontSize: 10, color: color.muted },
  chipSuperTextoOn: { color: color.gold, fontWeight: '600' as const },

  errorSet: {
    marginLeft: 36,
    fontFamily: font.body as string,
    fontSize: 11,
    color: color.danger,
  },

  botonSecundario: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: radius.sm, borderWidth: 1, borderColor: color.lineSoft,
  },
  botonSecundarioTexto: { fontFamily: font.body as string, fontSize: 12, color: color.gold, fontWeight: '600' as const },
  botonSecundarioTextoApagado: { fontFamily: font.body as string, fontSize: 12, color: color.muted },

  veredicto: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.lineSoft,
    backgroundColor: color.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center' as const,
    gap: 2,
  },
  veredictoOk: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.10)' },
  veredictoMal: { borderColor: 'rgba(224,114,111,0.35)' },

  veredictoEtiqueta: {
    fontFamily: font.display as string, fontSize: 9, color: color.champagne,
    letterSpacing: 1.4, textTransform: 'uppercase' as const,
  },
  veredictoNombre: {
    fontFamily: font.display as string, fontSize: 16, fontWeight: '600' as const,
    color: color.goldBright, textAlign: 'center' as const,
  },
  veredictoDetalle: { fontFamily: font.body as string, fontSize: 11, color: color.muted },
  veredictoPendiente: { fontFamily: font.body as string, fontSize: 12, color: color.muted, textAlign: 'center' as const },

  errorCaja: {
    backgroundColor: 'rgba(224,114,111,0.10)',
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(224,114,111,0.35)',
  },
  errorTexto: { fontFamily: font.body as string, fontSize: 14, lineHeight: 20, color: color.danger },

  botonPrincipal: {
    backgroundColor: color.gold,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center' as const,
  },
  botonPrincipalOff: { backgroundColor: color.surface2 },
  botonPrincipalTexto: { fontFamily: font.body as string, fontSize: 15, fontWeight: '600' as const, color: color.onGold },
  botonPrincipalTextoOff: { color: color.muted },
};
