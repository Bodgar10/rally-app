/**
 * supabase/functions/expres-resultado/index.ts
 *
 * RALLY · Capturar un partido de grupo de un exprés (suma 6).
 *
 * GEMELA DE `match-result`, Y APARTE
 *   Aquella deriva el ganador del marcador y lo contrasta con el que manda el
 *   juez. Aquí no hay ganador que derivar ni que contrastar: un suma 6 son seis
 *   games y el partido no lo gana nadie. Meter las dos cosas en la misma
 *   función obligaría a ramificar su núcleo, que es justo lo que no se toca.
 *
 * LA TABLA SE CALCULA UNA VEZ, EN TYPESCRIPT
 *   `prepararCapturaExpres` es la MISMA función que corre la pantalla del
 *   juez. No hay una versión de servidor y otra de cliente que puedan
 *   discrepar: el cliente la usa para enseñar el resultado antes de guardar y
 *   el servidor para decidir qué se guarda.
 *
 * DOS CAPTURAS A LA VEZ NO SE PISAN
 *   La RPC bloquea el grupo y compara una huella del estado contra lo que hay.
 *   Si otro juez capturó en medio, aborta con 'group_changed' y aquí se
 *   reintenta releyendo. Es el mismo mecanismo que la captura larga.
 *
 *   Con una diferencia que importa: allí la huella lleva `winner_pair_id` y
 *   aquí lleva los GAMES. En un exprés todos los ganadores son null, así que
 *   una huella basada en ellos no detectaría ningún cambio y las dos capturas
 *   pasarían.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { prepararCapturaExpres } from '../_shared/engine.bundle.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

const MAX_INTENTOS = 3;

interface FilaPartido {
  id: string;
  pair_a_id: string | null;
  pair_b_id: string | null;
  status: string;
}

/**
 * Huella del grupo tal y como lo leyó ESTA invocación, por MARCADOR.
 *
 * Ordenada por match_id para que las dos partes comparen lo mismo, y con la
 * misma forma exacta que construye `record_expres_result` en SQL: si una de
 * las dos cambia, deja de cuadrar SIEMPRE y nadie puede capturar. Van juntas a
 * propósito.
 */
const huella = (partidos: FilaPartido[], games: Map<string, { a: number; b: number }>) =>
  [...partidos]
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .map((m) => ({
      match_id: m.id,
      status: m.status,
      games_a: games.get(m.id)?.a ?? null,
      games_b: games.get(m.id)?.b ?? null,
    }));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const matchId = body?.match_id as string | undefined;
    if (!matchId) return json({ error: 'falta_match_id' }, 400);

    const borrando = body?.games_a == null && body?.games_b == null;
    const gamesA = borrando ? null : Number(body.games_a);
    const gamesB = borrando ? null : Number(body.games_b);

    // ── Quién captura ───────────────────────────────────────────────────────
    const auth = req.headers.get('Authorization') ?? '';
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: ures } = await asUser.auth.getUser();
    const actor = ures?.user?.id;
    if (!actor) return json({ error: 'unauthenticated' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── El partido y su contexto ────────────────────────────────────────────
    const { data: match, error: me } = await admin
      .from('matches')
      .select('id, tournament_id, category_id, group_id, formato, status')
      .eq('id', matchId)
      .maybeSingle();
    if (me) return json({ error: 'db', detail: me.message }, 500);
    if (!match) return json({ error: 'match_not_found' }, 404);
    if (!match.group_id) return json({ error: 'not_a_group_match' }, 409);
    if (match.formato !== 'suma_6') {
      return json({
        error: 'not_a_suma6_match',
        detail: 'Este partido no es a suma 6. Se captura por match-result.',
      }, 409);
    }

    // ── Reintento: si otro juez capturó en medio, se relee y se repite ──────
    let ultimoError = '';
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      const [partidosRes, standingsRes] = await Promise.all([
        admin
          .from('matches')
          .select('id, pair_a_id, pair_b_id, status')
          .eq('group_id', match.group_id),
        admin
          .from('group_standings')
          .select('pair_id')
          .eq('group_id', match.group_id),
      ]);
      if (partidosRes.error) return json({ error: 'db', detail: partidosRes.error.message }, 500);
      if (standingsRes.error) return json({ error: 'db', detail: standingsRes.error.message }, 500);

      const partidos = (partidosRes.data ?? []) as FilaPartido[];
      const pairIds = (standingsRes.data ?? []).map((r) => r.pair_id as string);
      if (pairIds.length === 0) {
        return json({ error: 'grupo_sin_tabla', detail: 'El grupo no tiene filas de tabla.' }, 409);
      }

      // Los marcadores ya capturados. Un suma 6 es UNA fila con set_number 1.
      const { data: sets, error: se } = await admin
        .from('match_sets')
        .select('match_id, games_a, games_b')
        .in('match_id', partidos.map((m) => m.id))
        .eq('set_number', 1);
      if (se) return json({ error: 'db', detail: se.message }, 500);

      const games = new Map<string, { a: number; b: number }>();
      for (const s of sets ?? []) games.set(s.match_id as string, { a: s.games_a as number, b: s.games_b as number });

      const resultados = partidos.map((m) => ({
        matchId: m.id,
        pairAId: m.pair_a_id!,
        pairBId: m.pair_b_id!,
        gamesA: games.get(m.id)?.a ?? null,
        gamesB: games.get(m.id)?.b ?? null,
      }));

      // ── La tabla, calculada con el MISMO código que la pantalla ───────────
      let captura;
      try {
        captura = prepararCapturaExpres({ pairIds, resultados, matchId, gamesA, gamesB });
      } catch (e) {
        // Marcador imposible o partido ajeno al grupo. El mensaje del motor ya
        // dice qué pasa y qué hacer; no se traduce ni se envuelve.
        return json({ error: 'marcador_invalido', detail: (e as Error).message }, 400);
      }

      const { data: result, error: re } = await admin.rpc('record_expres_result', {
        p_actor: actor,
        p_match_id: matchId,
        p_played_at: new Date().toISOString(),
        p_games_a: gamesA,
        p_games_b: gamesB,
        p_standings: captura.standings.map((s) => ({
          pair_id: s.pairId,
          played: s.played,
          games_won: s.gamesWon,
          games_lost: s.gamesLost,
          position: s.position,
          clinch_status: s.clinchStatus,
        })),
        p_group_state: huella(partidos, games),
      });

      if (!re) {
        return json({
          ok: true,
          result,
          borrado: borrando,
          tabla: captura.tabla,
          clinch: captura.clinch,
          intentos: intento,
        });
      }

      ultimoError = re.message;
      // Solo 'group_changed' se reintenta: es el único error que se arregla
      // releyendo. Un marcador inválido o una falta de permisos no cambian por
      // volver a intentarlo.
      if (!/group_changed/.test(re.message)) {
        const conflicto = /not_authorized|not_an_expres|not_a_suma6|suma6_|standings_incompletos/.test(re.message);
        return json({ error: 'captura_fallida', detail: re.message }, conflicto ? 409 : 500);
      }
    }

    return json({
      error: 'group_changed',
      detail: 'Otro juez capturó en este grupo mientras tanto y no se pudo resolver en ' +
        `${MAX_INTENTOS} intentos. Vuelve a cargar la pantalla.`,
      ultimo: ultimoError,
    }, 409);
  } catch (e) {
    return json({ error: 'inesperado', detail: (e as Error).message }, 500);
  }
});
