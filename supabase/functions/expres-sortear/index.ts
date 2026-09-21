/**
 * supabase/functions/expres-sortear/index.ts
 *
 * RALLY · Sortear un torneo exprés: grupos, calendario y horas.
 *
 * QUÉ HACE, EN ORDEN
 *   1. Lee el torneo, su configuración exprés, la ventana del día y las
 *      parejas inscritas.
 *   2. Calcula el reparto A/B y las rondas con `generarFixtureExpres`, a
 *      partir de la SEMILLA GUARDADA.
 *   3. Calcula las horas con `planificarExpres`.
 *   4. Se lo pasa todo a `sortear_expres`, que lo escribe en una transacción.
 *
 * EL SORTEO ES UNA FUNCIÓN PURA DE (PAREJAS, SEMILLA)
 *   No hay `Math.random()` en ningún punto de este camino. La semilla se
 *   guardó al crear el torneo y desde entonces el reparto es reproducible: con
 *   esa semilla y la lista de inscritas, cualquiera vuelve a sacar los mismos
 *   grupos y el mismo calendario. Es lo que permite enseñar el sorteo cuando
 *   alguien pregunta por qué le tocó el grupo de la muerte.
 *
 * LAS HORAS SE CALCULAN AQUÍ Y NO EN LA PANTALLA
 *   La pantalla de alta también llama a `planificarExpres`, pero para enseñar
 *   una previsión. La que vale es esta, con los datos que hay en la base en el
 *   momento del sorteo — el club pudo cambiar las canchas o la hora de cierre
 *   entre que creó el torneo y que cerró inscripciones.
 *
 * POR QUÉ NO ESCRIBE NADA DIRECTAMENTE
 *   Son cuatro escrituras que dependen entre sí —grupos, reparto, tabla y 20 a
 *   40 partidos— y a medias dejan un torneo imposible de continuar. Van a
 *   `sortear_expres`, que las hace en una transacción. Aquí solo se calcula.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { generarFixtureExpres, planificarExpres } from '../_shared/engine.bundle.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });

/**
 * México abolió el horario de verano en 2022: UTC-6 todo el año. Fijo a
 * propósito — la zona del servidor de Edge Functions es UTC y usarla correría
 * el calendario seis horas. Mismo criterio que schedule-groups y
 * schedule-knockout.
 */
const OFFSET_MX = '-06:00';

/** 'HH:MM:SS' de una columna `time` → 'HH:MM', que es lo que consume el motor. */
const aHHMM = (t: string): string => t.slice(0, 5);

/** 'YYYY-MM-DD' + 'HH:MM' → timestamptz sin ambigüedad. */
const aTimestamptz = (dia: string, hhmm: string): string => `${dia}T${hhmm}:00${OFFSET_MX}`;

