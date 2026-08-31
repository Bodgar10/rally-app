import { createClient } from 'jsr:@supabase/supabase-js@2';
import { validarMovimiento } from '../_shared/engine.bundle.js';

// ============================================================================
// RALLY · Mover un partido de hora y/o cancha
//
// POR QUÉ EXISTE, SI LA PANTALLA YA VALIDA
//   La pantalla valida en vivo para que el organizador vea el conflicto
//   mientras toca los botones. Eso es UX. Entre esa lectura y el «Mover»
//   cualquiera pudo ocupar el hueco, y un cliente viejo —o un curl— no valida
//   nada. La verdad se decide aquí.
//
// LA MISMA REGLA, NO UNA PARECIDA
//   Se llama a `validarMovimiento` del engine, el mismo código que corre en la
//   pantalla. Reescribir las reglas en SQL habría garantizado que un día
//   dijeran cosas distintas; lo que sí se rehace en la RPC son las dos que son
//   seguridad de datos y que SQL decide sin ambigüedad (cancha y jugadores),
//   como defensa en profundidad bajo el bloqueo.
//
// ZONA HORARIA
//   El engine trabaja con día ('YYYY-MM-DD') y minutos desde medianoche del
//   club, sin `Date` dentro. Aquí se convierte una vez, con la zona fija de
//   México — que no tiene horario de verano desde 2022, así que el desfase es
//   constante. Mismo valor y mismo motivo que schedule-knockout.
// ============================================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

const ZONA = 'America/Mexico_City';
const OFFSET_MX = '-06:00';

const diaDe = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));

const minutosDe = (iso: string) => {
  const hhmm = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
};

const dosDigitos = (n: number) => String(n).padStart(2, '0');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const { match_id, dia, inicio_min, cancha } = await req.json();
    if (!match_id || !dia || !cancha || typeof inicio_min !== 'number') {
      return json({ error: 'bad_request' }, 400);
    }

    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: ures } = await asUser.auth.getUser();
    const actor = ures?.user?.id;
    if (!actor) return json({ error: 'unauthenticated' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── El partido y su torneo ────────────────────────────────────────────
    const { data: match, error: me } = await admin
      .from('matches')
      .select('id, tournament_id, scheduled_at, court_label')
      .eq('id', match_id).maybeSingle();
    if (me) return json({ error: 'match_read_failed', detail: me.message }, 500);
    if (!match) return json({ error: 'match_not_found' }, 404);

    const { data: torneo, error: te } = await admin
      .from('tournaments').select('match_minutes').eq('id', match.tournament_id).maybeSingle();
    if (te) return json({ error: 'tournament_read_failed', detail: te.message }, 500);
    if (!torneo) return json({ error: 'tournament_not_found' }, 404);

    // ── Todo el calendario del torneo, con sus jugadores ──────────────────
    // Los cuatro jugadores son lo que convierte "la cancha está libre" en "y
    // además nadie tiene que estar en dos sitios": sin ellos la comprobación
    // más importante no se puede hacer.
    const { data: partidos, error: pe } = await admin
      .from('matches')
      .select('id, category_id, stage, round_label, scheduled_at, court_label, status, source_match_ids, pair_a_id, pair_b_id')
      .eq('tournament_id', match.tournament_id);
    if (pe) return json({ error: 'matches_read_failed', detail: pe.message }, 500);

    const { data: parejas, error: qe } = await admin
      .from('pairs')
      .select('id, player1_id, player2_id')
      .eq('tournament_id', match.tournament_id);
    if (qe) return json({ error: 'pairs_read_failed', detail: qe.message }, 500);

    const jugadoresDe = new Map<string, string[]>();
    for (const p of parejas ?? []) {
      jugadoresDe.set(p.id, [p.player1_id, p.player2_id].filter(Boolean) as string[]);
    }

    // Nombres para que el conflicto diga a quién buscar. Si esta consulta
    // falla NO se aborta: un mensaje sin nombre sigue siendo un rechazo
    // correcto, y negar el movimiento por no saber apellidos sería peor.
    const { data: usuarios } = await admin
      .from('users').select('id, full_name')
      .in('id', [...new Set((parejas ?? []).flatMap((p) => [p.player1_id, p.player2_id]))].filter(Boolean));
    const nombres: Record<string, string> = {};
    for (const u of usuarios ?? []) if (u.full_name) nombres[u.id] = u.full_name;

    const enCalendario = (partidos ?? []).map((m: any) => ({
      id: m.id,
      categoryId: m.category_id,
      stage: m.stage,
      roundLabel: m.round_label,
      jugadores: [
        ...(m.pair_a_id ? jugadoresDe.get(m.pair_a_id) ?? [] : []),
        ...(m.pair_b_id ? jugadoresDe.get(m.pair_b_id) ?? [] : []),
      ],
      dia: m.scheduled_at ? diaDe(m.scheduled_at) : null,
      inicioMin: m.scheduled_at ? minutosDe(m.scheduled_at) : null,
      cancha: m.court_label,
      status: m.status,
      sourceMatchIds: m.source_match_ids ?? null,
    }));

    // ── ENGINE: la misma función que corre en la pantalla ─────────────────
    const veredicto = validarMovimiento({
      partidos: enCalendario,
      movimiento: { matchId: match_id, dia, inicioMin: inicio_min, cancha },
      minutosPorPartido: torneo.match_minutes ?? 60,
      nombres,
    });

    if (!veredicto.ok) {
      // 409 y no 400: la petición está bien formada, es el estado del
      // calendario el que no la admite. La diferencia importa para el cliente.
      return json({ error: 'conflicto', conflictos: veredicto.conflictos }, 409);
    }

    // ── Persistir, con el bloqueo y la revalidación del servidor ──────────
    const destino = `${dia}T${dosDigitos(Math.floor(inicio_min / 60))}:${dosDigitos(inicio_min % 60)}:00${OFFSET_MX}`;

    const { data: result, error: re } = await admin.rpc('move_match', {
      p_actor: actor,
      p_match_id: match_id,
      p_scheduled_at: destino,
      p_court_label: cancha,
      // Dónde creía el cliente que estaba: si ya no está ahí, alguien lo movió.
      p_esperado_at: match.scheduled_at,
      p_esperado_court: match.court_label,
    });

    if (re) {
      const msg = re.message ?? '';
      if (msg.includes('not_authorized')) return json({ error: 'not_authorized' }, 403);
      if (msg.includes('match_moved_meanwhile')) {
        return json({
          error: 'match_moved_meanwhile',
          detail: 'Alguien movió este partido mientras lo cambiabas. Recarga y vuelve a intentarlo.',
        }, 409);
      }
      // La RPC rehace cancha y jugadores por su cuenta. Que salte aquí después
      // de que el engine dijera que sí significa que el calendario cambió entre
      // la lectura y la escritura — que es exactamente para lo que está.
      if (msg.includes('cancha_ocupada') || msg.includes('jugador_ocupado')) {
        return json({ error: 'conflicto_al_guardar', detail: msg }, 409);
      }
      return json({ error: 'rpc_failed', detail: msg }, 400);
    }

    return json({ ok: true, result });
  } catch (e) {
    return json({ error: 'unhandled', detail: String(e) }, 500);
  }
});
