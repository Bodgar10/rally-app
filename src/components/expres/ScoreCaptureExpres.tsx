/**
 * src/components/expres/ScoreCaptureExpres.tsx
 *
 * RALLY · Captura de un partido de SUMA 6.
 *
 * DOS CASILLAS, COMO EN LA CAPTURA LARGA
 *   Antes eran siete botones, uno por marcador posible —6-0, 5-1, 4-2, 3-3 y
 *   sus espejos—, con el argumento de que un marcador imposible que no se
 *   puede ni escribir no hay que validarlo después.
 *
 *   El argumento era bueno y la pantalla era peor. Quien captura viene de
 *   anotar marcadores en papel y de la captura larga, donde escribe los
 *   números; una rejilla de botones le obliga a BUSCAR su resultado entre
 *   siete opciones en vez de teclearlo, que es más lento y se siente raro. Y
 *   el juez de un torneo hace esto cuarenta veces en una tarde.
 *
 *   Así que se escriben. Lo que se gana en velocidad se paga en validación, y
 *   se paga bien: `validarMarcadorSuma6` ya existía en el motor y el error se
 *   dice en el momento, sin esperar a Guardar.
 *
 * ► LA CASILLA VACÍA SE COMPLETA SOLA, PERO NO SE IMPONE
 *   En cuanto hay un número en un lado, el otro se rellena con lo que falta
 *   para seis. Es lo que hace el juez de cabeza de todas formas —si uno hizo
 *   4, el otro hizo 2— y le ahorra la mitad de las pulsaciones. Puede
 *   sobrescribirlo: si se equivocó de casilla, corrige la que quiera y la
 *   otra se ajusta.
 *
 * NO HAY SELECTOR DE GANADOR, Y NO PORQUE SE DERIVE
 *   En la captura larga el ganador se dejó de preguntar porque el marcador ya
 *   lo decía. Aquí no se pregunta porque NO EXISTE: un suma 6 no tiene
 *   ganador. Se suman los games a favor y se restan los del rival. Por eso
 *   cada botón enseña debajo lo que le hace a la tabla — "+6", "0", "−2" —,
 *   que es el dato que de verdad cuenta.
 *
 * LOS DOS NOMBRES VAN ARRIBA, COMO CABECERA DE COLUMNA
 *   El único error de captura que este formato permite es invertir el
 *   marcador. Con "6-0" a secas no hay forma de saber de quién es el 6, así
 *   que los nombres van encima, alineados con los dos números, y el botón
 *   elegido repite el resultado en palabras debajo.
 *
 * LA VALIDACIÓN ES LA DEL MOTOR
 *   `prepararCapturaExpres` es la misma función que corre el servidor. No se
 *   reimplementa nada aquí: si esta pantalla y la Edge Function calcularan la
 *   tabla por separado, se despegarían a la primera corrección.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import {
  GAMES_POR_PARTIDO, prepararCapturaExpres, validarMarcadorSuma6, type ResultadoSuma6,
} from '@/lib/engine/expres';
import { textoDeBalance } from '@/lib/expres-texto';

export interface ScoreCaptureExpresProps {
  /** Parejas del grupo, para poder recalcular la tabla entera. */
  pairIds: readonly string[];
  /** Todos los partidos del grupo, como están ahora. */
  resultados: readonly ResultadoSuma6[];
  /** El partido que se captura. */
  matchId: string;
  nombreA: string;
  nombreB: string;
  /** Marcador ya guardado, si es una corrección. */
  guardado?: { gamesA: number; gamesB: number } | null;
  /**
   * Persistir. Recibe el marcador y lo que hay que escribir, ya calculado por
   * el motor. Si lanza, el mensaje se enseña tal cual.
   */
  onGuardar: (payload: ReturnType<typeof prepararCapturaExpres>) => Promise<void>;
  onCancelar?: () => void;
}

