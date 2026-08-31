/**
 * RALLY · Mover un partido a mano
 *
 * VALIDA MIENTRAS SE MUEVE, NO AL GUARDAR
 *   El organizador está en la cancha y con prisa. Enterarse de que la hora no
 *   vale después de pulsar «Guardar» le hace repetir el camino entero; verlo
 *   mientras toca los botones le deja encontrar el hueco a la primera.
 *
 * LA REGLA NO VIVE AQUÍ
 *   `validarMovimiento` está en el engine (`schedule/mover.ts`) porque las Edge
 *   Functions que reprograman el día necesitan decidir exactamente lo mismo, y
 *   una regla escrita dos veces acaba diciendo dos cosas. Esta pantalla solo la
 *   llama y pinta lo que devuelve.
 *
 * Y EL MENSAJE LLEVA NOMBRE
 *   "Ana Teresa terminó su cuarto hace 10 minutos" es accionable: el
 *   organizador sabe a quién buscar. "conflict: player_busy" no lo es.
 */

import { useMemo, useState } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';

import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { bottomInset } from '@/lib/web-layout';
import { supabase } from '@/lib/supabase/client';
import { fallo } from '@/lib/errores-red';
import {
  validarMovimiento, type PartidoEnCalendario,
} from '@/lib/engine/schedule/mover';

/**
 * México abolió el horario de verano en 2022, así que el desfase es constante.
 * Mismo valor y mismo motivo que `schedule-knockout`: la zona del servidor de
 * Edge Functions es UTC y usarla correría el calendario seis horas.
 */
const OFFSET_MX = '-06:00';

const PASO = 30;

