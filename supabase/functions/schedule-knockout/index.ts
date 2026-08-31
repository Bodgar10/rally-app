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
      .select('id, organizer_id, courts, match_minutes, tercer_lugar')
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
    if (dias.length === 1) {
      avisos.push(
        'El torneo tiene un solo día: la fase de grupos y las eliminatorias comparten la ventana, ' +
        'así que el calendario no reserva tiempo para los grupos.',
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
    let plan: Calendario;
    try {
      plan = programarEliminatorias({
        canchas: torneo.courts as number,
        desde: aHHMM(ventana.desde),
        hasta: aHHMM(ventana.hasta),
        categorias,
        minutosPorPartido: torneo.match_minutes as number,
        // El torneo decide si se juega el 3.er lugar (migración 052). Sin esta
        // línea el motor caía a su default `true` y reservaba una cancha por
        // categoría para un partido que nadie iba a jugar: ocho slots fantasma
        // en la transición de semis a final, justo la hora más cargada.
        tercerLugar: (torneo as { tercer_lugar?: boolean }).tercer_lugar !== false,
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
        finEstimado: plan.finEstimado,
        cotaInferior: plan.cotaInferior,
        totalPartidos: plan.totalPartidos,
        ocupacionPorFranja: plan.ocupacionPorFranja,
        empalmes,
        avisos,
        diagnostico: plan.diagnostico ?? null,
        matchesActualizados: 0,
      });
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
      court_label: `Cancha ${p.cancha}`,
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
            court_label: `Cancha ${p.cancha}`,
          })
          .eq('id', filas[i].id);
        if (error) {
          avisos.push(
            `${nombreCat.get(categoryId) ?? categoryId}: no se pudo guardar la hora de un partido (${error.message}).`,
          );
          continue;
        }
        matchesActualizados++;
      }
    }

    return json({
      cabe: true,
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
    });
  } catch (e) {
    return json({ error: 'unhandled', detail: String(e) }, 500);
  }
});
