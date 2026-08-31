/**
 * RALLY · Simular la captura de resultados de la fase de grupos
 *
 * POR QUÉ EXISTE
 *   La captura de resultados nunca se había probado de punta a punta y es el
 *   corazón del producto. Este script juega el torneo entero por el MISMO
 *   camino que el juez: se autentica como él y llama a la Edge Function
 *   `match-result`. No escribe en `matches`, `match_sets` ni `group_standings`
 *   directamente. Si el camino real está roto, el script falla; que es el
 *   objetivo.
 *
 *   La única escritura directa es `--reiniciar`, que es lo contrario de una
 *   prueba: deshace lo que la prueba hizo.
 *
 * USO
 *   node scripts/simular-resultados.mjs <tournament_id> --todas
 *   node scripts/simular-resultados.mjs <tournament_id> --categoria "5A Fuerza"
 *   node scripts/simular-resultados.mjs <tournament_id> --todas --reiniciar
 *
 *   --email / --password   credenciales del juez (o RALLY_JUEZ_EMAIL / _PASSWORD).
 *                          Sin --email toma el juez asignado al torneo y la
 *                          contraseña de los usuarios QA.
 *   --reiniciar            borra los resultados de las categorías elegidas
 *                          antes de volver a capturarlos.
 *   --verificar            solo comprueba que los marcadores que genera pasan
 *                          por `validateScore`. No toca la base ni la red.
 *
 * IDEMPOTENTE
 *   Sin `--reiniciar` salta los partidos que ya están 'finished'. Y el marcador
 *   de cada partido sale de un PRNG sembrado con su propio id: correrlo dos
 *   veces sobre el mismo torneo da los mismos marcadores.
 *
 * SALE CON CÓDIGO 1
 *   Si una captura es rechazada, si un grupo termina con posiciones que no son
 *   1..n, o si dos parejas quedan empatadas en todos los criterios y en el
 *   head-to-head — un empate que el motor no puede resolver y que en un torneo
 *   real exige sorteo.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prestarOwner, devolverOwner } from './asignar-juez-qa.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Colores de terminal ─────────────────────────────────────────────────────

const ESC = '\x1b[';
const C = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}90m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
};

// ── Entorno ─────────────────────────────────────────────────────────────────

function leerEnv() {
  const txt = readFileSync(resolve(raiz, '.env.local'), 'utf8');
  const env = {};
  for (const linea of txt.split('\n')) {
    const i = linea.indexOf('=');
    if (i < 0 || linea.trimStart().startsWith('#')) continue;
    env[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  return env;
}

// ── Argumentos ──────────────────────────────────────────────────────────────

function parsearArgs(argv) {
  const args = {
    tournamentId: null, categoria: null, todas: false,
    reiniciar: false, email: null, password: null, verificar: false,
    soloGrupos: false, resembrar: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--todas') args.todas = true;
    else if (a === '--verificar') args.verificar = true;
    else if (a === '--solo-grupos') args.soloGrupos = true;
    else if (a === '--resembrar') args.resembrar = true;
    else if (a === '--reiniciar') args.reiniciar = true;
    else if (a === '--categoria') args.categoria = argv[++i] ?? null;
    else if (a === '--email') args.email = argv[++i] ?? null;
    else if (a === '--password') args.password = argv[++i] ?? null;
    else if (!a.startsWith('--') && !args.tournamentId) args.tournamentId = a;
  }
  return args;
}

// ── PRNG determinista ───────────────────────────────────────────────────────
// El marcador de un partido depende SOLO de su id: dos corridas dan lo mismo.

function semillaDe(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function prng(semilla) {
  let s = semilla;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Marcadores realistas ────────────────────────────────────────────────────

/** Sets normales que el engine acepta: 6-0..6-4, 7-5, 7-6. */
const SETS_NORMALES = [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 4], [7, 5], [7, 6]];
/** Super muerte: a 10 con margen de 2. */
const SUPER = [[10, 3], [10, 5], [10, 6], [10, 7], [10, 8], [11, 9], [12, 10]];

const elegir = (rnd, lista) => lista[Math.floor(rnd() * lista.length)];

/**
 * Genera un marcador válido y devuelve { sets, ganador: 'A'|'B' }.
 *
 * FORMATO DE LA SUPER MUERTE — el mismo contrato que la UI del juez:
 * los PUNTOS van en tiebreak_a/b y games_a/b llevan el marcador 1-0.
 * Ver ScoreCapture.tsx y score.test.ts ('contrato de super muerte').
 */
function generarMarcador(matchId) {
  const rnd = prng(semillaDe(matchId));
  const ganador = rnd() < 0.5 ? 'A' : 'B';
  const tresSets = rnd() < 0.32;

  const setNormal = (loGanaA) => {
    const [hi, lo] = elegir(rnd, SETS_NORMALES);
    return {
      games_a: loGanaA ? hi : lo,
      games_b: loGanaA ? lo : hi,
      is_super_tiebreak: false,
      tiebreak_a: null,
      tiebreak_b: null,
    };
  };

  const ganaA = ganador === 'A';
  const sets = [];

  if (!tresSets) {
    sets.push(setNormal(ganaA), setNormal(ganaA));
  } else {
    // 1-1 y se decide en super muerte. Quién gana el primero varía.
    const primeroDelGanador = rnd() < 0.5;
    sets.push(setNormal(primeroDelGanador ? ganaA : !ganaA));
    sets.push(setNormal(primeroDelGanador ? !ganaA : ganaA));
    const [hi, lo] = elegir(rnd, SUPER);
    sets.push({
      games_a: ganaA ? 1 : 0,
      games_b: ganaA ? 0 : 1,
      is_super_tiebreak: true,
      tiebreak_a: ganaA ? hi : lo,
      tiebreak_b: ganaA ? lo : hi,
    });
  }

  return { sets: sets.map((s, i) => ({ set_number: i + 1, ...s })), ganador };
}