interface Props {
  /** El partido que se mueve. */
  partido: { id: string; categoria: string; etapa: string; parejaA: string | null; parejaB: string | null };
  dia: string;
  /** Estado actual de TODO el torneo, para que el motor pueda comparar. */
  partidos: PartidoEnCalendario[];
  nombres: Record<string, string>;
  canchas: number;
  minutosPorPartido: number;
  onCerrar: () => void;
  onGuardado: () => void;
}

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default function MoverPartido({
  partido, dia, partidos, nombres, canchas, minutosPorPartido, onCerrar, onGuardado,
}: Props) {
  const actual = partidos.find((p) => p.id === partido.id);

  const [inicioMin, setInicioMin] = useState(actual?.inicioMin ?? 8 * 60);
  const [cancha, setCancha]       = useState(actual?.cancha ?? 'Cancha 1');
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // En vivo: cada toque recalcula. Es puro y determinista, así que no hay nada
  // que esperar ni que cancelar.
  const validacion = useMemo(
    () => validarMovimiento({
      partidos, nombres, minutosPorPartido,
      movimiento: { matchId: partido.id, dia, inicioMin, cancha },
    }),
    [partidos, nombres, minutosPorPartido, partido.id, dia, inicioMin, cancha],
  );

  const sinCambios = actual?.inicioMin === inicioMin && actual?.cancha === cancha;

  async function guardar() {
    if (!validacion.ok || sinCambios) return;
    setError(null);
    setGuardando(true);
    try {
      const { error: e } = await supabase
        .from('matches')
        .update({ scheduled_at: `${dia}T${fmt(inicioMin)}:00${OFFSET_MX}`, court_label: cancha } as never)
        .eq('id', partido.id);
      if (e) throw e;
      onGuardado();
    } catch (e) {
      setError(fallo('mover-partido', e, 'No se pudo mover el partido.', { matchId: partido.id }));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={s.safe}>
        <View style={s.cabecera}>
          <Text style={s.titulo}>Mover partido</Text>
          <Pressable onPress={onCerrar} style={{ padding: space[2] }} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Text style={s.cerrar}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.cuerpo}>
          <View style={s.ficha}>
            <Text style={s.fichaCat}>{partido.categoria} · {partido.etapa}</Text>
            <Text style={s.fichaParejas}>
              {partido.parejaA && partido.parejaB
                ? `${partido.parejaA}  vs  ${partido.parejaB}`
                : 'Parejas por definir'}
            </Text>
          </View>

          {/* Hora */}
          <Text style={s.etiqueta}>HORA</Text>
          <View style={s.stepper}>
            <Pressable
              onPress={() => setInicioMin((m) => Math.max(0, m - PASO))}
              style={s.paso} accessibilityRole="button" accessibilityLabel="Media hora antes"
            >
              <Text style={s.pasoTexto}>−</Text>
            </Pressable>
            <Text style={s.cifra}>{fmt(inicioMin)}</Text>
            <Pressable
              onPress={() => setInicioMin((m) => Math.min(23 * 60 + 30, m + PASO))}
              style={s.paso} accessibilityRole="button" accessibilityLabel="Media hora después"
            >
              <Text style={s.pasoTexto}>+</Text>
            </Pressable>
          </View>

          {/* Cancha */}
          <Text style={s.etiqueta}>CANCHA</Text>
          <View style={s.canchas}>
            {Array.from({ length: Math.max(1, canchas) }, (_, i) => `Cancha ${i + 1}`).map((c) => (
              <Pressable
                key={c}
                onPress={() => setCancha(c)}
                style={[s.chip, cancha === c && s.chipActivo]}
                accessibilityRole="button"
                accessibilityState={{ selected: cancha === c }}
                accessibilityLabel={c}
              >
                <Text style={[s.chipTexto, cancha === c && s.chipTextoActivo]}>{i(c)}</Text>
              </Pressable>
            ))}
          </View>

          {/* El veredicto, en vivo */}
          {validacion.ok ? (
            <View style={s.ok}>
              <Text style={s.okTexto}>
                {sinCambios ? 'Es donde ya está.' : 'Se puede mover aquí.'}
              </Text>
            </View>
          ) : (
            <View style={s.mal}>
              {validacion.conflictos.map((c, k) => (
                <Text key={k} style={s.malTexto}>· {c.mensaje}</Text>
              ))}
            </View>
          )}

          {error && <Text style={s.error}>{error}</Text>}

          <Pressable
            onPress={guardar}
            disabled={!validacion.ok || sinCambios || guardando}
            style={({ pressed }) => [
              s.btn,
              (!validacion.ok || sinCambios || guardando) && s.btnInerte,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !validacion.ok || sinCambios }}
          >
            {guardando
              ? <ActivityIndicator color={color.onGold} />
              : <Text style={s.btnTexto}>Mover aquí</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** 'Cancha 3' → '3'. En una tira de ocho chips el prefijo es ruido. */
const i = (etiqueta: string) => /(\d+)/.exec(etiqueta)?.[1] ?? etiqueta;

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: color.lineSoft },
  titulo:   { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  cerrar:   { fontFamily: font.body, fontSize: 15, color: color.muted },

  cuerpo:   { padding: space[4], paddingBottom: bottomInset, gap: space[3] },

  ficha:        { backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.lineSoft, padding: space[3], gap: space[1] },
  fichaCat:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },
  fichaParejas: { fontFamily: font.display, fontSize: fontSize.body, color: color.text, lineHeight: 21 },

  etiqueta: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 1.5, marginTop: space[2] },

  stepper:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  paso:      { width: 52, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontFamily: font.display, fontSize: 26, color: color.gold },
  cifra:     { flex: 1, textAlign: 'center', fontFamily: font.display, fontSize: 40, color: color.goldBright },

  canchas:        { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip:           { minWidth: 46, paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.pill, borderWidth: 1, borderColor: color.lineSoft, backgroundColor: color.surface, alignItems: 'center' },
  chipActivo:     { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  chipTexto:      { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  chipTextoActivo:{ color: color.goldBright, fontWeight: '600' },

  ok:      { backgroundColor: 'rgba(126,178,109,0.10)', borderWidth: 1, borderColor: 'rgba(126,178,109,0.25)', borderRadius: radius.md, padding: space[3] },
  okTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.live },

  mal:      { backgroundColor: 'rgba(224,114,111,0.10)', borderWidth: 1, borderColor: 'rgba(224,114,111,0.25)', borderRadius: radius.md, padding: space[3], gap: space[1] },
  malTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 18 },

  error: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btn:       { backgroundColor: color.gold, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  btnInerte: { opacity: 0.5 },
  btnTexto:  { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold },
});
