/**
 * RALLY · Re-sembrar el torneo QA desde cero
 *
 *   node scripts/reseed-cimepa.mjs <tournament_id>
 *   node scripts/reseed-cimepa.mjs <tournament_id> --si     (sin preguntar)
 *
 * POR QUÉ EXISTE Y NO BASTA CON CORRER EL SEED OTRA VEZ
 *   `seed-cimepa.mjs` es idempotente por omisión: filtra las parejas con un set
 *   de huecos ya ocupados y salta los que existen. Con las ocho categorías
 *   llenas no inserta NADA — así que un cambio en el reparto de jugadores (los
 *   cruces entre categorías, por ejemplo) no llega nunca a la base. Para
 *   aplicarlo hay que borrar primero.
 *
 * POR QUÉ NO USA clean-qa.mjs
 *   Aquel borra por `like('email','qa_%@rally.test')`, y en la base hay 522
 *   usuarios con ese patrón de los que solo ~330 son de Cimepa: el resto los
 *   creó `seed-qa.mjs` con otro rango. Correrlo aquí se llevaría por delante el
 *   otro juego de datos de prueba. Este script borra SOLO el rango de Cimepa.
 *
 * EL ORDEN IMPORTA Y NO ES EL INTUITIVO
 *   `pairs.player1_id/player2_id` son `on delete restrict` sobre `users`, así
 *   que un usuario no se puede borrar mientras exista su pareja. Primero el
 *   TORNEO —cuyo cascade se lleva categorías, grupos, standings, parejas,
 *   partidos, ventanas, jueces y el calendario— y después los usuarios, que ya
 *   quedan libres. Al revés falla en cada uno.
 *
 * LO QUE NO RECUPERA
 *   Los jueces asignados a mano. Cuelgan del torneo por cascade y el seed no
 *   los crea. Se avisa antes de borrar para que puedas volver a asignarlos.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';

import { NOMBRE_TORNEO_CIMEPA } from './qa-config.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CONCURRENCIA = 6;

/**
 * Estados en los que un torneo QA se puede tirar.
 *
 * `finished` queda FUERA a propósito: un torneo terminado ya movió ratings
 * Glicko y puntos de ranking de sus jugadores, y borrarlo deja ese histórico
 * apuntando a un torneo que no existe. Si de verdad hay que rehacerlo, se
 * revierte a mano y con los ojos abiertos.
 */
const ESTADOS_QA = ['draft', 'registration_open', 'registration_closed', 'in_progress'];

/**
 * Los correos que crea seed-cimepa: el rango numérico 1000+ y los siete con
 * nombre propio. seed-qa.mjs usa 100..799, por eso el patrón es tan concreto.
 */
const RE_CIMEPA = /^qa_(1\d{3}|cantillo|tapia|robelo|minana|mandujano|paz|edgar)@rally\.test$/;

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

const abortar = (msg) => { console.error(`\n  ✕ ${msg}\n`); process.exit(1); };

/** Cuenta filas de una tabla por columna. Devuelve null si la tabla no aplica. */
async function contar(supa, tabla, col, val) {
  const { count, error } = await supa.from(tabla).select('*', { count: 'exact', head: true }).eq(col, val);
  return error ? null : (count ?? 0);
}