/**
 * Hora de juego, calculada y NO dejada a `now()`.
 *
 * POR QUÉ IMPORTA
 *   Si el script no manda `played_at`, la Edge Function pone `now()` y los 165
 *   partidos quedan capturados con milisegundos de diferencia: una pareja
 *   aparecería jugando dos partidos a la vez. Eso rompería el orden cronológico
 *   del que depende Glicko (migración 001 lo llama crítico) y haría imposible
 *   detectar un solapamiento de verdad.
 *
 *   Aquí cada partido recibe una hora coherente con cómo se juega el torneo:
 *   un grupo es un BLOQUE de partidos consecutivos en una cancha, así que sus
 *   tres partidos van en horas seguidas. Como una pareja pertenece a un solo
 *   grupo, nunca coincide consigo misma. En el cuadro, cada ronda ocupa su hora.
 */
const horaDeJuego = (baseISO, offsetHoras) =>
  new Date(new Date(baseISO).getTime() + offsetHoras * 3600_000).toISOString();

/** '6-4 7-5' · '6-3 4-6 [10-7]' */
const textoMarcador = (sets) =>
  sets
    .map((s) => (s.is_super_tiebreak ? `[${s.tiebreak_a}-${s.tiebreak_b}]` : `${s.games_a}-${s.games_b}`))
    .join(' ');

// ── Salida ──────────────────────────────────────────────────────────────────

const log  = (...a) => console.log(...a);
const bien = (m) => log(`  ${C.green}OK${C.reset}  ${m}`);
const mal  = (m) => log(`  ${C.red}FALLO${C.reset}  ${m}`);
const info = (m) => log(`  ${C.dim}·${C.reset} ${m}`);

// ── Main ────────────────────────────────────────────────────────────────────

/**
 * Verifica el generador de marcadores contra el ENGINE REAL, sin base de datos.
 *
 * Es el contrato del que depende todo el script: si `generarMarcador` produce
 * algo que `validateScore` rechaza, o si el ganador que cree haber puesto no es
 * el que deriva el motor, las 165 capturas fallarían una por una contra el
 * servidor. Aquí se descubre en un segundo y sin tocar nada.
 *
 * Usa el mismo bundle que corre dentro de la Edge Function.
 */
