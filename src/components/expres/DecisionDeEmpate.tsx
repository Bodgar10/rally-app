/**
 * src/components/expres/DecisionDeEmpate.tsx
 *
 * RALLY · El organizador decide quién avanza cuando el reglamento no llega.
 *
 * ESTO NO ES UN CASO LÍMITE, ES CAMINO PRINCIPAL
 *   Simulando torneos de cupo 16, el empate cae justo en la línea de
 *   clasificación en uno de cada cuatro. Y cuando cae, el enfrentamiento
 *   directo no sirve el 42% de las veces —porque en un grupo de 8 juegas
 *   contra 5 de tus 7 rivales y las empatadas pueden no haberse visto—. Sumado,
 *   esta pantalla sale en torno a un domingo de cada cuatro.
 *
 *   Por eso no está escondida detrás de un icono de advertencia ni redactada
 *   como un error. Es un paso normal del torneo: se juega un tiebreak en la
 *   cancha y alguien apunta el resultado.
 *
 * RALLY NO GESTIONA EL TIEBREAK, Y LO DICE
 *   No se captura el marcador del desempate ni se calcula nada: sería inventar
 *   un formato que el organizador no pidió y que cada club juega a su manera.
 *   Lo que hace la pantalla es sugerirlo y guardar el orden que él decida.
 *
 * SE ORDENA TOCANDO, NO ARRASTRANDO
 *   Tocar una pareja le pone el siguiente número. Volver a tocarla la saca y
 *   renumera. Arrastrar filas en un móvil, con guantes de pádel y sol de
 *   frente, es pedir un error en la decisión más delicada del torneo.
 *
 * Y SE PUEDE DESHACER SOLO
 *   El orden guardado se aplica únicamente si el empate sigue existiendo con
 *   estas mismas parejas — la regla de `group_standings.desempate_manual`
 *   (migración 064). Si luego se corrige un resultado y el empate desaparece,
 *   la decisión deja de aplicarse sin que nadie tenga que venir a borrarla.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import type { EmpateExpres } from '@/lib/engine/expres';
import { textoDeBalance } from '@/lib/expres-texto';

export interface DecisionDeEmpateProps {
  empate: EmpateExpres;
  nombreDePareja: (pairId: string) => string;
  /** Cuántas de las empatadas entran en cuartos. */
  plazasEnJuego: number;
  /** Guarda el orden. `pairId -> 1, 2, 3…`, que es lo que espera sortear_desempate (065). */
  onConfirmar: (ordenManual: Record<string, number>) => Promise<void>;
  onCancelar?: () => void;
}

