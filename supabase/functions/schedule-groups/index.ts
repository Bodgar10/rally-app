// supabase/functions/schedule-groups/index.ts
// Corre el scheduler de FASE DE GRUPOS (engine) y persiste el calendario.
// NO reimplementa lógica de torneo: el motor decide, esta función lee y escribe.
//
// GEMELA DE schedule-knockout, PERO ESCRIBE EN UN SOLO SITIO
//   Aquella escribe en `match_schedule` y en `matches` porque el cuadro se
//   materializa ronda a ronda y el plan cubre partidos que todavía no tienen
//   fila. Aquí no hace falta: los partidos de grupo existen desde
//   `close-registration`, así que el calendario va directo a
//   `matches.scheduled_at` y `matches.court_label`. Además `match_schedule`
//   tiene un check que prohíbe `stage = 'group'` (migración 047).
//
// EL BLOQUE DE CADA GRUPO SE RECALCULA, NO SE LEE
//   No hay columna de bloque en `groups`. `close-registration` lo resolvió al
//   formar los grupos y solo lo dijo en su respuesta. Aquí se vuelve a deducir
//   de `pair_block_choices` con `bloqueDeGrupo`, LA MISMA función que usó el
//   cierre — por eso vive en `reparto.ts` y se exporta: dos implementaciones de
//   la regla de la mayoría acabarían discrepando y el síntoma sería un torneo
//   con horarios que no cuadran.
//
// LOS PARTIDOS YA JUGADOS NO SE TOCAN
//   Su hora es un hecho histórico, no un plan. Reprogramar sobrescribe solo lo
//   que sigue pendiente, y dice cuántos se saltó.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  generarBloques,
  bloqueDeGrupo,
  programarGrupos,
  type Bloque,
  type GrupoAProgramar,
  type CalendarioGrupos,
} from '../_shared/engine.bundle.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

// México abolió el horario de verano en 2022: UTC-6 todo el año. Fijo a
// propósito — la zona del servidor de Edge Functions es UTC y usarla correría
// el calendario seis horas. Mismo criterio que schedule-knockout.
const OFFSET_MX = '-06:00';

/** 'HH:MM:SS' de una columna `time` → 'HH:MM', que es lo que consume el motor. */
const aHHMM = (t: string): string => t.slice(0, 5);

/** 'YYYY-MM-DDTHH:MM' del motor → timestamptz sin ambigüedad. */
const aTimestamptz = (local: string): string => `${local}:00${OFFSET_MX}`;

interface FilaVentana { dia: string; desde: string; hasta: string }
interface FilaGrupo { id: string; name: string; category_id: string }
interface FilaPareja {
  id: string; category_id: string; group_id: string | null;
  player1_id: string; player2_id: string;
}
interface FilaPartido {
  id: string; group_id: string | null; category_id: string;
  pair_a_id: string | null; pair_b_id: string | null;
  round_label: string | null; status: string;
  /** Necesario para distinguir "ya tiene hora" de "nunca la tuvo". Ver el paso 7. */
  scheduled_at: string | null;
}