async function verificarMarcadores(n = 5000) {
  const { validateScore } = await import('../supabase/functions/_shared/engine.bundle.js');
  const toSetScore = (s) => ({
    gamesA: Number(s.games_a),
    gamesB: Number(s.games_b),
    isSuperTiebreak: Boolean(s.is_super_tiebreak),
    tiebreakA: s.tiebreak_a ?? null,
    tiebreakB: s.tiebreak_b ?? null,
  });

  let malos = 0, desalineados = 0, supers = 0, tresSets = 0;
  for (let i = 0; i < n; i++) {
    // Ids con la forma de un uuid, para sembrar el PRNG como en la vida real.
    const id = `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
    const { sets, ganador } = generarMarcador(id);
    if (sets.length === 3) tresSets++;
    if (sets.some((s) => s.is_super_tiebreak)) supers++;

    const r = validateScore(sets.map(toSetScore));
    if (!r.valid) {
      malos++;
      if (malos <= 3) mal(`${textoMarcador(sets)} → ${r.errors.join(' · ')}`);
    } else if (r.winnerSide !== ganador) {
      desalineados++;
      if (desalineados <= 3) mal(`${textoMarcador(sets)} → el motor dice ${r.winnerSide}, el script ${ganador}`);
    }
  }

  log(`\n${C.bold}Verificación del generador contra el engine${C.reset} (${n} marcadores)\n`);
  info(`${tresSets} a tres sets · ${supers} con super muerte`);
  if (malos || desalineados) {
    mal(`${malos} marcadores inválidos, ${desalineados} con ganador desalineado`);
    process.exit(1);
  }
  bien('todos válidos y con el ganador que deriva el motor');

  // Determinismo: el mismo id da siempre el mismo marcador.
  const a = JSON.stringify(generarMarcador('11111111-1111-4111-8111-111111111111'));
  const b = JSON.stringify(generarMarcador('11111111-1111-4111-8111-111111111111'));
  if (a !== b) { mal('el generador no es determinista'); process.exit(1); }
  bien('determinista: el mismo partido da siempre el mismo marcador');
}

async function main() {
  const args = parsearArgs(process.argv.slice(2));

  if (args.verificar) {
    await verificarMarcadores();
    return;
  }

  if (!args.tournamentId || (!args.todas && !args.categoria)) {
    console.error(`
RALLY · Simular la captura de resultados de la fase de grupos

  node scripts/simular-resultados.mjs <tournament_id> --todas
  node scripts/simular-resultados.mjs <tournament_id> --categoria "5A Fuerza"

  --verificar            comprueba el generador contra el engine, sin base de datos
  --reiniciar            borra los resultados antes de volver a capturarlos
  --email / --password   credenciales del juez (default: el asignado al torneo)
`);
    process.exit(1);
  }

  const env = leerEnv();
  const URL = env.EXPO_PUBLIC_SUPABASE_URL;
  const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !ANON || !SERVICE) {
    console.error('Faltan variables en .env.local (URL / ANON / SERVICE_ROLE).');
    process.exit(1);
  }

  const admin = createClient(URL, SERVICE);   // solo LECTURA (y el --reiniciar)
  const anon  = createClient(URL, ANON);      // para autenticarse como el juez

  let fallos = 0;
  const fallo = (m) => { mal(m); fallos++; };

  // ── Torneo ────────────────────────────────────────────────────────────────
  const { data: torneo, error: te } = await admin
    .from('tournaments')
    .select('id, name, status, organizer_id, start_date, tercer_lugar')
    .eq('id', args.tournamentId).single();
  if (te || !torneo) {
    console.error(`No se encontró el torneo ${args.tournamentId}: ${te?.message ?? 'sin filas'}`);
    process.exit(1);
  }
  log(`\n${C.bold}${torneo.name}${C.reset} · ${torneo.status}\n`);

  // ── Identidad del juez ────────────────────────────────────────────────────
  let email = args.email ?? process.env.RALLY_JUEZ_EMAIL ?? null;
  if (!email) {
    const { data: jueces } = await admin
      .from('tournament_judges').select('user_id').eq('tournament_id', torneo.id);
    const ids = (jueces ?? []).map((j) => j.user_id);
    if (ids.length === 0) {
      console.error('El torneo no tiene jueces asignados y no se pasó --email. Asigna uno desde la app.');
      process.exit(1);
    }
    const { data: us } = await admin.from('users').select('id, email').in('id', ids);
    email = us?.[0]?.email ?? null;
    if (!email) {
      console.error('No se pudo resolver el correo del juez asignado.');
      process.exit(1);
    }
  }
  const password = args.password ?? process.env.RALLY_JUEZ_PASSWORD ?? 'qa-rally-2026';

  const { data: sesion, error: se } = await anon.auth.signInWithPassword({ email, password });
  if (se || !sesion?.session) {
    console.error(`No se pudo entrar como ${email}: ${se?.message ?? 'sin sesión'}`);
    console.error('Pasa --email/--password del juez, o RALLY_JUEZ_EMAIL / RALLY_JUEZ_PASSWORD.');
    process.exit(1);
  }
  const token = sesion.session.access_token;
  info(`Capturando como ${email}`);

  // ── Categorías ────────────────────────────────────────────────────────────
  const { data: todasCats, error: ce } = await admin
    .from('categories')
    .select('id, display_name, advance_per_group, best_extra_qualifiers, status')
    .eq('tournament_id', torneo.id).order('division');
  if (ce) {
    console.error(`No se pudieron leer las categorías: ${ce.message}`);
    process.exit(1);
  }

  const cats = args.todas
    ? (todasCats ?? [])
    : (todasCats ?? []).filter((c) => c.display_name.toLowerCase() === args.categoria.toLowerCase());

  if (cats.length === 0) {
    console.error(`Ninguna categoría coincide con "${args.categoria}".`);
    console.error(`Disponibles: ${(todasCats ?? []).map((c) => c.display_name).join(', ')}`);
    process.exit(1);
  }

  // ── Reinicio (única escritura directa; deshace la prueba anterior) ────────
  //
  // `--reiniciar` borra TODO lo jugado de la categoría, cuadro incluido: sin
  // eso, volver a correr chocaba con el guard `bracket_already_seeded` y el
  // reinicio se quedaba a medias.
  // `--resembrar` borra SOLO el cuadro y deja los grupos jugados, para volver a
  // sembrar con otra configuración de clasificados sin repetir 165 partidos.
  if (args.reiniciar || args.resembrar) {
    for (const cat of cats) {
      const { data: ko } = await admin
        .from('matches').select('id').eq('category_id', cat.id).neq('stage', 'group');
      const koIds = (ko ?? []).map((m) => m.id);
      if (koIds.length) {
        await admin.from('match_sets').delete().in('match_id', koIds);
        await admin.from('matches').delete().in('id', koIds);
      }
      info(`${cat.display_name}: cuadro borrado (${koIds.length} partidos)`);
      if (!args.reiniciar) continue;

      const { data: ms } = await admin
        .from('matches').select('id').eq('category_id', cat.id).eq('stage', 'group');
      const ids = (ms ?? []).map((m) => m.id);
      if (ids.length) {
        await admin.from('match_sets').delete().in('match_id', ids);
        await admin.from('matches')
          .update({ status: 'scheduled', winner_pair_id: null, played_at: null })
          .in('id', ids);
      }
      const { data: gs } = await admin.from('groups').select('id').eq('category_id', cat.id);
      const gids = (gs ?? []).map((g) => g.id);
      if (gids.length) {
        await admin.from('group_standings').update({
          played: 0, won: 0, lost: 0, sets_won: 0, sets_lost: 0,
          games_won: 0, games_lost: 0, points: 0, position: 0, clinch_status: 'alive',
        }).in('group_id', gids);
      }
      info(`Reiniciada ${cat.display_name}: ${ids.length} partidos`);
    }
    log('');
  }

  // ── Captura ───────────────────────────────────────────────────────────────
  // Los grupos ocupan las horas 0..2 del primer día; el cuadro, de la 3 en
  // adelante, una hora por ronda.
  const baseHoraria = `${torneo.start_date ?? '2026-09-11'}T14:00:00.000Z`;
  const HORA_CUADRO = 3;

  let capturados = 0, saltados = 0, conSuper = 0;
  const campeones = [];

  for (const cat of cats) {
    log(`${C.bold}${cat.display_name}${C.reset}  (pasan ${cat.advance_per_group} por grupo` +
        `${cat.best_extra_qualifiers ? `, +${cat.best_extra_qualifiers} repescados` : ''})`);

    const { data: grupos } = await admin
      .from('groups').select('id, name').eq('category_id', cat.id);
    if (!grupos || grupos.length === 0) {
      fallo('la categoría no tiene grupos generados');
      continue;
    }
    grupos.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));

    const { data: partidos } = await admin
      .from('matches').select('id, group_id, status, pair_a_id, pair_b_id')
      .eq('category_id', cat.id).eq('stage', 'group');

    const clasificadosCat = [];

    for (const grupo of grupos) {
      const delGrupo = (partidos ?? [])
        .filter((m) => m.group_id === grupo.id)
        .sort((a, b) => (a.id < b.id ? -1 : 1));

      for (const [iPartido, m] of delGrupo.entries()) {
        if (m.status === 'finished') { saltados++; continue; }

        const { sets, ganador } = generarMarcador(m.id);
        const winner = ganador === 'A' ? m.pair_a_id : m.pair_b_id;
        if (sets.some((s) => s.is_super_tiebreak)) conSuper++;

        const res = await fetch(`${URL}/functions/v1/match-result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            match_id: m.id, sets, winner_pair_id: winner,
            // Horas seguidas dentro del grupo: es como se juega, y garantiza
            // que ninguna pareja quede con dos partidos a la misma hora.
            played_at: horaDeJuego(baseHoraria, iPartido),
          }),
        });
        const cuerpo = await res.json().catch(() => null);

        if (!res.ok) {
          fallo(`Grupo ${grupo.name} · ${m.id.slice(0, 8)} (${textoMarcador(sets)}) ` +
                `rechazado ${res.status}: ${cuerpo?.error ?? '?'} ${cuerpo?.detail ?? ''}`);
          continue;
        }
        if (cuerpo?.winner_pair_id !== winner) {
          fallo(`Grupo ${grupo.name} · ${m.id.slice(0, 8)}: el servidor devolvió otro ganador`);
          continue;
        }
        capturados++;
      }

      // ── Verificación del grupo ─────────────────────────────────────────────
      const { data: tabla, error: tbe } = await admin
        .from('group_standings')
        .select('pair_id, played, won, lost, sets_won, sets_lost, games_won, games_lost, points, position')
        .eq('group_id', grupo.id).order('position');
      if (tbe) {
        fallo(`Grupo ${grupo.name}: no se pudo leer la tabla (${tbe.message})`);
        continue;
      }

      const filas = tabla ?? [];
      const n = filas.length;
      const posiciones = filas.map((f) => f.position).sort((a, b) => a - b);
      const esperadas = Array.from({ length: n }, (_, i) => i + 1);

      if (JSON.stringify(posiciones) !== JSON.stringify(esperadas)) {
        fallo(`Grupo ${grupo.name}: posiciones ${posiciones.join(',')} — se esperaba ${esperadas.join(',')}`);
        continue;
      }

      const sumaJugados = filas.reduce((a, f) => a + f.played, 0);
      if (sumaJugados !== delGrupo.length * 2) {
        fallo(`Grupo ${grupo.name}: ${sumaJugados} participaciones para ${delGrupo.length} partidos ` +
              `(se esperaban ${delGrupo.length * 2})`);
        continue;
      }

      // Empates sin resolver: dos filas contiguas iguales en TODOS los criterios
      // globales y sin head-to-head que las separe. En un torneo real eso exige
      // sorteo, así que si aparece hay que verlo, no tragárselo.
      let empateSinResolver = null;
      for (let i = 0; i + 1 < filas.length; i++) {
        const a = filas[i], b = filas[i + 1];
        const mismos =
          a.points === b.points &&
          a.sets_won - a.sets_lost === b.sets_won - b.sets_lost &&
          a.games_won - a.games_lost === b.games_won - b.games_lost &&
          a.games_won === b.games_won;
        if (!mismos) continue;
        const directo = delGrupo.find((m) =>
          (m.pair_a_id === a.pair_id && m.pair_b_id === b.pair_id) ||
          (m.pair_a_id === b.pair_id && m.pair_b_id === a.pair_id));
        if (!directo) { empateSinResolver = `${i + 1}o y ${i + 2}o (no se enfrentaron)`; break; }
        const { data: dm } = await admin
          .from('matches').select('winner_pair_id').eq('id', directo.id).single();
        if (!dm?.winner_pair_id) {
          empateSinResolver = `${i + 1}o y ${i + 2}o (head-to-head sin ganador)`;
          break;
        }
      }
      if (empateSinResolver) {
        fallo(`Grupo ${grupo.name}: empate sin resolver entre ${empateSinResolver}`);
        continue;
      }

      bien(`Grupo ${grupo.name}: ${n} parejas, posiciones 1..${n} sin empates sin resolver`);

      for (const f of filas.filter((x) => x.position <= cat.advance_per_group)) {
        clasificadosCat.push({ ...f, grupo: grupo.name });
      }
    }

    // ── Clasificados de la categoría ──────────────────────────────────────────
    if (clasificadosCat.length) {
      const nombres = await nombresDeParejas(admin, clasificadosCat.map((c) => c.pair_id));
      log(`  ${C.bold}Clasificados de ${cat.display_name}${C.reset} (${clasificadosCat.length}):`);
      for (const c of clasificadosCat) {
        log(`    ${c.position}o Grupo ${c.grupo}  ${nombres.get(c.pair_id) ?? c.pair_id.slice(0, 8)}` +
            `  ${c.points} pts · sets ${c.sets_won}-${c.sets_lost} · games ${c.games_won}-${c.games_lost}`);
      }
      if (cat.best_extra_qualifiers > 0) {
        info(`Más ${cat.best_extra_qualifiers} repescado(s): los elige el motor al sembrar el cuadro.`);
      }
    }

    // ── Cuadro ────────────────────────────────────────────────────────────────
    if (!args.soloGrupos) {
      const r = await jugarCuadro({
        admin, URL, token, cat, grupos, baseHoraria, horaCuadro: HORA_CUADRO, fallo,
        organizerId: torneo.organizer_id, actorId: sesion.user.id,
        tercerLugarActivo: torneo.tercer_lugar !== false,
      });
      capturados += r.capturados;
      conSuper += r.conSuper;
      if (r.campeon) campeones.push({ categoria: cat.display_name, ...r.campeon });
    }

    log('');
  }

  // ── Nadie juega dos partidos a la misma hora ──────────────────────────────
  if (!args.soloGrupos) {
    await verificarSolapamientos(admin, torneo.id, cats.map((c) => c.id), fallo, bien);
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  log('─'.repeat(60));
  if (campeones.length) {
    log(`${C.bold}Campeones${C.reset}`);
    for (const c of campeones) {
      log(`  ${c.categoria.padEnd(14)} ${c.campeon}`);
      log(`  ${''.padEnd(14)} 2o ${c.subcampeon}`);
      if (c.tercero) log(`  ${''.padEnd(14)} 3o ${c.tercero}`);
    }
    log('');
  }
  log(`Capturados: ${capturados}   Con super muerte: ${conSuper}   ` +
      `Ya estaban: ${saltados}   Fallos: ${fallos}`);
  if (fallos > 0) {
    log(`${C.red}Algo no cuadra.${C.reset}`);
    process.exit(1);
  }
  log(`${C.green}Todo cuadra.${C.reset}`);
}

