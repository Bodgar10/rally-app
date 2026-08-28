/**
 * RALLY · Calendario del último día
 *
 * EL HUECO QUE LLENA
 *   El scheduler producía un calendario y nadie podía verlo. El panel del
 *   organizador tenía doce pantallas y ninguna listaba partidos: las únicas
 *   listas eran la del juez (para capturar resultados) y las del jugador. El
 *   organizador, que es quien decide a qué hora se juega, no tenía dónde
 *   mirarlo.
 *
 * LOS EMPALMES SON EL MOTIVO REAL
 *   En el Cimepa real, Santiago Cantillo tenía semifinal de 2ª y final de 3ª
 *   a las 17:00 del mismo domingo. Es una PERSONA en dos categorías con
 *   parejas distintas, y el scheduler razona en parejas por categoría: no lo
 *   ve. En octavos y cuartos el motor separa a las categorías hermanadas; en
 *   semifinales y finales no, porque retrasar el torneo entero para proteger
 *   un caso que quizá no ocurra perjudica a 165 parejas por una.
 *
 *   Así que aquí no se bloquea nada. Se informa y decide el humano: quién
 *   espera, o si alguien pierde por default.
 *
 * DOS FUENTES DE AVISO
 *   · REALES: dos partidos del mismo jugador a la misma hora. Solo existen
 *     cuando ya hay parejas asignadas, y son certezas.
 *   · DE RIESGO: dos categorías que comparten jugadores tienen ronda a la
 *     misma hora. Salen del motor (`empalmes`) y existen desde antes de que
 *     se sepa quién clasifica. Son avisos de que PUEDE pasar.
 *
 *   Los reales van primero: una certeza pesa más que una probabilidad.
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
import HorasUltimoDia from '@/components/tournament/HorasUltimoDia';
import { fetchParejasPublicas, type ParejaPublica } from '@/lib/parejas-publicas';
import {
  programarEliminatorias,
  type CategoriaCuadro,
} from '@/lib/engine/schedule/knockout';
import { parseFechaISO, indiceLunes } from '@/lib/fechas';

// ── Presentación ────────────────────────────────────────────────────────────

const ETAPA: Record<string, string> = {
  round_of_32: 'ronda de 32',
  round_of_16: 'octavos',
  quarter:     'cuartos',
  semi:        'semifinal',
  final:       'final',
  third_place: '3.er lugar',
};

const DIAS_LARGOS = [
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
] as const;

function nombreDelDia(iso: string): string {
  const d = parseFechaISO(iso);
  return d ? DIAS_LARGOS[indiceLunes(d)] : '';
}

/** '2026-09-13T14:00:00-06:00' → '14:00', en la zona del propio timestamp. */
function horaDe(iso: string): string {
  // Se lee del texto y no con Date: el timestamptz viene con su offset (-06:00)
  // y convertirlo a la zona del dispositivo movería la hora para quien abra la
  // pantalla desde otro huso. La hora del torneo es la del club.
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : '—';
}

// ── Modelo ──────────────────────────────────────────────────────────────────

interface Fila {
  id: string | null;          // id del match, si la fila ya existe
  categoria: string;
  etapa: string;
  cancha: string;
  hora: string;
  parejaA: string | null;
  parejaB: string | null;
  jugadores: string[];        // ids, para detectar choques reales
}

interface EmpalmeReal {
  jugador: string;
  hora: string;
  detalle: string;
}

interface Riesgo {
  texto: string;
}

interface Estado {
  dia: string;
  diaISO: string;
  cierre: string;
  minutos: number;
  fin: string | null;
  finRealista: string | null;
  seVaDeHora: boolean;
  franjas: { hora: string; filas: Fila[] }[];
  reales: EmpalmeReal[];
  riesgos: Riesgo[];
  sinPlan: boolean;
}

// ── Pantalla ────────────────────────────────────────────────────────────────

type Fase =
  | { t: 'cargando' }
  | { t: 'lista' }
  | { t: 'programando' }
  | { t: 'noCabe'; mensaje: string; avisos: string[] };

