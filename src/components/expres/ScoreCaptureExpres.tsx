/**
 * src/components/expres/ScoreCaptureExpres.tsx
 *
 * RALLY · Captura de un partido de SUMA 6.
 *
 * SIETE BOTONES, NO DOS CASILLAS
 *   Un suma 6 solo puede terminar de siete maneras: 6-0, 5-1, 4-2, 3-3 y sus
 *   espejos. Con dos casillas numéricas el juez puede teclear un 7-2 o un 5-5,
 *   y entonces hay que validarlo, explicarle el error y que lo vuelva a
 *   intentar. Un marcador imposible que no se puede ni escribir no hay que
 *   validarlo después.
 *
 *   Es el mismo razonamiento que quitó el interruptor de súper muerte de la
 *   captura larga, llevado un paso más allá: allí el dato sobraba porque
 *   estaba en los números; aquí sobran los números.
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
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { MARCADORES_SUMA6, prepararCapturaExpres, type ResultadoSuma6 } from '@/lib/engine/expres';
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
  const [elegido, setElegido] = useState<number | null>(() =>
    guardado
      ? MARCADORES_SUMA6.findIndex((m) => m.gamesA === guardado.gamesA && m.gamesB === guardado.gamesB)
      : null,
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marcador = elegido === null ? null : MARCADORES_SUMA6[elegido];

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

  const fallo = preparado instanceof Error ? preparado.message : null;

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

      <Text style={s.eyebrow}>Seis games. El partido no tiene ganador.</Text>

      <View style={s.grid}>
        {MARCADORES_SUMA6.map((m, i) => {
          const activo = elegido === i;
          const saldo = m.gamesA - m.gamesB;
          return (
            <Pressable
              key={`${m.gamesA}-${m.gamesB}`}
              onPress={() => setElegido(activo ? null : i)}
              disabled={guardando}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              accessibilityLabel={`${nombreA} ${m.gamesA}, ${nombreB} ${m.gamesB}`}
              style={[s.boton, activo && s.botonActivo]}
            >
              <Text style={[s.marcador, activo && s.marcadorActivo]}>
                {m.gamesA}–{m.gamesB}
              </Text>
              <Text style={[s.saldo, activo && s.saldoActivo]}>
                {saldo === 0 ? 'no mueve' : textoDeBalance(saldo)}
              </Text>
            </Pressable>
          );
        })}
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

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  boton: {
    minWidth: 88,
    flexGrow: 1,
    minHeight: touchTarget + 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: space[2.5],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: color.surface,
  },
  botonActivo: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.14)' },
  marcador: { color: color.text, fontFamily: font.display, fontSize: fontSize.metric },
  marcadorActivo: { color: color.goldBright },
  saldo: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption },
  saldoActivo: { color: color.champagne },

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
