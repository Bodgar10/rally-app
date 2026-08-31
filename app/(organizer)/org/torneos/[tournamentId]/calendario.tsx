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
  ActivityIndicator, StyleSheet, SafeAreaView, Modal,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import HorasUltimoDia from '@/components/tournament/HorasUltimoDia';
import { fetchParejasPublicas, type ParejaPublica } from '@/lib/parejas-publicas';
import { frasePersonas } from '@/lib/frase-personas';
import ParrillaDia from '@/components/organizer/ParrillaDia';
import AvisosPlegables, { type GrupoAvisos } from '@/components/organizer/AvisosPlegables';
import MoverPartido from '@/components/organizer/MoverPartido';
import DetallePartido from '@/components/organizer/DetallePartido';
import { type PartidoEnCalendario } from '@/lib/engine/schedule/mover';
import {
  agruparPorHora, type Franja, type FilaCalendario,
} from '@/lib/calendario-franjas';
import LiveBracket, { type BracketMatch } from '@/components/realtime/LiveBracket';
import SelectorPestanas from '@/components/ui/SelectorPestanas';
import { ORDEN_ETAPAS, type EtapaCuadro } from '@/components/realtime/bracket-layout';
import {
  programarEliminatorias,
  finRealistaEncadenado,
  type CategoriaCuadro,
} from '@/lib/engine/schedule/knockout';
import { parseFechaISO, indiceLunes, horaDeTorneo, diaDeTorneo } from '@/lib/fechas';
import { fallo, registrarFallo } from '@/lib/errores-red';

// ── Presentación ────────────────────────────────────────────────────────────

const ETAPA: Record<string, string> = {
  // 'group' entra desde que la pantalla cubre el fin de semana entero.
  group:       'grupos',
  round_of_32: 'ronda de 32',
  round_of_16: 'octavos',
  quarter:     'cuartos',
  semi:        'semifinal',
  final:       'final',
  third_place: '3.er lugar',
};

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

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

/**
 * Una fila del calendario. La forma vive en `@/lib/calendario-franjas` porque
 * la comparten esta pantalla y la vista cronológica; aquí solo se le añade el
 * día, que es lo que permite repartir el fin de semana en pestañas.
 */
interface Fila extends FilaCalendario {
  /** 'YYYY-MM-DD' en la zona del club. Ver diaDeTorneo. */
  dia: string;
}


interface EmpalmeReal {
  jugador: string;
  hora: string;
  detalle: string;
  /** Para saltar a la celda. El aviso decía la hora y tocaba buscarlo a mano. */
  matchId: string;
  dia: string;
}