/**
 * Siembra el cuadro y lo juega entero, ronda a ronda, hasta el campeón.
 *
 * TODO PASA POR EL CAMINO REAL: `generate-bracket` para sembrar y
 * `match-result` para cada resultado. Capturar AVANZA el cuadro solo (RPC 050),
 * así que no se llama a `advance` en ningún momento: la ronda siguiente tiene
 * que aparecer sola. Si no aparece, es que el avance automático no funciona,
 * que es justo lo que se está probando.
 */
async function jugarCuadro({
  admin, URL, token, cat, grupos, baseHoraria, horaCuadro, fallo, organizerId, actorId,
  tercerLugarActivo,
}) {
  let capturados = 0, conSuper = 0, campeon = null;

  const leerCuadro = async () => {
    const { data, error } = await admin
      .from('matches')
      .select('id, stage, round_label, pair_a_id, pair_b_id, winner_pair_id, status, played_at, source_match_ids')
      .eq('category_id', cat.id).neq('stage', 'group');
    if (error) { fallo(`${cat.display_name}: no se pudo leer el cuadro (${error.message})`); return null; }
    return (data ?? []).sort((a, b) => (a.round_label ?? '').localeCompare(b.round_label ?? ''));
  };

  // ── Siembra ───────────────────────────────────────────────────────────────
  // SEMBRAR ES ACTO DE ORGANIZADOR, NO DE JUEZ. `generate-bracket` deja pasar
  // al juez en su pre-chequeo, pero la RPC `seed_bracket_for_category` solo
  // admite admin u owner — y hace bien: quién entra al cuadro no lo decide
  // quien anota los marcadores. Por eso aquí se pide prestado el permiso para
  // este paso concreto y se devuelve enseguida, como hace el cierre de
  // categorías. El botón de la app vive en la pantalla del organizador,
  // que es coherente con esto.
  let res, cuerpo;
  let prestado = false;
  try {
    prestado = await prestarOwner(admin, organizerId, actorId);
    res = await fetch(`${URL}/functions/v1/generate-bracket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'seed', category_id: cat.id }),
    });
    cuerpo = await res.json().catch(() => null);
  } catch (e) {
    fallo(`${cat.display_name}: ${e instanceof Error ? e.message : String(e)}`);
    return { capturados, conSuper, campeon };
  } finally {
    if (prestado) {
      try { await devolverOwner(admin, organizerId, actorId); }
      catch (e) { fallo(`membresía prestada SIN retirar: ${e.message}`); }
    }
  }
  // Un cuadro ya sembrado NO es un fallo: el script es idempotente y este es
  // justo el guard que se añadió al servidor para no re-sembrar encima.
  const yaSembrado = res.status === 409 && cuerpo?.error === 'bracket_already_seeded';
  if (!res.ok && !yaSembrado) {
    fallo(`${cat.display_name}: no se pudo sembrar el cuadro (${res.status} ${cuerpo?.error ?? '?'} ${cuerpo?.detail ?? ''})`);
    return { capturados, conSuper, campeon };
  }
  if (yaSembrado) info(`${cat.display_name}: el cuadro ya estaba sembrado, se juega el que hay`);
  let bracketSize = cuerpo?.bracket_size ?? 0;

  let cuadro = await leerCuadro();
  if (!cuadro) return { capturados, conSuper, campeon };
  if (!bracketSize) {
    // Cuadro preexistente: el tamaño sale de la ronda más grande que hay.
    const porEtapa = new Map();
    for (const m of cuadro.filter((x) => x.stage !== 'third_place')) {
      porEtapa.set(m.stage, (porEtapa.get(m.stage) ?? 0) + 1);
    }
    bracketSize = 2 * Math.max(0, ...porEtapa.values());
  }

  // ── Los que suben son los que dicta la configuración ──────────────────────
  const esperados = grupos.length * cat.advance_per_group + (cat.best_extra_qualifiers ?? 0);
  const primera = cuadro.filter((m) => m.stage !== 'third_place');
  const parejasEnCuadro = new Set(
    primera.flatMap((m) => [m.pair_a_id, m.pair_b_id]).filter(Boolean),
  );
  if (parejasEnCuadro.size !== esperados) {
    fallo(`${cat.display_name}: al cuadro subieron ${parejasEnCuadro.size} parejas y la ` +
          `configuración dicta ${esperados} (${grupos.length} grupos x ${cat.advance_per_group}` +
          `${cat.best_extra_qualifiers ? ` + ${cat.best_extra_qualifiers} repescados` : ''})`);
  } else {
    bien(`Cuadro de ${bracketSize}: subieron ${esperados} parejas, las que dicta la configuración`);
  }

  // ── Los byes nacen resueltos ──────────────────────────────────────────────
  // Un bye es un RESULTADO CONOCIDO desde que se siembra (migración 045), no un
  // partido pendiente. Nace 'finished' con ganador y SIN played_at: nadie lo
  // jugó, y ponerle hora sería inventarla.
  const byes = cuadro.filter((m) => !m.pair_a_id || !m.pair_b_id);
  if (byes.length === 0) {
    info('Este cuadro no tiene byes (los clasificados cuadran en potencia de 2)');
  } else {
    const sinResolver = byes.filter((m) => m.status !== 'finished' || !m.winner_pair_id);
    const conHora     = byes.filter((m) => m.played_at !== null);
    const solo        = (m) => m.pair_a_id ?? m.pair_b_id;
    const ganadorMal  = byes.filter((m) => m.winner_pair_id !== solo(m));

    if (sinResolver.length) fallo(`${cat.display_name}: ${sinResolver.length} bye(s) no nacen finished con ganador`);
    if (conHora.length)     fallo(`${cat.display_name}: ${conHora.length} bye(s) nacen con played_at; nadie los jugó`);
    if (ganadorMal.length)  fallo(`${cat.display_name}: ${ganadorMal.length} bye(s) con un ganador que no es la pareja presente`);
    if (!sinResolver.length && !conHora.length && !ganadorMal.length) {
      bien(`${byes.length} bye(s) nacen finished, con la pareja presente como ganadora y sin played_at`);
    }

    // La Edge Function tiene que rechazar capturarlo, venga de donde venga.
    const b = byes[0];
    const r = await fetch(`${URL}/functions/v1/match-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        match_id: b.id,
        winner_pair_id: solo(b),
        sets: [
          { set_number: 1, games_a: 6, games_b: 0, is_super_tiebreak: false, tiebreak_a: null, tiebreak_b: null },
          { set_number: 2, games_a: 6, games_b: 0, is_super_tiebreak: false, tiebreak_a: null, tiebreak_b: null },
        ],
      }),
    });
    const rc = await r.json().catch(() => null);
    if (r.ok) fallo(`${cat.display_name}: la Edge Function ACEPTÓ capturar un bye`);
    else if (rc?.error !== 'is_a_bye') {
      fallo(`${cat.display_name}: capturar un bye devolvió ${r.status} ${rc?.error ?? '?'}, se esperaba is_a_bye`);
    } else {
      bien('Capturar un bye se rechaza con is_a_bye');
    }
  }

  // Foto de los byes ANTES de jugar: el avance los lee, no los reescribe.
  const byesAntes = new Map(byes.map((m) => [m.id, {
    status: m.status, winner: m.winner_pair_id, played_at: m.played_at,
    a: m.pair_a_id, b: m.pair_b_id,
  }]));

  // ── Rondas ────────────────────────────────────────────────────────────────
  let ronda = 0;
  while (ronda < 8) {
    cuadro = await leerCuadro();
    if (!cuadro) break;

    // Un bye no se captura: ya está finished y le falta rival.
    const pendientes = cuadro.filter(
      (m) => m.status !== 'finished' && m.pair_a_id && m.pair_b_id,
    );
    if (pendientes.length === 0) break;

    for (const m of pendientes) {
      const { sets, ganador } = generarMarcador(m.id);
      const winner = ganador === 'A' ? m.pair_a_id : m.pair_b_id;
      if (sets.some((x) => x.is_super_tiebreak)) conSuper++;

      const r = await fetch(`${URL}/functions/v1/match-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          match_id: m.id, sets, winner_pair_id: winner,
          played_at: horaDeJuego(baseHoraria, horaCuadro + ronda),
        }),
      });
      const c = await r.json().catch(() => null);
      if (!r.ok) {
        fallo(`${cat.display_name} · ${m.stage} ${m.round_label}: rechazado ${r.status} ` +
              `${c?.error ?? '?'} ${c?.detail ?? ''}`);
        continue;
      }
      capturados++;
    }
    ronda++;
  }

  cuadro = await leerCuadro();
  if (!cuadro) return { capturados, conSuper, campeon };

  // ── El avance leyó los byes sin tocarlos ──────────────────────────────────
  if (byesAntes.size) {
    const tocados = [];
    for (const m of cuadro) {
      const antes = byesAntes.get(m.id);
      if (!antes) continue;
      if (m.status !== antes.status || m.winner_pair_id !== antes.winner ||
          m.played_at !== antes.played_at || m.pair_a_id !== antes.a || m.pair_b_id !== antes.b) {
        tocados.push(m.id);
      }
    }
    if (tocados.length) {
      fallo(`${cat.display_name}: el avance modificó ${tocados.length} bye(s) que ya estaban resueltos`);
    } else {
      bien(`Los ${byesAntes.size} bye(s) llegaron al final intactos: el avance los leyó, no los recalculó`);
    }

    // ── La plaza que viene de un bye se materializa en la ronda siguiente ────
    let huecos = 0;
    for (const [byeId, antes] of byesAntes) {
      const hijo = cuadro.find((m) => (m.source_match_ids ?? []).includes(byeId));
      if (!hijo) { fallo(`${cat.display_name}: el bye ${byeId.slice(0, 8)} no alimentó ningún partido`); huecos++; continue; }
      if (hijo.pair_a_id !== antes.winner && hijo.pair_b_id !== antes.winner) {
        fallo(`${cat.display_name}: ${hijo.stage} ${hijo.round_label} no recibió a la pareja que pasó por el bye`);
        huecos++;
      }
    }
    if (huecos === 0) {
      bien('Cada plaza que venía de un bye apareció en la ronda siguiente');
    }
  }

  // ── C − 1 partidos de verdad ──────────────────────────────────────────────
  // En un cuadro de tamaño B con C clasificados hay B−1 filas, de las que B−C
  // son byes. Los que se juegan de verdad son siempre C−1, con hueco o sin él.
  const realesEsperados = esperados - 1;
  const reales = cuadro.filter((m) => m.stage !== 'third_place' && m.pair_a_id && m.pair_b_id).length;
  if (reales !== realesEsperados) {
    fallo(`${cat.display_name}: ${reales} partidos reales en el cuadro y con ${esperados} ` +
          `clasificados tendrían que ser ${realesEsperados}`);
  } else {
    bien(`${reales} partidos reales = ${esperados} clasificados − 1` +
         (byes.length ? `, más ${byes.length} bye(s)` : ''));
  }

  // ── El tercer lugar nació al cerrar semifinales ───────────────────────────
  const semis = cuadro.filter((m) => m.stage === 'semi');
  const tercero = cuadro.find((m) => m.stage === 'third_place');

  // El tercer lugar necesita DOS perdedores de semifinal. Si una semi fue un
  // bye, solo perdió una pareja y no hay partido que jugar: `thirdPlaceFromSemis`
  // devuelve null y hace bien. Exigirlo ahí sería exigir un partido de uno.
  const semisReales = semis.filter((m) => m.pair_a_id && m.pair_b_id).length === 2;

  // El torneo puede tenerlo apagado (migración 052). Entonces lo correcto es
  // que NO exista, y comprobarlo es tan importante como lo contrario: un
  // interruptor que no apaga nada es peor que no tenerlo.
  if (!tercerLugarActivo) {
    if (tercero) {
      fallo(`${cat.display_name}: el torneo tiene el 3.er lugar APAGADO y aun así se creó`);
    } else {
      bien('3.er lugar apagado en el torneo: no se creó, como debe');
    }
  } else if (semis.length === 2 && !semisReales) {
    if (tercero) {
      fallo(`${cat.display_name}: se creó un tercer lugar con una semifinal que fue bye`);
    } else {
      bien('Sin tercer lugar: una semifinal fue bye, así que solo hubo un perdedor');
    }
  } else if (semis.length === 2) {
    if (!tercero) {
      fallo(`${cat.display_name}: se jugaron las semifinales y NO se creó el tercer lugar`);
    } else {
      const perdedores = semis.map((sm) =>
        sm.winner_pair_id === sm.pair_a_id ? sm.pair_b_id : sm.pair_a_id);
      const enTercero = [tercero.pair_a_id, tercero.pair_b_id];
      const cuadra = perdedores.every((x) => enTercero.includes(x));
      if (!cuadra) fallo(`${cat.display_name}: el tercer lugar no lo juegan los perdedores de semis`);
      else bien('El tercer lugar se creó al cerrar semifinales, con los dos perdedores');
    }
  }

  // ── Campeón ───────────────────────────────────────────────────────────────
  const final = cuadro.find((m) => m.stage === 'final');
  if (!final) {
    fallo(`${cat.display_name}: el cuadro no llegó a la final`);
  } else if (final.status !== 'finished' || !final.winner_pair_id) {
    fallo(`${cat.display_name}: la final quedó sin resultado`);
  } else {
    const ids = [final.winner_pair_id,
                 final.winner_pair_id === final.pair_a_id ? final.pair_b_id : final.pair_a_id];
    if (tercero?.winner_pair_id) ids.push(tercero.winner_pair_id);
    const nombres = await nombresDeParejas(admin, ids);
    campeon = {
      campeon: nombres.get(ids[0]) ?? ids[0].slice(0, 8),
      subcampeon: nombres.get(ids[1]) ?? ids[1].slice(0, 8),
      tercero: ids[2] ? (nombres.get(ids[2]) ?? ids[2].slice(0, 8)) : null,
    };
    bien(`Campeón: ${campeon.campeon}`);
  }

  // ── Corrección ────────────────────────────────────────────────────────────
  if (semis.length === 2) {
    await probarCorreccion({ admin, URL, token, cat, semis, baseHoraria, horaCuadro, fallo });
  }

  return { capturados, conSuper, campeon };
}

/**
 * Las dos caras de la invariante de corrección, sobre una semifinal cuya final
 * YA se jugó:
 *   · cambiar solo el marcador, mismo ganador  -> se acepta
 *   · cambiar el ganador                       -> downstream_already_played
 * y comprueba que el rechazo no dejó nada escrito a medias.
 */
async function probarCorreccion({ admin, URL, token, cat, semis, baseHoraria, horaCuadro, fallo }) {
  const semi = semis.find((m) => m.status === 'finished' && m.pair_a_id && m.pair_b_id);
  if (!semi) return;

  const enviar = (winner, sets) => fetch(`${URL}/functions/v1/match-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      match_id: semi.id, sets, winner_pair_id: winner,
      played_at: semi.played_at ?? horaDeJuego(baseHoraria, horaCuadro),
    }),
  });

  const ganador = semi.winner_pair_id;
  const perdedor = ganador === semi.pair_a_id ? semi.pair_b_id : semi.pair_a_id;
  const ganaA = ganador === semi.pair_a_id;

  // 1) Mismo ganador, marcador distinto. No mueve a nadie de sitio: se acepta.
  const setsIguales = [
    { set_number: 1, games_a: ganaA ? 6 : 1, games_b: ganaA ? 1 : 6, is_super_tiebreak: false, tiebreak_a: null, tiebreak_b: null },
    { set_number: 2, games_a: ganaA ? 6 : 0, games_b: ganaA ? 0 : 6, is_super_tiebreak: false, tiebreak_a: null, tiebreak_b: null },
  ];
  const r1 = await enviar(ganador, setsIguales);
  const c1 = await r1.json().catch(() => null);
  if (!r1.ok) {
    fallo(`${cat.display_name}: corregir el marcador sin cambiar de ganador fue rechazado ` +
          `(${r1.status} ${c1?.error ?? '?'} ${c1?.detail ?? ''})`);
  } else {
    bien('Corrección que no cambia el ganador: aceptada');
  }

  // 2) Cambiar el ganador con la final ya jugada: tiene que rebotar.
  const setsAlReves = [
    { set_number: 1, games_a: ganaA ? 1 : 6, games_b: ganaA ? 6 : 1, is_super_tiebreak: false, tiebreak_a: null, tiebreak_b: null },
    { set_number: 2, games_a: ganaA ? 0 : 6, games_b: ganaA ? 6 : 0, is_super_tiebreak: false, tiebreak_a: null, tiebreak_b: null },
  ];
  const r2 = await enviar(perdedor, setsAlReves);
  const c2 = await r2.json().catch(() => null);
  if (r2.ok) {
    fallo(`${cat.display_name}: se ACEPTÓ cambiar el ganador de una semifinal con la final ya jugada`);
  } else if (c2?.error !== 'downstream_already_played') {
    fallo(`${cat.display_name}: el rechazo esperado era downstream_already_played y llegó ` +
          `${r2.status} ${c2?.error ?? '?'}`);
  } else {
    bien('Corrección que cambia el ganador con la ronda siguiente jugada: rechazada');
  }

  // 3) El rechazo no puede haber escrito nada.
  const { data: despues } = await admin
    .from('matches').select('winner_pair_id, status').eq('id', semi.id).maybeSingle();
  if (despues?.winner_pair_id !== ganador) {
    fallo(`${cat.display_name}: el rechazo dejó la semifinal con otro ganador`);
  } else {
    bien('El rechazo no dejó nada escrito');
  }
}

