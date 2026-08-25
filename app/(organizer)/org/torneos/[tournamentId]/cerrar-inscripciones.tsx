/**
 * RALLY · Cerrar inscripciones
 *
 * TRES CAMBIOS SOBRE LA VERSIÓN ANTERIOR
 *
 * 1. DORADO, NO ROJO. Esto no destruye nada: genera los grupos y los partidos.
 *    En `registration_open` es LA acción principal del torneo.
 *
 * 2. VISTA PREVIA ANTES DE PULSAR. `computeFormat` es puro y determinista —
 *    solo importa tipos, cero I/O — así que se ejecuta aquí mismo y enseña la
 *    estructura exacta que va a generar el servidor. Misma entrada, misma
 *    salida: no hay divergencia posible con lo que ejecutará la Edge Function,
 *    que llama a la misma función.
 *
 * 3. POR CATEGORÍA, NO TODO O NADA. El backend siempre lo permitió: la Edge
 *    Function recibe `category_id` (una sola) y la RPC es
 *    close_registration_for_category. Lo de "todo o nada" era solo esta
 *    pantalla. Desde la migración 035, además, el torneo pasa a 'in_progress'
 *    solo al cerrar la ÚLTIMA categoría abierta, así que las que se dejan
 *    abiertas siguen aceptando inscripciones.
 *
 * LO MÁS IMPORTANTE DE LA PANTALLA
 *   `close-registration` solo cuenta parejas con payment_status en
 *   (paid_online, paid_offline, comp). Las 'pending' NO entran al cuadro y hoy
 *   desaparecían en silencio. Aquí se avisa en grande, por categoría.
 *
 * CATEGORÍAS VACÍAS
 *   Una categoría con <2 parejas no se puede cerrar, y desde la 035 mantiene el
 *   torneo en 'registration_open' — lo que impide terminarlo semanas después
 *   (finish_tournament exige 'in_progress'). Avisar no basta: el problema
 *   aparece mucho más tarde. Por eso se puede QUITAR aquí mismo. El trigger de
 *   la migración 033 protege el borrado con pagos, así que una vacía es segura.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import { computeFormat, type FormatPlan } from '@/lib/engine/format';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

// ── Modelo ──────────────────────────────────────────────────────────────────

/**
 * Los tres estados que SÍ cuentan para el cuadro. Espejo de close-registration.
 *
 * `as const` no es cosmético: sin él TS lo infiere como string[] y el .in() del
 * cliente tipado lo rechaza — espera los valores del enum payment_status.
 */
const PAGADAS = ['paid_online', 'paid_offline', 'comp'] as const;

type EstadoCategoria =
  | 'lista'        // >= 2 pagadas, plan no ambiguo
  | 'ambigua'      // >= 2 pagadas, pero el formato admite dos lecturas
  | 'faltan'       // 1 pagada
  | 'vacia'        // 0 pagadas
  | 'cerrada';     // status <> 'open'

interface Categoria {
  id:          string;
  nombre:      string;
  status:      string;
  pagadas:     number;
  pendientes:  number;
  estado:      EstadoCategoria;
  plan:        FormatPlan | null;
  /** Alternativa elegida cuando el plan es ambiguo. */
  alternativa: number;
}

// ── Presentación del plan ───────────────────────────────────────────────────

const RONDA: Record<string, string> = {
  final: 'final directa', semi: 'semifinales', quarter: 'cuartos de final',
  r16: 'octavos', r32: 'ronda de 32',
};

/** Agrupa tamaños repetidos: [4,4,3,3] -> "2 grupos de 4 y 2 de 3". */
function describirGrupos(tam: number[]): string {
  if (tam.length === 1) return `Todos contra todos (${tam[0]} parejas)`;

  // Cuenta cuántos grupos hay de cada tamaño, conservando el orden de aparición.
  const conteo: Array<{ tamano: number; n: number }> = [];
  for (const t of tam) {
    const ya = conteo.find((c) => c.tamano === t);
    if (ya) ya.n++; else conteo.push({ tamano: t, n: 1 });
  }

  const trozos = conteo.map((c, i) =>
    c.n === 1
      ? (i === 0 ? `un grupo de ${c.tamano}` : `otro de ${c.tamano}`)
      : (i === 0 ? `${c.n} grupos de ${c.tamano}` : `${c.n} de ${c.tamano}`),
  );

  return trozos.length === 1 ? trozos[0] : `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}`;
}

