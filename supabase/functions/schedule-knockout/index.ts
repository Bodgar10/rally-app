// supabase/functions/schedule-knockout/index.ts
// Corre el scheduler de eliminatorias (engine) y persiste el calendario.
// NO reimplementa lógica de torneo: el motor decide, esta función lee y escribe.
//
// DÓNDE ESCRIBE Y POR QUÉ EN DOS SITIOS
//   `generate-bracket` materializa el cuadro por rondas: `seed` crea la primera
//   y `advance` crea la siguiente cuando la anterior termina. Al programar el
//   día, las semis y la final aún NO existen como filas de `matches`. Por eso:
//     · match_schedule → el plan COMPLETO, incluidas las rondas sin fila.
//     · matches        → solo los partidos que ya existen y son jugables.
//   Si luego difieren, el partido se movió. No se duplica el plan en `matches`.
//
// LOS EMPALMES NO SE PERSISTEN
//   Se devuelven en la respuesta. Son derivables en cualquier momento del
//   calendario guardado (`match_schedule` + `matches`) cruzado con `pairs`, y
//   una tabla los congelaría: en cuanto el organizador mueva un partido a mano,
//   la tabla mentiría y el cálculo en vivo no. La pantalla del calendario los
//   recalcula sobre los partidos que está listando, que es la única fuente que
//   no puede desfasarse.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  programarEliminatorias,
  canchasDeSede,
  type CategoriaCuadro,
  type Calendario,
} from '../_shared/engine.bundle.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

// México abolió el horario de verano en 2022: UTC-6 todo el año, sin excepción.
// Fijo a propósito — la zona del servidor de Edge Functions es UTC y usarla
// correría el calendario seis horas.
const OFFSET_MX = '-06:00';

// El 3.er lugar no se programa: no lo produce el motor y su hora depende de
// cuándo acaben las semis. Se queda sin hora hasta que alguien la ponga a mano.
const STAGE_NO_PROGRAMABLE = 'third_place';

/** 'HH:MM:SS' de una columna `time` → 'HH:MM', que es lo que consume el motor. */
const aHHMM = (t: string): string => t.slice(0, 5);

/** Minutos desde medianoche -> 'HH:MM'. El inverso de `aMinutos`. */
const deMinutos = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** date 'YYYY-MM-DD' + 'HH:MM' + offset fijo → timestamptz sin ambigüedad. */
const aTimestamptz = (dia: string, hora: string): string =>
  `${dia}T${hora}:00${OFFSET_MX}`;

interface FilaCategoria {
  id: string;
  display_name: string;
  num_groups: number | null;
  advance_per_group: number | null;
  best_extra_qualifiers: number | null;
}

interface FilaVentana {
  dia: string;
  desde: string;
  hasta: string;
}