/** 'HH:MM' + minutos → 'HH:MM'. Para las tandas dentro de una franja. */
function sumarMinutos(hhmm: string, minutos: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const categoryId = body?.category_id as string | undefined;
    if (!categoryId) return json({ error: 'falta_category_id' }, 400);

    // ── Quién llama ─────────────────────────────────────────────────────────
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

    // ── Contexto ────────────────────────────────────────────────────────────
    const { data: cat, error: ce } = await admin
      .from('categories')
      .select('id, tournament_id')
      .eq('id', categoryId)
      .maybeSingle();
    if (ce) return json({ error: 'db', detail: ce.message }, 500);
    if (!cat) return json({ error: 'category_not_found' }, 404);

    const [torneoRes, cfgRes, etapasRes, ventanasRes, parejasRes] = await Promise.all([
      admin.from('tournaments').select('id, modo, courts, start_date').eq('id', cat.tournament_id).maybeSingle(),
      admin.from('expres_config').select('*').eq('tournament_id', cat.tournament_id).maybeSingle(),
      admin.from('expres_etapa').select('stage, formato, minutos').eq('tournament_id', cat.tournament_id),
      admin.from('tournament_windows').select('dia, desde, hasta').eq('tournament_id', cat.tournament_id).order('dia'),
      // ► SOLO LAS QUE PAGARON, igual que el camino largo.
      //   Antes se tomaban TODAS las parejas de la categoría, así que una
      //   inscripción en 'pending' entraba al sorteo. `close-registration`
      //   nunca las contó; que el exprés sí lo hiciera era la misma pregunta
      //   con dos respuestas. `sembrar_expres` lo comprueba otra vez del lado
      //   de la base: aquí se filtra para que el reparto salga bien, allí
      //   para que no se pueda escribir mal aunque se llame por otro camino.
      admin.from('pairs')
        .select('id')
        .eq('category_id', categoryId)
        .in('payment_status', ['paid_online', 'paid_offline', 'comp'])
        .order('id'),
    ]);

    const torneo = torneoRes.data;
    const cfg = cfgRes.data;
    if (!torneo) return json({ error: 'tournament_not_found' }, 404);
    if (torneo.modo !== 'expres') {
      return json({
        error: 'not_an_expres_tournament',
        detail: 'Este torneo no es exprés. La fase de grupos larga se monta por su camino.',
      }, 409);
    }
    if (!cfg) {
      return json({
        error: 'sin_expres_config',
        detail: 'Falta la configuración del exprés: cupo, semilla y partidos por pareja.',
      }, 409);
    }
    if (cfg.sorteado_at) {
      return json({
        error: 'expres_ya_sorteado',
        detail: `Este torneo se sorteó el ${cfg.sorteado_at}. Volver a sortear daría otro reparto.`,
      }, 409);
    }
    if (!torneo.courts || torneo.courts <= 0) {
      return json({ error: 'sin_canchas', detail: 'Falta capturar cuántas canchas se van a usar.' }, 409);
    }

    const ventana = (ventanasRes.data ?? [])[0];
    if (!ventana) {
      return json({
        error: 'sin_horario',
        detail: 'Falta el horario: el torneo no tiene ventana de juego para su día.',
      }, 409);
    }

    // Los minutos por etapa NO tienen valor por defecto: sin ellos el horario
    // saldría de un número inventado y parecería correcto.
    const porEtapa: Record<string, number> = {};
    for (const e of etapasRes.data ?? []) porEtapa[e.stage] = e.minutos;
    const faltan = ['group', 'quarter', 'semi', 'final'].filter((s) => !porEtapa[s]);
    if (faltan.length > 0) {
      return json({
        error: 'sin_formato_de_etapa',
        detail: `Faltan los minutos de: ${faltan.join(', ')}. Se capturan al crear el torneo.`,
      }, 409);
    }

    const pairIds = (parejasRes.data ?? []).map((p) => p.id as string);
    if (pairIds.length !== cfg.cupo) {
      return json({
        error: 'cupo_no_cuadra',
        detail: `Hay ${pairIds.length} parejas inscritas y el cupo es ${cfg.cupo}. ` +
          `El sorteo se hace con el cupo completo.`,
        inscritas: pairIds.length,
        cupo: cfg.cupo,
      }, 409);
    }

    // ── El reparto y el calendario ──────────────────────────────────────────
    let fixture, plan;
    try {
      fixture = generarFixtureExpres({
        pairIds,
        semilla: cfg.semilla_sorteo,
        partidosPorPareja: cfg.partidos_por_pareja,
      });
      plan = planificarExpres({
        cupo: cfg.cupo,
        canchas: torneo.courts,
        partidosPorPareja: cfg.partidos_por_pareja,
        ventana: { desde: aHHMM(ventana.desde), hasta: aHHMM(ventana.hasta) },
        minutos: {
          group: porEtapa.group,
          quarter: porEtapa.quarter,
          semi: porEtapa.semi,
          final: porEtapa.final,
        },
      });
    } catch (e) {
      // El motor rechaza por datos imposibles —cupo impar, K mayor que el
      // grupo—, y su mensaje ya explica qué hacer. No se traduce.
      return json({ error: 'fixture_invalido', detail: (e as Error).message }, 409);
    }

    // Las franjas de grupo del plan van en el MISMO orden que las del fixture
    // (A1, B1, A2, B2…). Si algún día dejaran de ir, el calendario saldría
    // desplazado y nadie lo notaría hasta que una pareja llegara tarde a su
    // partido. Así que se comprueba en vez de confiarse.
    const franjasPlan = plan.franjas.filter((f: { etapa: string }) => f.etapa === 'group');
    if (franjasPlan.length !== fixture.franjas.length) {
      return json({
        error: 'desfase_plan_fixture',
        detail: `El plan tiene ${franjasPlan.length} franjas de grupo y el fixture ${fixture.franjas.length}.`,
      }, 500);
    }
    for (let i = 0; i < franjasPlan.length; i++) {
      const a = franjasPlan[i];
      const b = fixture.franjas[i];
      if (a.grupo !== b.grupo || a.ronda !== b.ronda) {
        return json({
          error: 'desfase_plan_fixture',
          detail: `La franja ${i + 1} es ${a.grupo}${a.ronda} en el plan y ${b.grupo}${b.ronda} en el fixture.`,
        }, 500);
      }
    }

    // ── Partidos con hora y cancha ──────────────────────────────────────────
    //
    //   Cuando una ronda no cabe de una vez, los partidos que sobran pasan a
    //   la tanda siguiente: misma franja, media hora más tarde. Es lo que ya
    //   contaba `tandas` en el plan; aquí se materializa.
    const partidos: Record<string, unknown>[] = [];
    for (let i = 0; i < fixture.franjas.length; i++) {
      const franja = fixture.franjas[i];
      const hora = franjasPlan[i].desde as string;
      franja.partidos.forEach((p: { pairAId: string; pairBId: string }, idx: number) => {
        const tanda = Math.floor(idx / torneo.courts!);
        const cancha = (idx % torneo.courts!) + 1;
        partidos.push({
          grupo: franja.grupo,
          ronda: franja.ronda,
          orden: franja.orden,
          pair_a_id: p.pairAId,
          pair_b_id: p.pairBId,
          scheduled_at: aTimestamptz(ventana.dia, sumarMinutos(hora, tanda * porEtapa.group)),
          court_label: `Cancha ${cancha}`,
        });
      });
    }

    const grupos = fixture.grupos.map((g: { grupo: string; pairIds: string[] }) => ({
      name: g.grupo,
      pair_ids: g.pairIds,
    }));

    // ── Escribir, todo o nada ───────────────────────────────────────────────
    const { data: result, error: re } = await admin.rpc('sortear_expres', {
      p_actor: actor,
      p_category_id: categoryId,
      p_grupos: grupos,
      p_partidos: partidos,
    });
    if (re) {
      const conflicto = /ya_sorteado|grupos_ya_existen|cupo_no_cuadra|parejas_sin_repartir|calendario_no_cuadra|pareja_ajena/.test(re.message);
      return json({ error: 'sorteo_fallido', detail: re.message }, conflicto ? 409 : 500);
    }

    return json({
      ok: true,
      result,
      grupos: grupos.map((g) => ({ name: g.name, parejas: g.pair_ids.length })),
      partidos: partidos.length,
      empieza: plan.inicio,
      termina_grupos: plan.finDeGrupos,
      termina: plan.fin,
      zona: plan.zona,
      avisos: plan.avisos,
    });
  } catch (e) {
    return json({ error: 'inesperado', detail: (e as Error).message }, 500);
  }
});
