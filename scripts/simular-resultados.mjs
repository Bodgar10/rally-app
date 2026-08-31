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
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--todas') args.todas = true;
    else if (a === '--verificar') args.verificar = true;
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
    .from('tournaments').select('id, name, status').eq('id', args.tournamentId).single();
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
  if (args.reiniciar) {
    for (const cat of cats) {
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
  let capturados = 0, saltados = 0, conSuper = 0;

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

      for (const m of delGrupo) {
        if (m.status === 'finished') { saltados++; continue; }

        const { sets, ganador } = generarMarcador(m.id);
        const winner = ganador === 'A' ? m.pair_a_id : m.pair_b_id;
        if (sets.some((s) => s.is_super_tiebreak)) conSuper++;

        const res = await fetch(`${URL}/functions/v1/match-result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ match_id: m.id, sets, winner_pair_id: winner }),
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
    log('');
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  log('─'.repeat(60));
  log(`Capturados: ${capturados}   Con super muerte: ${conSuper}   ` +
      `Ya estaban: ${saltados}   Fallos: ${fallos}`);
  if (fallos > 0) {
    log(`${C.red}Algo no cuadra.${C.reset}`);
    process.exit(1);
  }
  log(`${C.green}Todo cuadra.${C.reset}`);
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