// ── Principal ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tournamentId = args.find((a) => !a.startsWith('--'));
  const sinPreguntar = args.includes('--si');

  // 1 · El id es OBLIGATORIO y explícito. Nunca hardcodeado, nunca deducido
  //     por nombre: borrar torneos es destructivo y un `npm run` distraído no
  //     debe poder llevarse nada.
  if (!tournamentId) {
    console.error('\n  Uso: node scripts/reseed-cimepa.mjs <tournament_id> [--si]\n');
    console.error('  El id va explícito a propósito. Este script BORRA el torneo entero.\n');
    process.exit(1);
  }
  if (!/^[0-9a-f-]{36}$/i.test(tournamentId)) {
    abortar(`"${tournamentId}" no parece un uuid.`);
  }

  const env = leerEnv();
  const supa = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Verificación ──────────────────────────────────────────────────────────
  const { data: torneo, error: errT } = await supa
    .from('tournaments').select('id, name, status').eq('id', tournamentId).maybeSingle();
  if (errT) abortar(`No se pudo leer el torneo: ${errT.message}`);
  if (!torneo) abortar(`No existe ningún torneo con id ${tournamentId}.`);

  console.log(`\n  ${torneo.name}`);
  console.log(`  ${torneo.id}  ·  ${torneo.status}\n`);

  // GATE 1 · El nombre. El status por sí solo no basta: en esta misma base hay
  // otros torneos en 'registration_open' que no son de QA.
  if (torneo.name !== NOMBRE_TORNEO_CIMEPA) {
    abortar(
      `Este torneo se llama "${torneo.name}", no "${NOMBRE_TORNEO_CIMEPA}".\n`
      + `    Este script solo re-siembra el torneo QA. Si de verdad querías\n`
      + `    borrar otro, hazlo a mano y con más cuidado del que tiene un script.`,
    );
  }

  // GATE 2 · El status.
  if (!ESTADOS_QA.includes(torneo.status)) {
    abortar(
      `El torneo está en '${torneo.status}'.\n`
      + `    Solo se re-siembra en: ${ESTADOS_QA.join(', ')}.\n`
      + `    Un torneo 'finished' ya movió ratings y puntos de ranking; borrarlo\n`
      + `    dejaría ese histórico apuntando a un torneo inexistente.`,
    );
  }

  const { data: parejas } = await supa
    .from('pairs').select('id, category_id, player1_id, player2_id').eq('tournament_id', tournamentId);

  const jugadores = new Set();
  for (const p of parejas ?? []) { jugadores.add(p.player1_id); jugadores.add(p.player2_id); }

  // GATE 3 · El más fuerte: TODOS los jugadores tienen que ser cuentas de QA.
  // Demuestra que no hay una sola persona real ahí dentro. Si alguien se
  // inscribió de verdad en este torneo, el script para.
  const { data: usuariosQA } = await supa
    .from('users').select('id, email').like('email', 'qa_%@rally.test');
  const esQA = new Map((usuariosQA ?? []).map((u) => [u.id, u.email]));

  const intrusos = [...jugadores].filter((id) => !esQA.has(id));
  if (intrusos.length > 0) {
    const { data: quienes } = await supa.from('users').select('email').in('id', intrusos.slice(0, 5));
    abortar(
      `${intrusos.length} jugador(es) de este torneo NO son cuentas de QA:\n`
      + (quienes ?? []).map((u) => `      ${u.email}`).join('\n')
      + `\n    Son personas reales inscritas. El script no borra datos de nadie.`,
    );
  }

  // ── Qué se va a borrar ────────────────────────────────────────────────────
  const conteos = {};
  for (const tb of ['pairs', 'matches', 'tournament_windows', 'tournament_judges',
                    'match_schedule', 'registrations', 'tournament_ranking_points']) {
    conteos[tb] = await contar(supa, tb, 'tournament_id', tournamentId);
  }

  const { data: cats } = await supa
    .from('categories').select('id, display_name, status').eq('tournament_id', tournamentId);
  const catIds = (cats ?? []).map((c) => c.id);

  let grupos = 0;
  if (catIds.length > 0) {
    const { count } = await supa.from('groups').select('*', { count: 'exact', head: true }).in('category_id', catIds);
    grupos = count ?? 0;
  }

  // Los usuarios de Cimepa: SOLO el rango de este seed. Los de seed-qa.mjs
  // comparten el prefijo qa_ y no se tocan.
  const usuariosCimepa = (usuariosQA ?? []).filter((u) => RE_CIMEPA.test(u.email));
  const otrosQA = (usuariosQA ?? []).length - usuariosCimepa.length;

  console.log('  SE VA A BORRAR:');
  console.log(`    categorías              ${catIds.length}`);
  console.log(`    parejas                 ${conteos.pairs}`);
  console.log(`    grupos                  ${grupos}`);
  console.log(`    partidos                ${conteos.matches}`);
  console.log(`    ventanas horarias       ${conteos.tournament_windows}`);
  console.log(`    calendario              ${conteos.match_schedule}`);
  console.log(`    inscripciones           ${conteos.registrations}`);
  console.log(`    puntos de ranking       ${conteos.tournament_ranking_points}`);
  console.log(`    usuarios QA de Cimepa   ${usuariosCimepa.length}`);
  console.log(`\n  NO SE TOCA:`);
  console.log(`    usuarios QA de otros seeds   ${otrosQA}`);

  const cerradas = (cats ?? []).filter((c) => c.status !== 'open');
  if (cerradas.length > 0) {
    console.log(`\n  ⚠  ${cerradas.length} categoría(s) YA CERRADA(S): ${cerradas.map((c) => c.display_name).join(', ')}`);
    console.log(`     Sus grupos, standings y partidos se pierden. El seed no los recrea:`);
    console.log(`     hay que volver a cerrar inscripciones desde la app.`);
  }
  if (conteos.tournament_judges > 0) {
    console.log(`\n  ⚠  ${conteos.tournament_judges} juez(ces) asignado(s). Se pierden y el seed no los`);
    console.log(`     recrea: hay que volver a asignarlos desde la app.`);
  }

  // ── Confirmación ──────────────────────────────────────────────────────────
  if (!sinPreguntar) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const r = await rl.question(`\n  Escribe "borrar" para continuar: `);
    rl.close();
    if (r.trim() !== 'borrar') { console.log('\n  Cancelado. No se tocó nada.\n'); return; }
  }

  // ── 1) El torneo ──────────────────────────────────────────────────────────
  // El cascade se lleva categorías, grupos, standings, parejas, partidos,
  // ventanas, jueces, calendario, inscripciones y puntos de ranking.
  console.log('\n  Borrando el torneo…');
  const { error: errDel } = await supa.from('tournaments').delete().eq('id', tournamentId);
  if (errDel) {
    abortar(
      `No se pudo borrar el torneo: ${errDel.message}\n`
      + `    Si menciona un trigger de pagos, hay inscripciones pagadas en línea:\n`
      + `    reembólsalas en Stripe antes de re-sembrar.`,
    );
  }
  console.log('  ✓ Torneo y todo lo que colgaba de él.');

  // ── 2) Los usuarios ───────────────────────────────────────────────────────
  // Ahora sí: sin parejas, el RESTRICT de pairs ya no muerde.
  console.log(`\n  Borrando ${usuariosCimepa.length} usuarios de Cimepa…`);
  let ok = 0, mal = 0;
  await enTanda(usuariosCimepa.map((u) => async () => {
    const { error } = await supa.auth.admin.deleteUser(u.id);
    if (error) { mal++; console.error(`    ✕ ${u.email}: ${error.message}`); }
    else { ok++; if (ok % 50 === 0) process.stdout.write(`    ${ok}/${usuariosCimepa.length}\n`); }
  }), CONCURRENCIA);
  console.log(`  ✓ ${ok} borrados, ${mal} fallos.`);
  if (mal > 0) abortar('Quedaron usuarios sin borrar. Revisa antes de sembrar o el seed los reusará.');

  // ── 3) Sembrar ────────────────────────────────────────────────────────────
  // Como proceso hijo y no importando main(): el seed imprime su propio
  // progreso y así se ve tal cual, sin reimplementar nada de él aquí.
  console.log('\n  ───────────────────────────────────────────');
  console.log('  Sembrando de nuevo…\n');

  const codigo = await new Promise((res) => {
    const hijo = spawn(process.execPath, [resolve(raiz, 'scripts/seed-cimepa.mjs')], {
      cwd: raiz, stdio: 'inherit',
    });
    hijo.on('close', res);
  });
  if (codigo !== 0) abortar(`El seed terminó con código ${codigo}.`);

  // ── 4) Invariantes ────────────────────────────────────────────────────────
  await verificar(supa);
}

