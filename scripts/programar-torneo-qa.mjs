/**
 * RALLY · Programar los horarios de un torneo QA por el camino real
 *
 * PARA QUÉ
 *   `close-registration` dispara los dos schedulers al cerrar la ÚLTIMA
 *   categoría. Un torneo cuyas categorías se cerraron antes de que ese
 *   encadenado existiera —o cuya llamada falló— se queda con los grupos
 *   creados y sin una sola hora: el jugador entra al dashboard y ve
 *   «Por definir» aunque todo esté cerrado.
 *
 *   Este script vuelve a disparar los dos, por HTTP y con un JWT real, que es
 *   exactamente lo que hace el botón «Reintentar horarios» de la pantalla de
 *   cierre. No escribe por SQL: si el camino real está roto, tiene que
 *   romperse aquí también.
 *
 * EL PERMISO SE PRESTA Y SE DEVUELVE
 *   Las dos funciones exigen ser OWNER del organizador. El usuario QA no lo es,
 *   así que se le presta la membresía y se le quita en un `finally`, también si
 *   algo revienta. Mismo criterio que `cerrar-categorias-qa.mjs`.
 *
 * USO
 *   node scripts/programar-torneo-qa.mjs <tournament_id>
 *   node scripts/programar-torneo-qa.mjs <tournament_id> --como correo@ejemplo.com --clave '...'
 *
 *   El `--como` hace falta en torneos creados a mano, donde el usuario QA de
 *   `seed-qa.mjs` no existe. Sirve cualquier cuenta con contraseña; si no es
 *   owner del organizador, el script se la presta y se la quita al terminar.
 *
 *   La contraseña NO se imprime nunca, ni siquiera al fallar el login.
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

const log  = (...a) => console.log(...a);
const alto = (m) => { console.error(`\n  ALTO · ${m}\n`); process.exit(1); };

async function main() {
  const argv = process.argv.slice(2);
  const tournamentId = argv.find((a) => !a.startsWith('--'));
  const iComo = argv.indexOf('--como');
  const correo = iComo >= 0 ? argv[iComo + 1] : CORREO_JUEZ_QA;
  const iClave = argv.indexOf('--clave');
  const clave = iClave >= 0 ? argv[iClave + 1] : PASSWORD_QA;
  if (!tournamentId) alto('Falta el id del torneo.\n  node scripts/programar-torneo-qa.mjs <tournament_id>');

  const env = leerEnv();
  const admin = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const comoUsuario = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const { data: t } = await admin
    .from('tournaments').select('id, name, organizer_id').eq('id', tournamentId).maybeSingle();
  if (!t) alto(`No existe el torneo ${tournamentId}.`);
  log(`\n  ${t.name}`);

  const { data: sesion, error: eLogin } = await comoUsuario.auth.signInWithPassword({
    email: correo, password: clave,
  });
  if (eLogin) {
    alto(`No se pudo entrar como ${correo}: ${eLogin.message}\n` +
         '  En un torneo creado a mano hace falta --como <correo> --clave <contraseña>,\n' +
         '  con una cuenta que exista de verdad. Sirve la del organizador.');
  }
  const jwt = sesion.session.access_token;

  let prestado = false;
  try {
    prestado = await prestarOwner(admin, t.organizer_id, sesion.user.id);
    if (prestado) log(`  · membresía de owner prestada a ${correo}`);

    for (const fn of ['schedule-groups', 'schedule-knockout']) {
      const res = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ tournamentId }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) {
        log(`  ✗ ${fn}: HTTP ${res.status} ${JSON.stringify(cuerpo)}`);
        continue;
      }
      const n = cuerpo?.matchesActualizados ?? 0;
      log(`  ✓ ${fn}: ${n} partidos con hora` +
          (cuerpo?.ocupacion ? ` · ocupación ${cuerpo.ocupacion.porcentaje}%` : '') +
          (cuerpo?.sinProgramar?.length ? ` · ${cuerpo.sinProgramar.length} sin programar` : ''));
      for (const a of cuerpo?.avisos ?? []) log(`      ${a}`);
    }
  } finally {
    if (prestado) {
      await devolverOwner(admin, t.organizer_id, sesion.user.id);
      log('  · membresía devuelta');
    }
  }

  // El parte se da con lo que dice la base, no con lo que respondieron las
  // funciones: dos 200 no son dos escrituras.
  const { data: ms } = await admin
    .from('matches').select('scheduled_at, stage').eq('tournament_id', tournamentId);
  const conHora = (ms ?? []).filter((m) => m.scheduled_at).length;
  log(`\n  ${conHora} de ${(ms ?? []).length} partidos tienen hora.\n`);
  if (conHora === 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