/** "2 grupos de 4 · pasan 2 por grupo · semifinales" */
function describirPlan(plan: FormatPlan): string {
  const grupos = describirGrupos(plan.groupSizes);
  const unSoloGrupo = plan.groupSizes.length === 1;
  const ronda = RONDA[plan.knockoutStart] ?? plan.knockoutStart;

  const extra = plan.bestExtraQualifiers > 0
    ? ` + ${plan.bestExtraQualifiers} mejor${plan.bestExtraQualifiers > 1 ? 'es' : ''} tercero${plan.bestExtraQualifiers > 1 ? 's' : ''}`
    : '';

  // Sin nadie que avance no hay fase final que anunciar.
  if (plan.advancePerGroup === 0 && !extra) return `${grupos} · sin fase final`;

  // Con un solo grupo, "por grupo" sobra: se pasa directo a la ronda.
  return unSoloGrupo
    ? `${grupos} · pasan ${plan.advancePerGroup}${extra} a la ${ronda}`
    : `${grupos} · pasan ${plan.advancePerGroup} por grupo${extra} · ${ronda}`;
}

/** Grupos de tamaño desigual: quien esté en el grande juega un partido más. */
function avisoDesigual(plan: FormatPlan): string | null {
  const t = plan.groupSizes;
  if (t.length < 2) return null;
  const max = Math.max(...t), min = Math.min(...t);
  if (max === min) return null;
  return `Un grupo de ${max} y otro de ${min}: el de ${max} juega un partido más.`;
}

function clasificar(pagadas: number, status: string, plan: FormatPlan | null): EstadoCategoria {
  if (status !== 'open') return 'cerrada';
  if (pagadas === 0) return 'vacia';
  if (pagadas < 2)   return 'faltan';
  return plan?.ambiguous ? 'ambigua' : 'lista';
}

const ETIQUETA: Record<EstadoCategoria, { texto: string; tinte: string }> = {
  lista:   { texto: 'LISTA',              tinte: color.live      },
  ambigua: { texto: 'DECIDE EL FORMATO',  tinte: color.alive     },
  faltan:  { texto: 'FALTA 1 PAREJA',     tinte: color.alive     },
  vacia:   { texto: 'VACÍA',              tinte: color.muted     },
  cerrada: { texto: 'CERRADA',            tinte: color.champagne },
};

// ── Pantalla ────────────────────────────────────────────────────────────────

type Fase =
  | { t: 'cargando' }
  | { t: 'lista' }
  | { t: 'confirmando' }
  | { t: 'cerrando'; hecho: number; total: number; actual: string }
  | { t: 'resultado'; cerradas: string[]; fallo: { nombre: string; motivo: string } | null };

