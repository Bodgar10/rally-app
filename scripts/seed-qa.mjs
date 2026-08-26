#!/usr/bin/env node
/**
 * RALLY · Siembra de datos de QA
 *
 * Llena un torneo con parejas de prueba para ejercitar el motor de formato con
 * los siete tamaños que producen planes distintos.
 *
 * POR QUÉ NODE CON admin.createUser Y NO SQL DIRECTO
 *   Las filas de `public.users` las crea el trigger `on_auth_user_created` a
 *   partir de `auth.users`. Insertarlas a mano por SQL las dejaría huérfanas:
 *   sin fila en auth, sin poder iniciar sesión, y con el trigger sin disparar —
 *   o sea, datos que NO se parecen a los de producción, que es justo lo que un
 *   entorno de prueba no puede permitirse.
 *
 *   Tampoco una Edge Function: 196 altas superan de largo el tiempo de vida de
 *   una invocación, y trocearlo en lotes sería complejidad sin motivo para algo
 *   que solo se corre a mano.
 *
 * IDEMPOTENTE
 *   Los correos son `qa_NNN@rally.test`, deterministas por índice. Antes de
 *   crear se listan los existentes y se reutilizan. Las parejas se comprueban
 *   contra las que ya hay en la categoría. Correr esto dos veces no duplica
 *   nada.
 *
 * Uso:
 *   node scripts/seed-qa.mjs
 *   node scripts/seed-qa.mjs --dry     (enseña el plan y no escribe)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Configuración ───────────────────────────────────────────────────────────

const TOURNAMENT_ID = '21db9ff2-5d1e-4a1d-be53-2b77aa0e37f0'; // 5to Torneo Mexapadel Open Elite

/**
 * Cuántas parejas por categoría, y por qué cada número.
 * Los planes están verificados contra computeFormat: si el motor cambia, esta
 * tabla deja de describir la realidad y hay que actualizarla.
 *
 * `parejas` es lo que SIEMBRA este script, no el total de la categoría. Si ya
 * hay parejas reales ahí, se suman — y `objetivo` dice a cuánto debe llegar el
 * total para que el plan salga el esperado.
 *
 * `base` es el primer índice de correo de cada categoría, y está fijo a
 * propósito: con índices correlativos, cambiar el número de una categoría
 * desplazaba los de todas las siguientes y la reejecución dejaba de reutilizar
 * los mismos usuarios. Con bloques de 100 reservados, tocar una no mueve el
 * resto. 32 parejas = 64 usuarios, así que 100 sobra.
 */
const REPARTO = [
  { division: 'sexta',   gender: 'mixed',  base: 100, parejas: 5,  objetivo: 5,  plan: 'round robin, final directa' },
  // 6 sembradas + 2 parejas reales que ya estaban = 8.
  { division: 'quinta',  gender: 'mixed',  base: 200, parejas: 6,  objetivo: 8,  plan: '2 grupos de 4 → semifinales' },
  { division: 'cuarta',  gender: 'mixed',  base: 300, parejas: 16, objetivo: 16, plan: '4 grupos de 4 → cuartos' },
  { division: 'tercera', gender: 'mixed',  base: 400, parejas: 24, objetivo: 24, plan: '6 grupos de 4 → r16 con 4 mejores terceros' },
  { division: 'segunda', gender: 'mixed',  base: 500, parejas: 32, objetivo: 32, plan: '8 grupos de 4 → r16 limpio' },
  { division: 'quinta',  gender: 'female', base: 600, parejas: 4,  objetivo: 4,  plan: 'AMBIGUO: round robin o semifinales' },
  { division: 'cuarta',  gender: 'female', base: 700, parejas: 9,  objetivo: 9,  plan: '3 grupos de 3 → semis con 1 repescado' },
];

/** Altas en paralelo. Más alto empieza a dar 429 en el endpoint de admin. */
const CONCURRENCIA = 6;

