/**
 * RALLY · Formato del torneo
 *
 * De momento una sola decisión: si se juega el partido por el 3.er lugar.
 *
 * POR QUÉ EL INTERRUPTOR LLEVA UN PRECIO DEBAJO
 *   "¿Quieres jugar el 3.er lugar?" no se puede responder sin saber qué cuesta,
 *   y cuesta dos cosas a la vez: partidos y hora de cierre. Sin ese dato el
 *   organizador dice que sí por inercia —suena bien— y se entera el domingo.
 *
 *   Medido contra Cimepa: ocho partidos más y media hora de cierre. La media
 *   hora es lo que importa, porque no se reparte: los ocho caen a la vez, en la
 *   transición de semifinales a final, que es cuando las ocho categorías
 *   convergen y el día va más cargado.
 *
 * DEFAULT ACTIVADO
 *   Es lo que se venía haciendo siempre. Apagarlo por defecto habría dejado sin
 *   3.er lugar a torneos que ya contaban con él.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView, Switch, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useVolver } from '@/hooks/useVolver';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import { frasePrecioTercerLugar } from '@/lib/tercer-lugar';
import { fallo } from '@/lib/errores-red';

export default function FormatoScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();
  const volver = useVolver();

  const [nombre, setNombre]       = useState('');
  // Arranca apagado: si la carga falla, la pantalla no promete un partido
  // que el torneo no va a jugar.
  const [tercero, setTercero]     = useState(false);
  const [formato, setFormato]     = useState<'super_muerte' | 'set_completo'>('super_muerte');
  const [puntos, setPuntos]       = useState('10');
  const [tercerosCapturados, setTercerosCapturados] = useState(0);
  /** Lo que hay en la base, para saber si de verdad se está cambiando algo. */
  const [formatoGuardado, setFormatoGuardado] = useState<'super_muerte' | 'set_completo'>('super_muerte');
  const [puntosGuardados, setPuntosGuardados] = useState(10);
  /** El aviso está pendiente de confirmar. No es un impedimento. */
  const [confirmando, setConfirmando] = useState(false);
  const [precio, setPrecio]       = useState<string | null>(null);
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const { data: t, error: te } = await supabase
        .from('tournaments')
        .select('name, courts, match_minutes, tercer_lugar, tercer_set_formato, tercer_set_puntos')
        .eq('id', tournamentId)
        .maybeSingle();
      if (te) throw te;
      if (!t) throw new Error('El torneo no existe.');

      const fila = t as unknown as {
        name: string; courts: number | null;
        match_minutes: number | null; tercer_lugar: boolean | null;
        tercer_set_formato: 'super_muerte' | 'set_completo' | null;
        tercer_set_puntos: number | null;
      };
      setNombre(fila.name);
      // `=== true` y no `!== false`: lo desconocido se lee APAGADO. La regla
      // es que solo esté encendido si alguien lo encendió a propósito.
      setTercero(fila.tercer_lugar === true);
      // Un torneo creado antes de la 063 no tiene el dato: súper muerte a 10,
      // que es como se venía jugando.
      setFormato(fila.tercer_set_formato ?? 'super_muerte');
      setPuntos(String(fila.tercer_set_puntos ?? 10));
      setFormatoGuardado(fila.tercer_set_formato ?? 'super_muerte');
      setPuntosGuardados(fila.tercer_set_puntos ?? 10);

      // Cuántos partidos tienen ya un tercer set capturado. No bloquea nada:
      // es lo que hay que decirle al organizador antes de que cambie la regla.
      const { count } = await supabase
        .from('match_sets')
        .select('match_id, matches!inner(tournament_id)', { count: 'exact', head: true })
        .eq('set_number', 3)
        .eq('matches.tournament_id', tournamentId);
      setTercerosCapturados(count ?? 0);

      // ── El precio ─────────────────────────────────────────────────────────
      // Clasificados por categoría = grupos × pasan + repescados. Hace falta
      // para saber CUÁNTAS categorías llegan a dos semifinales reales: con 3
      // clasificados una semifinal es bye y no hay 3.er lugar que jugar.
      const { data: cats } = await supabase
        .from('categories')
        .select('id, advance_per_group, best_extra_qualifiers')
        .eq('tournament_id', tournamentId);

      const ids = (cats ?? []).map((c) => c.id);
      const { data: grupos } = ids.length
        ? await supabase.from('groups').select('category_id').in('category_id', ids)
        : { data: [] as { category_id: string }[] };

      const porCat = new Map<string, number>();
      for (const g of grupos ?? []) porCat.set(g.category_id, (porCat.get(g.category_id) ?? 0) + 1);

      const clasificados = (cats ?? [])
        .map((c) => (porCat.get(c.id) ?? 0) * (c.advance_per_group ?? 1) + (c.best_extra_qualifiers ?? 0))
        .filter((n) => n > 0);

      // Sin categorías cerradas todavía no hay cuadros, y decir un número
      // inventado sería peor que no decir ninguno.
      setPrecio(
        clasificados.length === 0
          ? null
          : frasePrecioTercerLugar(clasificados, fila.courts ?? 4, fila.match_minutes ?? 60),
      );
    } catch (e) {
      setError(fallo('formato', e, 'No se pudo cargar la configuración.', { tournamentId }));
    } finally {
      setCargando(false);
    }
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  /** ¿Se está cambiando la regla con terceros sets ya jugados? */
  const cambiaFormato = formato !== formatoGuardado || Number(puntos) !== puntosGuardados;
  const hayQueAvisar = cambiaFormato && tercerosCapturados > 0;

  async function guardar() {
    // AVISO CON CONFIRMACIÓN, NO CANDADO. El organizador puede cambiar la
    // regla con el torneo en marcha; lo que no puede es hacerlo sin saber a
    // cuántos partidos ya jugados afecta la lectura.
    if (hayQueAvisar && !confirmando) { setConfirmando(true); return; }

    setError(null);
    setGuardando(true);
    try {
      const n = Number(puntos);
      if (formato === 'super_muerte' && (!Number.isInteger(n) || n < 7 || n > 21)) {
        throw new Error('La súper muerte se juega entre 7 y 21 puntos.');
      }
      const { error: e } = await supabase
        .from('tournaments')
        .update({
          tercer_lugar: tercero,
          tercer_set_formato: formato,
          tercer_set_puntos: formato === 'super_muerte' ? n : 10,
        } as never)
        .eq('id', tournamentId);
      if (e) throw e;
      volver();
    } catch (e) {
      setError(fallo('formato/guardar', e, 'No se pudo guardar. Intenta de nuevo.', { tournamentId }));
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator color={color.gold} /></View>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.contenido}>
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.titulo}>Formato</Text>

        <View style={s.fila}>
          <View style={s.filaTexto}>
            <Text style={s.filaTitulo}>Partido por el 3.er lugar</Text>
            <Text style={s.filaSub}>
              Lo juegan los dos perdedores de las semifinales.
            </Text>
          </View>
          <Switch
            value={tercero}
            onValueChange={setTercero}
            trackColor={{ false: color.line, true: color.goldDeep }}
            thumbColor={tercero ? color.goldBright : color.muted}
            accessibilityLabel="Jugar el partido por el tercer lugar"
          />
        </View>

        {/* El precio, en los dos ejes que le importan al organizador. */}
        <View style={s.nota}>
          <Text style={s.notaTexto}>
            {precio ??
              'Cuando cierres las inscripciones de alguna categoría te diremos ' +
              'cuántos partidos añade y cuánto alarga el último día.'}
          </Text>
          {!tercero && (
            <Text style={s.notaApagado}>
              Apagado: no se creará al cerrar las semifinales. El plan del último
              día se recalcula sin él.
            </Text>
          )}
        </View>

        {/* ── EL SET DECISIVO ──────────────────────────────────────────
            No se deduce de los números: en el tercer set un 5-4 es legal
            camino de un set completo y camino de una súper muerte. Mientras el
            motor lo adivinaba, rechazaba los marcadores en curso del tercero
            como si fueran imposibles. */}
        <Text style={s.seccion}>Cómo se juega el tercer set</Text>

        <View style={s.opciones}>
          {([
            ['super_muerte', 'Súper muerte', 'Lo normal en padel'],
            ['set_completo', 'Set completo', 'Como el primero y el segundo'],
          ] as const).map(([valor, titulo, sub]) => (
            <Pressable
              key={valor}
              onPress={() => { setFormato(valor); setConfirmando(false); }}
              style={[s.opcion, formato === valor && s.opcionElegida]}
              accessibilityRole="radio"
              accessibilityState={{ selected: formato === valor }}
            >
              <Text style={[s.opcionTitulo, formato === valor && s.opcionTituloElegida]}>{titulo}</Text>
              <Text style={s.opcionSub}>{sub}</Text>
            </Pressable>
          ))}
        </View>

        {formato === 'super_muerte' && (
          <View style={s.fila}>
            <View style={s.filaTexto}>
              <Text style={s.filaTitulo}>A cuántos puntos</Text>
              <Text style={s.filaSub}>Se gana por dos. Entre 7 y 21.</Text>
            </View>
            <TextInput
              value={puntos}
              onChangeText={(v) => { setPuntos(v.replace(/[^0-9]/g, '')); setConfirmando(false); }}
              keyboardType="number-pad"
              maxLength={2}
              style={s.puntos}
              accessibilityLabel="Puntos de la súper muerte"
            />
          </View>
        )}

        {/* EL AVISO, cuando ya hay terceros sets jugados. Con confirmación,
            no con candado: la regla se puede cambiar en cualquier momento. */}
        {hayQueAvisar && (
          <View style={s.aviso}>
            <Text style={s.avisoTitulo}>
              {tercerosCapturados === 1
                ? 'Hay 1 partido con tercer set capturado'
                : `Hay ${tercerosCapturados} partidos con tercer set capturado`}
            </Text>
            <Text style={s.avisoTexto}>
              Esos resultados NO se tocan: su marcador y su ganador se quedan
              exactamente como están. El formato nuevo solo aplica de aquí en
              adelante.
            </Text>
            {confirmando && (
              <Text style={s.avisoConfirmar}>
                Vuelve a pulsar Guardar para confirmar el cambio.
              </Text>
            )}
          </View>
        )}

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={guardar}
          disabled={guardando}
          style={({ pressed }) => [s.btn, guardando && s.btnInerte, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Guardar"
        >
          {guardando
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={s.btnTexto}>Guardar</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: color.bg },
  centro:    { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  contenido: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow:   { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  titulo:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },

  fila: {
    flexDirection: 'row', alignItems: 'center', gap: space[3],
    backgroundColor: color.surface, borderWidth: 1, borderColor: color.line,
    borderRadius: radius.lg, padding: space[4], marginTop: space[2],
  },
  filaTexto:  { flex: 1, gap: space[1] },
  filaTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  filaSub:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  seccion:     { fontFamily: font.display, fontSize: fontSize.section, color: color.champagne, marginTop: space[2] },
  opciones:    { flexDirection: 'row', gap: space[2] },
  opcion:      { flex: 1, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], gap: space[1] },
  opcionElegida: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.10)' },
  opcionTitulo:  { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.text },
  opcionTituloElegida: { color: color.gold },
  opcionSub:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  puntos:      { width: 64, textAlign: 'center', borderWidth: 1, borderColor: color.goldMuted, borderRadius: radius.sm, color: color.text, fontFamily: font.display, fontSize: fontSize.cardName, paddingVertical: space[2] },
  aviso:       { backgroundColor: 'rgba(230,180,80,0.10)', borderWidth: 1, borderColor: 'rgba(230,180,80,0.25)', borderRadius: radius.md, padding: space[3], gap: space[2] },
  avisoTitulo: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.alive },
  avisoTexto:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.text, lineHeight: 18 },
  avisoConfirmar: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.alive },

  nota:        { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3], gap: space[2] },
  notaTexto:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },
  notaApagado: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 17 },

  error:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btn:       { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  btnInerte: { opacity: 0.7 },
  btnTexto:  { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
});
