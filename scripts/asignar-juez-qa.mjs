/**
 * RALLY · Asignar un juez QA a un torneo
 *
 * POR QUÉ EXISTE
 *   `simular-resultados.mjs` captura por el camino real: se autentica y llama a
 *   la Edge Function. Para eso necesita un usuario que PUEDA capturar, y los
 *   únicos que pueden en un torneo real son el owner del organizador y el juez
 *   asignado — cuentas de personas, con contraseñas que un script no debe
 *   tener.
 *
 *   Este script crea (o reutiliza) un juez de prueba con la contraseña de los
 *   usuarios QA y lo asigna al torneo. Así la simulación corre sola sin que
 *   nadie preste sus credenciales.
 *
 * EL CORREO NO ES CASUAL
 *   `qa_juez@rally.test` entra en el patrón `qa_%@rally.test` que ya borra
 *   `clean-qa.mjs`. Un correo fuera de ese molde dejaría un usuario huérfano
 *   con permiso de captura después de limpiar.
 *
 * USO
 *   node scripts/asignar-juez-qa.mjs <tournament_id>
 *   node scripts/asignar-juez-qa.mjs <tournament_id> --quitar
 *
 * IDEMPOTENTE
 *   Si el usuario ya existe lo reutiliza; si ya está asignado, no duplica
 *   (la tabla tiene UNIQUE (tournament_id, user_id)).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CORREO_JUEZ_QA = 'qa_juez@rally.test';
export const PASSWORD_QA = 'qa-rally-2026';

/**
 * Presta al usuario QA la membresía de owner del organizador.
 *
 * POR QUÉ HACE FALTA, Y POR QUÉ SE DEVUELVE
 *   Capturar resultados y ADMINISTRAR el torneo son permisos distintos, y está
 *   bien que lo sean: `close_registration_for_category` y
 *   `seed_bracket_for_category` solo admiten admin u owner, mientras que
 *   `record_match_result` y `record_knockout_result` también admiten al juez
 *   asignado. Un juez captura; no decide quién entra al cuadro.
 *
 *   Los scripts de QA tienen que hacer las dos cosas, así que piden prestado el
 *   permiso para el paso de organizador y lo devuelven inmediatamente. La
 *   alternativa —llamar a la RPC con service_role pasando el id del owner real
 *   como p_actor— sería actuar en su nombre sin que se entere, y eso es peor
 *   aunque escriba exactamente lo mismo.
 *
 * Devuelve true si REALMENTE se prestó (y por tanto hay que devolverlo).
 */
export async function prestarOwner(admin, organizerId, userId) {
  const { data: ya } = await admin
    .from('organizer_members')
    .select('user_id')
    .eq('organizer_id', organizerId)
    .eq('user_id', userId)
    .maybeSingle();
  if (ya) return false;

  const { error } = await admin.from('organizer_members')
    .insert({ organizer_id: organizerId, user_id: userId, member_role: 'owner' });
  if (error) throw new Error(`no se pudo prestar la membresía de owner: ${error.message}`);
  return true;
}

/** Retira la membresía prestada. Llamar SIEMPRE, en un `finally`. */
export async function devolverOwner(admin, organizerId, userId) {
  const { error } = await admin.from('organizer_members')
    .delete().eq('organizer_id', organizerId).eq('user_id', userId);
  if (error) throw new Error(`no se pudo retirar la membresía prestada: ${error.message}`);
}

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

async function main() {
  const argv = process.argv.slice(2);
  const tournamentId = argv.find((a) => !a.startsWith('--'));
  const quitar = argv.includes('--quitar');

  if (!tournamentId) {
    console.error('\n  node scripts/asignar-juez-qa.mjs <tournament_id> [--quitar]\n');
    process.exit(1);
  }

  const env = leerEnv();
  const supa = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: torneo, error: te } = await supa
    .from('tournaments').select('id, name, organizer_id').eq('id', tournamentId).single();
  if (te || !torneo) {
    console.error(`No se encontró el torneo ${tournamentId}: ${te?.message ?? 'sin filas'}`);
    process.exit(1);
  }
  console.log(`\n  Torneo: ${torneo.name}`);

  // ── Usuario ───────────────────────────────────────────────────────────────
  let userId = null;
  const { data: ya } = await supa
    .from('users').select('id').eq('email', CORREO_JUEZ_QA).maybeSingle();

  if (ya) {
    userId = ya.id;
    console.log(`  Usuario: ${CORREO_JUEZ_QA} (ya existía)`);
  } else {
    const { data, error } = await supa.auth.admin.createUser({
      email: CORREO_JUEZ_QA,
      password: PASSWORD_QA,
      email_confirm: true,
      user_metadata: { full_name: 'Juez QA', created_by: 'qa_seed' },
    });
    if (error) {
      console.error(`  No se pudo crear ${CORREO_JUEZ_QA}: ${error.message}`);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`  Usuario: ${CORREO_JUEZ_QA} (creado)`);
  }

  // ── Asignación ────────────────────────────────────────────────────────────
  if (quitar) {
    const { error } = await supa.from('tournament_judges')
      .delete().eq('tournament_id', torneo.id).eq('user_id', userId);
    if (error) { console.error(`  No se pudo quitar: ${error.message}`); process.exit(1); }
    console.log('  Asignación retirada.\n');
    return;
  }

  // OJO: la tabla real tiene id, tournament_id, user_id, assigned_by, created_at.
  // `organizer_id` y `assigned_at` están en la migración 013 pero NO en la base
  // (drift documentado en la cabecera de esa migración). Insertar cualquiera de
  // los dos devuelve PGRST204.
  const { error: ie } = await supa.from('tournament_judges')
    .upsert(
      { tournament_id: torneo.id, user_id: userId },
      { onConflict: 'tournament_id,user_id', ignoreDuplicates: true },
    );
  if (ie) { console.error(`  No se pudo asignar: ${ie.message}`); process.exit(1); }

  console.log(`  Asignado como juez del torneo.`);
  console.log(`\n  Ya puedes correr:`);
  console.log(`    node scripts/simular-resultados.mjs ${torneo.id} --categoria "Mixtos C" \\`);
  console.log(`      --email ${CORREO_JUEZ_QA} --password ${PASSWORD_QA}\n`);
}

// Solo cuando se invoca directamente: `cerrar-categorias-qa.mjs` importa este
// módulo por sus dos constantes, y sin este guard le corría el main entero.
const invocadoDirecto = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocadoDirecto) main().catch((e) => { console.error(e); process.exit(1); });