/**
 * Ninguna pareja puede tener dos partidos capturados a la misma hora.
 *
 * Es físicamente imposible y además el orden cronológico de `played_at` es lo
 * que consume Glicko (migración 001 lo marca como crítico). Si dos partidos de
 * la misma pareja comparten hora, el rating se calcula sobre un orden que no
 * existe.
 */
async function verificarSolapamientos(admin, tournamentId, categoryIds, fallo, bien) {
  const { data, error } = await admin
    .from('matches')
    .select('id, pair_a_id, pair_b_id, played_at, stage, round_label')
    .eq('tournament_id', tournamentId)
    .in('category_id', categoryIds)
    .eq('status', 'finished')
    .not('played_at', 'is', null);
  if (error) { fallo(`No se pudieron leer los partidos para el cruce de horas: ${error.message}`); return; }

  const porPareja = new Map();
  for (const m of data ?? []) {
    for (const pid of [m.pair_a_id, m.pair_b_id]) {
      if (!pid) continue;
      const ya = porPareja.get(pid) ?? [];
      ya.push(m);
      porPareja.set(pid, ya);
    }
  }

  let choques = 0;
  for (const [pid, ms] of porPareja) {
    const horas = new Map();
    for (const m of ms) {
      const h = m.played_at;
      if (horas.has(h)) {
        choques++;
        if (choques <= 3) {
          fallo(`La pareja ${pid.slice(0, 8)} tiene dos partidos a las ${h}: ` +
                `${horas.get(h).stage}/${horas.get(h).round_label} y ${m.stage}/${m.round_label}`);
        }
        continue;
      }
      horas.set(h, m);
    }
  }
  if (choques === 0) {
    bien(`Nadie juega dos partidos a la misma hora (${porPareja.size} parejas revisadas)`);
  } else if (choques > 3) {
    fallo(`... y ${choques - 3} choques más`);
  }
}

/** Nombres por `bracket_pairs_public`, el mismo read-path que la app. */
async function nombresDeParejas(admin, pairIds) {
  const ids = [...new Set(pairIds)];
  if (ids.length === 0) return new Map();
  const { data } = await admin
    .from('bracket_pairs_public')
    .select('pair_id, player1_name, player2_name')
    .in('pair_id', ids);
  return new Map((data ?? []).map((p) => [p.pair_id, `${p.player1_name} / ${p.player2_name}`]));
}

main().catch((e) => { console.error(e); process.exit(1); });
