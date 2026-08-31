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
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import HorasUltimoDia from '@/components/tournament/HorasUltimoDia';
import { fetchParejasPublicas, type ParejaPublica } from '@/lib/parejas-publicas';
import { frasePersonas } from '@/lib/frase-personas';
import LiveBracket, { type BracketMatch } from '@/components/realtime/LiveBracket';
import SelectorPestanas from '@/components/ui/SelectorPestanas';
import { ORDEN_ETAPAS, type EtapaCuadro } from '@/components/realtime/bracket-layout';
import {
  programarEliminatorias,
  finRealistaEncadenado,
  type CategoriaCuadro,
} from '@/lib/engine/schedule/knockout';
import { parseFechaISO, indiceLunes, horaDeTorneo } from '@/lib/fechas';
import { fallo, registrarFallo } from '@/lib/errores-red';

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

/**
 * 'HH:MM' en la zona del club.
 *
 * ANTES esto leía la hora del texto con un regex, y estaba mal: el scheduler
 * escribe 08:00-06:00 pero PostgREST devuelve el mismo instante en UTC
 * (14:00+00:00), así que el calendario enseñaba las 14:00. La intención
 * original —no usar la zona del dispositivo— era correcta; el método, no.
 */
const horaDe = (iso: string): string => horaDeTorneo(iso) || '—';

/** 990 → '16:30'. La vuelta de `horaMin`. */
const deMinutos = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ── Modelo ──────────────────────────────────────────────────────────────────

interface Fila {
  id: string;                 // id del match, o una clave sintética del plan
  categoriaId: string;
  categoria: string;
  /** El valor del enum, para agrupar por columna del cuadro. */
  stage: EtapaCuadro;
  etapa: string;              // ya traducida, para la vista cronológica
  cancha: string;
  hora: string;
  horaMin: number;            // para ordenar sin volver a parsear
  /** El timestamptz crudo. LiveBracket lo formatea con la zona del club. */
  iso: string;
  parejaAId: string | null;
  parejaBId: string | null;
  parejaA: string | null;
  parejaB: string | null;
  estado: 'scheduled' | 'in_progress' | 'finished';
  jugadores: string[];        // ids, para detectar choques reales
}

/** Un tramo de la vista cronológica: partidos seguidos de la misma ronda. */
interface Bloque {
  clave: string;
  categoria: string;
  etapa: string;
  canchas: string;
  filas: Fila[];
}

interface EmpalmeReal {
  jugador: string;
  hora: string;
  detalle: string;
}

interface Riesgo {
  texto: string;
  /** Quiénes son, por nombre. Vacío si no se pudieron resolver. */
  jugadores: string[];
}

interface Estado {
  dia: string;
  diaISO: string;
  cierre: string;
  minutos: number;
  fin: string | null;
  finRealista: string | null;
  seVaDeHora: boolean;
  /**
   * true si NINGUNA categoría tiene cuadro que programar todavía.
   *
   * No es lo mismo que "no cabe". Con las ocho categorías abiertas no hay
   * clasificados, el motor recibe una lista vacía y devuelve `cabe: false` —
   * que leído sin contexto se pinta como "No cabe en el domingo" en rojo. Eso
   * es falso y alarmante: no es que el día no dé de sí, es que aún no hay nada
   * que colocar. Por eso se distingue ANTES de llamar al motor.
   */
  sinCuadros: boolean;
  /**
   * true si las horas salen de un recálculo y no del plan guardado.
   *
   * Se dice en pantalla. Una hora previsualizada y una hora programada se leen
   * igual, y confundirlas es dar por hecho un calendario que nadie guardó.
   */
  previsualizacion: boolean;
  franjas: { hora: string; filas: Fila[] }[];
  /** Todas las filas, para poder filtrarlas por categoría en las pestañas. */
  filas: Fila[];
  /** Categorías con partidos, en el orden en que empiezan a jugar. */
  categorias: { id: string; nombre: string; partidos: number }[];
  reales: EmpalmeReal[];
  riesgos: Riesgo[];
  sinPlan: boolean;
}

