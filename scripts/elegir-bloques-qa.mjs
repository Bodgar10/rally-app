/**
 * RALLY · Elegir bloque horario para las parejas de un torneo QA
 *
 * POR QUÉ HACE FALTA
 *   `schedule-groups` reparte los grupos DENTRO del bloque que eligió la
 *   pareja al inscribirse. Sin elección no tiene entrada: devuelve
 *   `sin_bloque` para cada grupo y ni un partido recibe hora.
 *
 *   `seed-cimepa.mjs` inserta las parejas directamente en la tabla, saltándose
 *   la pantalla de inscripción — que es donde se elige el bloque. Así que
 *   después de un reseed la tabla `pair_block_choices` está vacía y el
 *   scheduler de grupos no puede hacer nada. No es un fallo suyo: es un dato
 *   de entrada que nadie había creado.
 *
 * QUÉ HACE, Y QUÉ NO
 *   Elige el bloque como lo haría la inscripción: el primero con cupo para la
 *   categoría de la pareja, usando el MISMO motor que la app
 *   (`bloquesDisponibles` / `cupoDeBloque`). No reparte a ciegas ni llena
 *   bloques por encima de su capacidad — si lo hiciera, estaría probando el
 *   scheduler contra un dato que la app nunca produciría.
 *
 *   El orden es determinista (por id de pareja) para que dos corridas den el
 *   mismo reparto.
 *
 * USO
 *   node scripts/elegir-bloques-qa.mjs <tournament_id>
 *   node scripts/elegir-bloques-qa.mjs <tournament_id> --borrar
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generarBloques, bloquesDisponibles, PAREJAS_POR_GRUPO,
} from '../supabase/functions/_shared/engine.bundle.js';

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
  const borrar = argv.includes('--borrar');
  if (!tournamentId) {
    console.error('\n  node scripts/elegir-bloques-qa.mjs <tournament_id> [--borrar]\n');
    process.exit(1);
  }

  const env = leerEnv();
  const s = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: t, error: te } = await s
    .from('tournaments').select('id, name, courts, match_minutes').eq('id', tournamentId).single();
  if (te || !t) { console.error(`No se encontró el torneo: ${te?.message ?? 'sin filas'}`); process.exit(1); }
  console.log(`\n  ${t.name}`);

  if (borrar) {
    const { error } = await s.from('pair_block_choices').delete().eq('tournament_id', tournamentId);
    console.log(error ? `  No se pudo borrar: ${error.message}` : '  Elecciones borradas.\n');
    return;
  }

  const { data: ws } = await s
    .from('tournament_windows').select('dia, desde, hasta').eq('tournament_id', tournamentId).order('dia');

  const reticula = generarBloques({
    ventanas: (ws ?? []).map((w) => ({
      dia: w.dia, desde: w.desde.slice(0, 5), hasta: w.hasta.slice(0, 5),
    })),
    canchas: t.courts ?? 8,
    minutosPorPartido: t.match_minutes ?? 60,
  });
  console.log(`  ${reticula.bloques.length} bloques · capacidad ${reticula.capacidadParejas} parejas`);
  for (const a of reticula.avisos) console.log(`    · ${a}`);

  const { data: parejas } = await s
    .from('pairs').select('id, category_id').eq('tournament_id', tournamentId).order('id');
  if (!parejas?.length) { console.error('  El torneo no tiene parejas.'); process.exit(1); }

  if (parejas.length > reticula.capacidadParejas) {
    console.error(`  No caben: ${parejas.length} parejas para ${reticula.capacidadParejas} lugares.`);
    process.exit(1);
  }

  // Ocupación viva, para que `cupoDeBloque` decida con la verdad. Un grupo son
  // 3 parejas de la MISMA categoría y ocupa un carril entero: por eso el cupo
  // no es una división simple y por eso se usa el motor y no una cuenta a mano.
  const ocupacion = {};
  for (const b of reticula.bloques) ocupacion[b.id] = {};

  const asignadas = [];
  let sinHueco = 0;
  for (const p of parejas) {
    const libres = bloquesDisponibles(reticula.bloques, ocupacion, p.category_id);
    if (libres.length === 0) { sinHueco++; continue; }
    const elegido = libres[0];
    ocupacion[elegido.id][p.category_id] = (ocupacion[elegido.id][p.category_id] ?? 0) + 1;
    asignadas.push({
      tournament_id: tournamentId, pair_id: p.id, bloque_id: elegido.id, forzado: false,
    });
  }

  // En tandas: 165 filas en un solo insert es un payload innecesariamente grande.
  for (let i = 0; i < asignadas.length; i += 50) {
    const { error } = await s.from('pair_block_choices')
      .upsert(asignadas.slice(i, i + 50), { onConflict: 'pair_id' });
    if (error) { console.error(`  Insert: ${error.message}`); process.exit(1); }
  }

  console.log(`\n  Asignadas ${asignadas.length} parejas${sinHueco ? `, ${sinHueco} SIN HUECO` : ''}`);
  const porBloque = {};
  for (const a of asignadas) porBloque[a.bloque_id] = (porBloque[a.bloque_id] ?? 0) + 1;
  for (const b of reticula.bloques) {
    const n = porBloque[b.id] ?? 0;
    console.log(`    ${b.dia} ${b.desde}-${b.hasta}  ${String(n).padStart(3)} parejas ` +
                `(${Math.ceil(n / PAREJAS_POR_GRUPO)} de ${b.carriles} carriles)`);
  }
  console.log('');
  if (sinHueco > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