/**
 * Lo que hay que poder comprobar de un vistazo. Se lee de la BASE, no del plan
 * en memoria: el objetivo es confirmar que lo sembrado es lo que se quería, y
 * para eso hay que preguntarle a la base.
 */
async function verificar(supa) {
  console.log('\n  ───────────────────────────────────────────');
  console.log('  INVARIANTES\n');

  const { data: t } = await supa
    .from('tournaments').select('id').eq('name', NOMBRE_TORNEO_CIMEPA).maybeSingle();
  if (!t) { console.error('  ✕ No se encuentra el torneo recién sembrado.\n'); process.exit(1); }

  const { data: cats } = await supa
    .from('categories').select('id, display_name').eq('tournament_id', t.id).order('division');
  const { data: parejas } = await supa
    .from('pairs').select('category_id, player1_id, player2_id').eq('tournament_id', t.id);

  const ESPERADO = {
    '2A Fuerza': 21, '3A Fuerza': 30, '4A Fuerza': 30, '5A Fuerza': 30,
    '6A Fuerza': 15, '5A Femenil': 12, 'Mixtos D': 18, 'Mixtos C': 9,
  };

  const porCat = new Map();
  const veces = new Map();
  for (const p of parejas ?? []) {
    porCat.set(p.category_id, (porCat.get(p.category_id) ?? 0) + 1);
    for (const j of [p.player1_id, p.player2_id]) veces.set(j, (veces.get(j) ?? 0) + 1);
  }

  const personas = veces.size;
  const enDos = [...veces.values()].filter((n) => n >= 2).length;
  const pct = personas > 0 ? (enDos / personas * 100) : 0;

  const marca = (ok) => (ok ? '✓' : '✕');
  let todoBien = true;

  const totalParejas = parejas?.length ?? 0;
  const okParejas = totalParejas === 165;
  const okPersonas = personas === 305;
  const okDos = enDos === 25;
  todoBien = okParejas && okPersonas && okDos;

  console.log(`  ${marca(okParejas)} parejas               ${totalParejas} (esperado 165)`);
  console.log(`  ${marca(okPersonas)} personas distintas    ${personas} (esperado 305)`);
  console.log(`  ${marca(okDos)} en dos categorías     ${enDos} (esperado 25) · ${pct.toFixed(1)}%`);
  console.log('');

  for (const c of cats ?? []) {
    const n = porCat.get(c.id) ?? 0;
    const esp = ESPERADO[c.display_name];
    const ok = n === esp;
    if (!ok) todoBien = false;
    console.log(`  ${marca(ok)} ${c.display_name.padEnd(14)} ${String(n).padStart(3)}/${esp}`);
  }

  // Quién quedó cruzado, para poder ir a mirarlo en la app.
  const idsDobles = [...veces.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
  if (idsDobles.length > 0) {
    const { data: gente } = await supa.from('users').select('id, full_name').in('id', idsDobles);
    const nombre = new Map((gente ?? []).map((u) => [u.id, u.full_name]));
    const catDe = new Map((cats ?? []).map((c) => [c.id, c.display_name]));
    const suyas = new Map();
    for (const p of parejas ?? []) {
      for (const j of [p.player1_id, p.player2_id]) {
        if (!veces.get(j) || veces.get(j) < 2) continue;
        if (!suyas.has(j)) suyas.set(j, []);
        suyas.get(j).push(catDe.get(p.category_id));
      }
    }
    console.log('\n  EN DOS CATEGORÍAS:');
    for (const [id, cs] of suyas) {
      console.log(`    ${(nombre.get(id) ?? id).padEnd(24)} ${cs.join(' + ')}`);
    }
  }

  console.log(`\n  ${todoBien ? '✓ Todo cuadra.' : '✕ Hay invariantes que no cuadran.'}\n`);
  if (!todoBien) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