interface FilaMatch {
  id: string;
  stage: string;
  round_label: string | null;
  status: string;
  pair_a_id: string | null;
  pair_b_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    // ─────────────────── 1. Auth: SOLO el organizador ───────────────────
    // Mismo patrón que close-registration (owner en organizer_members), NO
    // can_capture_tournament: programar el torneo es acto de organización, no
    // de captura, y los jueces no deben poder correrlo.
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: ures, error: uerr } = await asUser.auth.getUser();
    if (uerr || !ures?.user) return json({ error: 'unauthorized' }, 401);
    const actorId = ures.user.id;

    let body: { tournamentId?: string };
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const tournamentId = body.tournamentId;
    if (!tournamentId) return json({ error: 'tournamentId_required' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: torneo } = await admin
      .from('tournaments')
      .select('id, organizer_id, courts, match_minutes, tercer_lugar, venue_id')
      .eq('id', tournamentId)
      .maybeSingle();
    if (!torneo) return json({ error: 'tournament_not_found' }, 404);

    const { data: ownerRow } = await admin
      .from('organizer_members')
      .select('user_id')
      .eq('organizer_id', torneo.organizer_id)
      .eq('user_id', actorId)
      .eq('member_role', 'owner')
      .maybeSingle();
    if (!ownerRow) return json({ error: 'forbidden' }, 403);

    // ─────────────────── 2. Capacidad del torneo ───────────────────
    // Las tres cosas son obligatorias y nullable en BD a propósito (044): sin
    // ellas no hay nada que decidir. Se listan TODAS las que faltan de una vez
    // para que el organizador no descubra la segunda tras arreglar la primera.
    const { data: ventanas } = await admin
      .from('tournament_windows')
      .select('dia, desde, hasta')
      .eq('tournament_id', tournamentId)
      .order('dia', { ascending: true });

    const falta: string[] = [];
    if (torneo.courts == null) falta.push('el número de canchas');
    if (torneo.match_minutes == null) falta.push('los minutos por partido');
    if (!ventanas || ventanas.length === 0) falta.push('las ventanas horarias (al menos un día)');
    if (falta.length > 0) {
      return json({
        error: 'capacidad_incompleta',
        message: `Falta capturar ${falta.join(', ')} antes de programar. Se configura en la pantalla de horarios del torneo.`,
        faltantes: falta,
      }, 400);
    }

    const dias = ventanas as FilaVentana[];
    const avisos: string[] = [];

    // ─────────────────── 3. La ventana del último día ───────────────────
    // El orden cronológico es semántico (044): todos los días menos el último
    // son fase de grupos, el último es eliminatorias. Ya viene ordenado por
    // `dia` ascendente, así que el último elemento es el que buscamos.
    const ventana = dias[dias.length - 1];

    /**
     * A qué hora ARRANCA el cuadro.
     *
     * ► EL BUG, Y YA MORDIÓ UNA VEZ
     *   Con varios días esto es la apertura del último: ese día es solo del
     *   cuadro. Con UN SOLO DÍA —los torneos de Padel Hype, y los exprés— la
     *   fase de grupos ocupa esa misma ventana, y arrancar en la apertura
     *   programaba los cuartos ENCIMA de los grupos. En el exprés de
     *   septiembre eso puso ocho jugadores en dos partidos a la vez.
     *
     * ► SE PREGUNTA A LOS PARTIDOS, NO SE PROYECTA
     *   La hora buena es cuando acaba el último partido de grupos, y eso ya
     *   está escrito en `matches.scheduled_at`: los grupos se programan antes
     *   que el cuadro, siempre. Recalcularlo con `generarBloques` daría una
     *   proyección que puede no coincidir con lo que de verdad se guardó —por
     *   un partido movido a mano, por ejemplo.
     *
     *   Se le suma la duración REAL de ese partido, no la planificada: un
     *   partido de 60 minutos ocupa 75. Empezar el cuadro cuando el último
     *   grupo todavía está en pista es el mismo error con menos minutos.
     */
    const minutosPartido = (torneo.match_minutes as number) ?? 60;

    /**
     * LO QUE OCUPA UN PARTIDO DE GRUPOS EN LA RETÍCULA: su duración nominal.
     *
     * ► EL COJÍN DE RETRASO NO VA AQUÍ
     *   Antes se le sumaba `FACTOR_RETRASO` —30 min planificados son 38 de
     *   verdad— para no arrancar el cuadro con el último grupo todavía en
     *   pista. Con el cuadro DETRÁS de todo eso era razonable. Metiéndolo
     *   ENTRE los grupos es destructivo: la retícula del cuadro arrancaba a
     *   las 14:38 y la de los grupos iba a las 14:30, 15:00, 15:30… Ocho
     *   minutos de desfase bastan para que cada partido de cuadro pise el
     *   turno de grupos siguiente y no encuentre cancha en toda la tarde.
     *   Medido: las semifinales de 5ª se iban de las 15:08 a las 18:08.
     *
     *   La fase de grupos se planifica a la duración nominal, uno detrás de
     *   otro. El cuadro del mismo día tiene que leer el mismo reloj. El
     *   retraso real se dice aparte, en `finRealista`, que es donde el
     *   organizador lo necesita.
     */
    const minutosReales = minutosPartido;

    /** 'HH:MM' del club, no del servidor (que corre en UTC). */
    const horaEnClub = (iso: string): string =>
      new Date(iso).toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City',
      });
    /** 'YYYY-MM-DD' del club. */
    const diaEnClub = (iso: string): string =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const aMinutos = (hhmm: string): number =>
      Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

    // ── Los grupos que se juegan ESTE MISMO DÍA ────────────────────────────
    //
    // El cuadro ya no espera a que se vacíe el club. Dos cosas salen de aquí:
    //
    //   · CUÁNDO puede empezar CADA categoría: cuando acaban SUS grupos. Antes
    //     era cuando acababan los del torneo entero, y eso ataba a la primera
    //     categoría a la última: en Padel Hype los cuartos de 5ª Mixto salían
    //     a las 18:08 con sus grupos terminados a las 15:00. Tres horas de
    //     nada para doce parejas.
    //
    //   · QUÉ CANCHAS están ocupadas y hasta cuándo, para que el cuadro se
    //     meta en los huecos que la fase de grupos va dejando en vez de
    //     empezar donde ya no queda nadie.
    //
    // Junto hacen del día una cascada: cada categoría juega sus grupos y
    // enseguida su cuadro, mientras las demás siguen en grupos. El torneo
    // acaba antes y nadie se queda mirando.
    const { data: gruposDelDia } = await admin
      .from('matches')
      .select('category_id, scheduled_at, court_label')
      .eq('tournament_id', tournamentId)
      .eq('stage', 'group')
      .not('scheduled_at', 'is', null);

    interface GrupoEnPista { categoryId: string; desdeMin: number; cancha: string | null }
    const enPista: GrupoEnPista[] = [];
    /** categoryId -> minuto en que acaba su último partido de grupos. */
    const finDeSusGrupos = new Map<string, number>();

    for (const m of (gruposDelDia ?? []) as Array<{
      category_id: string; scheduled_at: string; court_label: string | null;
    }>) {
      // Solo los del día del cuadro: en un torneo de varios días los del
      // viernes no ocupan ninguna cancha del domingo.
      if (diaEnClub(m.scheduled_at) !== ventana.dia) continue;
      const desdeMin = aMinutos(horaEnClub(m.scheduled_at));
      enPista.push({ categoryId: m.category_id, desdeMin, cancha: m.court_label });
      const fin = desdeMin + minutosReales;
      finDeSusGrupos.set(m.category_id, Math.max(finDeSusGrupos.get(m.category_id) ?? 0, fin));
    }

    /**
     * A qué hora ARRANCA el día de cuadro: en cuanto la PRIMERA categoría
     * tenga sus grupos terminados. Las demás esperan a los suyos con
     * `noAntesDe`, y las canchas ocupadas las respeta `ocupadas`.
     *
     * Sin grupos ese día —el caso de varios días, donde el último es solo
     * cuadro— es la apertura de la ventana, como siempre.
     */
    const aperturaMin = aMinutos(aHHMM(ventana.desde));
    const primerFin = finDeSusGrupos.size > 0
      ? Math.min(...finDeSusGrupos.values())
      : null;
    /**
     * Alineado a la retícula del día. Si los grupos van a y media, el cuadro
     * también: una retícula desplazada no encuentra nunca una cancha entera
     * libre porque siempre pisa el turno siguiente.
     */
    const alineado = (min: number): number =>
      aperturaMin + Math.ceil(Math.max(0, min - aperturaMin) / minutosPartido) * minutosPartido;

    const desdeCuadro = primerFin === null
      ? aHHMM(ventana.desde)
      : deMinutos(alineado(Math.max(aperturaMin, primerFin)));

    if (dias.length === 1 && finDeSusGrupos.size === 0) {
      // Grupos sin programar todavía. No se adivina: el cuadro arranca en la
      // apertura y se avisa, que es lo que había antes de esto.
      avisos.push(
        'El torneo es de un solo día y sus partidos de grupos no tienen hora: el cuadro se ' +
        'programa desde la apertura y puede quedar encima de ellos.',
      );
    } else if (primerFin !== null) {
      avisos.push(
        `El cuadro arranca a las ${desdeCuadro}: cada categoría empieza el suyo en cuanto ` +
        'termina su fase de grupos, sin esperar a las demás.',
      );
    }

    // ─────────────────── 4. Clasificados por categoría ───────────────────
    // num_groups × advance_per_group + best_extra_qualifiers es exactamente lo
    // que produce selectQualifiers a partir del plan que guardó el cierre de
    // inscripciones. Las tres columnas son NULL mientras la categoría siga
    // abierta: esas se saltan en vez de asumir un default inventado.
    const { data: cats } = await admin
      .from('categories')
      .select('id, display_name, num_groups, advance_per_group, best_extra_qualifiers')
      .eq('tournament_id', tournamentId);

    // ── Quién juega en cada categoría ──────────────────────────────────────
    // Es lo que le permite al motor saber que dos categorías comparten gente.
    // Sin esto no hermana nada y programa octavos de dos categorías con
    // jugadores comunes a la misma hora — que es lo que pasaba: en el Cimepa
    // real, Santiago Cantillo tenía dos partidos simultáneos.
    //
    // TODAS las parejas de la categoría, no solo las que clasificarán: a la
    // hora de programar no se sabe quién pasa, y un superconjunto solo puede
    // sobre-separar. Equivocarse por ahí cuesta minutos de calendario;
    // equivocarse al revés cuesta que alguien no pueda jugar.
    const { data: todasParejas } = await admin
      .from('pairs')
      .select('category_id, player1_id, player2_id')
      .eq('tournament_id', tournamentId);

    const jugadoresPorCat = new Map<string, string[]>();
    for (const pr of todasParejas ?? []) {
      const ya = jugadoresPorCat.get(pr.category_id);
      const dos = [pr.player1_id, pr.player2_id];
      if (ya) ya.push(...dos);
      else jugadoresPorCat.set(pr.category_id, dos);
    }

    const categorias: CategoriaCuadro[] = [];
    for (const c of (cats ?? []) as FilaCategoria[]) {
      if (c.num_groups == null || c.advance_per_group == null || c.best_extra_qualifiers == null) {
        avisos.push(`${c.display_name}: sin formato calculado todavía, no entra en el calendario. Cierra sus inscripciones primero.`);
        continue;
      }
      const clasificados = c.num_groups * c.advance_per_group + c.best_extra_qualifiers;
      if (clasificados < 2) {
        avisos.push(`${c.display_name}: ${clasificados} clasificados, no hay cuadro que programar.`);
        continue;
      }
      categorias.push({ id: c.id, clasificados, jugadores: jugadoresPorCat.get(c.id) });
    }

    if (categorias.length === 0) {
      return json({
        error: 'sin_categorias_programables',
        message: 'Ninguna categoría tiene cuadro eliminatorio que programar.',
        avisos,
      }, 400);
    }

    // ─────────────────── 5. El motor decide ───────────────────
    //
    // EL CUADRO SE JUEGA EN LA SEDE DEL TORNEO, Y SOLO AHÍ.
    //
    // Mundo Pádel reparte los grupos entre Narvarte y Alberca Olímpica, y juega
    // todo el cuadro en Alberca — que es la sede del torneo, la del cartel. Las
    // demás sucursales prestan canchas para la fase de grupos y nada más.
    //
    // No hace falta preguntarlo: `tournaments.venue_id` ya lo dice. Derivarlo
    // así evita el estado imposible de una sede de eliminatorias sin ni una
    // cancha en el torneo.
    //
    // Sin canchas capturadas manda `courts`, que es como funcionó siempre.
    const { data: filasCanchas } = await admin
      .from('tournament_courts')
      .select('nombre, orden, venue_id')
      .eq('tournament_id', tournamentId)
      .order('orden');

    const todas = ((filasCanchas ?? []) as Array<{
      nombre: string; orden: number; venue_id: string | null;
    }>).map((f) => ({ nombre: f.nombre, orden: f.orden, venueId: f.venue_id }));

    const sedePrincipal = (torneo.venue_id as string | null) ?? null;
    const delCuadro = todas.length > 0
      ? canchasDeSede(todas, sedePrincipal, sedePrincipal)
      : [];

    if (todas.length > 0 && delCuadro.length === 0) {
      return json({
        error: 'sin_canchas_en_la_sede',
        message:
          'Ninguna cancha del torneo está en su sede. El cuadro se juega ahí, así que ' +
          'no hay dónde programarlo: revisa la sede de las canchas o la del torneo.',
      }, 400);
    }

    /**
     * El nombre de la cancha del cuadro, 1-based sobre las de la sede.
     *
     * Cae a `Cancha N` sin canchas capturadas: es lo que decía antes.
     */
    const etiquetaCuadro = (carril: number): string =>
      delCuadro[carril - 1]?.nombre ?? `Cancha ${carril}`;

    const canchasCuadro = delCuadro.length > 0 ? delCuadro.length : (torneo.courts as number);

    /**
     * 'Cancha 2' -> 2, el carril del cuadro. Null si esa cancha no es del
     * cuadro: los grupos de otra sucursal no ocupan nada aquí.
     *
     * Se busca por NOMBRE, que es lo que guarda `matches.court_label`. Sin
     * canchas capturadas se cae al número, que es como se nombraban siempre.
     */
    const carrilDelCuadro = (etiqueta: string | null): number | null => {
      if (!etiqueta) return null;
      if (delCuadro.length > 0) {
        const i = delCuadro.findIndex((c) => c.nombre === etiqueta);
        return i === -1 ? null : i + 1;
      }
      const n = Number(/(\d+)/.exec(etiqueta)?.[1]);
      return Number.isFinite(n) && n >= 1 && n <= canchasCuadro ? n : null;
    };

    const ocupadas: { cancha: number; desdeMin: number; hastaMin: number }[] = [];
    for (const g of enPista) {
      const carril = carrilDelCuadro(g.cancha);
      if (carril === null) continue;
      ocupadas.push({ cancha: carril, desdeMin: g.desdeMin, hastaMin: g.desdeMin + minutosReales });
    }

    const noAntesDe: Record<string, number> = {};
    for (const [catId, fin] of finDeSusGrupos) noAntesDe[catId] = alineado(fin);

    let plan: Calendario;
    try {
      plan = programarEliminatorias({
        canchas: canchasCuadro,
        desde: desdeCuadro,
        hasta: aHHMM(ventana.hasta),
        categorias,
        minutosPorPartido: torneo.match_minutes as number,
        // El día como cascada, no como dos bloques. Ver `gruposDelDia`.
        ocupadas,
        noAntesDe,
        // El torneo decide si se juega el 3.er lugar (migración 052). Sin esta
        // línea el motor caía a su default `true` y reservaba una cancha por
        // categoría para un partido que nadie iba a jugar: ocho slots fantasma
        // en la transición de semis a final, justo la hora más cargada.
        tercerLugar: (torneo as { tercer_lugar?: boolean }).tercer_lugar === true,
      });
    } catch (e) {
      // El motor valida su entrada (canchas, ventana invertida, duración fuera
      // de rango). Si rechaza, es capacidad mal capturada, no un fallo nuestro.
      return json({ error: 'entrada_invalida', message: String((e as Error).message ?? e) }, 400);
    }

    avisos.push(...plan.avisos);

    // ─────────────────── 6. No cabe: informar sin escribir ───────────────────
    // Un calendario a medias es peor que ninguno: el jugador vería hora en unos
    // partidos y no en otros sin saber por qué. Todo o nada.
    // Los empalmes con NOMBRE de categoría, no con uuid: el consumidor es una
    // pantalla y un aviso que dice "a3f9-… choca con 7b21-…" no sirve de nada.
    const nombrePorCat = new Map(
      ((cats ?? []) as FilaCategoria[]).map((c) => [c.id, c.display_name]),
    );
    const empalmes = plan.empalmes.map((e: Calendario['empalmes'][number]) => ({
      ...e,
      categoriaA: nombrePorCat.get(e.categoriaA) ?? e.categoriaA,
      categoriaB: nombrePorCat.get(e.categoriaB) ?? e.categoriaB,
    }));

    if (!plan.cabe) {
      return json({
        cabe: false,
        ok: false,
        categoriasSaltadas: [],
        partidosNoEscritos: 0,
        finEstimado: plan.finEstimado,
        cotaInferior: plan.cotaInferior,
        totalPartidos: plan.totalPartidos,
        ocupacionPorFranja: plan.ocupacionPorFranja,
        empalmes,
        avisos,
        diagnostico: plan.diagnostico ?? null,
        matchesActualizados: 0,
      }, 409);
    }

    // ─────────────────── 7a. Persistir el plan completo ───────────────────
    // Borrar y reinsertar, no upsert: un upsert dejaría vivos los slots de un
    // plan anterior con más partidos (menos clasificados tras una baja), y esos
    // huérfanos son horas fantasma que nadie juega.
    const { error: delErr } = await admin
      .from('match_schedule')
      .delete()
      .eq('tournament_id', tournamentId);
    if (delErr) return json({ error: 'plan_delete_failed', detail: delErr.message }, 400);

    const filasPlan = plan.partidos.map((p) => ({
      tournament_id: tournamentId,
      category_id: p.categoryId,
      stage: p.etapa,
      slot_index: p.indiceEnRonda,
      scheduled_at: aTimestamptz(ventana.dia, p.inicio),
      court_label: etiquetaCuadro(p.cancha),
    }));

    const { error: insErr } = await admin.from('match_schedule').insert(filasPlan);
    if (insErr) return json({ error: 'plan_insert_failed', detail: insErr.message }, 400);

    // ─────────────────── 7b. Volcar sobre los partidos que ya existen ─────────
    // Solo la(s) ronda(s) materializada(s). El emparejamiento es posicional
    // porque un partido del plan no tiene id: filas jugables ordenadas por
    // round_label ↔ slots ordenados por slot_index.
    //
    // "Jugable" = con las dos parejas Y `scheduled`. Los byes nacen `finished`
    // (045) y no son partidos pendientes: darles hora los pondría en la lista
    // del juez y en la pantalla del jugador como si alguien fuera a jugarlos.
    // Indexar el plan por (categoría, stage), ordenado por slot.
    const planPorGrupo = new Map<string, typeof plan.partidos>();
    for (const p of plan.partidos) {
      const k = `${p.categoryId}#${p.etapa}`;
      const arr = planPorGrupo.get(k);
      if (arr) arr.push(p);
      else planPorGrupo.set(k, [p]);
    }
    for (const arr of planPorGrupo.values()) {
      arr.sort((a, b) => a.indiceEnRonda - b.indiceEnRonda);
    }

    // Las filas que ya existen, indexadas por lo mismo.
    const { data: existentes } = await admin
      .from('matches')
      .select('id, category_id, stage, round_label, status, pair_a_id, pair_b_id')
      .eq('tournament_id', tournamentId)
      .neq('stage', 'group');

    const filasPorGrupo = new Map<string, FilaMatch[]>();
    for (const m of (existentes ?? []) as Array<FilaMatch & { category_id: string }>) {
      if (m.stage === STAGE_NO_PROGRAMABLE) continue;
      if (!m.pair_a_id || !m.pair_b_id) continue;   // bye o llave vacía
      if (m.status !== 'scheduled') continue;        // ya jugado o en curso
      const k = `${m.category_id}#${m.stage}`;
      const arr = filasPorGrupo.get(k);
      if (arr) arr.push(m);
      else filasPorGrupo.set(k, [m]);
    }
    for (const arr of filasPorGrupo.values()) {
      // round_label lleva zero-padding justamente para que el orden
      // lexicográfico coincida con el numérico (ver generate-bracket).
      arr.sort((a, b) => (a.round_label ?? '').localeCompare(b.round_label ?? ''));
    }

    const nombreCat = new Map(
      ((cats ?? []) as FilaCategoria[]).map((c) => [c.id, c.display_name]),
    );

    // Un desajuste de conteo significa que el plan y el cuadro real no hablan
    // del mismo torneo (se resembró, hubo una baja, cambió el formato). Escribir
    // igual desplazaría las horas una posición y nadie lo notaría hasta el día
    // del torneo. Se salta la CATEGORÍA entera, no solo el stage: dejar media
    // categoría programada es el mismo problema en pequeño.
    const catsConDesajuste = new Set<string>();
    for (const [k, slots] of planPorGrupo) {
      const [categoryId, stage] = k.split('#');
      const filas = filasPorGrupo.get(k);
      if (!filas) continue;   // ronda aún no materializada: normal, no es error
      if (filas.length !== slots.length) {
        catsConDesajuste.add(categoryId);
        avisos.push(
          `${nombreCat.get(categoryId) ?? categoryId} (${stage}): el plan tiene ${slots.length} partidos ` +
          `y en la base hay ${filas.length} jugables. No se escribió ninguna hora de esta categoría.`,
        );
      }
    }

    let matchesActualizados = 0;
    /** UPDATE que no llegaron a la base. Antes solo se contaban en `avisos`. */
    let erroresDeEscritura = 0;
    for (const [k, slots] of planPorGrupo) {
      const [categoryId] = k.split('#');
      if (catsConDesajuste.has(categoryId)) continue;
      const filas = filasPorGrupo.get(k);
      if (!filas) continue;

      for (let i = 0; i < filas.length; i++) {
        const p = slots[i];
        const { error } = await admin
          .from('matches')
          .update({
            scheduled_at: aTimestamptz(ventana.dia, p.inicio),
            court_label: etiquetaCuadro(p.cancha),
          })
          .eq('id', filas[i].id);
        if (error) {
          erroresDeEscritura += 1;
          avisos.push(
            `${nombreCat.get(categoryId) ?? categoryId}: no se pudo guardar la hora de un partido (${error.message}).`,
          );
          continue;
        }
        matchesActualizados++;
      }
    }

    // ─────────────────── 8. Cuadrar las cuentas ───────────────────
    //
    // `cabe: true` estaba escrito a mano y significaba "el plan cabía en la
    // ventana". Pero entre el plan y la base hay dos filtros que pueden dejar
    // una categoría sin una sola hora — el desajuste de conteo, que salta la
    // categoría ENTERA, y los UPDATE que fallan uno a uno—, y los dos se
    // contaban solo en `avisos`. Un aviso en una lista no es un veredicto: la
    // pantalla leía `cabe` y pintaba "listo".
    //
    // Ahora una categoría saltada es un NO. El plan cabía; el torneo no quedó
    // programado, que es lo que el organizador necesita saber.
    const categoriasSaltadas = [...catsConDesajuste].map((id) => ({
      categoryId: id,
      categoria: nombreCat.get(id) ?? id,
      motivo: 'desajuste_con_el_cuadro' as const,
      queHacer:
        'El plan y el cuadro sembrado no tienen el mismo número de partidos. ' +
        'Suele pasar si se resembró la categoría o hubo una baja después de programar: ' +
        'vuelve a sembrar el cuadro y programa otra vez.',
    }));

    const okKnockout = categoriasSaltadas.length === 0 && erroresDeEscritura === 0;

    return json({
      // `cabe` sigue diciendo lo que decía —si el plan entraba en la ventana—,
      // pero ya no es el veredicto: para eso está `ok`.
      cabe: true,
      ok: okKnockout,
      categoriasSaltadas,
      partidosNoEscritos: erroresDeEscritura,
      finEstimado: plan.finEstimado,
      cotaInferior: plan.cotaInferior,
      totalPartidos: plan.totalPartidos,
      ocupacionPorFranja: plan.ocupacionPorFranja,
      // Se devuelven, no se persisten: son una función pura del calendario
      // guardado más quién juega en cada categoría, y ambas cosas ya están en
      // la base. Una tabla los duplicaría y podría quedarse desfasada al primer
      // partido que el organizador mueva a mano. Ver la nota del final.
      empalmes,
      avisos,
      diagnostico: plan.diagnostico ?? null,
      matchesActualizados,
      // 409 y no 200 cuando algo quedó sin hora: `close-registration` y la
      // pantalla miran `res.ok`, así que el veredicto tiene que estar también
      // en el status y no solo en el cuerpo.
    }, okKnockout ? 200 : 409);
  } catch (e) {
    return json({ error: 'unhandled', detail: String(e) }, 500);
  }
});
