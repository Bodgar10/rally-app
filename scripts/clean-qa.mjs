#!/usr/bin/env node
/**
 * RALLY · Limpieza de los datos de QA
 *
 * Borra TODO lo que creó seed-qa.mjs: los usuarios qa_NNN@rally.test y, por
 * cascada, sus parejas, inscripciones y declaraciones de edad.
 *
 * POR QUÉ BASTA CON BORRAR LOS USUARIOS
 *   `public.users.id` referencia `auth.users(id) on delete cascade`, y de
 *   `public.users` cuelgan pairs (player1_id/player2_id), registrations (vía
 *   pairs) y player_age_declarations. Borrar en auth arrastra todo.
 *
 * EL FRENO QUE HAY QUE CONOCER
 *   `registrations_block_paid_delete` (migración 033) impide borrar una
 *   inscripción con pago en línea, para no dejar un cargo vivo en Stripe sin
 *   registro. Si alguna pareja de QA llegó a pagar de verdad, el borrado FALLA
 *   ahí — y está bien que falle. Este script lo detecta antes y lo dice, en vez
 *   de estrellarse a mitad.
 *
 * Uso:
 *   node scripts/clean-qa.mjs           (pide confirmación)
 *   node scripts/clean-qa.mjs --si      (sin preguntar)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCIA = 6;

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

async function main() {
  const env = leerEnv();
  const supa = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // El patrón es el mismo que usa la siembra. Si alguien cambia uno, que
  // cambie el otro: si no, la limpieza deja basura.
  const { data: usuarios, error } = await supa
    .from('users').select('id, email, full_name').like('email', 'qa_%@rally.test');

  if (error) { console.error('No se pudo consultar:', error.message); process.exit(1); }
  if (!usuarios?.length) { console.log('\n  No hay usuarios qa_. Nada que borrar.\n'); return; }

  const ids = usuarios.map((u) => u.id);

  // Qué se va a llevar por delante, contado ANTES de tocar nada.
  const { data: parejas } = await supa
    .from('pairs').select('id')
    .or(`player1_id.in.(${ids.join(',')}),player2_id.in.(${ids.join(',')})`);

  const idsParejas = (parejas ?? []).map((p) => p.id);

  let pagadas = [];
  if (idsParejas.length > 0) {
    const { data } = await supa
      .from('registrations').select('id, payment_status, stripe_payment_intent_id')
      .in('pair_id', idsParejas)
      .eq('payment_status', 'paid_online');
    pagadas = data ?? [];
  }

  console.log(`\n  Usuarios qa_    ${usuarios.length}`);
  console.log(`  Parejas suyas   ${idsParejas.length}`);
  console.log(`  Con pago online ${pagadas.length}`);

  if (pagadas.length > 0) {
    console.error('\n  ✕ Hay inscripciones pagadas en línea. El trigger');
    console.error('    registrations_block_paid_delete (migración 033) va a impedir el borrado,');
    console.error('    y hace bien: dejaría un cargo vivo en Stripe sin registro en RALLY.');
    console.error('    Reembólsalas en Stripe primero. PaymentIntents:');
    for (const r of pagadas) console.error(`      ${r.stripe_payment_intent_id ?? r.id}`);
    console.error('');
    process.exit(1);
  }

  if (!process.argv.includes('--si')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const r = await rl.question(`\n  Borrar ${usuarios.length} usuarios y sus ${idsParejas.length} parejas? (escribe "borrar"): `);
    rl.close();
    if (r.trim() !== 'borrar') { console.log('  Cancelado.\n'); return; }
  }

  let ok = 0, mal = 0;
  await enTanda(usuarios.map((u) => async () => {
    // Solo auth: el cascade se lleva public.users y todo lo que cuelga.
    const { error } = await supa.auth.admin.deleteUser(u.id);
    if (error) { mal++; console.error(`    ✕ ${u.email}: ${error.message}`); }
    else { ok++; if (ok % 25 === 0) process.stdout.write(`    ${ok}/${usuarios.length}\n`); }
  }), CONCURRENCIA);

  const { data: quedan } = await supa
    .from('users').select('id').like('email', 'qa_%@rally.test');

  console.log(`\n  Borrados ${ok}, fallos ${mal}. Quedan ${quedan?.length ?? 0} usuarios qa_.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
