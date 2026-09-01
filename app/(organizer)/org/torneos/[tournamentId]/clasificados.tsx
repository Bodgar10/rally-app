/**
 * RALLY · Cuántos clasifican, después de cerrar inscripciones
 *
 * EL HUECO QUE LLENA
 *   Los dos números que deciden el tamaño del cuadro —cuántos pasan por grupo
 *   y cuántos entran de repesca— solo se podían tocar ANTES de cerrar
 *   inscripciones. Después, nada.
 *
 *   Y es justo después cuando el organizador se entera de que hay un problema:
 *   abre el calendario y ve que el domingo cierra a las 21:00, o abre Grupos y
 *   ve un cuadro que arranca en ronda de 32 con trece byes. Le estábamos
 *   avisando del problema y quitándole la única palanca que lo resuelve.
 *
 *   En el torneo bb8e137e, 3ª y 4ª Varonil tenían 10 grupos × 1 + 9 repescados
 *   = 19 clasificados. Diecinueve no caben en dieciséis, así que abrían a 32.
 *   Bajar la repesca a 6 los dejó en 16 exactos y quitó doce partidos del
 *   domingo. Hubo que hacerlo con SQL a mano.
 *
 * POR QUÉ ESTA PANTALLA Y NO UN CAMPO EN OTRA
 *   Porque el cambio no es guardar dos enteros: según el estado de la
 *   categoría puede no tocar nada, puede borrar y resembrar el cuadro, o puede
 *   estar prohibido. Eso necesita sitio para explicarse antes de que alguien
 *   pulse Guardar, y necesita enseñar EN VIVO qué cuadro sale de cada número
 *   —clasificados, ronda de arranque, byes y el piso— mientras se mueven.
 *
 *   Se entra desde el calendario, que es donde se ve el cierre tarde, y desde
 *   el índice del torneo.
 *
 * LA ARITMÉTICA NO VIVE AQUÍ
 *   Sale entera de `@/lib/cuadro-tamano`, el mismo módulo que usa la pantalla
 *   de cerrar inscripciones. Si se duplicara, un día las dos pantallas
 *   anunciarían cuadros distintos para los mismos números.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import { cuadroDe, explicarCuadro, pisoDeCuadro, estaEnElPiso } from '@/lib/cuadro-tamano';
import { fallo } from '@/lib/errores-red';
import { situacionDeCuadro, type SituacionCuadro } from '@/lib/cuadro-ajuste';

// ── Modelo ──────────────────────────────────────────────────────────────────

interface Cat {
  id: string;
  nombre: string;
  grupos: number;
  /** Lo guardado en la base. */
  pasan: number;
  repesca: number;
  /** Partidos de eliminatoria que existen hoy. */
  cuadro: number;
  /** De esos, cuántos ya tienen resultado. */
  jugados: number;
  situacion: SituacionCuadro;
}

/** Lo que el organizador está moviendo, por categoría. Solo lo que cambió. */
type Edicion = Record<string, { pasan: number; repesca: number }>;