/** Id de la pestaña cronológica. No es una categoría, por eso no es un uuid. */
const TODO_EL_DIA = '__dia__';

/**
 * Qué se escribe donde todavía no hay parejas.
 *
 * No es un fallo: los cuadros salen de la fase de grupos y los grupos aún no
 * se han jugado. "Por definir" dejaba al organizador sin saber si faltaba un
 * dato suyo o si el sistema simplemente no puede saberlo aún.
 */
const TEXTO_PENDIENTE = 'Se define en la fase de grupos';

// ── Las dos vistas ──────────────────────────────────────────────────────────

/**
 * El día completo, franja a franja.
 *
 * Los partidos consecutivos de la misma categoría y ronda van en UN bloque
 * plegado. Las franjas vacías siguen mostrándose: ver el hueco es parte del
 * valor — una hora muerta a media tarde es sitio para adelantar la final.
 */
function VistaCronologica({ franjas }: { franjas: { hora: string; filas: Fila[] }[] }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const alternar = (k: string) => setAbiertos((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <>
      {franjas.map((f) => (
        <View key={f.hora} style={s.franja}>
          <Text style={[s.franjaHora, f.filas.length === 0 && s.franjaHueca]}>{f.hora}</Text>

          {f.filas.length === 0 ? (
            <Text style={s.hueco}>Sin partidos</Text>
          ) : (
            agruparEnBloques(f.filas).map((b) => {
              const clave = `${f.hora}#${b.clave}`;
              const abierto = abiertos.has(clave);
              const uno = b.filas.length === 1;

              return (
                <View key={clave} style={s.bloque}>
                  <Pressable
                    onPress={() => !uno && alternar(clave)}
                    disabled={uno}
                    style={({ pressed }) => [s.bloqueCabecera, pressed && !uno && { opacity: 0.8 }]}
                    accessibilityRole={uno ? undefined : 'button'}
                    accessibilityState={uno ? undefined : { expanded: abierto }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.bloqueCat}>{b.categoria}</Text>
                      <Text style={s.bloqueDetalle}>
                        {b.etapa} · {b.filas.length} {b.filas.length === 1 ? 'partido' : 'partidos'} · {b.canchas}
                      </Text>
                    </View>
                    {!uno && <Text style={s.chevron}>{abierto ? '▾' : '▸'}</Text>}
                  </Pressable>

                  {(abierto || uno) && (
                    <View style={s.bloqueCuerpo}>
                      {b.filas.map((p) => (
                        <View key={p.id} style={s.partido}>
                          <Text style={s.partidoCancha}>{p.cancha}</Text>
                          {p.parejaA && p.parejaB ? (
                            <Text style={s.partidoParejas}>{p.parejaA}  vs  {p.parejaB}</Text>
                          ) : (
                            <Text style={s.partidoSinParejas}>{TEXTO_PENDIENTE}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      ))}
    </>
  );
}

/**
 * El cuadro de una categoría: rondas en columnas, de octavos a la final.
 *
 * Reusa LiveBracket con partidos inyectados. No consulta ni se suscribe: los
 * datos son la fusión de `matches` y `match_schedule` que ya hizo la pantalla,
 * y eso una consulta por category_id no lo puede hacer — las rondas futuras
 * todavía no tienen fila en `matches`.
 */
function VistaCuadro({ filas, categoria }: { filas: Fila[]; categoria: string }) {
  const partidos = useMemo<BracketMatch[]>(
    () => [...filas]
      // Por ronda y luego por cancha: dentro de una columna el orden es el del
      // cuadro, y la cancha es lo más parecido que tenemos a ese orden.
      .sort((a, b) =>
        ORDEN_ETAPAS.indexOf(a.stage) - ORDEN_ETAPAS.indexOf(b.stage)
        || a.cancha.localeCompare(b.cancha, 'es', { numeric: true }))
      .map((f) => ({
        id: f.id,
        stage: f.stage,
        roundLabel: null,
        status: f.estado,
        pairAId: f.parejaAId,
        pairBId: f.parejaBId,
        pairAName: f.parejaA,
        pairBName: f.parejaB,
        winnerPairId: null,
        scheduledAt: f.iso,
        courtLabel: f.cancha,
      })),
    [filas],
  );

  return (
    <View style={s.cuadro}>
      <Text style={s.cuadroTitulo}>{categoria}</Text>
      <LiveBracket
        categoryId=""
        partidos={partidos}
        vacio="Esta categoría no tiene partidos programados."
      />
    </View>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

type Fase =
  | { t: 'cargando' }
  | { t: 'lista' }
  | { t: 'programando' }
  | { t: 'noCabe'; mensaje: string; avisos: string[] };

export default function CalendarioScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [estado, setEstado] = useState<Estado | null>(null);
  const [tab, setTab]       = useState<string>(TODO_EL_DIA);
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

    const aMinutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

    const filas: Fila[] = [];

    for (const m of partidos ?? []) {
      const pa = m.pair_a_id ? parejas.get(m.pair_a_id) : undefined;
      const pb = m.pair_b_id ? parejas.get(m.pair_b_id) : undefined;
      const hora = horaDe(m.scheduled_at!);
      filas.push({
        id: m.id,
        categoriaId: m.category_id,
        categoria: nombreCat.get(m.category_id) ?? '—',
        stage: m.stage as EtapaCuadro,
        etapa: ETAPA[m.stage] ?? m.stage,
        cancha: m.court_label ?? '—',
        hora,
        horaMin: aMinutos(hora),
        iso: m.scheduled_at!,
        parejaAId: m.pair_a_id,
        parejaBId: m.pair_b_id,
        parejaA: nombreDe(pa),
        parejaB: nombreDe(pb),
        estado: (m.status as Fila['estado']) ?? 'scheduled',
        jugadores: [pa, pb].flatMap(idsDe),
      });
    }

    for (const p of plan ?? []) {
      if (yaReales.has(`${p.category_id}#${p.stage}`)) continue;   // ya pintado arriba
      const hora = horaDe(p.scheduled_at);
      filas.push({
        // El plan no tiene id de partido: la posición dentro de la ronda es lo
        // único que lo identifica, y basta como clave de render.
        id: `plan:${p.category_id}:${p.stage}:${p.slot_index}`,
        categoriaId: p.category_id,
        categoria: nombreCat.get(p.category_id) ?? '—',
        stage: p.stage as EtapaCuadro,
        etapa: ETAPA[p.stage] ?? p.stage,
        cancha: p.court_label,
        hora,
        horaMin: aMinutos(hora),
        iso: p.scheduled_at,
        parejaAId: null,
        parejaBId: null,
        parejaA: null,
        parejaB: null,
        estado: 'scheduled',
        jugadores: [],
      });
    }

    // ── Quién juega en cada categoría ──────────────────────────────────────
    // Es lo que convierte la hermandad en algo calculable: sin esto el motor no
    // sabe que 5ª Femenil y Mixtos D comparten seis jugadoras. Se usan TODAS
    // las parejas de la categoría, no solo las clasificadas: a estas alturas no
    // se sabe quién pasará, y un superconjunto solo puede sobre-avisar, que es
    // el lado correcto en el que equivocarse.
    const { data: todasParejas } = await supabase
      .from('pairs').select('id, category_id, player1_id, player2_id').eq('tournament_id', tournamentId);

    const jugadoresPorCat = new Map<string, string[]>();
    for (const pr of todasParejas ?? []) {
      const ya = jugadoresPorCat.get(pr.category_id);
      const dos = [pr.player1_id, pr.player2_id];
      if (ya) ya.push(...dos);
      else jugadoresPorCat.set(pr.category_id, dos);
    }

    // ── Nombre de cada jugador ──────────────────────────────────────────────
    // El aviso decía "2ª y 3ª comparten jugadores" y ahí se quedaba. Saber que
    // hay un choque sin saber CON QUIÉN no sirve para resolverlo: el
    // organizador tiene que escribirle a alguien.
    //
    // Los nombres van por `bracket_pairs_public`, no por un embed a `users`:
    // `users_select_own` solo deja leer la propia fila (ver parejas-publicas.ts).
    const publicas = await fetchParejasPublicas((todasParejas ?? []).map((pr) => pr.id));
    const nombrePorJugador = new Map<string, string>();
    for (const pp of publicas.values()) {
      if (pp.player1_id) nombrePorJugador.set(pp.player1_id, pp.player1_name);
      if (pp.player2_id) nombrePorJugador.set(pp.player2_id, pp.player2_name);
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

    // ── Riesgos: sobre los partidos QUE ESTÁN, no sobre un plan recalculado ─
    // Antes esto volvía a correr el motor. Estaba mal: el motor con
    // hermandades produce un calendario distinto del guardado, así que los
    // empalmes que listaba eran los de un torneo que no se va a jugar.
    const riesgos = empalmesDeLasFilas(filas, jugadoresPorCat, nombrePorJugador);

    // ── Horas del día ──────────────────────────────────────────────────────
    //
    // EL PLAN GUARDADO MANDA.
    //   Si hay filas en `match_schedule`, la cabecera se deriva de ELLAS. Un
    //   recálculo describiría un calendario hipotético mientras el cuerpo de la
    //   pantalla lista el real, y nada le diría al organizador cuál es cuál —
    //   que es exactamente el error que tenía esta pantalla.
    //
    //   Recalcular solo sirve para PREVISUALIZAR antes de guardar. Cuando toca,
    //   se dice.
    const cuadros = cuadrosDe(cats ?? [], jugadoresPorCat);
    const sinCuadros = cuadros.length === 0;

    let fin: string | null = null;
    let finRealista: string | null = null;
    let previsualizacion = false;

    if (filas.length > 0) {
      fin = deMinutos(Math.max(...filas.map((f) => f.horaMin)) + minutos);

      // MISMA fórmula que el motor, importada de él: se estira la CADENA de
      // cada categoría, no el día. Duplicarla aquí garantizaría que las dos
      // versiones divergieran en el primer ajuste.
      //
      // Las rondas de una categoría se cuentan por etapas distintas en el
      // plan: si tiene octavos, cuartos, semis y final, son cuatro eslabones.
      const cadenas = new Map<string, { rondas: Set<string>; ultimo: number }>();
      for (const f of filas) {
        const ya = cadenas.get(f.categoriaId);
        if (ya) { ya.rondas.add(f.stage); ya.ultimo = Math.max(ya.ultimo, f.horaMin); }
        else cadenas.set(f.categoriaId, { rondas: new Set([f.stage]), ultimo: f.horaMin });
      }
      const min = finRealistaEncadenado(
        [...cadenas.entries()].map(([categoryId, c]) => ({
          categoryId, rondas: c.rondas.size, ultimoInicioMin: c.ultimo,
        })),
        minutos,
      );
      finRealista = min === null ? null : deMinutos(min);
    } else if (t?.courts && !sinCuadros) {
      // Sin plan guardado: se previsualiza. Sin cuadros no se llama al motor —
      // su `cabe: false` sobre una lista vacía no significa nada.
      previsualizacion = true;
      try {
        const r = programarEliminatorias({
          canchas: t.courts, desde: ventana.desde.slice(0, 5), hasta: cierre,
          categorias: cuadros, minutosPorPartido: minutos,
        });
        fin = r.cabe ? r.finEstimado : null;
        finRealista = r.finRealista;
      } catch (e) {
        // La previsualización se queda sin horas y la pantalla sigue viva: es
        // un adorno, no el dato. Pero el motor puede lanzar por algo que no sea
        // "no cabe" —un cuadro mal formado, por ejemplo— y ese caso hay que
        // poder verlo en vez de leerlo como capacidad insuficiente.
        registrarFallo('calendario/previsualizacion', e, {
          canchas: t.courts, categorias: cuadros.length, minutos,
        });
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
      sinCuadros,
      previsualizacion,
      franjas: agruparPorHora(filas),
      filas,
      categorias: categoriasConPartidos(filas),
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
    } catch (e) {
      setError(fallo('calendario', e, 'No se pudo programar el calendario. Intenta de nuevo.', {
        tournamentId,
      }));
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
            {/* 1 · Las horas.
                Solo si hay algo que programar. Con todo abierto no hay
                clasificados y una hora calculada sobre cero cuadros no dice
                nada — decir "no cabe" ahí sería alarmar por falta de datos. */}
            {estado.sinCuadros ? (
              <View style={s.tarjeta}>
                <Text style={s.neutro}>
                  Cierra las inscripciones de al menos una categoría para ver el
                  calendario.
                </Text>
                <Pressable
                  onPress={() => router.push(`/(organizer)/org/torneos/${tournamentId}/cerrar-inscripciones`)}
                  style={({ pressed }) => [s.enlace, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  <Text style={s.enlaceTexto}>Ir a cerrar inscripciones →</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.tarjeta}>
                <HorasUltimoDia
                  dia={estado.dia}
                  fin={estado.fin}
                  finRealista={estado.finRealista}
                  seVaDeHora={estado.seVaDeHora}
                  minutos={estado.minutos}
                  titulo={estado.previsualizacion ? 'Último día · previsualización' : 'Último día'}
                >
                  {estado.previsualizacion && (
                    <Text style={s.previsualizacion}>
                      Todavía no hay calendario guardado. Estas horas son una
                      estimación de lo que saldría al programar; pueden cambiar.
                    </Text>
                  )}
                </HorasUltimoDia>
              </View>
            )}

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
                  <View key={i} style={{ gap: 2 }}>
                    <Text style={s.riesgoLinea}>{r.texto}</Text>
                    {/* Los nombres completos: el aviso corta en tres para que se
                        lea, pero para escribirles hacen falta todos. */}
                    {r.jugadores.length > 2 && (
                      <Text style={s.riesgoNombres}>{r.jugadores.join(' · ')}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* 3 · El calendario, por pestañas.
                Antes era una tira de tarjetas idénticas: ocho octavos de la
                misma categoría ocupaban la pantalla entera sin decir nada que
                no dijera uno. Ahora hay dos lecturas — el día completo y el
                cuadro de cada categoría — porque son dos preguntas distintas:
                "¿qué pasa a las 11?" y "¿cómo va 3ª Fuerza?". */}
            {estado.sinPlan ? (
              estado.sinCuadros ? null : (
                <Text style={s.vacio}>
                  Todavía no hay calendario. Pulsa «Programar el último día».
                </Text>
              )
            ) : (
              <>
                <SelectorPestanas
                  pestanas={[
                    { id: TODO_EL_DIA, etiqueta: 'Todo el día', cuenta: estado.filas.length },
                    ...estado.categorias.map((c) => ({
                      id: c.id, etiqueta: c.nombre, cuenta: c.partidos,
                    })),
                  ]}
                  activa={tab}
                  onCambiar={setTab}
                />

                {tab === TODO_EL_DIA ? (
                  <VistaCronologica franjas={estado.franjas} />
                ) : (
                  <VistaCuadro
                    filas={estado.filas.filter((f) => f.categoriaId === tab)}
                    categoria={estado.categorias.find((c) => c.id === tab)?.nombre ?? ''}
                  />
                )}
              </>
            )}

            {/* 4 · Correr el scheduler */}
            <Pressable
              onPress={programar}
              disabled={fase.t === 'programando' || estado.sinCuadros}
              style={({ pressed }) => [
                s.principal,
                (fase.t === 'programando' || estado.sinCuadros) && s.principalInerte,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: estado.sinCuadros }}
            >
              {fase.t === 'programando'
                ? <ActivityIndicator color={color.bg} />
                : <Text style={s.principalTexto}>
                    {estado.sinPlan ? 'Programar el último día' : 'Reprogramar'}
                  </Text>}
            </Pressable>

            {!estado.sinCuadros && (
              <Text style={s.pieBoton}>
                Reprogramar reescribe las horas de todo el último día. Los
                resultados ya capturados no se tocan.
              </Text>
            )}
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

/**
 * Las categorías que tienen partidos, ordenadas por su primer partido.
 *
 * Por hora y no alfabéticamente: las pestañas se leen como el día, y la
 * primera que juega es la primera que el organizador quiere mirar.
 */
function categoriasConPartidos(filas: Fila[]): { id: string; nombre: string; partidos: number }[] {
  const m = new Map<string, { id: string; nombre: string; partidos: number; desde: number }>();
  for (const f of filas) {
    const ya = m.get(f.categoriaId);
    if (ya) { ya.partidos++; ya.desde = Math.min(ya.desde, f.horaMin); }
    else m.set(f.categoriaId, { id: f.categoriaId, nombre: f.categoria, partidos: 1, desde: f.horaMin });
  }
  return [...m.values()]
    .sort((a, b) => a.desde - b.desde || a.nombre.localeCompare(b.nombre))
    .map(({ id, nombre, partidos }) => ({ id, nombre, partidos }));
}

/** Misma fórmula que la Edge Function: grupos × por grupo + repescados. */
function cuadrosDe(cats: FilaCat[], jugadores?: Map<string, string[]>): CategoriaCuadro[] {
  const out: CategoriaCuadro[] = [];
  for (const c of cats) {
    if (c.num_groups == null || c.advance_per_group == null || c.best_extra_qualifiers == null) continue;
    const n = c.num_groups * c.advance_per_group + c.best_extra_qualifiers;
    if (n >= 2) out.push({ id: c.id, clasificados: n, jugadores: jugadores?.get(c.id) });
  }
  return out;
}

/**
 * Categorías hermanadas que comparten franja EN EL CALENDARIO QUE HAY.
 *
 * No recalcula nada: mira los partidos que la pantalla está listando. Dos
 * categorías son hermanas si comparten al menos un jugador, y el motor separa
 * las rondas tempranas de las hermanas pero deja pasar semifinales y finales a
 * propósito — retrasar el torneo entero por un caso que quizá no ocurra
 * perjudica a 165 parejas por una. Lo que quede empalmado se lista para que lo
 * resuelva el organizador.
 *
 * Se deduplica por par de categorías: sirve saber que 2ª y 3ª chocan, no que
 * chocan en tres rondas distintas.
 */
function empalmesDeLasFilas(
  filas: Fila[],
  jugadores: Map<string, string[]>,
  nombrePorJugador: Map<string, string>,
): Riesgo[] {
  // Grafo de hermandad: por jugador, en qué categorías aparece.
  const catsDeJugador = new Map<string, Set<string>>();
  for (const [catId, ids] of jugadores) {
    for (const j of ids) {
      const ya = catsDeJugador.get(j);
      if (ya) ya.add(catId);
      else catsDeJugador.set(j, new Set([catId]));
    }
  }

  // Además de QUÉ pares son hermanos, POR QUIÉN lo son. Es el dato que
  // convierte el aviso en algo accionable.
  const hermanas = new Set<string>();
  const compartidos = new Map<string, Set<string>>();
  for (const [jugadorId, cs] of catsDeJugador) {
    if (cs.size < 2) continue;
    const lista = [...cs].sort();
    for (let i = 0; i < lista.length; i++) {
      for (let k = i + 1; k < lista.length; k++) {
        const par = `${lista[i]}#${lista[k]}`;
        hermanas.add(par);
        const ya = compartidos.get(par);
        if (ya) ya.add(jugadorId);
        else compartidos.set(par, new Set([jugadorId]));
      }
    }
  }
  if (hermanas.size === 0) return [];

  const nombre = new Map(filas.map((f) => [f.categoriaId, f.categoria]));
  const vistos = new Set<string>();
  const out: Riesgo[] = [];

  // Por franja: qué categorías (y en qué ronda) coinciden.
  const porHora = new Map<string, Map<string, string>>();
  for (const f of filas) {
    if (!porHora.has(f.hora)) porHora.set(f.hora, new Map());
    porHora.get(f.hora)!.set(f.categoriaId, f.etapa);
  }

  for (const [hora, cats] of [...porHora].sort()) {
    const ids = [...cats.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let k = i + 1; k < ids.length; k++) {
        const par = [ids[i], ids[k]].sort().join('#');
        if (!hermanas.has(par) || vistos.has(par)) continue;
        vistos.add(par);
        const nombres = [...(compartidos.get(par) ?? [])]
          .map((j) => nombrePorJugador.get(j))
          .filter((n): n is string => !!n)
          .sort((a, b) => a.localeCompare(b, 'es'));
        out.push({
          texto: `${nombre.get(ids[i])} y ${nombre.get(ids[k])} ${frasePersonas(nombres)} y su `
            + `${cats.get(ids[i])} y ${cats.get(ids[k])} coinciden a las ${hora}.`,
          jugadores: nombres,
        });
      }
    }
  }
  return out;
}

/**
 * Dentro de una franja, junta los partidos consecutivos de la misma categoría
 * y ronda en un solo bloque.
 *
 * Ocho octavos de 5ª Fuerza a la misma hora eran ocho tarjetas idénticas que
 * llenaban la pantalla y no decían nada que no dijera una: "5ª Fuerza ·
 * Octavos · 8 partidos · Canchas 1-8". El detalle sigue estando, a un toque.
 */
function agruparEnBloques(filas: Fila[]): Bloque[] {
  const porRonda = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = `${f.categoriaId}#${f.stage}`;
    const ya = porRonda.get(k);
    if (ya) ya.push(f); else porRonda.set(k, [f]);
  }

  return [...porRonda.entries()].map(([clave, fs]) => {
    const ordenadas = [...fs].sort((a, b) => a.cancha.localeCompare(b.cancha, 'es', { numeric: true }));
    return {
      clave,
      categoria: ordenadas[0].categoria,
      etapa: ordenadas[0].etapa,
      canchas: resumirCanchas(ordenadas.map((f) => f.cancha)),
      filas: ordenadas,
    };
  }).sort((a, b) => a.categoria.localeCompare(b.categoria));
}

/** ['Cancha 1','Cancha 2','Cancha 3'] → 'Canchas 1-3'. Sin rango, las lista. */
function resumirCanchas(etiquetas: string[]): string {
  if (etiquetas.length === 0) return '';
  if (etiquetas.length === 1) return etiquetas[0];

  const nums = etiquetas
    .map((e) => Number(/(\d+)/.exec(e)?.[1] ?? NaN))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  // Solo se colapsa si son consecutivas: 'Canchas 1-8' tiene que significar
  // que están las ocho, no que hay dos y la mayor es la 8.
  const consecutivas = nums.length === etiquetas.length
    && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);

  return consecutivas
    ? `Canchas ${nums[0]}-${nums[nums.length - 1]}`
    : `Canchas ${nums.join(', ')}`;
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
  riesgoNombres:{ fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 18 },

  franja:      { borderTopWidth: 1, borderTopColor: color.line, paddingTop: space[2], gap: space[2] },
  franjaHora:  { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  franjaHueca: { color: color.muted, opacity: 0.5 },
  hueco:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.5, fontStyle: 'italic' },

  bloque:          { backgroundColor: color.surface, borderRadius: radius.md, overflow: 'hidden' },
  bloqueCabecera:  { flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], minHeight: touchTarget },
  bloqueCat:       { fontFamily: font.display, fontSize: fontSize.body, color: color.text },
  bloqueDetalle:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: 2 },
  chevron:         { fontFamily: font.body, fontSize: fontSize.body, color: color.champagne },
  bloqueCuerpo:    { borderTopWidth: 1, borderTopColor: color.line, padding: space[3], gap: space[2] },

  cuadro:          { gap: space[2] },
  cuadroTitulo:    { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },

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

  // Neutro a propósito: ni dorado (no es un logro) ni rojo (no es un fallo).
  // Es una precondición que todavía no se cumple.
  neutro:      { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 21 },
  previsualizacion: { fontFamily: font.body, fontSize: fontSize.caption, color: color.alive, lineHeight: 18, marginTop: space[2] },
  enlace:      { marginTop: space[2], alignSelf: 'flex-start', minHeight: touchTarget * 0.7, justifyContent: 'center' },
  enlaceTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.champagne },
  error: { fontFamily: font.body, fontSize: fontSize.body, color: color.danger, lineHeight: 21, marginTop: space[2] },
});
