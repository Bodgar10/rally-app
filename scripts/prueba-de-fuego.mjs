#!/usr/bin/env node
/**
 * RALLY · Prueba de fuego: dos torneos, la misma semana, dos organizadores
 *
 * ► QUÉ CRUZA QUE NUNCA SE HA CRUZADO
 *   Hasta hoy la app solo ha vivido UN torneo, de UN organizador, con cada
 *   jugador en un sitio a la vez. Todas las reglas que deciden "de qué torneo
 *   habla esta pantalla" nunca han tenido que elegir. Esto las obliga:
 *
 *     1. EL RANKING CRUZA ORGANIZADORES. Es la promesa central del producto y
 *        no se ha probado nunca: `ranking_points` no mira quién montó el
 *        torneo. Con dos organizadores distintos y jugadores en los dos, los
 *        puntos tienen que caer en la MISMA fila.
 *
 *     2. EL ROLLUP SUMA DOS TORNEOS. `apply_tournament_ranking_points` suma
 *        todos los torneos de la temporada por (jugador, división). Con uno
 *        solo esa suma es la identidad y no prueba nada.
 *
 *     3. EL DASHBOARD TIENE QUE ELEGIR. Con dos torneos vivos a la vez,
 *        `MiSituacion`, `EnMiCancha`, `MyNextMatch` y `MisResultados` eligen
 *        cada uno por su cuenta y con criterios distintos —urgencia, próxima
 *        hora, torneo más reciente—. Si discrepan, la pantalla se contradice.
 *
 *     4. EL CAMPEÓN SE JUBILA. `SIGUE_SIENDO_NOTICIA` apaga el trofeo cuando
 *        hay otro torneo vivo que empieza después. Cerrar el largo con el
 *        exprés todavía en marcha es exactamente ese caso.
 *
 *     5. DOS DIVISIONES EN EL RANKING. Las pestañas de `/ranking` nunca han
 *        tenido más de una.
 *
 * ► LOS DOS ORGANIZADORES SON DEL MISMO DUEÑO, A PROPÓSITO
 *   Lo que el ranking cruza es `organizer_id`, y eso es lo que se prueba. Un
 *   segundo dueño obligaría a una segunda sesión para conducir el torneo y no
 *   añadiría ni una línea de código distinta. Se dice aquí para que nadie lea
 *   esta prueba como algo que no es.
 *
 * ► LA SOLAPA ES EL PUNTO
 *   El largo va viernes a domingo; el exprés cae el SÁBADO, en mitad. Y hay
 *   parejas en los dos, en la MISMA división. Es el peor caso a propósito: si
 *   algo se va a contradecir, se contradice aquí.
 *
 * ► NO JUEGA NADA
 *   Esto solo siembra: organizadores, torneos, categorías y parejas. Cerrar,
 *   sortear y capturar se hace por el camino real —la app, o
 *   `simular-resultados.mjs` y `completar-expres.mjs`—, porque el objetivo es
 *   probar ESE camino, no uno paralelo.
 *
 * IDEMPOTENTE
 *   Todo se busca por nombre o por correo antes de crear. Correrlo dos veces
 *   no duplica nada.
 *
 * Uso:
 *   node scripts/prueba-de-fuego.mjs --dry     enseña el plan, no escribe
 *   node scripts/prueba-de-fuego.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Qué se monta ────────────────────────────────────────────────────────────

/** La semana. El exprés cae dentro del largo: esa solapa es el experimento. */
const SEMANA = {
  largoInicio: '2026-10-09',   // viernes
  largoFin:    '2026-10-11',   // domingo
  expres:      '2026-10-10',   // sábado, en mitad del largo
};

export const NOMBRE_LARGO   = 'Copa Otoño Pedregal (PF)';
export const NOMBRE_EXPRES  = 'Exprés Coyoacán (PF)';
export const ORGANIZADOR_B  = 'Club Coyoacán (PF)';
/** `organizers` exige slug y contact_email: NOT NULL y sin default. */
const ORG_B_SLUG   = 'club-coyoacan-pf';
const ORG_B_CORREO = 'pf+coyoacan@rally.test';

/** Correos de los jugadores sembrados. `pf_` para poder limpiarlos aparte. */
const correoDe = (i) => `pf_${String(i).padStart(3, '0')}@rally.test`;