// ── Nombres ─────────────────────────────────────────────────────────────────
// Bancos separados por género: las categorías femeniles tienen que salir con
// nombres de mujer o el dato de prueba no se parece al real.

const NOMBRES_H = [
  'Alejandro', 'Carlos', 'Diego', 'Eduardo', 'Fernando', 'Gerardo', 'Héctor',
  'Ignacio', 'Javier', 'Luis', 'Manuel', 'Néstor', 'Óscar', 'Pablo', 'Ricardo',
  'Sergio', 'Tomás', 'Víctor', 'Andrés', 'Bruno', 'César', 'Daniel', 'Emilio',
  'Felipe', 'Gonzalo', 'Hugo', 'Iván', 'Joaquín', 'Leonardo', 'Mauricio',
  'Nicolás', 'Rodrigo', 'Salvador', 'Rubén', 'Adrián', 'Marcos',
];

const NOMBRES_M = [
  'Adriana', 'Beatriz', 'Carmen', 'Daniela', 'Elena', 'Fernanda', 'Gabriela',
  'Helena', 'Isabel', 'Julia', 'Karla', 'Lucía', 'Mariana', 'Natalia', 'Olivia',
  'Patricia', 'Renata', 'Sofía', 'Teresa', 'Valeria', 'Ximena', 'Alejandra',
  'Bárbara', 'Claudia', 'Diana', 'Estela', 'Frida', 'Georgina', 'Inés',
  'Jimena', 'Laura', 'Mónica', 'Paulina', 'Regina', 'Silvia', 'Verónica',
];

const APELLIDOS = [
  'García', 'Hernández', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez',
  'Sánchez', 'Ramírez', 'Flores', 'Torres', 'Rivera', 'Gómez', 'Díaz', 'Cruz',
  'Morales', 'Reyes', 'Ortiz', 'Gutiérrez', 'Chávez', 'Ramos', 'Ruiz',
  'Vázquez', 'Castillo', 'Jiménez', 'Mendoza', 'Aguilar', 'Vargas', 'Romero',
  'Herrera', 'Medina', 'Castro', 'Guerrero', 'Rojas', 'Delgado', 'Peña',
  'Núñez', 'Cabrera', 'Sandoval', 'Ibarra', 'Fuentes', 'Contreras', 'Salazar',
  'Bautista', 'Cortés', 'Estrada', 'Miranda', 'Valdez', 'Escobar', 'Lara',
];

/**
 * Nombre determinista a partir del índice. Determinista a propósito: correr el
 * script dos veces tiene que dar los mismos nombres, o el "idempotente"
 * dejaría de serlo en la parte que se ve.
 *
 * Los dos apellidos usan multiplicadores primos distintos para que no salgan
 * "García García" en cadena.
 */
function nombreDe(indice, genero) {
  const pila = genero === 'female' ? NOMBRES_M : NOMBRES_H;
  const nombre  = pila[indice % pila.length];
  const paterno = APELLIDOS[(indice * 7) % APELLIDOS.length];
  const materno = APELLIDOS[(indice * 13 + 5) % APELLIDOS.length];
  return `${nombre} ${paterno} ${materno}`;
}

const correoDe = (indice) => `qa_${String(indice).padStart(3, '0')}@rally.test`;

// ── Entorno ─────────────────────────────────────────────────────────────────

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

// ── Utilidades ──────────────────────────────────────────────────────────────

/** Ejecuta `tareas` con como mucho `limite` en vuelo. */
async function enTanda(tareas, limite) {
  const resultados = [];
  let siguiente = 0;
  const obreros = Array.from({ length: Math.min(limite, tareas.length) }, async () => {
    while (siguiente < tareas.length) {
      const i = siguiente++;
      resultados[i] = await tareas[i]();
    }
  });
  await Promise.all(obreros);
  return resultados;
}

// ── Principal ───────────────────────────────────────────────────────────────

