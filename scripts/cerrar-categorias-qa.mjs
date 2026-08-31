/**
 * RALLY · Cerrar las inscripciones de un torneo QA por el camino real
 *
 * POR QUÉ EXISTE
 *   Después de un reseed, las ocho categorías quedan abiertas y sin grupos. La
 *   app las cierra una a una desde `cerrar-inscripciones.tsx`, que llama a la
 *   Edge Function `close-registration`. Este script hace exactamente esa
 *   llamada, no un atajo por SQL: si el camino real está roto, tiene que
 *   romperse aquí también.
 *
 * EL PERMISO, Y POR QUÉ SE PRESTA Y SE DEVUELVE
 *   `close-registration` exige que quien llama sea OWNER del organizador
 *   (403 forbidden si no), y la RPC lo vuelve a verificar por su cuenta. El
 *   juez QA no lo es: capturar resultados y cerrar inscripciones son permisos
 *   distintos, y está bien que lo sean.
 *
 *   Así que el script le presta al usuario QA la membresía de owner, cierra, y
 *   se la QUITA en un `finally` — también si algo revienta a mitad. El préstamo
 *   dura segundos y queda dicho por pantalla. La alternativa era llamar a la
 *   RPC con service_role pasando el id del owner real como `p_actor`, es decir
 *   actuar en su nombre sin que se entere; eso es peor aunque escriba lo mismo.
 *
 *   Si el usuario QA ya era owner por su cuenta, no se toca nada.
 *
 * DECISIÓN DE FORMATO
 *   Cuando el reparto es ambiguo, `close-registration` devuelve
 *   `needs_decision` con el plan y sus alternativas en vez de elegir sola. Aquí
 *   se reenvía el plan que propone, que es el que la UI marca por defecto.
 *
 * USO
 *   node scripts/cerrar-categorias-qa.mjs <tournament_id>
 *   node scripts/cerrar-categorias-qa.mjs <tournament_id> --categoria "Mixtos C"
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORREO_JUEZ_QA, PASSWORD_QA, prestarOwner, devolverOwner } from './asignar-juez-qa.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  const iCat = argv.indexOf('--categoria');
  const soloCategoria = iCat >= 0 ? argv[iCat + 1] : null;

  if (!tournamentId) {
    console.error('\n  node scripts/cerrar-categorias-qa.mjs <tournament_id> [--categoria "5A Fuerza"]\n');
    process.exit(1);
  }

  const env = leerEnv();
  const URL = env.EXPO_PUBLIC_SUPABASE_URL;
  const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const anon = createClient(URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const { data: torneo, error: te } = await admin
    .from('tournaments').select('id, name, organizer_id, status').eq('id', tournamentId).single();
  if (te || !torneo) {
    console.error(`No se encontró el torneo ${tournamentId}: ${te?.message ?? 'sin filas'}`);
    process.exit(1);
  }
  console.log(`\n  ${torneo.name} · ${torneo.status}`);

  const { data: user } = await admin
    .from('users').select('id').eq('email', CORREO_JUEZ_QA).maybeSingle();
  if (!user) {
    console.error(`  No existe ${CORREO_JUEZ_QA}. Corre antes asignar-juez-qa.mjs.`);
    process.exit(1);
  }

  // ── Préstamo de la membresía de owner ────────────────────────────────────
  let prestado = false;
  try {
    prestado = await prestarOwner(admin, torneo.organizer_id, user.id);
  } catch (e) { console.error(`  ${e.message}`); process.exit(1); }
  console.log(prestado
    ? `  Membresía de owner PRESTADA a ${CORREO_JUEZ_QA} (se retira al terminar).`
    : `  ${CORREO_JUEZ_QA} ya era miembro; no se toca.`);

  let fallos = 0;
  try {
    const { data: sesion, error: se } = await anon.auth.signInWithPassword({
      email: CORREO_JUEZ_QA, password: PASSWORD_QA,
    });
    if (se || !sesion?.session) throw new Error(`login: ${se?.message ?? 'sin sesión'}`);
    const token = sesion.session.access_token;

    const { data: cats } = await admin
      .from('categories').select('id, display_name, status').eq('tournament_id', torneo.id).order('division');

    const objetivo = soloCategoria
      ? (cats ?? []).filter((c) => c.display_name.toLowerCase() === soloCategoria.toLowerCase())
      : (cats ?? []);
    if (objetivo.length === 0) {
      throw new Error(`ninguna categoría coincide con "${soloCategoria}"`);
    }

    for (const cat of objetivo) {
      if (cat.status !== 'open') {
        console.log(`  · ${cat.display_name}: ya está ${cat.status}, se salta`);
        continue;
      }

      const llamar = (cuerpo) => fetch(`${URL}/functions/v1/close-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cuerpo),
      });

      let res = await llamar({ category_id: cat.id });
      let json = await res.json().catch(() => null);

      // Reparto ambiguo: la UI ofrece alternativas y marca el plan propuesto.
      // Aquí se acepta ese plan, que es el default de la pantalla.
      if (res.ok && json?.status === 'needs_decision') {
        console.log(`  · ${cat.display_name}: formato ambiguo, se acepta el plan propuesto ` +
                    `(${json.plan?.groupSizes?.length ?? '?'} grupos)`);
        res = await llamar({ category_id: cat.id, chosen_format: json.plan });
        json = await res.json().catch(() => null);
      }

      if (!res.ok || !json?.ok) {
        console.log(`  ✗ ${cat.display_name}: ${res.status} ${json?.error ?? '?'} ${json?.detail ?? ''}`);
        fallos++;
        continue;
      }
      console.log(`  ✓ ${cat.display_name}: cerrada`);
    }
  } catch (e) {
    console.error(`  ${e instanceof Error ? e.message : String(e)}`);
    fallos++;
  } finally {
    // Se devuelve SIEMPRE, aunque el cierre haya reventado a mitad.
    if (prestado) {
      try {
        await devolverOwner(admin, torneo.organizer_id, user.id);
        console.log('  Membresía de owner RETIRADA.');
      } catch (e) {
        console.log(`  ⚠ ${e.message} — quítala a mano.`);
      }
    }
  }

  // Resumen de grupos generados
  const { data: gruposCount } = await admin
    .from('categories').select('id, display_name, status').eq('tournament_id', torneo.id);
  const cerradas = (gruposCount ?? []).filter((c) => c.status !== 'open').length;
  console.log(`\n  Categorías cerradas: ${cerradas}/${gruposCount?.length ?? 0}   Fallos: ${fallos}\n`);
  if (fallos > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