export default function ClasificadosScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  const [nombre, setNombre]   = useState('');
  const [cats, setCats]       = useState<Cat[]>([]);
  const [edicion, setEdicion] = useState<Edicion>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  /** Categoría cuyo borrado de cuadro está pendiente de confirmar. */
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const { data: t } = await supabase
        .from('tournaments').select('name').eq('id', tournamentId).maybeSingle();
      if (t) setNombre(t.name);

      const { data: filas, error: ce } = await supabase
        .from('categories')
        .select('id, display_name, advance_per_group, best_extra_qualifiers')
        .eq('tournament_id', tournamentId)
        .order('division');
      if (ce) throw ce;

      const ids = (filas ?? []).map((c) => c.id);
      if (ids.length === 0) { setCats([]); setCargando(false); return; }

      const [{ data: grupos }, { data: partidos }] = await Promise.all([
        supabase.from('groups').select('id, category_id').in('category_id', ids),
        // Solo eliminatorias: los de grupo no se tocan nunca aquí.
        supabase.from('matches')
          .select('id, category_id, status, winner_pair_id')
          .in('category_id', ids).neq('stage', 'group'),
      ]);

      const gruposPorCat = new Map<string, number>();
      for (const g of grupos ?? []) gruposPorCat.set(g.category_id, (gruposPorCat.get(g.category_id) ?? 0) + 1);

      const cuadroPorCat = new Map<string, number>();
      const jugadosPorCat = new Map<string, number>();
      for (const m of partidos ?? []) {
        cuadroPorCat.set(m.category_id, (cuadroPorCat.get(m.category_id) ?? 0) + 1);
        if (m.status === 'finished' || m.winner_pair_id) {
          jugadosPorCat.set(m.category_id, (jugadosPorCat.get(m.category_id) ?? 0) + 1);
        }
      }

      const salida: Cat[] = [];
      for (const c of filas ?? []) {
        const g = gruposPorCat.get(c.id) ?? 0;
        // Sin grupos la categoría no está cerrada: esta pantalla no aplica.
        if (g === 0) continue;
        const cuadro = cuadroPorCat.get(c.id) ?? 0;
        const jugados = jugadosPorCat.get(c.id) ?? 0;
        salida.push({
          id: c.id,
          nombre: c.display_name,
          grupos: g,
          pasan: c.advance_per_group ?? 1,
          repesca: c.best_extra_qualifiers ?? 0,
          cuadro,
          jugados,
          situacion: situacionDeCuadro(cuadro, jugados),
        });
      }
      setCats(salida);
    } catch (e) {
      setError(fallo('clasificados.cargar', e, 'No se pudieron cargar las categorías.'));
    }
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const valorDe = (c: Cat) => edicion[c.id] ?? { pasan: c.pasan, repesca: c.repesca };
  const cambiada = (c: Cat) => {
    const v = valorDe(c);
    return v.pasan !== c.pasan || v.repesca !== c.repesca;
  };

  const mover = (c: Cat, campo: 'pasan' | 'repesca', delta: number) => {
    const v = valorDe(c);
    const nuevo = { ...v, [campo]: Math.max(campo === 'pasan' ? 1 : 0, v[campo] + delta) };
    setEdicion((prev) => ({ ...prev, [c.id]: nuevo }));
    setAviso(null);
    setConfirmar(null);
  };

  /**
   * Guardar. La RPC es la que manda: repite los permisos y las tres
   * situaciones del lado del servidor, porque una pantalla no es una garantía.
   */
  async function guardar(c: Cat, borrarCuadro: boolean) {
    const v = valorDe(c);
    setGuardando(c.id);
    setError(null);
    setAviso(null);
    try {
      const { data, error: re } = await supabase.rpc('ajustar_clasificados', {
        p_category_id: c.id,
        p_advance: v.pasan,
        p_extra: v.repesca,
        p_borrar_cuadro: borrarCuadro,
      });
      if (re) {
        // Los tres rechazos de la RPC, traducidos. Un mensaje de Postgres crudo
        // no le dice a nadie qué hacer.
        if (re.message.includes('resultados_capturados')) {
          setError(
            `${c.nombre} ya tiene resultados capturados en el cuadro. No se puede cambiar: ` +
            `habría que borrar partidos que dos parejas jugaron de verdad.`,
          );
        } else if (re.message.includes('cuadro_sembrado')) {
          setConfirmar(c.id);
        } else if (re.message.includes('no_autorizado')) {
          setError('Solo el dueño del organizador puede cambiar esto.');
        } else {
          setError(fallo('clasificados.guardar', re, 'No se pudo guardar el cambio.', { categoria: c.id }));
        }
        setGuardando(null);
        return;
      }

      const r = data as { hay_que_resembrar?: boolean } | null;
      const pasos: string[] = [`${c.nombre}: guardado.`];

      // Resembrar el cuadro que acabamos de borrar.
      if (r?.hay_que_resembrar) {
        const ok = await llamar('generate-bracket', { action: 'seed', category_id: c.id });
        pasos.push(ok ? 'Cuadro resembrado.' : 'El cuadro NO se pudo resembrar: hazlo desde Grupos.');
      }

      // Y reprogramar el día de eliminatorias: cambiar los clasificados cambia
      // cuántos partidos hay, así que el calendario viejo ya no describe nada.
      const prog = await llamar('schedule-knockout', { tournamentId });
      pasos.push(prog ? 'Calendario reprogramado.' : 'El calendario NO se reprogramó: hazlo desde Calendario.');

      setAviso(pasos.join(' '));
      setEdicion((prev) => { const { [c.id]: _, ...resto } = prev; return resto; });
      setConfirmar(null);
      await cargar();
    } catch (e) {
      setError(fallo('clasificados.guardar', e, 'No se pudo guardar el cambio.', { categoria: c.id }));
    }
    setGuardando(null);
  }

  /** Llamada a una Edge Function. Devuelve si salió bien; no lanza. */
  async function llamar(fn: string, body: unknown): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  if (cargando) {
    return (
      <SafeAreaView style={s.pantalla}>
        <View style={s.centro}><ActivityIndicator color={color.gold} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.pantalla}>
      <BotonVolver texto={nombre || 'Torneo'} />
      <ScrollView contentContainerStyle={s.contenido} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.titulo}>Cuántos clasifican</Text>

        {cats.length === 0 ? (
          <Text style={s.vacio}>
            Todavía no hay categorías cerradas. Estos números se ajustan aquí una
            vez que las inscripciones están cerradas y los grupos armados.
          </Text>
        ) : (
          <Text style={s.entradilla}>
            Cambiar estos números cambia el tamaño del cuadro y cuántos partidos
            se juegan el último día. Al guardar se reprograma el calendario.
          </Text>
        )}

        {error && <Text style={s.error}>{error}</Text>}
        {aviso && <Text style={s.ok}>{aviso}</Text>}

        {cats.map((c) => {
          const v = valorDe(c);
          const cuadro = cuadroDe(c.grupos, v.pasan, v.repesca);
          const piso = pisoDeCuadro(c.grupos);
          const enElPiso = estaEnElPiso(c.grupos, v.pasan, v.repesca);
          const explicacion = explicarCuadro(c.grupos, v.pasan, v.repesca);
          const bloqueada = c.situacion === 'bloqueada';

          return (
            <View key={c.id} style={s.tarjeta}>
              <View style={s.cabecera}>
                <Text style={s.catNombre}>{c.nombre}</Text>
                <Text style={s.catGrupos}>
                  {c.grupos} {c.grupos === 1 ? 'grupo' : 'grupos'}
                </Text>
              </View>

              {/* Situación 3: se dice por qué, no con un error técnico. */}
              {bloqueada ? (
                <Text style={s.bloqueada}>
                  El cuadro de esta categoría ya tiene {c.jugados}{' '}
                  {c.jugados === 1 ? 'resultado capturado' : 'resultados capturados'}.
                  Cambiar los clasificados obligaría a borrar partidos que ya se
                  jugaron, y eso destruye un dato cierto: lo que pasó en la cancha.
                  Aquí ya no se toca.
                </Text>
              ) : (
                <>
                  <Perilla
                    etiqueta="Pasan por grupo"
                    valor={v.pasan}
                    minimo={1}
                    onMenos={() => mover(c, 'pasan', -1)}
                    onMas={() => mover(c, 'pasan', +1)}
                  />
                  <Perilla
                    etiqueta="Repescados"
                    valor={v.repesca}
                    minimo={0}
                    onMenos={() => mover(c, 'repesca', -1)}
                    onMas={() => mover(c, 'repesca', +1)}
                  />

                  {/* EN VIVO: clasificados, ronda, byes y el piso. */}
                  <View style={s.cuenta}>
                    <Text style={s.cuentaNumero}>{cuadro.clasificados}</Text>
                    <Text style={s.cuentaTexto}>
                      clasificados · {cuadro.nombreRonda}
                      {cuadro.byes > 0
                        ? ` con ${cuadro.byes} ${cuadro.byes === 1 ? 'bye' : 'byes'}`
                        : ' sin byes'}
                    </Text>
                  </View>
                  {explicacion && <Text style={s.explicacion}>{explicacion}</Text>}
                  {!enElPiso && (
                    <Text style={s.piso}>
                      Piso con {c.grupos} {c.grupos === 1 ? 'grupo' : 'grupos'}:{' '}
                      {piso.nombreRonda} ({piso.clasificados} clasificados). Por
                      debajo de eso hay que armar menos grupos.
                    </Text>
                  )}

                  {/* Situación 2: se avisa ANTES de tocar nada. */}
                  {c.situacion === 'resembrar' && cambiada(c) && (
                    <Text style={s.aviso}>
                      Esta categoría ya tiene el cuadro sembrado ({c.cuadro} partidos,
                      ninguno jugado). Guardar lo borra y lo vuelve a sembrar con el
                      número nuevo.
                    </Text>
                  )}

                  {confirmar === c.id ? (
                    <View style={s.confirmar}>
                      <Text style={s.confirmarTexto}>
                        Se van a borrar los {c.cuadro} partidos del cuadro de{' '}
                        {c.nombre} y se sembrará uno nuevo. ¿Seguimos?
                      </Text>
                      <View style={s.confirmarBotones}>
                        <Pressable
                          onPress={() => setConfirmar(null)}
                          style={s.btnFantasma}
                          accessibilityRole="button"
                        >
                          <Text style={s.btnFantasmaTexto}>Cancelar</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void guardar(c, true)}
                          style={s.btnPeligro}
                          accessibilityRole="button"
                        >
                          <Text style={s.btnPeligroTexto}>Borrar y resembrar</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => void guardar(c, false)}
                      disabled={!cambiada(c) || guardando === c.id}
                      style={[s.btn, (!cambiada(c) || guardando === c.id) && s.btnOff]}
                      accessibilityRole="button"
                      accessibilityLabel={`Guardar clasificados de ${c.nombre}`}
                      accessibilityState={{ disabled: !cambiada(c) }}
                    >
                      {guardando === c.id
                        ? <ActivityIndicator color={color.onGold} />
                        : (
                          <Text style={cambiada(c) ? s.btnTexto : s.btnTextoOff}>
                            {cambiada(c)
                              ? 'Guardar y reprogramar →'
                              : `Sin cambios · ${c.pasan} por grupo + ${c.repesca} de repesca`}
                          </Text>
                        )}
                    </Pressable>
                  )}
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

/** − valor + . Botones grandes: esto se toca con el torneo en marcha. */
function Perilla({
  etiqueta, valor, minimo, onMenos, onMas,
}: {
  etiqueta: string; valor: number; minimo: number;
  onMenos: () => void; onMas: () => void;
}) {
  return (
    <View style={s.perilla}>
      <Text style={s.perillaEtiqueta}>{etiqueta}</Text>
      <View style={s.perillaControles}>
        <Pressable
          onPress={onMenos}
          disabled={valor <= minimo}
          style={[s.perillaBoton, valor <= minimo && s.perillaBotonOff]}
          accessibilityRole="button"
          accessibilityLabel={`Bajar ${etiqueta}`}
        >
          <Text style={s.perillaSigno}>−</Text>
        </Pressable>
        <Text style={s.perillaValor}>{valor}</Text>
        <Pressable
          onPress={onMas}
          style={s.perillaBoton}
          accessibilityRole="button"
          accessibilityLabel={`Subir ${etiqueta}`}
        >
          <Text style={s.perillaSigno}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla:   { flex: 1, backgroundColor: color.bg },
  centro:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenido:  { ...webContentColumn, padding: space[4], paddingBottom: bottomInset, gap: space[3] },
  eyebrow:    { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 1.2, textTransform: 'uppercase' },
  titulo:     { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[1] },
  entradilla: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  vacio:      { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },
  error:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 18 },
  ok:         { fontFamily: font.body, fontSize: fontSize.caption, color: color.live, lineHeight: 18 },

  tarjeta:    { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.lg, padding: space[4], gap: space[3] },
  cabecera:   { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  catNombre:  { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  catGrupos:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  bloqueada:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  perilla:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  perillaEtiqueta: { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  perillaControles: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  perillaBoton: { width: touchTarget, height: touchTarget, borderRadius: radius.sm, borderWidth: 1, borderColor: color.goldMuted, alignItems: 'center', justifyContent: 'center' },
  perillaBotonOff: { opacity: 0.35 },
  perillaSigno: { fontFamily: font.display, fontSize: 20, color: color.gold },
  perillaValor: { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright, minWidth: 32, textAlign: 'center' },

  cuenta:     { flexDirection: 'row', alignItems: 'baseline', gap: space[2], borderTopWidth: 1, borderTopColor: color.lineSoft, paddingTop: space[3] },
  cuentaNumero: { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright },
  cuentaTexto:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.text, flex: 1 },
  explicacion:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  piso:         { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18 },
  aviso:        { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 18 },

  confirmar:       { backgroundColor: 'rgba(224,114,111,0.10)', borderWidth: 1, borderColor: 'rgba(224,114,111,0.25)', borderRadius: radius.md, padding: space[3], gap: space[3] },
  confirmarTexto:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.text, lineHeight: 18 },
  confirmarBotones:{ flexDirection: 'row', gap: space[2] },
  btnFantasma:     { flex: 1, minHeight: touchTarget, borderRadius: radius.sm, borderWidth: 1, borderColor: color.lineSoft, alignItems: 'center', justifyContent: 'center' },
  btnFantasmaTexto:{ fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  btnPeligro:      { flex: 2, minHeight: touchTarget, borderRadius: radius.sm, backgroundColor: color.danger, alignItems: 'center', justifyContent: 'center' },
  btnPeligroTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.bg },

  btn:        { backgroundColor: color.gold, borderWidth: 1, borderColor: color.gold, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[3] },
  btnOff:     { backgroundColor: 'transparent', borderColor: color.goldMuted },
  btnTexto:   { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.onGold },
  btnTextoOff:{ fontFamily: font.body, fontSize: fontSize.caption, color: color.goldMuted, textAlign: 'center' },
});