const NOMBRES = [
  'Mateo', 'Santiago', 'Emiliano', 'Diego', 'Leonardo', 'Iker', 'Rodrigo', 'Ángel',
  'Julián', 'Maximiliano', 'Sebastián', 'Damián', 'Gael', 'Thiago', 'Bruno', 'Axel',
];
const APELLIDOS = [
  'Vargas', 'Peña', 'Núñez', 'Cordero', 'Salas', 'Vega', 'Rojas', 'Cabrera',
  'Delgado', 'Montes', 'Quiroga', 'Ibáñez', 'Serrano', 'Lara', 'Pardo', 'Cuevas',
];
const nombreDe = (i) => `${NOMBRES[i % NOMBRES.length]} ${APELLIDOS[(i * 7) % APELLIDOS.length]}`;

/**
 * El reparto de jugadores, y por qué cada tramo.
 *
 * Los índices son de `pf_NNN`. Lo que importa es el SOLAPE: los mismos
 * jugadores en las dos Quinta Varonil, que es donde los puntos tienen que
 * sumarse entre organizadores distintos.
 */
const REPARTO = {
  /** Largo · Quinta Varonil: 8 parejas. La 1.ª es Aldo + Bodgar. */
  largoQuinta:  { pairs: 7, base: 0 },    // pf_000..pf_013
  /** Largo · Cuarta Mixto: 8 parejas. Gente que NO está en el exprés. */
  largoCuarta:  { pairs: 8, base: 14 },   // pf_014..pf_029
  /**
   * Exprés · Quinta Varonil: 16 parejas. La 1.ª es Aldo + Bodgar otra vez, y
   * las 4 siguientes repiten jugadores del largo — ahí está el solape.
   */
  expresRepite: { pairs: 4, base: 0 },    // pf_000..pf_007, ya en el largo
  expresNuevo:  { pairs: 11, base: 30 },  // pf_030..pf_051
};

const CAPACIDAD_LARGO = {
  canchas: 4,
  minutos: 60,
  ventanas: [
    { dia: SEMANA.largoInicio, desde: '16:00', hasta: '22:00' },
    { dia: '2026-10-10',       desde: '09:00', hasta: '21:00' },
    { dia: SEMANA.largoFin,    desde: '09:00', hasta: '19:00' },
  ],
};

const EXPRES_CFG = {
  canchas: 4,
  cupo: 16,
  ventana: { desde: '12:00', hasta: '19:00' },
  /** Minutos por etapa. Mismo estándar que la pantalla de alta. */
  minutos: { group: 30, quarter: 30, semi: 30, final: 45 },
  /** Lo que elige el organizador. La otra opción es 'set_star_point'. */
  finalFormato: 'dos_sets_oro',
};

/** Los dos de verdad, para poder verlo desde la propia cuenta. */
const REALES = {
  bodgar: '9beb8523-39c6-4685-bd4c-856c7a0272da',
  aldo:   '173fa757-308d-4f68-b6f7-1a7b9ae0d07e',
};

const CONCURRENCIA = 6;

// ── Utilidades ──────────────────────────────────────────────────────────────