export default function CalendarioScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();

  const [estado, setEstado] = useState<Estado | null>(null);
  const [fase, setFase]     = useState<Fase>({ t: 'cargando' });
  const [error, setError]   = useState<string | null>(null);
  const [nombre, setNombre] = useState('');

  const cargar = useCallback(async () => {
    setError(null);

    const [{ data: t }, { data: ws }, { data: cats }] = await Promise.all([
      supabase.from('tournaments')
        .select('name, courts, match_minutes').eq('id', tournamentId).maybeSingle(),
      supabase.from('tournament_windows')
        .select('dia, desde, hasta').eq('tournament_id', tournamentId).order('dia'),
      supabase.from('categories')
        .select('id, display_name, num_groups, advance_per_group, best_extra_qualifiers')
        .eq('tournament_id', tournamentId),
    ]);

    if (t) setNombre(t.name);

    const ventanas = ws ?? [];
    if (ventanas.length === 0) {
      setEstado(null);
      setFase({ t: 'lista' });
      return;
    }
    const ventana = ventanas[ventanas.length - 1];
    const cierre  = ventana.hasta.slice(0, 5);
    const minutos = t?.match_minutes ?? 60;

    const nombreCat = new Map(
      (cats ?? []).map((c) => [c.id, c.display_name]),
    );

    // ── El plan guardado y los partidos que ya existen ──────────────────────
    // `match_schedule` cubre TODAS las rondas, incluidas las que aún no tienen
    // fila en `matches` (el cuadro se materializa ronda a ronda). `matches`
    // aporta las parejas, que es lo que convierte un riesgo en una certeza.
    const [{ data: plan }, { data: partidos }] = await Promise.all([
      supabase.from('match_schedule')
        .select('category_id, stage, slot_index, scheduled_at, court_label')
        .eq('tournament_id', tournamentId)
        .order('scheduled_at'),
      supabase.from('matches')
        .select('id, category_id, stage, round_label, scheduled_at, court_label, pair_a_id, pair_b_id, status')
        .eq('tournament_id', tournamentId)
        .neq('stage', 'group')
        .not('scheduled_at', 'is', null),
    ]);

    const parejas = await fetchParejasPublicas(
      (partidos ?? []).flatMap((m) => [m.pair_a_id, m.pair_b_id]),
    );

    // Los partidos reales mandan sobre el plan: si el organizador movió uno a
    // mano, `matches.scheduled_at` es la verdad y `match_schedule` el plan
    // original. Se indexan por (categoría, etapa) para no pintarlos dos veces.
    const yaReales = new Set(
      (partidos ?? []).map((m) => `${m.category_id}#${m.stage}`),
    );

    const filas: Fila[] = [];

    for (const m of partidos ?? []) {
      const pa = m.pair_a_id ? parejas.get(m.pair_a_id) : undefined;
      const pb = m.pair_b_id ? parejas.get(m.pair_b_id) : undefined;
      filas.push({
        id: m.id,
        categoria: nombreCat.get(m.category_id) ?? '—',
        etapa: ETAPA[m.stage] ?? m.stage,
        cancha: m.court_label ?? '—',
        hora: horaDe(m.scheduled_at!),
        parejaA: nombreDe(pa),
        parejaB: nombreDe(pb),
        jugadores: [pa, pb].flatMap(idsDe),
      });
    }

    for (const p of plan ?? []) {
      if (yaReales.has(`${p.category_id}#${p.stage}`)) continue;   // ya pintado arriba
      filas.push({
        id: null,
        categoria: nombreCat.get(p.category_id) ?? '—',
        etapa: ETAPA[p.stage] ?? p.stage,
        cancha: p.court_label,
        hora: horaDe(p.scheduled_at),
        parejaA: null,
        parejaB: null,
        jugadores: [],
      });
    }

    // ── Empalmes REALES: un jugador con dos partidos a la misma hora ────────
    const porJugadorHora = new Map<string, Fila[]>();
    for (const f of filas) {
      for (const j of f.jugadores) {
        const k = `${j}#${f.hora}`;
        const ya = porJugadorHora.get(k);
        if (ya) ya.push(f); else porJugadorHora.set(k, [f]);
      }
    }
    const nombrePorId = new Map<string, string>();
    for (const p of parejas.values()) {
      nombrePorId.set(p.player1_id, p.player1_name);
      nombrePorId.set(p.player2_id, p.player2_name);
    }

    const reales: EmpalmeReal[] = [];
    for (const [k, choque] of porJugadorHora) {
      if (choque.length < 2) continue;
      const [jugadorId, hora] = k.split('#');
      reales.push({
        jugador: nombrePorId.get(jugadorId) ?? 'Un jugador',
        hora,
        detalle: choque.map((c) => `${c.etapa} de ${c.categoria}`).join(' y '),
      });
    }
    reales.sort((a, b) => a.hora.localeCompare(b.hora) || a.jugador.localeCompare(b.jugador));

    // ── Riesgos: lo que dice el motor sobre categorías hermanadas ───────────
    // Se recalcula aquí porque `empalmes` no se persiste: es barato (el motor
    // es puro) y así refleja los clasificados actuales.
    const riesgos = calcularRiesgos(cats ?? [], nombreCat, {
      canchas: t?.courts ?? 0,
      desde: ventana.desde.slice(0, 5),
      hasta: cierre,
      minutos,
    });

    // ── Horas del día ──────────────────────────────────────────────────────
    let fin: string | null = null;
    let finRealista: string | null = null;
    if (t?.courts) {
      const cuadros = cuadrosDe(cats ?? []);
      if (cuadros.length > 0) {
        try {
          const r = programarEliminatorias({
            canchas: t.courts, desde: ventana.desde.slice(0, 5), hasta: cierre,
            categorias: cuadros, minutosPorPartido: minutos,
          });
          fin = r.cabe ? r.finEstimado : null;
          finRealista = r.finRealista;
        } catch { /* capacidad imposible: se queda sin horas */ }
      }
    }

    setEstado({
      dia: nombreDelDia(ventana.dia),
      diaISO: ventana.dia,
      cierre,
      minutos,
      fin,
      finRealista,
      seVaDeHora: finRealista != null && finRealista > cierre,
      franjas: agruparPorHora(filas),
      reales,
      riesgos,
      sinPlan: filas.length === 0,
    });
    setFase({ t: 'lista' });
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  async function programar() {
    setError(null);
    setFase({ t: 'programando' });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('Tu sesión expiró. Vuelve a entrar.');
      setFase({ t: 'lista' });
      return;
    }

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/schedule-knockout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ tournamentId }),
        },
      );

      // La función puede no estar desplegada todavía. Un 404 aquí no es un
      // fallo del torneo y decirlo con el mensaje genérico mandaría al
      // organizador a buscar un problema que no tiene.
      if (res.status === 404) {
        setError('El programador todavía no está publicado en el servidor. Avisa a soporte; el calendario que ves sigue siendo válido.');
        setFase({ t: 'lista' });
        return;
      }

      const cuerpo = await res.json().catch(() => null);

      if (!res.ok) {
        setError(cuerpo?.message ?? 'No se pudo programar. Intenta de nuevo.');
        setFase({ t: 'lista' });
        return;
      }

      if (cuerpo?.cabe === false) {
        const d = cuerpo.diagnostico;
        setFase({
          t: 'noCabe',
          mensaje: d
            ? `No caben ${d.partidosSinProgramar} partidos. Necesitas ${d.canchasQueFaltan} ${d.canchasQueFaltan === 1 ? 'cancha más' : 'canchas más'} o ${d.horasQueFaltan} ${d.horasQueFaltan === 1 ? 'hora más' : 'horas más'}.`
            : 'El último día no da de sí con este formato.',
          avisos: cuerpo.avisos ?? [],
        });
        return;
      }

      await cargar();
    } catch {
      setError('No se pudo contactar con el servidor.');
      setFase({ t: 'lista' });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (fase.t === 'cargando') {
    return (
      <SafeAreaView style={s.pantalla}>
        <View style={s.centro}><ActivityIndicator color={color.gold} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.pantalla}>
      <BotonVolver texto={nombre || 'Torneo'} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>{nombre.toUpperCase()}</Text>
        <Text style={s.title}>Calendario</Text>

        {fase.t === 'noCabe' ? (
          <View style={s.noCabe}>
            <Text style={s.noCabeTitulo}>No cabe en el último día</Text>
            <Text style={s.noCabeCuerpo}>{fase.mensaje}</Text>
            {fase.avisos.map((a, i) => (
              <Text key={i} style={s.noCabeAviso}>· {a}</Text>
            ))}
            <Pressable
              onPress={() => setFase({ t: 'lista' })}
              style={({ pressed }) => [s.secundario, pressed && { opacity: 0.8 }]}
            >
              <Text style={s.secundarioTexto}>Volver al calendario</Text>
            </Pressable>
          </View>
        ) : !estado ? (
          <Text style={s.vacio}>
            Captura los horarios del torneo para poder programar el último día.
          </Text>
        ) : (
          <>
            {/* 1 · Las horas */}
            <View style={s.tarjeta}>
              <HorasUltimoDia
                dia={estado.dia}
                fin={estado.fin}
                finRealista={estado.finRealista}
                seVaDeHora={estado.seVaDeHora}
                minutos={estado.minutos}
              />
            </View>

            {/* 2 · Empalmes. Los reales primero: son certezas, no riesgos. */}
            {estado.reales.length > 0 && (
              <View style={s.alerta}>
                <Text style={s.alertaTitulo}>
                  {estado.reales.length === 1
                    ? 'Un jugador tiene dos partidos a la vez'
                    : `${estado.reales.length} jugadores tienen dos partidos a la vez`}
                </Text>
                {estado.reales.map((e, i) => (
                  <Text key={i} style={s.alertaLinea}>
                    {e.jugador} — {e.detalle}, ambas {e.hora}.
                  </Text>
                ))}
                <Text style={s.alertaPie}>
                  Decide tú quién espera. El sistema no mueve nada por su cuenta.
                </Text>
              </View>
            )}

            {estado.riesgos.length > 0 && (
              <View style={s.riesgo}>
                <Text style={s.riesgoTitulo}>Posibles empalmes</Text>
                {estado.riesgos.map((r, i) => (
                  <Text key={i} style={s.riesgoLinea}>{r.texto}</Text>
                ))}
              </View>
            )}

            {/* 3 · El calendario */}
            {estado.sinPlan ? (
              <Text style={s.vacio}>
                Todavía no hay calendario. Pulsa «Programar el último día».
              </Text>
            ) : (
              estado.franjas.map((f) => (
                <View key={f.hora} style={s.franja}>
                  <Text style={[s.franjaHora, f.filas.length === 0 && s.franjaHueca]}>
                    {f.hora}
                  </Text>
                  {f.filas.length === 0 ? (
                    // El hueco no se colapsa: verlo es parte del valor. Una
                    // hora vacía a media tarde es sitio para adelantar algo.
                    <Text style={s.hueco}>Sin partidos</Text>
                  ) : (
                    f.filas.map((p, i) => (
                      <View key={`${f.hora}-${i}`} style={s.partido}>
                        <View style={s.partidoCabecera}>
                          <Text style={s.partidoCat}>{p.categoria}</Text>
                          <Text style={s.partidoCancha}>{p.cancha}</Text>
                        </View>
                        <Text style={s.partidoEtapa}>{p.etapa}</Text>
                        {p.parejaA && p.parejaB ? (
                          <Text style={s.partidoParejas}>{p.parejaA}  vs  {p.parejaB}</Text>
                        ) : (
                          <Text style={s.partidoSinParejas}>Por definir</Text>
                        )}
                      </View>
                    ))
                  )}
                </View>
              ))
            )}

            {/* 4 · Correr el scheduler */}
            <Pressable
              onPress={programar}
              disabled={fase.t === 'programando'}
              style={({ pressed }) => [
                s.principal,
                fase.t === 'programando' && s.principalInerte,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              {fase.t === 'programando'
                ? <ActivityIndicator color={color.bg} />
                : <Text style={s.principalTexto}>
                    {estado.sinPlan ? 'Programar el último día' : 'Reprogramar'}
                  </Text>}
            </Pressable>

            <Text style={s.pieBoton}>
              Reprogramar reescribe las horas de todo el último día. Los
              resultados ya capturados no se tocan.
            </Text>
          </>
        )}

        {error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

const nombreDe = (p: ParejaPublica | undefined): string | null =>
  p ? `${p.player1_name} / ${p.player2_name}` : null;

const idsDe = (p: ParejaPublica | undefined): string[] =>
  p ? [p.player1_id, p.player2_id].filter(Boolean) : [];

interface FilaCat {
  id: string;
  num_groups: number | null;
  advance_per_group: number | null;
  best_extra_qualifiers: number | null;
}

/** Misma fórmula que la Edge Function: grupos × por grupo + repescados. */
function cuadrosDe(cats: FilaCat[]): CategoriaCuadro[] {
  const out: CategoriaCuadro[] = [];
  for (const c of cats) {
    if (c.num_groups == null || c.advance_per_group == null || c.best_extra_qualifiers == null) continue;
    const n = c.num_groups * c.advance_per_group + c.best_extra_qualifiers;
    if (n >= 2) out.push({ id: c.id, clasificados: n });
  }
  return out;
}

/**
 * Los empalmes que el motor deja pasar a propósito, en lenguaje de organizador.
 *
 * Sin el campo `jugadores` el motor no hermana nada, así que hoy esto devuelve
 * lista vacía: la hermandad se conocerá cuando se sepa quién clasificó. La
 * función queda cableada para que ese día no haya que tocar la pantalla.
 */
function calcularRiesgos(
  cats: FilaCat[],
  nombreCat: Map<string, string>,
  cap: { canchas: number; desde: string; hasta: string; minutos: number },
): Riesgo[] {
  if (cap.canchas < 1) return [];
  const cuadros = cuadrosDe(cats);
  if (cuadros.length === 0) return [];

  try {
    const r = programarEliminatorias({
      canchas: cap.canchas, desde: cap.desde, hasta: cap.hasta,
      categorias: cuadros, minutosPorPartido: cap.minutos,
    });
    // Se deduplica por par de categorías: al organizador le sirve saber que 2ª
    // y 3ª chocan, no que chocan en tres rondas distintas.
    const vistos = new Set<string>();
    const out: Riesgo[] = [];
    for (const e of r.empalmes) {
      const par = [e.categoriaA, e.categoriaB].sort().join('#');
      if (vistos.has(par)) continue;
      vistos.add(par);
      const a = nombreCat.get(e.categoriaA) ?? e.categoriaA;
      const b = nombreCat.get(e.categoriaB) ?? e.categoriaB;
      out.push({
        texto: `${a} y ${b} comparten jugadores y su ${ETAPA[e.etapa] ?? e.etapa} es a la misma hora.`,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Agrupa por hora y RELLENA los huecos entre la primera y la última.
 *
 * Colapsar las franjas vacías escondería justo lo accionable: una hora muerta
 * a media tarde es sitio para adelantar la final y terminar antes.
 */
function agruparPorHora(filas: Fila[]): { hora: string; filas: Fila[] }[] {
  if (filas.length === 0) return [];

  const porHora = new Map<string, Fila[]>();
  for (const f of filas) {
    const ya = porHora.get(f.hora);
    if (ya) ya.push(f); else porHora.set(f.hora, [f]);
  }

  const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const horas = [...porHora.keys()].map(aMin).sort((a, b) => a - b);
  const paso = 30;
  const salida: { hora: string; filas: Fila[] }[] = [];
  for (let m = horas[0]; m <= horas[horas.length - 1]; m += paso) {
    const h = fmt(m);
    salida.push({ hora: h, filas: (porHora.get(h) ?? []).sort(
      (a, b) => a.categoria.localeCompare(b.categoria) || a.cancha.localeCompare(b.cancha),
    ) });
  }
  return salida;
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.bg },
  centro:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, letterSpacing: 1 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[2] },

  tarjeta: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: space[4] },

  alerta:       { backgroundColor: 'rgba(224,114,111,0.10)', borderWidth: 1, borderColor: color.danger, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  alertaTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.danger },
  alertaLinea:  { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 21 },
  alertaPie:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, marginTop: space[1] },

  riesgo:       { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: space[4], gap: space[1] },
  riesgoTitulo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  riesgoLinea:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 21 },

  franja:      { borderTopWidth: 1, borderTopColor: color.line, paddingTop: space[2], gap: space[2] },
  franjaHora:  { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  franjaHueca: { color: color.muted, opacity: 0.5 },
  hueco:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.5, fontStyle: 'italic' },

  partido:         { backgroundColor: color.surface, borderRadius: radius.md, padding: space[3], gap: 2 },
  partidoCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  partidoCat:      { fontFamily: font.display, fontSize: fontSize.body, color: color.text },
  partidoCancha:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne },
  partidoEtapa:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  partidoParejas:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, marginTop: 2 },
  partidoSinParejas: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, opacity: 0.5, fontStyle: 'italic', marginTop: 2 },

  principal:       { minHeight: touchTarget, backgroundColor: color.gold, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: space[3] },
  principalInerte: { opacity: 0.6 },
  principalTexto:  { fontFamily: font.display, fontSize: fontSize.body, color: color.bg },
  pieBoton:        { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, textAlign: 'center' },

  secundario:      { minHeight: touchTarget, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: space[3] },
  secundarioTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.champagne },

  noCabe:       { backgroundColor: 'rgba(224,114,111,0.08)', borderWidth: 1, borderColor: color.danger, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  noCabeTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.danger },
  noCabeCuerpo: { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 21 },
  noCabeAviso:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  vacio: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 21, paddingVertical: space[3] },
  error: { fontFamily: font.body, fontSize: fontSize.body, color: color.danger, lineHeight: 21, marginTop: space[2] },
});