interface Riesgo {
  texto: string;
  /** Quiénes son, por nombre. Vacío si no se pudieron resolver. */
  jugadores: string[];
  matchId?: string;
  dia?: string;
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
  /**
   * El fin de semana entero, un elemento por día CON partidos.
   *
   * Antes esta pantalla solo miraba el último día. Los grupos viven en los
   * otros dos y no tenían dónde verse: la pantalla de grupos enseña las
   * tablas, que responden otra pregunta.
   */
  dias: {
    dia: string;
    etiqueta: string;
    filas: Fila[];
    franjas: Franja[];
    categorias: { id: string; nombre: string; partidos: number }[];
  }[];
  /** Todas las filas del torneo, de los tres días. */
  filas: Fila[];
  /** Canchas del torneo. Sin ellas la ocupación se dice sin cociente. */
  canchas: number | null;
  /** playerId -> nombre. Lo consume el motor de movimientos para sus mensajes. */
  nombres: Record<string, string>;
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
        ORDEN_ETAPAS.indexOf(a.stage as EtapaCuadro) - ORDEN_ETAPAS.indexOf(b.stage as EtapaCuadro)
        || a.cancha.localeCompare(b.cancha, 'es', { numeric: true }))
      .map((f) => ({
        id: f.id,
        // `Fila.stage` es string desde que la forma vive en la lib compartida
        // —los partidos de grupo también pasan por aquí—; VistaCuadro solo
        // recibe filas de eliminatorias, que sí son EtapaCuadro.
        stage: f.stage as EtapaCuadro,
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
  /** Día elegido. Null = el primero con partidos, que es por donde se empieza a leer. */
  const [diaTab, setDiaTab] = useState<string | null>(null);
  /** El partido que se está moviendo. Null = nadie. */
  const [moviendo, setMoviendo] = useState<Fila | null>(null);
  /** La celda que se está mirando. Tocar es MIRAR; mover se pide desde aquí. */
  const [detalle, setDetalle]   = useState<Fila | null>(null);
  /** La celda a la que saltó un aviso. Se limpia al cambiar de día o filtro. */
  const [resaltado, setResaltado] = useState<string | null>(null);
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
      // TODOS los partidos con hora, grupos incluidos.
      //
      // Antes esta consulta llevaba `.neq('stage','group')` porque la pantalla
      // solo enseñaba el último día. Los partidos de grupo no tenían hora y no
      // había nada que excluir; en cuanto `schedule-groups` empiece a
      // escribirla, aparecen solos en el viernes y el sábado sin tocar nada
      // más. Mientras `scheduled_at` sea NULL, este filtro los deja fuera y la
      // pantalla se comporta como hasta hoy.
      supabase.from('matches')
        .select('id, category_id, stage, round_label, scheduled_at, court_label, pair_a_id, pair_b_id, status')
        .eq('tournament_id', tournamentId)
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
        dia: diaDeTorneo(m.scheduled_at!),
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
        dia: diaDeTorneo(p.scheduled_at),
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
        matchId: choque[0].id,
        dia: choque[0].dia,
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

    // SOLO las filas del ÚLTIMO DÍA. La cabecera habla del día de
    // eliminatorias, y desde que esta pantalla cubre el fin de semana entero
    // `filas` trae también viernes y sábado: el máximo caía en el último
    // partido de grupos del sábado y la cabecera anunciaba que el domingo
    // terminaba a las 23:00 cuando el plan acaba a las 19:00.
    const delUltimoDia = filas.filter((f) => f.dia === ventana.dia);

    if (delUltimoDia.length > 0) {
      fin = deMinutos(Math.max(...delUltimoDia.map((f) => f.horaMin)) + minutos);

      // MISMA fórmula que el motor, importada de él: se estira la CADENA de
      // cada categoría, no el día. Duplicarla aquí garantizaría que las dos
      // versiones divergieran en el primer ajuste.
      //
      // Las rondas de una categoría se cuentan por etapas distintas en el
      // plan: si tiene octavos, cuartos, semis y final, son cuatro eslabones.
      const cadenas = new Map<string, { rondas: Set<string>; ultimo: number }>();
      for (const f of delUltimoDia) {
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
      dias: repartirPorDia(filas),
      filas,
      canchas: t?.courts ?? null,
      nombres: Object.fromEntries(nombrePorJugador),
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

  /**
   * El día que se está mirando.
   *
   * Se elige el PRIMERO con partidos y no el último: el fin de semana se lee
   * de viernes a domingo, y abrir en la final sería empezar por el desenlace.
   * Si el día guardado ya no existe —se reprogramó— se cae al primero en vez
   * de quedarse en blanco.
   */
  const diaActivo =
    estado?.dias.find((d) => d.dia === diaTab)
    ?? estado?.dias[0]
    ?? { dia: '', etiqueta: '', filas: [] as Fila[], franjas: [] as Franja[], categorias: [] };

  /**
   * Los avisos del DÍA que se está mirando, uno por tipo.
   *
   * Del día y no del torneo: un choque del viernes no ayuda a quien está
   * cuadrando el domingo, y mezclarlos era parte de por qué la lista se hacía
   * ilegible.
   */
  const avisosDelDia: GrupoAvisos[] = estado ? [
    {
      clave: 'reales',
      tono: 'error',
      titulo: (n) => n === 1
        ? 'Un jugador tiene dos partidos a la vez'
        : `${n} jugadores tienen dos partidos a la vez`,
      lineas: estado.reales
        .filter((e) => e.dia === diaActivo.dia)
        .map((e) => ({ texto: `${e.hora} · ${e.jugador} — ${e.detalle}`, matchId: e.matchId })),
    },
    {
      clave: 'riesgos',
      tono: 'aviso',
      // "Posibles empalmes" no le dice nada a nadie. Esto sí: qué pasa y por qué.
      titulo: (n) => n === 1
        ? 'Dos categorías con jugadores en común juegan a la vez'
        : `${n} pares de categorías con jugadores en común juegan a la vez`,
      lineas: estado.riesgos
        .filter((r) => !r.dia || r.dia === diaActivo.dia)
        .map((r) => ({ texto: r.texto, matchId: r.matchId })),
    },
  ] : [];

  /**
   * Tocar una celda ABRE EL DETALLE, no el diálogo de mover.
   *
   * Dar por supuesto que quien toca quiere mover era el error: casi siempre se
   * toca para mirar quién juega. Y en las filas del plan —las que aún no
   * existen en `matches`— el toque no hacía absolutamente nada, sin decir por
   * qué. Ahora se abren igual y el detalle lo explica.
   */
  const sePuedeMover = (f: Fila) => !f.id.startsWith('plan:');

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
                {/* PRIMERO el día, DESPUÉS la categoría. En ese orden porque
                    esa es la pregunta que se hace el organizador: primero
                    "¿qué pasa el sábado?" y solo entonces "¿y 3ª Fuerza?".
                    Con un día solo, la tira sobra y no se pinta. */}
                {estado.dias.length > 1 && (
                  <SelectorPestanas
                    pestanas={estado.dias.map((d) => ({
                      id: d.dia, etiqueta: d.etiqueta, cuenta: d.filas.length,
                    }))}
                    activa={diaActivo.dia}
                    onCambiar={(id) => { setDiaTab(id); setTab(TODO_EL_DIA); }}
                  />
                )}

                {/* La categoría FILTRA la parrilla; no cambia de vista.
                    Antes abría el cuadro eliminatorio, que en los días de
                    grupos no tiene nada que enseñar: el viernes con "2A Fuerza"
                    decía "no hay partidos" mientras sus partidos estaban a la
                    vista en «Todo el día». */}
                <SelectorPestanas
                  pestanas={[
                    { id: TODO_EL_DIA, etiqueta: 'Todo el día', cuenta: diaActivo.filas.length },
                    ...diaActivo.categorias.map((c) => ({
                      id: c.id, etiqueta: c.nombre, cuenta: c.partidos,
                    })),
                  ]}
                  activa={tab}
                  onCambiar={setTab}
                />

                <ParrillaDia
                  filas={tab === TODO_EL_DIA
                    ? diaActivo.filas
                    : diaActivo.filas.filter((f) => f.categoriaId === tab)}
                  canchas={estado.canchas ?? 8}
                  resaltado={resaltado}
                  onCelda={(f) => setDetalle(f as Fila)}
                />

                {/* DESPUÉS de la parrilla: se entra a ver el calendario, no a
                    que le griten a uno. Y una línea por tipo, no veinticinco. */}
                <AvisosPlegables
                  grupos={avisosDelDia}
                  onSaltar={(id) => {
                    const f = estado.filas.find((x) => x.id === id);
                    if (f && f.dia !== diaActivo.dia) setDiaTab(f.dia);
                    setTab(TODO_EL_DIA);
                    setResaltado(id);
                  }}
                />
              </>
            )}

            {/* El detalle de la celda. Va antes que el de mover porque es el
                paso previo: se mira, y desde ahí se decide mover. */}
            {detalle && (
              <Modal
                visible
                transparent
                animationType="slide"
                onRequestClose={() => setDetalle(null)}
              >
                <View style={s.hojaFondo}>
                  <View style={s.hoja}>
                    <DetallePartido
                      partido={{
                        id: detalle.id,
                        categoria: detalle.categoria,
                        etapa: detalle.etapa,
                        hora: detalle.hora,
                        cancha: detalle.cancha,
                        parejaA: detalle.parejaA,
                        parejaB: detalle.parejaB,
                        estado: detalle.estado,
                      }}
                      sePuedeMover={sePuedeMover(detalle)}
                      onMover={() => { setMoviendo(detalle); setDetalle(null); }}
                      onCerrar={() => setDetalle(null)}
                    />
                  </View>
                </View>
              </Modal>
            )}

            {/* El modal de mover. La validación es del engine; aquí solo se pinta. */}
      {moviendo && estado && (
        <MoverPartido
          partido={{
            id: moviendo.id, categoria: moviendo.categoria, etapa: moviendo.etapa,
            parejaA: moviendo.parejaA, parejaB: moviendo.parejaB,
          }}
          dia={moviendo.dia}
          partidos={aPartidosDelMotor(estado.filas)}
          nombres={estado.nombres}
          canchas={estado.canchas ?? 8}
          minutosPorPartido={estado.minutos}
          onCerrar={() => setMoviendo(null)}
          onGuardado={() => { setMoviendo(null); void cargar(); }}
        />
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
        // Corto y accionable: qué, quién, cuándo. El párrafo anterior decía lo
        // mismo en tres renglones que nadie terminaba de leer.
        const quienes = nombres.length
          ? nombres.slice(0, 2).join(' y ') + (nombres.length > 2 ? ` +${nombres.length - 2}` : '')
          : 'jugadores en común';
        const ejemplo = filas.find((f) => f.hora === hora && f.categoriaId === ids[i]);
        out.push({
          texto: `${hora} · ${nombre.get(ids[i])} y ${nombre.get(ids[k])} — ${quienes}`,
          jugadores: nombres,
          matchId: ejemplo?.id,
          dia: ejemplo?.dia,
        });
      }
    }
  }
  return out;
}




/**
 * Fila de pantalla -> partido del motor.
 *
 * El motor no sabe de nombres de pareja ni de etiquetas: quiere día, minutos,
 * cancha y los cuatro jugadores. Las filas que vienen del PLAN y no de
 * `matches` se quedan fuera — no tienen id real y no se pueden mover — pero
 * sus horas sí cuentan como ocupación, así que se mandan igual: quitarlas
 * dejaría al motor creyendo que la cancha está libre.
 */
function aPartidosDelMotor(filas: Fila[]): PartidoEnCalendario[] {
  return filas.map((f) => ({
    id: f.id,
    categoryId: f.categoriaId,
    stage: f.stage,
    roundLabel: null,
    jugadores: f.jugadores,
    dia: f.dia,
    inicioMin: f.horaMin,
    cancha: f.cancha,
    status: f.estado,
    // La pantalla no trae el enlace del árbol; el motor cae a "la ronda
    // anterior de la categoría", que sobre-restringe pero nunca deja pasar un
    // imposible.
    sourceMatchIds: null,
  }));
}

/**
 * El fin de semana, un elemento por día CON partidos.
 *
 * Los días sin nada no salen: una pestaña vacía es una pregunta sin respuesta.
 * Los huecos que importan son los de DENTRO de un día —el viernes de 14 a 17
 * con 3 canchas de 8— y esos los enseña la vista cronológica.
 */
function repartirPorDia(filas: Fila[]): Estado['dias'] {
  const porDia = new Map<string, Fila[]>();
  for (const f of filas) {
    if (!f.dia) continue;
    const ya = porDia.get(f.dia);
    if (ya) ya.push(f); else porDia.set(f.dia, [f]);
  }
  return [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dia, suyas]) => ({
      dia,
      etiqueta: etiquetaDeDia(dia),
      filas: suyas,
      franjas: agruparPorHora(suyas),
      categorias: categoriasConPartidos(suyas),
    }));
}

/** 'Vie 11'. Corto porque va en una pestaña, con día para no confundirse. */
function etiquetaDeDia(dia: string): string {
  const d = parseFechaISO(dia);
  if (!d) return dia;
  return `${DIAS_CORTOS[indiceLunes(d)]} ${d.getDate()}`;
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // La hoja del detalle: sube desde abajo, no tapa el día entero.
  hojaFondo: { flex: 1, backgroundColor: 'rgba(6,6,8,0.82)', justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.gold,
    borderTopLeftRadius: radius.xl2, borderTopRightRadius: radius.xl2,
    padding: space[4.5], paddingBottom: bottomInset,
  },

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
