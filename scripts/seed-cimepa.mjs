#!/usr/bin/env node
/**
 * RALLY · Réplica del Sexto Torneo Cimepa
 *
 * Crea un torneo COMPLETO con la estructura real de Cimepa (We All Padel):
 * 165 parejas en 8 categorías, 8 canchas y tres ventanas de viernes a domingo.
 * Sirve para comparar lo que propone el planificador contra lo que ellos
 * armaron a mano — 55 grupos, todos de 3.
 *
 * POR QUÉ UN TORNEO NUEVO Y NO REUSAR EL DE PRUEBA
 *   El "5to Torneo Mexapadel Open Elite" tiene casos límite que vale la pena
 *   conservar: la categoría ambigua de 4 parejas y el round robin de 5.
 *   Rehacerlo los perdería, y tener los dos permite compararlos.
 *
 * IDEMPOTENTE
 *   El torneo se busca por nombre; las categorías por división+género; los
 *   usuarios por correo determinista; las parejas por "este jugador ya está en
 *   esta categoría". Correrlo dos veces no duplica nada.
 *
 * Uso:
 *   node scripts/seed-cimepa.mjs
 *   node scripts/seed-cimepa.mjs --dry
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NOMBRE_TORNEO_CIMEPA } from './qa-config.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── El torneo ───────────────────────────────────────────────────────────────

const FECHAS = { inicio: '2026-09-11', fin: '2026-09-13' };   // vie · sáb · dom

const CAPACIDAD = {
  canchas: 8,
  minutos: 60,
  ventanas: [
    { dia: '2026-09-11', desde: '14:00', hasta: '22:00' },   //  8 h → 64 slots
    { dia: '2026-09-12', desde: '08:00', hasta: '22:00' },   // 14 h → 112
    { dia: '2026-09-13', desde: '08:00', hasta: '20:00' },   // 12 h → 96
  ],
};

/**
 * Las ocho categorías reales.
 *
 * OJO CON EL GÉNERO: "Fuerza" en el padel mexicano es la rama VARONIL. Meterlas
 * como mixtas sería el mismo error que llevó a esconder Varonil de la pantalla
 * de categorías — 126 de las 165 parejas de Cimepa son varoniles.
 *
 * `base` es el primer índice de correo. Bloques de 100 y a partir de 1000 para
 * no chocar con seed-qa.mjs, que usa 100..799.
 */
const CATEGORIAS = [
  { division: 'segunda', gender: 'male',   nombre: '2A Fuerza',  parejas: 21, base: 1000 },
  { division: 'tercera', gender: 'male',   nombre: '3A Fuerza',  parejas: 30, base: 1100 },
  { division: 'cuarta',  gender: 'male',   nombre: '4A Fuerza',  parejas: 30, base: 1200 },
  { division: 'quinta',  gender: 'male',   nombre: '5A Fuerza',  parejas: 30, base: 1300 },
  { division: 'sexta',   gender: 'male',   nombre: '6A Fuerza',  parejas: 15, base: 1400 },
  { division: 'quinta',  gender: 'female', nombre: '5A Femenil', parejas: 12, base: 1500 },
  { division: 'cuarta',  gender: 'mixed',  nombre: 'Mixtos D',   parejas: 18, base: 1600 },
  { division: 'tercera', gender: 'mixed',  nombre: 'Mixtos C',   parejas:  9, base: 1700 },
];

const CONCURRENCIA = 6;

// ── Nombres ─────────────────────────────────────────────────────────────────

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

/** Determinista: correr dos veces da los mismos nombres. */
function nombreDe(indice, esMujer) {
  const pila = esMujer ? NOMBRES_M : NOMBRES_H;
  return `${pila[indice % pila.length]} `
    + `${APELLIDOS[(indice * 7) % APELLIDOS.length]} `
    + `${APELLIDOS[(indice * 13 + 5) % APELLIDOS.length]}`;
}

const correoDe = (i) => `qa_${String(i).padStart(4, '0')}@rally.test`;

/**
 * Género de cada jugador de una pareja.
 *
 * En mixto la pareja es un hombre y una mujer — no es un detalle cosmético:
 * es lo que significa la categoría, y un dato de prueba que no lo respete no
 * se parece al real.
 */
function generosDePareja(gender) {
  if (gender === 'female') return [true, true];
  if (gender === 'male')   return [false, false];
  return [false, true];
}

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

