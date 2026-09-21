#!/usr/bin/env node
/**
 * RALLY · Poner lado y mano a los jugadores de QA
 *
 * PARA QUÉ
 *   `seed-qa.mjs` y `completar-parejas.mjs` crean jugadores con nombre y poco
 *   más, porque cuando se escribieron `preferred_side` estaba sin usar y `mano`
 *   no existía (migración 081).
 *
 *   Sin esos dos campos, tres pantallas nuevas se ven vacías y parecen rotas:
 *   el buscador de pareja no encuentra a nadie —exige lado contrario—, la ficha
 *   del rival no dice cómo juegan, y no hay forma de ver el aviso del zurdo de
 *   revés. Este script las llena para poder probarlas de verdad.
 *
 * ► NO TOCA A NADIE QUE NO SEA DE QA
 *   Solo jugadores cuyo correo sea del dominio de pruebas. Un jugador real que
 *   dejó su lado en blanco lo dejó a propósito, y rellenárselo desde un script
 *   sería publicar en su ficha un dato que él no dijo.
 *
 * ► Y NO PISA LO YA CONTESTADO
 *   Si alguien ya tiene lado, se respeta. Con `--forzar` se sobrescribe, que
 *   sirve para rearmar un reparto cuando el buscador de pareja no encuentra a
 *   nadie por casualidad del sorteo.
 *
 * USO
 *   node scripts/lado-y-mano-qa.mjs
 *   node scripts/lado-y-mano-qa.mjs --dry      (enseña qué haría, no escribe)
 *   node scripts/lado-y-mano-qa.mjs --forzar   (sobrescribe lo que ya tienen)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/** Los correos que crean los scripts de QA. */
const ES_DE_QA = /@rally\.test$/i;

/**
 * El reparto.
 *
 * Mitad y mitad de drive y revés —si todos fueran del mismo lado el buscador
 * de pareja no encontraría a nadie y parecería roto cuando en realidad
 * funciona—, con algunos de 'ambos' para ejercitar ese caso.
 *
 * ► LOS ZURDOS CAEN SIEMPRE EN EL REVÉS, Y NO ES CASUALIDAD.
 *   El zurdo de revés es lo que dispara el aviso táctico de la ficha del rival
 *   —"te va a cerrar el cruzado"—. Si la mano se repartiera al azar, ese aviso
 *   saldría por suerte o no saldría nunca, y entonces no se puede probar.
 *
 *   `i % 6 === 1` da siempre un índice IMPAR, y los impares son de revés (o de
 *   'ambos'). Nunca sale un zurdo de drive, que es el caso aburrido.
 */
function repartoDe(i) {
  const lado = i % 5 === 4 ? 'ambos' : i % 2 === 0 ? 'drive' : 'reves';
  const mano = i % 6 === 1 ? 'zurdo' : 'diestro';
  return { preferred_side: lado, mano };
}

async function main() {
  const dry = process.argv.includes('--dry');
  const forzar = process.argv.includes('--forzar');

  const env = leerEnv();
  const admin = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: usuarios, error } = await admin
    .from('users')
    .select('id, email, full_name, preferred_side, mano')
    .order('email');
  if (error) {
    console.error(`No se pudieron leer los jugadores: ${error.message}`);
    process.exit(1);
  }

  const deQA = (usuarios ?? []).filter((u) => ES_DE_QA.test(u.email ?? ''));
  if (deQA.length === 0) {
    console.log('No hay jugadores de QA. Corre antes `node scripts/seed-qa.mjs`.');
    return;
  }

  const pendientes = forzar ? deQA : deQA.filter((u) => !u.preferred_side || !u.mano);
  console.log(`\n${deQA.length} jugadores de QA · ${pendientes.length} por completar` +
    (forzar ? ' (--forzar: se sobrescriben todos)' : ''));

  if (pendientes.length === 0) {
    console.log('Ya tienen lado y mano. Usa --forzar para rehacer el reparto.\n');
    return;
  }

  let zurdosDeReves = 0;
  for (const [i, u] of pendientes.entries()) {
    const r = repartoDe(i);
    if (r.mano === 'zurdo' && r.preferred_side === 'reves') zurdosDeReves++;
    if (dry) {
      console.log(`  ${u.full_name ?? u.email}: ${r.mano}, ${r.preferred_side}`);
      continue;
    }
    const { error: e } = await admin.from('users').update(r).eq('id', u.id);
    process.stdout.write(e ? '✗' : '·');
  }

  if (dry) {
    console.log(`\n(--dry: no se escribió nada). Zurdos de revés que saldrían: ${zurdosDeReves}\n`);
    return;
  }

  console.log(`\n\nListo. ${zurdosDeReves} zurdos de revés — son los que disparan el aviso`);
  console.log('táctico de la ficha del rival, así que con al menos uno ya se puede ver.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
