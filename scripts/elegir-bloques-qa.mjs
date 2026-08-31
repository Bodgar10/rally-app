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
 *   Elige el bloque como lo haría la inscripción, usando el MISMO motor que la
 *   app (`bloquesDisponibles` / `cupoDeBloque`). No reparte a ciegas ni llena
 *   bloques por encima de su capacidad — si lo hiciera, estaría probando el
 *   scheduler contra un dato que la app nunca produciría.
 *
 * EL SESGO, QUE ES LO QUE LO HACE ÚTIL
 *   Repartir en orden llena el viernes al 100% y deja el sábado por la noche
 *   vacío. Eso no se parece a nada: es un caso idealizado que no prueba nada.
 *
 *   La gente elige como puede. El primer bloque de cada día cae en horario
 *   laboral y casi nadie lo toma —en Cimepa el viernes de 14 a 17 trabajaron 3
 *   de 8 canchas— y los de tarde se llenan primero. Con ese sesgo el QA
 *   reproduce lo que de verdad va a pasar: bloques agotados, gente cayendo al
 *   que queda, y el último bloque tardío recibiendo a quien no cupo antes.
 *
 *   `--sin-sesgo` vuelve al reparto en orden, por si hace falta el caso plano.
 *
 * SOLO ANTES DE CERRAR
 *   Desde la migración 055 la elección se congela al cerrar la categoría, así
 *   que este script hay que correrlo ANTES del cierre — que además es el orden
 *   correcto: la pareja elige al inscribirse y el cierre agrupa dentro del
 *   bloque. Al revés salen grupos con gente de horarios distintos.
 *
 *   El sorteo es determinista: sembrado con el id de la pareja, dos corridas
 *   dan el mismo reparto.
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

/** Determinista: el mismo id da siempre el mismo número. */
function prng(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cuánto tira un bloque, según la hora a la que empieza.
 *
 * El primero de cada día pesa poco: es el que cae en horario laboral y el que
 * en Cimepa dejó cinco canchas paradas. A partir de las 17:00 la preferencia
 * se dispara, que es cuando la gente sale de trabajar.
 */
function peso(bloque, esPrimeroDelDia) {
  const h = Number(bloque.desde.slice(0, 2));
  const base = h < 12 ? 3      // mañana entre semana: poca gente
             : h < 15 ? 2      // sobremesa
             : h < 18 ? 8      // media tarde: el grueso
             : 10;             // noche: lo más pedido
  return esPrimeroDelDia ? Math.max(1, Math.round(base / 3)) : base;
}

async function main() {
  const argv = process.argv.slice(2);
  const tournamentId = argv.find((a) => !a.startsWith('--'));
  const borrar = argv.includes('--borrar');
  const sinSesgo = argv.includes('--sin-sesgo');
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

  // El primero de cada día, para castigarlo: es el del horario laboral.
  const primeroDelDia = new Set();
  const vistos = new Set();
  for (const b of reticula.bloques) {
    if (vistos.has(b.dia)) continue;
    vistos.add(b.dia);
    primeroDelDia.add(b.id);
  }

  const asignadas = [];
  const cayoEnOtro = [];
  let sinHueco = 0;
  for (const p of parejas) {
    const libres = bloquesDisponibles(reticula.bloques, ocupacion, p.category_id);
    if (libres.length === 0) { sinHueco++; continue; }

    let elegido;
    if (sinSesgo) {
      elegido = libres[0];
    } else {
      // Ruleta ponderada sobre los bloques QUE AÚN TIENEN CUPO. Cuando el
      // preferido se agota, la pareja cae al siguiente que quede — que es
      // exactamente lo que pasa en la inscripción real.
      const rnd = prng(p.id);
      const pesos = libres.map((b) => peso(b, primeroDelDia.has(b.id)));
      const total = pesos.reduce((a, x) => a + x, 0);
      let tirada = rnd() * total;
      elegido = libres[libres.length - 1];
      for (let i = 0; i < libres.length; i++) {
        tirada -= pesos[i];
        if (tirada <= 0) { elegido = libres[i]; break; }
      }
      // ¿Se quedó sin su favorito? Es el dato que interesa del sesgo.
      const favorito = libres.reduce((a, b) =>
        peso(b, primeroDelDia.has(b.id)) > peso(a, primeroDelDia.has(a.id)) ? b : a);
      if (elegido.id !== favorito.id) cayoEnOtro.push(p.id);
    }

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

  console.log(`\n  Asignadas ${asignadas.length} parejas${sinHueco ? `, ${sinHueco} SIN HUECO` : ''}` +
              `${sinSesgo ? ' (reparto plano)' : ''}`);
  const porBloque = {};
  for (const a of asignadas) porBloque[a.bloque_id] = (porBloque[a.bloque_id] ?? 0) + 1;
  for (const b of reticula.bloques) {
    const n = porBloque[b.id] ?? 0;
    console.log(`    ${b.dia} ${b.desde}-${b.hasta}  ${String(n).padStart(3)} parejas ` +
                `(${Math.ceil(n / PAREJAS_POR_GRUPO)} de ${b.carriles} carriles)`);
  }
  const agotados = reticula.bloques.filter((b) => (porBloque[b.id] ?? 0) >= b.carriles * PAREJAS_POR_GRUPO);
  if (agotados.length) {
    console.log(`\n  Bloques AGOTADOS: ${agotados.length} de ${reticula.bloques.length}` +
                ` (${agotados.map((b) => `${b.dia.slice(5)} ${b.desde}`).join(', ')})`);
  }
  if (!sinSesgo) {
    console.log(`  Parejas que NO consiguieron su bloque preferido: ${cayoEnOtro.length}`);
  }
  console.log('');
  if (sinHueco > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