export default function DecisionDeEmpate({
  empate,
  nombreDePareja,
  plazasEnJuego,
  onConfirmar,
  onCancelar,
}: DecisionDeEmpateProps) {
  const [orden, setOrden] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completo = orden.length === empate.pairIds.length;

  function alternar(pairId: string) {
    setError(null);
    setOrden((prev) => (prev.includes(pairId) ? prev.filter((p) => p !== pairId) : [...prev, pairId]));
  }

  async function confirmar() {
    if (!completo) return;
    setError(null);
    setGuardando(true);
    try {
      const mapa: Record<string, number> = {};
      orden.forEach((pairId, i) => {
        mapa[pairId] = i + 1;
      });
      await onConfirmar(mapa);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la decisión. Inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.cont}>
      <Text style={s.titulo}>Quién avanza</Text>

      <View style={s.explica}>
        <Text style={s.explicaTexto}>
          {empate.pairIds.length} parejas terminaron con el mismo saldo de games (
          {textoDeBalance(empate.balance)}), y{' '}
          {empate.motivo === 'no_se_enfrentaron'
            ? 'no se enfrentaron entre ellas, así que no hay partido que mirar'
            : 'lo que pasó cuando se enfrentaron tampoco las separa'}
          . Hasta aquí llega el reglamento.
        </Text>
        <Text style={s.explicaTexto}>
          Lo normal es jugar un tiebreak en la cancha. RALLY no lo gestiona: cuando lo
          tengan, marca aquí el orden y la tabla se cierra.
        </Text>
        <Text style={s.plazas}>
          {plazasEnJuego === 1
            ? 'Solo una de ellas entra en cuartos.'
            : `Entran ${plazasEnJuego} de las ${empate.pairIds.length}.`}
        </Text>
      </View>

      <Text style={s.eyebrow}>Tócalas en orden, de la primera a la última</Text>

      {empate.pairIds.map((pairId) => {
        const puesto = orden.indexOf(pairId);
        const elegida = puesto !== -1;
        const entra = elegida && puesto < plazasEnJuego;
        return (
          <Pressable
            key={pairId}
            onPress={() => alternar(pairId)}
            disabled={guardando}
            accessibilityRole="button"
            accessibilityState={{ selected: elegida }}
            style={[s.fila, elegida && s.filaElegida, entra && s.filaEntra]}
          >
            <View style={[s.numero, elegida && s.numeroElegido, entra && s.numeroEntra]}>
              <Text style={[s.numeroTexto, elegida && s.numeroTextoElegido]}>
                {elegida ? puesto + 1 : '·'}
              </Text>
            </View>
            <Text style={[s.nombre, elegida && s.nombreElegido]} numberOfLines={1}>
              {nombreDePareja(pairId)}
            </Text>
            {elegida && (
              <Text style={[s.destino, entra ? s.destinoEntra : s.destinoFuera]}>
                {entra ? 'a cuartos' : 'fuera'}
              </Text>
            )}
          </Pressable>
        );
      })}

      {error && (
        <View style={s.error}>
          <Text style={s.errorTexto}>{error}</Text>
        </View>
      )}

      <Pressable
        onPress={confirmar}
        disabled={!completo || guardando}
        accessibilityRole="button"
        style={[s.confirmar, (!completo || guardando) && s.confirmarApagado]}
      >
        {guardando ? (
          <ActivityIndicator color={color.bg} />
        ) : (
          <Text style={s.confirmarTexto}>
            {completo ? 'Guardar esta decisión' : `Faltan ${empate.pairIds.length - orden.length} por ordenar`}
          </Text>
        )}
      </Pressable>

      <Text style={s.nota}>
        Queda registrado que esto lo decidiste tú y no el reglamento, y así se enseña en la
        tabla. Si luego se corrige un resultado y el empate desaparece, esta decisión deja de
        aplicarse sola.
      </Text>

      {onCancelar && (
        <Pressable onPress={onCancelar} disabled={guardando} style={s.cancelar}>
          <Text style={s.cancelarTexto}>Ahora no</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  cont: { padding: space[4], gap: space[3] },
  titulo: {
    color: color.champagne,
    fontFamily: font.display,
    fontSize: fontSize.screenH1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  explica: {
    gap: space[2],
    padding: space[3],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: color.line,
  },
  explicaTexto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
  plazas: { color: color.goldBright, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },

  eyebrow: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: touchTarget + 8,
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: color.surface,
  },
  filaElegida: { borderColor: 'rgba(212,175,55,0.45)' },
  filaEntra: { backgroundColor: 'rgba(66,214,164,0.10)', borderColor: 'rgba(66,214,164,0.35)' },

  numero: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  numeroElegido: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.16)' },
  numeroEntra: { borderColor: color.live, backgroundColor: 'rgba(66,214,164,0.16)' },
  numeroTexto: { color: color.muted, fontFamily: font.display, fontSize: fontSize.cardName },
  numeroTextoElegido: { color: color.text },

  nombre: { flex: 1, color: color.text, fontFamily: font.body, fontSize: fontSize.body },
  nombreElegido: { fontWeight: '600' },
  destino: { fontFamily: font.body, fontSize: fontSize.minAbsolute, textTransform: 'uppercase', letterSpacing: 0.6 },
  destinoEntra: { color: color.live },
  destinoFuera: { color: color.muted },

  error: {
    padding: space[3],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(224,114,111,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(224,114,111,0.3)',
  },
  errorTexto: { color: color.danger, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },

  confirmar: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.gold,
  },
  confirmarApagado: { opacity: 0.4 },
  confirmarTexto: { color: color.bg, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },

  nota: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute, lineHeight: 17 },

  cancelar: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  cancelarTexto: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption },
});