async function main() {
  const dry = process.argv.includes('--dry');
  const env = leerEnv();

  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan EXPO_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const supa = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const totalParejas = REPARTO.reduce((s, r) => s + r.parejas, 0);
  const totalUsuarios = totalParejas * 2;

  console.log(`\n  Torneo    ${TOURNAMENT_ID}`);
  console.log(`  Parejas   ${totalParejas}`);
  console.log(`  Jugadores ${totalUsuarios}\n`);
  for (const r of REPARTO) {
    const extra = r.objetivo !== r.parejas ? ` (+${r.objetivo - r.parejas} ya existentes → ${r.objetivo})` : '';
    console.log(`    ${r.division.padEnd(8)} ${r.gender.padEnd(7)} ${String(r.parejas).padStart(3)}${extra.padEnd(28)}  ${r.plan}`);
  }
  console.log('');

  if (dry) { console.log('  --dry: no se escribió nada.\n'); return; }

  // ── Categorías ────────────────────────────────────────────────────────────
  const { data: cats, error: errCats } = await supa
    .from('categories')
    .select('id, division, gender, display_name, status')
    .eq('tournament_id', TOURNAMENT_ID);

  if (errCats) { console.error('No se pudieron leer las categorías:', errCats.message); process.exit(1); }

  const catDe = new Map((cats ?? []).map((c) => [`${c.division}|${c.gender}`, c]));

  const faltantes = REPARTO.filter((r) => !catDe.has(`${r.division}|${r.gender}`));
  if (faltantes.length > 0) {
    console.error('  Faltan categorías en el torneo:');
    for (const f of faltantes) console.error(`    ${f.division} ${f.gender}`);
    console.error('  Créalas desde la app antes de sembrar.\n');
    process.exit(1);
  }

  const cerradas = REPARTO
    .map((r) => catDe.get(`${r.division}|${r.gender}`))
    .filter((c) => c.status !== 'open');
  if (cerradas.length > 0) {
    console.error('  Estas categorías ya no admiten inscripciones:');
    for (const c of cerradas) console.error(`    ${c.display_name} (${c.status})`);
    console.error('  La siembra sería parcial. Aborta.\n');
    process.exit(1);
  }

  // ── Usuarios existentes ───────────────────────────────────────────────────
  // Se consulta public.users (no listUsers, que pagina de 50 en 50): el trigger
  // garantiza que hay fila por cada auth.user.
  const { data: yaHay } = await supa
    .from('users').select('id, email').like('email', 'qa_%@rally.test');

  const porCorreo = new Map((yaHay ?? []).map((u) => [u.email, u.id]));
  console.log(`  Usuarios qa_ existentes: ${porCorreo.size}\n`);

  // ── Plan de jugadores ─────────────────────────────────────────────────────
  // El índice global es estable: la categoría N siempre ocupa el mismo rango,
  // así que reejecutar reutiliza exactamente los mismos usuarios.
  const plan = [];
  for (const r of REPARTO) {
    const cat = catDe.get(`${r.division}|${r.gender}`);
    let indice = r.base;
    for (let p = 0; p < r.parejas; p++) {
      const dos = [];
      for (let j = 0; j < 2; j++) {
        dos.push({ indice, correo: correoDe(indice), nombre: nombreDe(indice, r.gender) });
        indice++;
      }
      plan.push({ categoria: cat, jugadores: dos });
    }
  }

  // ── Alta de usuarios ──────────────────────────────────────────────────────
  const porCrear = plan.flatMap((p) => p.jugadores).filter((j) => !porCreado(j));
  function porCreado(j) { return porCorreo.has(j.correo); }

  console.log(`  Por crear: ${porCrear.length} usuarios (concurrencia ${CONCURRENCIA})`);
  const t0 = Date.now();
  let hechos = 0;
  let fallos = 0;

  await enTanda(porCrear.map((j) => async () => {
    const { data, error } = await supa.auth.admin.createUser({
      email: j.correo,
      password: 'qa-rally-2026',   // todas iguales: son de prueba y hay que poder entrar
      email_confirm: true,
      user_metadata: { full_name: j.nombre, created_by: 'qa_seed' },
    });

    if (error) {
      // 'already registered' entre dos corridas concurrentes no es un fallo.
      if (/already/i.test(error.message)) {
        const { data: u } = await supa.from('users').select('id').eq('email', j.correo).maybeSingle();
        if (u) { porCorreo.set(j.correo, u.id); hechos++; return; }
      }
      fallos++;
      console.error(`    ✕ ${j.correo}: ${error.message}`);
      return;
    }

    porCorreo.set(j.correo, data.user.id);
    hechos++;
    if (hechos % 25 === 0) process.stdout.write(`    ${hechos}/${porCrear.length}\n`);
  }), CONCURRENCIA);

  console.log(`  Usuarios listos: ${hechos} nuevos, ${fallos} fallos, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  if (fallos > 0) { console.error('  Hubo fallos; no se siembran parejas. Revisa arriba.\n'); process.exit(1); }

  // ── Parejas ───────────────────────────────────────────────────────────────
  // Idempotencia: una pareja ya existe si alguno de sus dos jugadores está en
  // esa categoría. Es la misma regla que impone la base con su UNIQUE.
  const { data: parejasHoy } = await supa
    .from('pairs').select('category_id, player1_id, player2_id').eq('tournament_id', TOURNAMENT_ID);

  const ocupado = new Set();
  for (const p of parejasHoy ?? []) {
    ocupado.add(`${p.category_id}|${p.player1_id}`);
    ocupado.add(`${p.category_id}|${p.player2_id}`);
  }

  const aInsertar = [];
  for (const p of plan) {
    const [a, b] = p.jugadores.map((j) => porCorreo.get(j.correo));
    if (!a || !b) continue;
    if (ocupado.has(`${p.categoria.id}|${a}`) || ocupado.has(`${p.categoria.id}|${b}`)) continue;

    aInsertar.push({
      tournament_id:       TOURNAMENT_ID,
      category_id:         p.categoria.id,
      player1_id:          a,
      player2_id:          b,
      // El torneo es gratuito: paid_offline es el estado que cuenta para el
      // cuadro sin pasar por Stripe.
      payment_status:      'paid_offline',
      schedule_preference: 'any',
    });
  }

  console.log(`  Parejas por insertar: ${aInsertar.length} (de ${plan.length} del plan)`);

  if (aInsertar.length > 0) {
    // De 50 en 50: un insert de 98 filas con RLS bypass va bien, pero si algo
    // falla el lote entero se pierde y cuesta más saber qué pasó.
    for (let i = 0; i < aInsertar.length; i += 50) {
      const lote = aInsertar.slice(i, i + 50);
      const { error } = await supa.from('pairs').insert(lote);
      if (error) { console.error(`    ✕ lote ${i}: ${error.message}`); process.exit(1); }
      console.log(`    +${lote.length}`);
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  const { data: finales } = await supa
    .from('pairs').select('category_id').eq('tournament_id', TOURNAMENT_ID);

  const cuenta = new Map();
  for (const p of finales ?? []) cuenta.set(p.category_id, (cuenta.get(p.category_id) ?? 0) + 1);

  console.log('\n  Estado final:');
  for (const r of REPARTO) {
    const c = catDe.get(`${r.division}|${r.gender}`);
    const n = cuenta.get(c.id) ?? 0;
    const ok = n === r.objetivo ? '✓' : '✕';
    console.log(`    ${ok} ${c.display_name.padEnd(14)} ${String(n).padStart(3)}/${r.objetivo}`);
  }
  console.log(`\n  Contraseña de todos: qa-rally-2026`);
  console.log(`  Para borrar: node scripts/clean-qa.mjs\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