function leerEnv() {
  const texto = readFileSync(resolve(raiz, '.env.local'), 'utf8');
  const env = {};
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const [k, ...resto] = l.split('=');
    env[k.trim()] = resto.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function enTanda(tareas, limite) {
  let siguiente = 0;
  await Promise.all(Array.from({ length: Math.min(limite, tareas.length) }, async () => {
    while (siguiente < tareas.length) await tareas[siguiente++]();
  }));
}

const morir = (msg) => { console.error(`\n  ✕ ${msg}\n`); process.exit(1); };

// ── Principal ───────────────────────────────────────────────────────────────

async function main() {
  const dry = process.argv.includes('--dry');
  const env = leerEnv();
  const supa = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const totalQA = REPARTO.largoQuinta.pairs * 2 + REPARTO.largoCuarta.pairs * 2
                + REPARTO.expresNuevo.pairs * 2;

  console.log(`\n  PRUEBA DE FUEGO · semana del ${SEMANA.largoInicio}\n`);
  console.log(`    ${NOMBRE_LARGO}`);
  console.log(`      ${SEMANA.largoInicio} → ${SEMANA.largoFin} · ${CAPACIDAD_LARGO.canchas} canchas`);
  console.log(`      Quinta Varonil ${REPARTO.largoQuinta.pairs + 1} parejas · Cuarta Mixto ${REPARTO.largoCuarta.pairs} parejas`);
  console.log(`\n    ${NOMBRE_EXPRES}   (organizador ${ORGANIZADOR_B})`);
  console.log(`      ${SEMANA.expres} · ${EXPRES_CFG.ventana.desde}–${EXPRES_CFG.ventana.hasta} · cupo ${EXPRES_CFG.cupo}`);
  console.log(`      Quinta Varonil · final ${EXPRES_CFG.finalFormato}`);
  console.log(`\n    SOLAPE: Aldo + Bodgar y ${REPARTO.expresRepite.pairs} parejas más juegan LOS DOS,`);
  console.log(`            en Quinta Varonil, con organizadores distintos.`);
  console.log(`\n    ~${totalQA} jugadores de prueba (pf_NNN@rally.test)\n`);

  if (dry) { console.log('  --dry: no se escribió nada.\n'); return; }

  // ── Organizador A: el que ya existe ───────────────────────────────────────
  const { data: orgA } = await supa
    .from('organizers').select('id, name').limit(1).maybeSingle();
  if (!orgA) morir('No hay ningún organizador. Crea uno desde la app.');
  console.log(`  Organizador A: ${orgA.name}`);

  // El dueño de A será también dueño de B: ver la cabecera.
  const { data: owner } = await supa
    .from('organizer_members').select('user_id')
    .eq('organizer_id', orgA.id).eq('member_role', 'owner').limit(1).maybeSingle();
  if (!owner) morir(`El organizador ${orgA.name} no tiene owner.`);

  // ── Organizador B ─────────────────────────────────────────────────────────
  let { data: orgB } = await supa
    .from('organizers').select('id, name').eq('name', ORGANIZADOR_B).maybeSingle();

  if (!orgB) {
    const { data, error } = await supa.from('organizers')
      .insert({ name: ORGANIZADOR_B, slug: ORG_B_SLUG, contact_email: ORG_B_CORREO })
      .select('id, name').single();
    if (error) morir(`Organizador B: ${error.message}`);
    orgB = data;
    const { error: em } = await supa.from('organizer_members').insert({
      organizer_id: orgB.id, user_id: owner.user_id, member_role: 'owner',
    });
    if (em) morir(`Owner de B: ${em.message}`);
    console.log(`  Organizador B creado: ${orgB.name}`);
  } else {
    console.log(`  Organizador B ya existía: ${orgB.name}`);
  }

  // ── Los dos torneos ───────────────────────────────────────────────────────
  const torneo = async (nombre, organizerId, campos) => {
    const { data: ya } = await supa
      .from('tournaments').select('id, status').eq('name', nombre).maybeSingle();
    if (ya) { console.log(`  ${nombre}: ya existía (${ya.status})`); return ya; }
    const { data, error } = await supa.from('tournaments').insert({
      name: nombre, organizer_id: organizerId, status: 'registration_open',
      registration_fee: 0, ...campos,
    }).select('id, status').single();
    if (error) morir(`${nombre}: ${error.message}`);
    console.log(`  ${nombre}: creado ${data.id}`);
    return data;
  };

  const largo = await torneo(NOMBRE_LARGO, orgA.id, {
    start_date: SEMANA.largoInicio, end_date: SEMANA.largoFin,
    courts: CAPACIDAD_LARGO.canchas, match_minutes: CAPACIDAD_LARGO.minutos,
    tier: 'p2', tercer_lugar: true,
    tercer_set_formato: 'super_muerte', tercer_set_puntos: 10,
  });

  const expres = await torneo(NOMBRE_EXPRES, orgB.id, {
    start_date: SEMANA.expres, end_date: SEMANA.expres,
    courts: EXPRES_CFG.canchas, match_minutes: EXPRES_CFG.minutos.group,
    modo: 'expres', tier: 'p2', tercer_lugar: false,
    tercer_set_formato: 'super_muerte', tercer_set_puntos: 10,
  });

  if (largo.status !== 'registration_open' || expres.status !== 'registration_open') {
    morir('Alguno de los dos ya no admite parejas. Bórralos antes de repetir.');
  }

  // ── Ventanas del largo ────────────────────────────────────────────────────
  await supa.from('tournament_windows').delete().eq('tournament_id', largo.id);
  const { error: ew } = await supa.from('tournament_windows').insert(
    CAPACIDAD_LARGO.ventanas.map((v) => ({
      tournament_id: largo.id, dia: v.dia, desde: `${v.desde}:00`, hasta: `${v.hasta}:00`,
    })),
  );
  if (ew) morir(`Ventanas: ${ew.message}`);

  // ── Ventana y config del exprés ───────────────────────────────────────────
  await supa.from('tournament_windows').delete().eq('tournament_id', expres.id);
  const { error: ew2 } = await supa.from('tournament_windows').insert({
    tournament_id: expres.id, dia: SEMANA.expres,
    desde: `${EXPRES_CFG.ventana.desde}:00`, hasta: `${EXPRES_CFG.ventana.hasta}:00`,
  });
  if (ew2) morir(`Ventana del exprés: ${ew2.message}`);

  const { data: cfgYa } = await supa
    .from('expres_config').select('tournament_id').eq('tournament_id', expres.id).maybeSingle();
  if (!cfgYa) {
    // La semilla del sorteo es inmutable una vez escrita (trigger de la 074).
    const { error } = await supa.from('expres_config').insert({
      tournament_id: expres.id, cupo: EXPRES_CFG.cupo,
      partidos_por_pareja: 5, clasifican_por_grupo: 4,
      // `semilla_sorteo` es TEXT, no int: el sorteo la usa como cadena.
      semilla_sorteo: String(Math.floor(Math.random() * 2 ** 31)),
    });
    if (error) morir(`expres_config: ${error.message}`);
  }

  const etapas = [
    { stage: 'group',   formato: 'suma_6',                 minutos: EXPRES_CFG.minutos.group },
    { stage: 'quarter', formato: 'set_oro',                minutos: EXPRES_CFG.minutos.quarter },
    { stage: 'semi',    formato: 'set_oro',                minutos: EXPRES_CFG.minutos.semi },
    { stage: 'final',   formato: EXPRES_CFG.finalFormato,  minutos: EXPRES_CFG.minutos.final },
  ].map((e) => ({ tournament_id: expres.id, ...e }));
  const { error: ee } = await supa
    .from('expres_etapa').upsert(etapas, { onConflict: 'tournament_id,stage' });
  if (ee) morir(`expres_etapa: ${ee.message}`);

  // ── Categorías ────────────────────────────────────────────────────────────
  const categoria = async (tournamentId, division, gender, display, extra = {}) => {
    const { data: ya } = await supa.from('categories')
      .select('id').eq('tournament_id', tournamentId)
      .eq('division', division).eq('gender', gender).maybeSingle();
    if (ya) return ya.id;
    const { data, error } = await supa.from('categories').insert({
      tournament_id: tournamentId, division, gender,
      display_name: display, status: 'open', ...extra,
    }).select('id').single();
    if (error) morir(`Categoría ${display}: ${error.message}`);
    return data.id;
  };

  const catLargoQuinta = await categoria(largo.id, 'quinta', 'male', 'Quinta Varonil');
  const catLargoCuarta = await categoria(largo.id, 'cuarta', 'mixed', 'Cuarta Mixto');
  // El exprés nace con su forma decidida: dos grupos, pasan 4, sin repesca.
  const catExpres = await categoria(expres.id, 'quinta', 'male', 'Quinta Varonil', {
    format_type: 'groups_then_knockout', num_groups: 2,
    advance_per_group: 4, best_extra_qualifiers: 0,
  });
  console.log('  Categorías listas');

  // ── Jugadores ─────────────────────────────────────────────────────────────
  const maxIndice = Math.max(
    REPARTO.largoQuinta.base + REPARTO.largoQuinta.pairs * 2,
    REPARTO.largoCuarta.base + REPARTO.largoCuarta.pairs * 2,
    REPARTO.expresNuevo.base + REPARTO.expresNuevo.pairs * 2,
  );
  const correos = Array.from({ length: maxIndice }, (_, i) => correoDe(i));

  const { data: yaUsuarios } = await supa
    .from('users').select('id, email').in('email', correos);
  const idPorCorreo = new Map((yaUsuarios ?? []).map((u) => [u.email, u.id]));

  const porCrear = correos
    .map((correo, i) => ({ correo, nombre: nombreDe(i) }))
    .filter((j) => !idPorCorreo.has(j.correo));

  if (porCrear.length > 0) {
    console.log(`  Creando ${porCrear.length} jugadores…`);
    let fallos = 0;
    await enTanda(porCrear.map((j) => async () => {
      const { data, error } = await supa.auth.admin.createUser({
        email: j.correo, password: 'qa-rally-2026', email_confirm: true,
        user_metadata: { full_name: j.nombre, created_by: 'prueba_de_fuego' },
      });
      if (error) {
        if (/already/i.test(error.message)) {
          const { data: u } = await supa.from('users').select('id').eq('email', j.correo).maybeSingle();
          if (u) { idPorCorreo.set(j.correo, u.id); return; }
        }
        fallos++; console.error(`    ✕ ${j.correo}: ${error.message}`);
        return;
      }
      idPorCorreo.set(j.correo, data.user.id);
    }), CONCURRENCIA);
    if (fallos > 0) morir('Hubo fallos creando jugadores; no se siembran parejas.');
  }
  console.log(`  Jugadores listos: ${idPorCorreo.size}`);

  // ── Parejas ───────────────────────────────────────────────────────────────
  const uid = (i) => {
    const id = idPorCorreo.get(correoDe(i));
    if (!id) morir(`Falta el jugador ${correoDe(i)}`);
    return id;
  };

  /** Las parejas de un tramo: (base+2n, base+2n+1). */
  const tramo = ({ pairs, base }) =>
    Array.from({ length: pairs }, (_, n) => [uid(base + n * 2), uid(base + n * 2 + 1)]);

  const planParejas = [
    { catId: catLargoQuinta, torneoId: largo.id, nombre: 'Largo · Quinta',
      parejas: [[REALES.aldo, REALES.bodgar], ...tramo(REPARTO.largoQuinta)] },
    { catId: catLargoCuarta, torneoId: largo.id, nombre: 'Largo · Cuarta Mixto',
      parejas: tramo(REPARTO.largoCuarta) },
    { catId: catExpres, torneoId: expres.id, nombre: 'Exprés · Quinta',
      parejas: [
        [REALES.aldo, REALES.bodgar],
        ...tramo(REPARTO.expresRepite),   // LOS MISMOS que el largo: el solape
        ...tramo(REPARTO.expresNuevo),
      ] },
  ];

  for (const bloque of planParejas) {
    const { data: ya } = await supa
      .from('pairs').select('player1_id, player2_id').eq('category_id', bloque.catId);
    // Misma regla que impone la base: un jugador no repite dentro de UNA
    // categoría. Entre categorías distintas sí, y es justo lo que se prueba.
    const ocupado = new Set((ya ?? []).flatMap((p) => [p.player1_id, p.player2_id]));

    const nuevas = bloque.parejas
      .filter(([a, b]) => !ocupado.has(a) && !ocupado.has(b))
      .map(([a, b]) => ({
        tournament_id: bloque.torneoId, category_id: bloque.catId,
        player1_id: a, player2_id: b,
        // `pairs` no tiene `status`: tiene `payment_status`, y con cuota 0 el
        // camino real deja 'paid_offline' — que es lo que hay en las 16 de
        // producción. Sembrar 'pending' pondría a prueba otra cosa.
        payment_status: 'paid_offline',
      }));

    if (nuevas.length > 0) {
      const { error } = await supa.from('pairs').insert(nuevas);
      if (error) morir(`Parejas de ${bloque.nombre}: ${error.message}`);
    }
    console.log(`  ${bloque.nombre}: ${(ya ?? []).length + nuevas.length} parejas (${nuevas.length} nuevas)`);
  }

  console.log(`
  Listo. Los dos torneos están en 'registration_open'.

  LO QUE SIGUE, por el camino real:
    · Largo   → panel del torneo → Cerrar inscripciones → Calendario
                node scripts/simular-resultados.mjs ${largo.id} --todas
    · Exprés  → panel del torneo → Torneo exprés → Sortear los grupos

  QUÉ MIRAR:
    · Entra como Aldo con los dos torneos vivos: ¿de cuál habla el dashboard?
    · Cierra el LARGO con el exprés en marcha: ¿se jubila el trofeo?
    · Con los dos cerrados: /ranking tiene que sumar las dos Quintas en UNA
      fila por jugador, y enseñar dos pestañas (Quinta y Cuarta).
`);
}

const invocadoDirecto = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocadoDirecto) main().catch((e) => { console.error(e); process.exit(1); });
