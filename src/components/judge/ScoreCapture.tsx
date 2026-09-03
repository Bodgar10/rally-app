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
 * TAMPOCO SE PREGUNTA SI EL TERCER SET FUE SÚPER MUERTE
 *   Por lo mismo: está en los números. Un set normal termina en 6 o en 7; una
 *   súper muerte, en 10 o más con dos de diferencia. Entre 7 y 10 no hay nada,
 *   así que `clasificarSet` (en el motor) decide sin ambigüedad y el formulario
 *   se queda con DOS CASILLAS por set y ningún interruptor.
 *
 *   Cuando el motor lee un set como súper muerte, la pantalla lo dice debajo.
 *   No es una pregunta: es acuse de recibo.
 *
 * EL CONTRATO DE LA SUPER MUERTE en la base no cambia — ver `payloadDeSets`.
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { color, font, radius } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { mensajeDeCaptura } from '@/lib/captura-errores';
import { clasificarSet, estadoDeSet, validateParcial, validateScore, type ScoreConfig } from '@/lib/engine/score';
// La conversión formulario -> payload vive fuera para poder probarla: el fallo
// del set vacío que llegaba como 0-0 era de conversión, no de pantalla.
import { aMotor, capturado, payloadDeSets } from '@/lib/captura-sets';
import type { SetScore as SetDelMotor } from '@/lib/engine/types';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

/**
 * Un set en el formulario: DOS NÚMEROS. No hay más.
 *
 * Ya no se guarda `isSuperTiebreak`: el formato lo deduce `clasificarSet` a
 * partir de los propios números, porque un set normal no pasa de 7 y una súper
 * muerte no baja de 10. El interruptor pedía un dato que estaba escrito en el
 * marcador, y que se podía contestar mal.
 */
interface SetScore {
  a: string;
  b: string;
}

const emptySet = (): SetScore => ({ a: '', b: '' });

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
  /**
   * Cómo juega ESTE torneo el set decisivo. OBLIGATORIA.
   *
   * Sin ella la pantalla validaría con una regla que puede no ser la del
   * torneo: un 7-5 en el tercero cierra un set completo y no cierra una súper
   * muerte, y el juez vería un error donde no lo hay o al revés. Es un dato,
   * no un default — sale de `tournaments.tercer_set_formato` vía
   * `scoreConfigDelTorneo`, que revienta si no llega.
   */
  scoreConfig: ScoreConfig;
  /** Callback cuando el resultado fue aceptado exitosamente. */
  onSuccess: () => void;
}

/**
 * `match_sets` (snake, números) -> estado del formulario (strings).
 *
 * De un super muerte guardado se sacan los PUNTOS, no los games: en la base ese
 * set lleva 1-0 en games y el marcador real en tiebreak_a/b. Al reabrirlo para
 * corregir tiene que verse "10-8", que es lo que el juez escribió.
 */