export default function CerrarInscripcionesScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombre, setNombre]         = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [marcadas, setMarcadas]     = useState<Set<string>>(new Set());
  const [fase, setFase]             = useState<Fase>({ t: 'cargando' });
  const [error, setError]           = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data: cats }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase.from('categories').select('id, display_name, status')
        .eq('tournament_id', tournamentId).order('division'),
    ]);

    if (t) setNombre((t as { name: string }).name);

    const filas = (cats ?? []) as Array<{ id: string; display_name: string; status: string }>;

    const conConteos: Categoria[] = await Promise.all(filas.map(async (c) => {
      const [{ count: pagadas }, { count: pendientes }] = await Promise.all([
        supabase.from('pairs').select('id', { count: 'exact', head: true })
          .eq('category_id', c.id).in('payment_status', PAGADAS),
        supabase.from('pairs').select('id', { count: 'exact', head: true })
          .eq('category_id', c.id).eq('payment_status', 'pending'),
      ]);

      const n = pagadas ?? 0;
      // computeFormat lanza con menos de 2: hay que cortar antes.
      const plan = n >= 2 ? computeFormat(n) : null;

      return {
        id: c.id, nombre: c.display_name, status: c.status,
        pagadas: n, pendientes: pendientes ?? 0,
        estado: clasificar(n, c.status, plan),
        plan, alternativa: 0,
      };
    }));

    setCategorias(conConteos);
    // Por defecto van marcadas las que se pueden cerrar.
    setMarcadas(new Set(
      conConteos.filter((c) => c.estado === 'lista' || c.estado === 'ambigua').map((c) => c.id),
    ));
    setFase({ t: 'lista' });
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const cerrables = useMemo(
    () => categorias.filter((c) => marcadas.has(c.id)),
    [categorias, marcadas],
  );
  const vacias = useMemo(() => categorias.filter((c) => c.estado === 'vacia'), [categorias]);
  const pendientesTotal = useMemo(
    () => cerrables.reduce((n, c) => n + c.pendientes, 0),
    [cerrables],
  );
  const abiertasTrasCerrar = useMemo(
    () => categorias.filter((c) => c.status === 'open' && !marcadas.has(c.id)).length,
    [categorias, marcadas],
  );

  function alternar(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function elegirAlternativa(id: string, idx: number) {
    setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, alternativa: idx } : c)));
  }

  /** Quitar una categoría vacía sin salir de aquí. Ver cabecera. */
  async function quitarVacia(c: Categoria) {
    setError(null);
    const { error: dbError } = await supabase.from('categories').delete().eq('id', c.id);
    if (dbError) {
      setError(`No se pudo quitar ${c.nombre}. Intenta de nuevo.`);
      return;
    }
    await cargar();
  }

  /** El plan efectivo: la alternativa elegida si era ambigua. */
  function planDe(c: Categoria): FormatPlan | null {
    if (!c.plan) return null;
    if (!c.plan.ambiguous) return c.plan;
    const opciones = [c.plan, ...(c.plan.alternatives ?? [])];
    return opciones[c.alternativa] ?? c.plan;
  }

  async function cerrar() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Tu sesión expiró. Vuelve a entrar.'); return; }

    const cerradas: string[] = [];

    for (let i = 0; i < cerrables.length; i++) {
      const c = cerrables[i];
      setFase({ t: 'cerrando', hecho: i, total: cerrables.length, actual: c.nombre });

      try {
        const res = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/close-registration`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
            },
            body: JSON.stringify({ category_id: c.id, chosen_format: planDe(c) }),
          },
        );

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          // Las anteriores YA quedaron cerradas: la RPC es atómica por
          // categoría, no entre categorías. Hay que decirlo tal cual.
          setFase({
            t: 'resultado',
            cerradas,
            fallo: { nombre: c.nombre, motivo: traducir(json?.error) },
          });
          return;
        }

        cerradas.push(c.nombre);
      } catch {
        setFase({
          t: 'resultado',
          cerradas,
          fallo: { nombre: c.nombre, motivo: 'Sin conexión con el servidor.' },
        });
        return;
      }
    }

    setFase({ t: 'resultado', cerradas, fallo: null });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (fase.t === 'cargando') {
    return <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>;
  }

  if (fase.t === 'cerrando') {
    return (
      <View style={s.cargando}>
        <ActivityIndicator color={color.gold} size="large" />
        <Text style={s.cerrandoTexto}>
          Cerrando {fase.actual}…{'\n'}({fase.hecho + 1} de {fase.total})
        </Text>
      </View>
    );
  }

  if (fase.t === 'resultado') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.eyebrow}>{fase.fallo ? 'CERRADO A MEDIAS' : 'LISTO'}</Text>
          <Text style={s.title}>
            {fase.fallo ? 'Algunas categorías no se cerraron' : 'Cuadros generados'}
          </Text>

          {fase.cerradas.length > 0 && (
            <View style={s.resumenOk}>
              <Text style={s.resumenTitulo}>
                Se cerraron {fase.cerradas.length} {fase.cerradas.length === 1 ? 'categoría' : 'categorías'}
              </Text>
              {fase.cerradas.map((n) => (
                <Text key={n} style={s.resumenLinea}>· {n}</Text>
              ))}
            </View>
          )}

          {fase.fallo && (
            <View style={s.resumenFallo}>
              <Text style={s.resumenFalloTitulo}>{fase.fallo.nombre} no se cerró</Text>
              <Text style={s.resumenLinea}>{fase.fallo.motivo}</Text>
              <Text style={s.resumenLinea}>
                Las anteriores sí quedaron cerradas. Puedes reintentar esta desde aquí.
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.btnDorado, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Text style={s.btnDoradoTexto}>Volver al torneo</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const puedeCerrar = cerrables.length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombre || 'Torneo'} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>SIGUIENTE PASO</Text>
        <Text style={s.title}>Cerrar inscripciones</Text>
        <Text style={s.bajada}>
          Al cerrar una categoría se generan sus grupos y sus partidos. Los
          jugadores ya no podrán inscribirse en ella. Las que dejes abiertas
          siguen aceptando parejas.
        </Text>

        {categorias.map((c) => {
          const et       = ETIQUETA[c.estado];
          const marcada  = marcadas.has(c.id);
          const activable = c.estado === 'lista' || c.estado === 'ambigua';
          const plan     = planDe(c);
          const desigual = plan ? avisoDesigual(plan) : null;

          return (
            <View key={c.id} style={[s.tarjeta, marcada && s.tarjetaMarcada]}>
              <Pressable
                onPress={() => activable && alternar(c.id)}
                disabled={!activable}
                style={s.tarjetaCabecera}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marcada, disabled: !activable }}
                accessibilityLabel={c.nombre}
              >
                <View style={[s.check, marcada && s.checkMarcado, !activable && s.checkInerte]}>
                  {marcada && <Icon name="check" size={12} color={color.bg} width={2.5} />}
                </View>

                <Text style={[s.nombre, !activable && s.nombreInerte]}>{c.nombre}</Text>
                <Text style={[s.etiqueta, { color: et.tinte }]}>{et.texto}</Text>
              </Pressable>

              <View style={s.tarjetaCuerpo}>
                <Text style={s.conteo}>
                  {c.pagadas === 0
                    ? 'Sin parejas inscritas'
                    : `${c.pagadas} ${c.pagadas === 1 ? 'pareja pagada' : 'parejas pagadas'}`}
                </Text>

                {/* Lo más valioso de la pantalla: hoy estas parejas
                    desaparecen del cuadro sin que nadie se entere. */}
                {c.pendientes > 0 && (
                  <View style={s.avisoPago}>
                    <Text style={s.avisoPagoTitulo}>
                      {c.pendientes} {c.pendientes === 1 ? 'pareja no ha pagado' : 'parejas no han pagado'}
                    </Text>
                    <Text style={s.avisoPagoCuerpo}>
                      {c.pendientes === 1 ? 'Quedará fuera' : 'Quedarán fuera'} del cuadro. Cobra
                      o regístra{c.pendientes === 1 ? 'la' : 'las'} a mano antes de cerrar.
                    </Text>
                  </View>
                )}

                {plan && <Text style={s.estructura}>── {describirPlan(plan)}</Text>}
                {desigual && <Text style={s.desigual}>{desigual}</Text>}

                {c.estado === 'faltan' && (
                  <Text style={s.faltan}>Se necesitan 2 parejas pagadas para poder cerrar.</Text>
                )}

                {/* Alternativas del plan ambiguo */}
                {c.estado === 'ambigua' && c.plan && (
                  <View style={s.alternativas}>
                    {[c.plan, ...(c.plan.alternatives ?? [])].map((alt, i) => (
                      <Pressable
                        key={i}
                        onPress={() => elegirAlternativa(c.id, i)}
                        style={s.alternativa}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: c.alternativa === i }}
                      >
                        <View style={[s.radio, c.alternativa === i && s.radioActivo]} />
                        <Text style={s.alternativaTexto}>{describirPlan(alt)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Quitar la vacía aquí mismo: si solo se avisa, el problema
                    reaparece semanas después al intentar terminar el torneo. */}
                {c.estado === 'vacia' && (
                  <Pressable
                    onPress={() => quitarVacia(c)}
                    style={({ pressed }) => [s.quitar, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${c.nombre}`}
                  >
                    <Text style={s.quitarTexto}>Quitar categoría</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        {vacias.length > 0 && (
          <Text style={s.notaVacias}>
            Una categoría vacía sin quitar mantiene el torneo abierto y te
            impedirá terminarlo más adelante.
          </Text>
        )}

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={() => setFase({ t: 'confirmando' })}
          disabled={!puedeCerrar}
          style={({ pressed }) => [
            s.btnDorado, !puedeCerrar && s.btnInactivo, pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !puedeCerrar }}
        >
          <Text style={[s.btnDoradoTexto, !puedeCerrar && s.btnTextoInactivo]}>
            {!puedeCerrar
              ? 'Elige al menos una categoría'
              : cerrables.length === 1
                ? `Cerrar ${cerrables[0].nombre}`
                : `Cerrar ${cerrables.length} categorías`}
          </Text>
        </Pressable>
      </ScrollView>

      {/* ── Confirmación ─────────────────────────────────────── */}
      {fase.t === 'confirmando' && (
        <View style={s.overlay}>
          <View style={s.dialogo}>
            <Text style={s.dialogoTitulo}>
              {cerrables.length === 1
                ? `¿Cerrar ${cerrables[0].nombre}?`
                : `¿Cerrar ${cerrables.length} categorías?`}
            </Text>

            <Text style={s.dialogoCuerpo}>
              Se generan los grupos y los partidos de {cerrables.map((c) => c.nombre).join(', ')}.
            </Text>

            {pendientesTotal > 0 && (
              <Text style={s.dialogoAviso}>
                {pendientesTotal} {pendientesTotal === 1 ? 'pareja sin pagar quedará fuera' : 'parejas sin pagar quedarán fuera'} del cuadro.
              </Text>
            )}

            <Text style={s.dialogoCuerpo}>
              {abiertasTrasCerrar > 0
                ? `Quedan ${abiertasTrasCerrar} ${abiertasTrasCerrar === 1 ? 'categoría abierta' : 'categorías abiertas'}: siguen aceptando inscripciones.`
                : 'Era la última categoría abierta, así que el torneo pasa a "En curso".'}
            </Text>

            <View style={s.dialogoBotones}>
              <Pressable
                onPress={() => setFase({ t: 'lista' })}
                style={s.dialogoCancelar}
                accessibilityRole="button"
              >
                <Text style={s.dialogoCancelarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={cerrar}
                style={s.dialogoConfirmar}
                accessibilityRole="button"
                accessibilityLabel="Cerrar y generar cuadros"
              >
                <Text style={s.dialogoConfirmarTexto}>Cerrar y generar cuadros</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

/** Códigos de close-registration a lenguaje de organizador. */
function traducir(codigo: unknown): string {
  const c = typeof codigo === 'string' ? codigo : '';
  if (c === 'not_enough_pairs')  return 'No llega a 2 parejas pagadas.';
  if (c === 'forbidden')         return 'No tienes permiso sobre este torneo.';
  if (c === 'category_not_found') return 'La categoría ya no existe.';
  return 'No se pudo cerrar. Intenta de nuevo.';
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  cargando: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space[5] },
  cerrandoTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', lineHeight: 20 },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  bajada:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[1] },

  tarjeta:        { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, overflow: 'hidden' },
  tarjetaMarcada: { borderColor: color.gold },
  tarjetaCabecera:{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], minHeight: touchTarget },
  tarjetaCuerpo:  { paddingHorizontal: space[4], paddingBottom: space[3], gap: space[2] },

  check:        { width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1.5, borderColor: color.lineSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkMarcado: { backgroundColor: color.gold, borderColor: color.gold },
  checkInerte:  { opacity: 0.3 },

  nombre:       { flex: 1, minWidth: 0, fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  nombreInerte: { color: color.muted },
  etiqueta:     { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', letterSpacing: 0.5, flexShrink: 0 },

  conteo:     { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  estructura: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18 },
  desigual:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },
  faltan:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 17 },

  avisoPago:       { backgroundColor: 'rgba(230,180,80,0.10)', borderWidth: 1, borderColor: color.alive, borderRadius: radius.sm, padding: space[3], gap: 3 },
  avisoPagoTitulo: { fontFamily: font.display, fontSize: fontSize.body, fontWeight: '600', color: color.alive },
  avisoPagoCuerpo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  alternativas:    { gap: space[2], marginTop: space[1] },
  alternativa:     { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget },
  radio:           { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.lineSoft, flexShrink: 0 },
  radioActivo:     { borderColor: color.gold, backgroundColor: color.gold },
  alternativaTexto:{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: fontSize.caption, color: color.text, lineHeight: 18 },

  quitar:      { alignSelf: 'flex-start', minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: space[3], borderWidth: 1, borderColor: 'rgba(224,114,111,0.30)', borderRadius: radius.sm },
  quitarTexto: { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.danger },

  notaVacias: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 18 },
  error:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btnDorado:        { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: space[2] },
  btnInactivo:      { backgroundColor: color.surface2, borderColor: color.line },
  btnDoradoTexto:   { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
  btnTextoInactivo: { color: color.muted },

  resumenOk:         { backgroundColor: color.surface, borderWidth: 1, borderColor: color.live, borderRadius: radius.md, padding: space[4], gap: space[1] },
  resumenFallo:      { backgroundColor: 'rgba(224,114,111,0.10)', borderWidth: 1, borderColor: color.danger, borderRadius: radius.md, padding: space[4], gap: space[1] },
  resumenTitulo:     { fontFamily: font.display, fontSize: fontSize.cardName, color: color.live },
  resumenFalloTitulo:{ fontFamily: font.display, fontSize: fontSize.cardName, color: color.danger },
  resumenLinea:      { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,6,8,0.82)', alignItems: 'center', justifyContent: 'center', padding: space[4.5] },
  dialogo: { width: '100%', maxWidth: 420, backgroundColor: color.surface, borderWidth: 1, borderColor: color.gold, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  dialogoTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, fontWeight: '600', color: color.text },
  dialogoCuerpo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  dialogoAviso:  { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.alive, lineHeight: 18 },
  dialogoBotones:{ flexDirection: 'row', gap: space[2], marginTop: space[2] },
  dialogoCancelar:      { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.sm },
  dialogoCancelarTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  dialogoConfirmar:     { flex: 2, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', backgroundColor: color.gold, borderRadius: radius.sm },
  dialogoConfirmarTexto:{ fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.onGold },
});