export default function ScoreCaptureExpres({
  pairIds,
  resultados,
  matchId,
  nombreA,
  nombreB,
  guardado = null,
  onGuardar,
  onCancelar,
}: ScoreCaptureExpresProps) {
  const [textoA, setTextoA] = useState(guardado ? String(guardado.gamesA) : '');
  const [textoB, setTextoB] = useState(guardado ? String(guardado.gamesB) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Escribir en una casilla completa la otra hasta seis.
   *
   * Solo con un número válido y solo si cabe: con un 9 no se autocompleta un
   * −3, se deja la otra como esté y la validación dice lo que pasa.
   */
  function escribir(lado: 'a' | 'b', crudo: string) {
    const limpio = crudo.replace(/[^0-9]/g, '').slice(0, 1);
    const n = limpio === '' ? null : Number(limpio);
    const complemento = n !== null && n >= 0 && n <= GAMES_POR_PARTIDO
      ? String(GAMES_POR_PARTIDO - n)
      : null;

    if (lado === 'a') {
      setTextoA(limpio);
      if (complemento !== null) setTextoB(complemento);
    } else {
      setTextoB(limpio);
      if (complemento !== null) setTextoA(complemento);
    }
    setError(null);
  }

  const numA = textoA === '' ? null : Number(textoA);
  const numB = textoB === '' ? null : Number(textoB);
  const completo = numA !== null && numB !== null;

  /**
   * Lo que está mal escrito.
   *
   * El mensaje sale del MOTOR y no se redacta aquí: `validarMarcadorSuma6` es
   * la misma función que corre el servidor, y ya explica el error enumerando
   * los siete marcadores posibles. Escribir una versión propia en la pantalla
   * es cómo se acaba con dos textos distintos para el mismo fallo según por
   * dónde entre el dato.
   */
  const errorDeFormato = completo ? (validarMarcadorSuma6(numA, numB)[0] ?? null) : null;

  const marcador = completo && !errorDeFormato ? { gamesA: numA, gamesB: numB } : null;

  /**
   * Se prepara en cuanto hay marcador elegido, no al pulsar Guardar: si el
   * motor va a rechazarlo, mejor saberlo antes de bloquear la pantalla.
   */
  const preparado = useMemo(() => {
    if (!marcador) return null;
    try {
      return prepararCapturaExpres({
        pairIds,
        resultados,
        matchId,
        gamesA: marcador.gamesA,
        gamesB: marcador.gamesB,
      });
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [marcador, pairIds, resultados, matchId]);

  const fallo = errorDeFormato ?? (preparado instanceof Error ? preparado.message : null);

  async function guardar(borrando: boolean) {
    setError(null);
    setGuardando(true);
    try {
      const payload = borrando
        ? prepararCapturaExpres({ pairIds, resultados, matchId, gamesA: null, gamesB: null })
        : (preparado as ReturnType<typeof prepararCapturaExpres>);
      await onGuardar(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.cont}>
      {/* Los nombres, alineados con los dos números de cada botón. */}
      <View style={s.cabecera}>
        <Text style={[s.nombre, s.nombreIzq]} numberOfLines={2}>{nombreA}</Text>
        <Text style={s.vs}>games</Text>
        <Text style={[s.nombre, s.nombreDer]} numberOfLines={2}>{nombreB}</Text>
      </View>

      <Text style={s.eyebrow}>
        Seis games entre las dos. El partido no tiene ganador.
      </Text>

      {/* LAS DOS CASILLAS. Escribir una completa la otra hasta seis. */}
      <View style={s.casillas}>
        <TextInput
          value={textoA}
          onChangeText={(v) => escribir('a', v)}
          keyboardType="number-pad"
          maxLength={1}
          editable={!guardando}
          placeholder="–"
          placeholderTextColor={color.muted}
          style={[s.casilla, errorDeFormato && s.casillaMala]}
          accessibilityLabel={`Games de ${nombreA}`}
        />
        <Text style={s.guion}>–</Text>
        <TextInput
          value={textoB}
          onChangeText={(v) => escribir('b', v)}
          keyboardType="number-pad"
          maxLength={1}
          editable={!guardando}
          placeholder="–"
          placeholderTextColor={color.muted}
          style={[s.casilla, errorDeFormato && s.casillaMala]}
          accessibilityLabel={`Games de ${nombreB}`}
        />
      </View>

      {marcador && !fallo && (
        <View style={s.resumen}>
          <Text style={s.resumenTexto}>
            {marcador.gamesA === marcador.gamesB
              ? `${nombreA} y ${nombreB} se reparten los 6 games. No suma ni resta a ninguna.`
              : marcador.gamesA > marcador.gamesB
                ? `${nombreA} suma ${textoDeBalance(marcador.gamesA - marcador.gamesB)} y ${nombreB} resta ${Math.abs(marcador.gamesA - marcador.gamesB)}.`
                : `${nombreB} suma ${textoDeBalance(marcador.gamesB - marcador.gamesA)} y ${nombreA} resta ${Math.abs(marcador.gamesB - marcador.gamesA)}.`}
          </Text>
        </View>
      )}

      {(fallo || error) && (
        <View style={s.error}>
          <Text style={s.errorTexto}>{fallo ?? error}</Text>
        </View>
      )}

      <Pressable
        onPress={() => guardar(false)}
        disabled={!marcador || !!fallo || guardando}
        accessibilityRole="button"
        style={[s.guardar, (!marcador || !!fallo || guardando) && s.guardarApagado]}
      >
        {guardando ? (
          <ActivityIndicator color={color.bg} />
        ) : (
          <Text style={s.guardarTexto}>{guardado ? 'Corregir marcador' : 'Guardar marcador'}</Text>
        )}
      </Pressable>

      {/* Borrar solo aparece si hay algo que borrar. Un botón destructivo
          visible sin nada que destruir es una invitación a un accidente. */}
      {guardado && (
        <Pressable onPress={() => guardar(true)} disabled={guardando} style={s.borrar}>
          <Text style={s.borrarTexto}>Quitar el marcador y devolverlo a la agenda</Text>
        </Pressable>
      )}

      {onCancelar && (
        <Pressable onPress={onCancelar} disabled={guardando} style={s.cancelar}>
          <Text style={s.cancelarTexto}>Cancelar</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  cont: { padding: space[4], gap: space[3] },

  cabecera: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  nombre: { flex: 1, color: color.text, fontFamily: font.body, fontSize: fontSize.cardName },
  nombreIzq: { textAlign: 'left' },
  nombreDer: { textAlign: 'right' },
  vs: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption },

  eyebrow: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  casillas: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space[3], marginVertical: space[2],
  },
  casilla: {
    width: 76, height: 76, textAlign: 'center',
    fontFamily: font.display, fontSize: fontSize.displayL, color: color.text,
    borderWidth: 1, borderColor: color.goldMuted, borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  casillaMala: { borderColor: color.danger },
  guion: { fontFamily: font.display, fontSize: fontSize.metric, color: color.muted },


  resumen: {
    padding: space[3],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: color.line,
  },
  resumenTexto: { color: color.champagne, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },

  error: {
    padding: space[3],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },

  guardar: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.gold,
  },
  guardarApagado: { opacity: 0.4 },
  guardarTexto: { color: color.bg, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },

  borrar: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  borrarTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.caption },

  cancelar: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  cancelarTexto: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption },
});