function aFormulario(guardados: SetGuardado[]): SetScore[] {
  return [...guardados]
    .sort((x, y) => x.set_number - y.set_number)
    .map((g) => (g.is_super_tiebreak
      ? { a: String(g.tiebreak_a ?? ''), b: String(g.tiebreak_b ?? '') }
      : { a: String(g.games_a), b: String(g.games_b) }));
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
  scoreConfig,
  onSuccess,
}: ScoreCaptureProps) {
  const corrigiendo = !!setsIniciales && setsIniciales.length > 0;
  const [sets, setSets] = useState<SetScore[]>(() =>
    corrigiendo ? aFormulario(setsIniciales!) : [emptySet(), emptySet()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  /** Acuse de recibo del último set guardado. Se borra al seguir tecleando. */
  const [guardado, setGuardado] = useState<string | null>(null);

  /**
   * EL VEREDICTO, recalculado en cada tecla.
   *
   * `sets.filter(capturado)` y no `sets`: mientras el juez teclea el primer
   * número, el set está a medias y el motor lo llamaría inválido. Un formulario
   * que grita antes de que termines de escribir no se lee, se ignora.
   */
  const veredicto = useMemo(() => {
    const completos = aMotor(sets);
    if (completos.length === 0) return null;
    return validateScore(completos, scoreConfig);
  }, [sets, scoreConfig]);

  /**
   * EL VEREDICTO DE LO CAPTURADO HASTA AHORA.
   *
   * Misma validación set a set, sin exigir que el partido esté decidido. Es lo
   * que permite guardar el primer set en cuanto termina, que es de lo que va
   * todo esto: sin captura incremental, durante 75 minutos nadie sabe nada de
   * esa cancha — ni el que espera para entrar, ni el que ya jugó y quiere
   * saber si clasificó.
   */
  const parcial = useMemo(() => {
    const completos = aMotor(sets);
    if (completos.length === 0) return null;
    return validateParcial(completos, scoreConfig);
  }, [sets, scoreConfig]);

  const ganadorId = veredicto?.winnerSide
    ? (veredicto.winnerSide === 'A' ? pairAId : pairBId)
    : null;
  const ganadorNombre = veredicto?.winnerSide
    ? (veredicto.winnerSide === 'A' ? pairAName : pairBName)
    : null;

  /** ¿El marcador ya cierra el partido? */
  const cierra = !!ganadorId;
  /**
   * SE PUEDE GUARDAR con lo que haya, mientras lo que haya sea legal.
   *
   * DOS TOQUES, y es una restricción de diseño, no un adorno: el juez teclea
   * los dos números del set que acaba de terminar y pulsa una vez. Si costara
   * un modal, una confirmación o una pantalla más, no lo haría entre punto y
   * punto y no habría nada de esto.
   */
  const listo = !submitting && (parcial?.valid ?? false) && aMotor(sets).length > 0;

  /**
   * QUÉ VALIDACIÓN SE ENSEÑA MIENTRAS SE CAPTURA.
   *
   *   La de CERRAR el partido (`veredicto`) responde "¿esto es un partido
   *   terminado?", y a un partido que se está jugando le contesta que no —con
   *   razón, y sin que eso sea un fallo de nadie. Pintar esa respuesta en rojo
   *   mientras el juez anota el set en curso dice que algo se rompió cuando no
   *   se ha roto nada: el set 3 en 2-1 salía con borde de error y el texto
   *   "no se puede empezar el siguiente set con este abierto" — un mensaje
   *   sobre un set siguiente que no existe— y justo debajo, en verde, "Set 2
   *   guardado. El partido sigue en juego". Las dos cosas del mismo envío.
   *
   *   Así que los errores en pantalla salen de `parcial`, que es la pregunta
   *   que el juez está haciendo de verdad: "¿es legal lo que llevo?". El
   *   veredicto de cierre solo se usa para saber a quién dar por ganador.
   *
   *   Sigue habiendo rojo cuando toca: un 8-3, o un set abierto que NO es el
   *   último, siguen siendo errores del juez y `validateParcial` los reporta.
   */
  const aEnsenar = parcial;

  /**
   * El error de un SET concreto, para ponerlo en su fila.
   *
   * Los mensajes del motor empiezan por "Set N…", así que se reparten por
   * número. Lo que no case con un set (sets de más) queda para el pie, que es
   * donde se lee el estado global.
   */
  const errorPorSet = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of aEnsenar?.errors ?? []) {
      const n = /^Set (\d+)/.exec(e) ?? /^Super muerte del set (\d+)/.exec(e);
      if (n) m.set(Number(n[1]) - 1, e);
    }
    return m;
  }, [aEnsenar]);

  /**
   * En qué punto está cada set, deducido de sus números.
   *
   * El juez no declara nada: teclea 3-1 y la fila dice "en curso"; teclea 6-2
   * y dice "cerrado". Es acuse de recibo, no una pregunta — igual que la nota
   * de súper muerte de aquí abajo.
   */
  const estadoFila = (idx: number): 'terminado' | 'en_curso' | null => {
    const st = sets[idx];
    if (!st || !capturado(st)) return null;
    return estadoDeSet(
      parseInt(st.a, 10), parseInt(st.b, 10), scoreConfig,
      idx === scoreConfig.bestOf - 1,
    );
  };

  /** ¿Este set se está leyendo como súper muerte? Solo para decirlo en pantalla. */
  const esSuperMuerte = (idx: number): boolean => {
    const st = sets[idx];
    if (!st || !capturado(st)) return false;
    return clasificarSet(parseInt(st.a, 10), parseInt(st.b, 10), scoreConfig) === 'super';
  };

  /** Lo que no es de un set concreto. Vacío si el marcador está bien. */
  const errorGeneral = useMemo(() => {
    const sueltos = (aEnsenar?.errors ?? []).filter(
      (e) => !/^Set \d+/.test(e) && !/^Super muerte del set \d+/.test(e),
    );
    return sueltos.length ? sueltos.join(' · ') : null;
  }, [aEnsenar]);

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
    setGuardado(null);
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
    // El botón está apagado si lo capturado no es legal; esto es la red por si
    // el marcador cambia entre el toque y el envío.
    if (!listo) return;

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
            // El servidor decide igual: si el marcador ya cierra, cierra. Esto
            // solo le dice que un marcador a medias no es un error.
            parcial: !cierra,
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

      // Con el partido cerrado se sale, como siempre. Con un set suelto la
      // hoja SE QUEDA ABIERTA: el juez va a anotar el siguiente en un rato y
      // hacerle volver a buscar el partido es el toque de más que mata la
      // función.
      if (cierra) onSuccess();
      else setGuardado(`Set ${(parcial?.setsA ?? 0) + (parcial?.setsB ?? 0)} guardado. El partido sigue en juego.`);
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
      {/* Las medidas fijas son LAS MISMAS que las de la fila de sets (26 del
          número, 24 del guion, gap 10) y en el mismo orden, para que cada
          nombre caiga exactamente sobre su casilla. Antes sobraba un hueco de
          26 al final que desplazaba las dos columnas media casilla. */}
      <View style={estilos.fila}>
        <View style={estilos.huecoNumero} />
        <Text style={estilos.nombreColumna} numberOfLines={2} ellipsizeMode="tail">{pairAName}</Text>
        <View style={estilos.huecoGuion} />
        <Text style={estilos.nombreColumna} numberOfLines={2} ellipsizeMode="tail">{pairBName}</Text>
      </View>

      {/* Una fila por set */}
      <View style={{ gap: 10 }}>
        {sets.map((st, idx) => {
          const malo = errorPorSet.get(idx);
          return (
            <View key={idx} style={{ gap: 5 }}>
              <View style={estilos.fila}>
                <Text style={estilos.numeroSet}>{idx + 1}</Text>

                <ScoreInput
                  value={st.a}
                  onChangeText={(v) => updateSet(idx, 'a', v)}
                  malo={!!malo}
                  accessibilityLabel={`Set ${idx + 1}, marcador de ${pairAName}`}
                />
                <Text style={estilos.guion}>–</Text>
                <ScoreInput
                  value={st.b}
                  onChangeText={(v) => updateSet(idx, 'b', v)}
                  malo={!!malo}
                  accessibilityLabel={`Set ${idx + 1}, marcador de ${pairBName}`}
                />
              </View>

              {/* Sin interruptor de súper muerte: si el tercer set se capturó
                  10-8, el motor ya sabe que eso es una súper muerte. Se avisa
                  cuando pasa, para que el juez vea que se entendió. */}
              {!malo && esSuperMuerte(idx) && (
                <Text style={estilos.notaSet}>Súper muerte</Text>
              )}
              {!malo && !esSuperMuerte(idx) && estadoFila(idx) === 'en_curso' && (
                <Text style={estilos.notaSetEnCurso}>● En curso</Text>
              )}
              {!malo && !esSuperMuerte(idx) && estadoFila(idx) === 'terminado' && (
                <Text style={estilos.notaSet}>✓ Set cerrado</Text>
              )}
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

      {guardado && !errorServidor && (
        <View style={estilos.guardadoCaja} accessibilityLiveRegion="polite">
          <Text style={estilos.guardadoTexto}>✓ {guardado}</Text>
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
        accessibilityLabel={cierra ? 'Guardar el resultado y cerrar el partido' : 'Guardar el set capturado'}
        accessibilityState={{ disabled: !listo }}
      >
        {submitting ? (
          <ActivityIndicator color={color.onGold} />
        ) : (
          <Text style={[estilos.botonPrincipalTexto, !listo && estilos.botonPrincipalTextoOff]}>
            {cierra
              ? (corrigiendo ? 'Guardar corrección' : 'Guardar y cerrar el partido')
              : 'Guardar set · el partido sigue'}
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
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  malo: boolean;
  accessibilityLabel: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="number-pad"
      // Dos cifras no bastan desde que la misma casilla acepta súper muertes:
      // un 12-10 necesita tres. Antes el límite dependía del interruptor.
      maxLength={3}
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

/**
 * POR QUÉ HAY `minWidth: 0` EN TODO LO QUE LLEVA `flex: 1`
 *
 * En el navegador un hijo de una fila flex nace con `min-width: auto`, que NO
 * es cero: para un `<input>` es su ancho intrínseco (~170px por el `size` por
 * defecto) y para un texto, el de su palabra más larga. Los dos números del set
 * se negaban a bajar de ahí, la fila sumaba más que la hoja y la columna
 * derecha se salía por el borde. En React Native nativo esa regla no existe,
 * así que el corte solo aparecía en Safari del móvil — que es justo donde
 * captura el juez.
 *
 * `minWidth: 0` es la clave que devuelve el reparto a partes iguales. Un solo
 * layout para iOS, Android y web: en nativo la clave es inerte.
 */
const ANCHO_NUMERO = 26; // la columna del "1" / "2" de cada set
const ANCHO_GUION = 24;  // el "–" entre las dos casillas
const HUECO = 10;        // el gap de la fila

const estilos = {
  /** La rejilla de la hoja: mismas medidas en la cabecera y en cada set. */
  fila: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: HUECO },
  huecoNumero: { width: ANCHO_NUMERO, flexShrink: 0 },
  huecoGuion: { width: ANCHO_GUION, flexShrink: 0 },

  nombreColumna: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.body as string,
    fontSize: 11,
    color: color.champagne,
    textAlign: 'center' as const,
  },

  numeroSet: {
    width: ANCHO_NUMERO,
    flexShrink: 0,
    fontFamily: font.display as string,
    fontSize: 12,
    color: color.muted,
    textAlign: 'center' as const,
  },

  casilla: {
    flex: 1,
    minWidth: 0,
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
    paddingHorizontal: 4,
    minHeight: 52,
  },
  casillaMala: { borderColor: color.danger },

  guion: {
    width: ANCHO_GUION,
    flexShrink: 0,
    textAlign: 'center' as const,
    color: color.muted,
    fontFamily: font.display as string,
    fontSize: 16,
  },

  notaSet: {
    marginLeft: ANCHO_NUMERO + HUECO,
    fontFamily: font.body as string,
    fontSize: 11,
    color: color.champagne,
  },

  // Verde: es el mismo token con el que toda la app dice "en vivo".
  notaSetEnCurso: {
    marginLeft: ANCHO_NUMERO + HUECO,
    fontFamily: font.body as string,
    fontSize: 11,
    color: color.live,
  },

  errorSet: {
    marginLeft: ANCHO_NUMERO + HUECO,
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

  // Acuse de recibo del set guardado. Verde de "positivo" (Doc D §2.2): el
  // juez tiene que ver que su toque llegó sin quedarse mirando la pantalla.
  guardadoCaja: {
    backgroundColor: 'rgba(66,214,164,0.10)',
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(66,214,164,0.35)',
  },
  guardadoTexto: { fontFamily: font.body as string, fontSize: 14, lineHeight: 20, color: color.live },

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