const nombreVisible = (c) => c.nombre;

// ── Principal ───────────────────────────────────────────────────────────────

async function main() {
  const dry = process.argv.includes('--dry');
  const env = leerEnv();
  const supa = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const totalParejas = CATEGORIAS.reduce((a, c) => a + c.parejas, 0);

  console.log(`\n  ${NOMBRE_TORNEO_CIMEPA}`);
  console.log(`  ${FECHAS.inicio} → ${FECHAS.fin} · ${CAPACIDAD.canchas} canchas · ${CAPACIDAD.minutos} min\n`);
  for (const c of CATEGORIAS) {
    console.log(`    ${c.nombre.padEnd(12)} ${c.gender.padEnd(7)} ${String(c.parejas).padStart(3)} parejas`);
  }
  console.log(`\n  ${totalParejas} parejas · ${totalParejas * 2} jugadores\n`);

  if (dry) { console.log('  --dry: no se escribió nada.\n'); return; }

  // ── Organizador ───────────────────────────────────────────────────────────
  const { data: org } = await supa.from('organizers').select('id, name').limit(1).maybeSingle();
  if (!org) { console.error('  No hay ningún organizador. Crea uno desde la app.\n'); process.exit(1); }

  // ── Torneo ────────────────────────────────────────────────────────────────
  let { data: torneo } = await supa
    .from('tournaments').select('id, status')
    .eq('name', NOMBRE_TORNEO_CIMEPA).maybeSingle();

  if (!torneo) {
    const { data, error } = await supa.from('tournaments').insert({
      name:             NOMBRE_TORNEO_CIMEPA,
      organizer_id:     org.id,
      start_date:       FECHAS.inicio,
      end_date:         FECHAS.fin,
      status:           'registration_open',
      registration_fee: 0,
      courts:           CAPACIDAD.canchas,
      match_minutes:    CAPACIDAD.minutos,
    }).select('id, status').single();

    if (error) { console.error('  No se pudo crear el torneo:', error.message, '\n'); process.exit(1); }
    torneo = data;
    console.log(`  Torneo creado: ${torneo.id}`);
  } else {
    // Reejecución: la capacidad se reafirma por si alguien la tocó a mano.
    await supa.from('tournaments')
      .update({ courts: CAPACIDAD.canchas, match_minutes: CAPACIDAD.minutos })
      .eq('id', torneo.id);
    console.log(`  Torneo ya existía: ${torneo.id}`);
  }

  if (torneo.status !== 'registration_open') {
    console.error(`\n  El torneo está en '${torneo.status}': ya no admite parejas. Aborta.\n`);
    process.exit(1);
  }

  // ── Ventanas ──────────────────────────────────────────────────────────────
  // Se borran y reinsertan: un upsert dejaría vivas las de una configuración
  // anterior, y el orden cronológico de las ventanas es semántico para el
  // planificador (el último día es el de eliminatorias).
  await supa.from('tournament_windows').delete().eq('tournament_id', torneo.id);
  const { error: errW } = await supa.from('tournament_windows').insert(
    CAPACIDAD.ventanas.map((v) => ({
      tournament_id: torneo.id, dia: v.dia,
      desde: `${v.desde}:00`, hasta: `${v.hasta}:00`,
    })),
  );
  if (errW) { console.error('  Ventanas:', errW.message, '\n'); process.exit(1); }
  console.log(`  Ventanas: ${CAPACIDAD.ventanas.length}`);

  // ── Categorías ────────────────────────────────────────────────────────────
  const { data: yaCats } = await supa
    .from('categories').select('id, division, gender, display_name')
    .eq('tournament_id', torneo.id);

  const catDe = new Map((yaCats ?? []).map((c) => [`${c.division}|${c.gender}`, c]));
  const porCrear = CATEGORIAS.filter((c) => !catDe.has(`${c.division}|${c.gender}`));

  if (porCrear.length > 0) {
    const { data, error } = await supa.from('categories').insert(
      porCrear.map((c) => ({
        tournament_id: torneo.id,
        division:      c.division,
        gender:        c.gender,
        display_name:  nombreVisible(c),
      })),
    ).select('id, division, gender');
    if (error) { console.error('  Categorías:', error.message, '\n'); process.exit(1); }
    for (const c of data ?? []) catDe.set(`${c.division}|${c.gender}`, c);
  }
  console.log(`  Categorías: ${catDe.size} (${porCrear.length} nuevas)`);

  // ── Plan de jugadores ─────────────────────────────────────────────────────
  const plan = [];
  for (const c of CATEGORIAS) {
    const cat = catDe.get(`${c.division}|${c.gender}`);
    const [g1, g2] = generosDePareja(c.gender);
    let i = c.base;
    for (let p = 0; p < c.parejas; p++) {
      plan.push({
        categoria: cat,
        jugadores: [
          { correo: correoDe(i),     nombre: nombreDe(i,     g1) },
          { correo: correoDe(i + 1), nombre: nombreDe(i + 1, g2) },
        ],
      });
      i += 2;
    }
  }

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const { data: yaHay } = await supa
    .from('users').select('id, email').like('email', 'qa_%@rally.test');
  const porCorreo = new Map((yaHay ?? []).map((u) => [u.email, u.id]));

  const nuevos = plan.flatMap((p) => p.jugadores).filter((j) => !porCorreo.has(j.correo));
  console.log(`\n  Usuarios por crear: ${nuevos.length} (concurrencia ${CONCURRENCIA})`);

  const t0 = Date.now();
  let hechos = 0, fallos = 0;

  await enTanda(nuevos.map((j) => async () => {
    const { data, error } = await supa.auth.admin.createUser({
      email: j.correo,
      password: 'qa-rally-2026',
      email_confirm: true,
      user_metadata: { full_name: j.nombre, created_by: 'qa_seed' },
    });
    if (error) {
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
    if (hechos % 50 === 0) process.stdout.write(`    ${hechos}/${nuevos.length}\n`);
  }), CONCURRENCIA);

  console.log(`  Usuarios listos: ${hechos} nuevos, ${fallos} fallos, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (fallos > 0) { console.error('\n  Hubo fallos; no se siembran parejas.\n'); process.exit(1); }

  // ── Parejas ───────────────────────────────────────────────────────────────
  const { data: yaParejas } = await supa
    .from('pairs').select('category_id, player1_id, player2_id').eq('tournament_id', torneo.id);

  const ocupado = new Set();
  for (const p of yaParejas ?? []) {
    ocupado.add(`${p.category_id}|${p.player1_id}`);
    ocupado.add(`${p.category_id}|${p.player2_id}`);
  }

  const aInsertar = [];
  for (const p of plan) {
    const [a, b] = p.jugadores.map((j) => porCorreo.get(j.correo));
    if (!a || !b) continue;
    if (ocupado.has(`${p.categoria.id}|${a}`) || ocupado.has(`${p.categoria.id}|${b}`)) continue;
    aInsertar.push({
      tournament_id:       torneo.id,
      category_id:         p.categoria.id,
      player1_id:          a,
      player2_id:          b,
      payment_status:      'paid_offline',   // torneo gratuito: cuentan para el cuadro
      schedule_preference: 'any',
    });
  }

  console.log(`\n  Parejas por insertar: ${aInsertar.length} (de ${plan.length} del plan)`);
  for (let i = 0; i < aInsertar.length; i += 50) {
    const lote = aInsertar.slice(i, i + 50);
    const { error } = await supa.from('pairs').insert(lote);
    if (error) { console.error(`    ✕ lote ${i}: ${error.message}`); process.exit(1); }
    process.stdout.write(`    +${lote.length}\n`);
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  const { data: finales } = await supa
    .from('pairs').select('category_id').eq('tournament_id', torneo.id);
  const cuenta = new Map();
  for (const p of finales ?? []) cuenta.set(p.category_id, (cuenta.get(p.category_id) ?? 0) + 1);

  console.log('\n  Estado final:');
  for (const c of CATEGORIAS) {
    const cat = catDe.get(`${c.division}|${c.gender}`);
    const n = cuenta.get(cat.id) ?? 0;
    console.log(`    ${n === c.parejas ? '✓' : '✕'} ${c.nombre.padEnd(12)} ${String(n).padStart(3)}/${c.parejas}`);
  }
  console.log(`\n  Torneo: ${torneo.id}`);
  console.log(`  Contraseña de todos: qa-rally-2026`);
  console.log(`  Para borrar: node scripts/clean-qa.mjs\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