/** 'R1' → 1. Es lo que escribe close-registration desde `generateRoundRobin`. */
function rondaDe(label: string | null, orden: number): number {
  const m = /^R(\d+)$/.exec(label ?? '');
  // Sin etiqueta se cae al orden de llegada: peor calendario, pero calendario.
  return m ? Number(m[1]) : orden + 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    // ─────────────────── 1. Auth: SOLO el organizador ───────────────────
    // Programar el torneo es acto de organización, no de captura: los jueces no
    // deben poder correrlo. Mismo criterio que schedule-knockout.
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
      .select('id, organizer_id, courts, match_minutes')
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
    // Se listan TODAS las que faltan de una vez, para que el organizador no
    // descubra la segunda tras arreglar la primera.
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

    // ─────────────────── 3. La retícula ───────────────────
    let bloques: Bloque[];
    const avisos: string[] = [];
    try {
      const reticula = generarBloques({
        ventanas: (ventanas as FilaVentana[]).map((v) => ({
          dia: v.dia, desde: aHHMM(v.desde), hasta: aHHMM(v.hasta),
        })),
        canchas: torneo.courts as number,
        minutosPorPartido: torneo.match_minutes as number,
      });
      bloques = reticula.bloques;
      avisos.push(...reticula.avisos);
    } catch (e) {
      return json({ error: 'entrada_invalida', message: String((e as Error).message ?? e) }, 400);
    }

    // ─────────────────── 4. Grupos, partidos y elecciones ───────────────────
    const { data: cats } = await admin
      .from('categories')
      .select('id, display_name')
      .eq('tournament_id', tournamentId);
    const idsCat = (cats ?? []).map((c) => c.id);
    const nombrePorCat = new Map((cats ?? []).map((c) => [c.id, c.display_name]));

    if (idsCat.length === 0) {
      return json({ error: 'sin_categorias', message: 'El torneo no tiene categorías.' }, 400);
    }

    const [{ data: grupos }, { data: parejas }, { data: partidos }, { data: elecciones }] =
      await Promise.all([
        admin.from('groups').select('id, name, category_id').in('category_id', idsCat),
        admin.from('pairs')
          .select('id, category_id, group_id, player1_id, player2_id')
          .eq('tournament_id', tournamentId),
        admin.from('matches')
          .select('id, group_id, category_id, pair_a_id, pair_b_id, round_label, status, scheduled_at')
          .eq('tournament_id', tournamentId)
          .eq('stage', 'group'),
        admin.from('pair_block_choices')
          .select('pair_id, bloque_id')
          .eq('tournament_id', tournamentId),
      ]);

    const filasGrupo = (grupos ?? []) as FilaGrupo[];
    if (filasGrupo.length === 0) {
      return json({
        error: 'sin_grupos',
        message: 'No hay grupos que programar. Cierra las inscripciones primero.',
      }, 400);
    }

    const bloquePorPareja = new Map<string, string>();
    for (const e of elecciones ?? []) bloquePorPareja.set(e.pair_id, e.bloque_id);

    const parejasPorGrupo = new Map<string, FilaPareja[]>();
    const jugadoresPorCategoria: Record<string, string[]> = {};
    for (const p of (parejas ?? []) as FilaPareja[]) {
      (jugadoresPorCategoria[p.category_id] ??= []).push(p.player1_id, p.player2_id);
      if (!p.group_id) continue;
      const ya = parejasPorGrupo.get(p.group_id);
      if (ya) ya.push(p);
      else parejasPorGrupo.set(p.group_id, [p]);
    }

    const partidosPorGrupo = new Map<string, FilaPartido[]>();
    for (const m of (partidos ?? []) as FilaPartido[]) {
      if (!m.group_id) continue;
      const ya = partidosPorGrupo.get(m.group_id);
      if (ya) ya.push(m);
      else partidosPorGrupo.set(m.group_id, [m]);
    }

    // ─────────────────── 5. Armar la entrada del motor ───────────────────
    const entrada: GrupoAProgramar[] = [];
    for (const g of filasGrupo) {
      const suyos = (partidosPorGrupo.get(g.id) ?? [])
        // Orden estable: por etiqueta de ronda y luego por id.
        .sort((a, b) => (a.round_label ?? '').localeCompare(b.round_label ?? '')
          || a.id.localeCompare(b.id));

      if (suyos.length === 0) {
        avisos.push(`${nombrePorCat.get(g.category_id) ?? g.category_id} · grupo ${g.name}: sin partidos creados.`);
        continue;
      }

      const misParejas = parejasPorGrupo.get(g.id) ?? [];
      entrada.push({
        id: g.id,
        categoryId: g.category_id,
        nombre: g.name,
        bloqueId: bloqueDeGrupo(misParejas.map((p) => bloquePorPareja.get(p.id) ?? null)),
        partidos: suyos.map((m, i) => ({
          matchId: m.id,
          pairAId: m.pair_a_id ?? '',
          pairBId: m.pair_b_id ?? '',
          ronda: rondaDe(m.round_label, i),
        })),
      });
    }

    if (entrada.length === 0) {
      return json({ error: 'sin_partidos', message: 'Los grupos no tienen partidos que programar.', avisos }, 400);
    }

    // ─────────────────── 6. El motor decide ───────────────────
    let plan: CalendarioGrupos;
    try {
      plan = programarGrupos({
        bloques,
        minutosPorPartido: torneo.match_minutes as number,
        grupos: entrada,
        jugadoresPorCategoria,
      });
    } catch (e) {
      return json({ error: 'entrada_invalida', message: String((e as Error).message ?? e) }, 400);
    }
    avisos.push(...plan.avisos);

    // ─────────────────── 7. Escribir ───────────────────
    // Un partido ya jugado conserva su hora: es un hecho, no un plan. Se cuenta
    // aparte para que el organizador sepa que ese trozo del calendario no se
    // movió aunque él pidiera reprogramar.
    //
    // PERO SOLO SI TIENE HORA QUE CONSERVAR. Antes bastaba con `status =
    // 'finished'`, y eso dejaba fuera para siempre al partido que se capturó
    // ANTES de generar el calendario: nunca tuvo `scheduled_at`, el scheduler
    // lo saltaba por jugado, y en la pantalla de Grupos salía sin hora ni
    // cancha mientras sus vecinos las tenían — con pinta de que se habían
    // borrado al capturar.
    //
    // Verificado en el torneo de prueba: 162 de 165 partidos con hora, y los
    // 3 sin ella eran exactamente los 3 capturados. Todos del mismo grupo.
    //
    // Se le escribe su franja igual: es la que le tocaba, y el orden de las
    // dos acciones del organizador —capturar y programar— no debería cambiar
    // lo que ve después.
    const jugados = new Set(
      ((partidos ?? []) as FilaPartido[])
        .filter((m) => m.status === 'finished' && m.scheduled_at)
        .map((m) => m.id),
    );

    const porEscribir = plan.partidos.filter((p) => !jugados.has(p.matchId));
    let escritos = 0;
    const fallos: string[] = [];

    // UPDATE fila a fila y no un upsert en lote: cada partido lleva hora Y
    // cancha distintas, así que el lote exigiría mandar la fila entera y se
    // arriesgaría a pisar columnas que no son nuestras (resultado, estado,
    // parejas). El UPDATE toca exactamente dos columnas.
    //
    // Pero EN TANDAS, no en fila india: un torneo como Cimepa son 165 partidos,
    // y 165 viajes seguidos a Postgres desde una Edge Function son segundos de
    // reloj por nada. De 20 en 20 baja a nueve viajes.
    const TANDA = 20;
    for (let i = 0; i < porEscribir.length; i += TANDA) {
      const tanda = porEscribir.slice(i, i + TANDA);
      const res = await Promise.all(tanda.map((p) =>
        admin
          .from('matches')
          .update({ scheduled_at: aTimestamptz(p.inicio), court_label: `Cancha ${p.cancha}` })
          .eq('id', p.matchId)
          .then((r) => ({ id: p.matchId, error: r.error }))
      ));
      for (const r of res) {
        if (r.error) fallos.push(`${r.id}: ${r.error.message}`);
        else escritos += 1;
      }
    }

    // Los empalmes con NOMBRE de categoría, no con uuid: el consumidor es una
    // pantalla, y "a3f9-… choca con 7b21-…" no le sirve a nadie.
    const empalmes = plan.empalmes.map((e) => ({
      ...e,
      categoriaA: nombrePorCat.get(e.categoriaA) ?? e.categoriaA,
      categoriaB: nombrePorCat.get(e.categoriaB) ?? e.categoriaB,
    }));

    const sinProgramar = plan.sinProgramar.map((s) => ({
      ...s,
      categoria: nombrePorCat.get(s.categoryId) ?? s.categoryId,
      grupo: filasGrupo.find((g) => g.id === s.groupId)?.name ?? s.groupId,
    }));

    return json({
      ok: fallos.length === 0,
      matchesActualizados: escritos,
      partidosPlanificados: plan.partidos.length,
      partidosYaJugados: plan.partidos.length - porEscribir.length,
      sinProgramar,
      empalmes,
      sobrevendidos: plan.sobrevendidos,
      ocupacion: plan.ocupacion,
      ocupacionPorBloque: plan.ocupacionPorBloque,
      avisos,
      fallos: fallos.length > 0 ? fallos : undefined,
    }, fallos.length > 0 ? 500 : 200);
  } catch (e) {
    console.error('[schedule-groups] error no controlado:', e);
    return json({ error: 'internal', message: String((e as Error).message ?? e) }, 500);
  }
});
