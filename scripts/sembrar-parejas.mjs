#!/usr/bin/env node
/**
 * RALLY · Llenar un torneo de parejas para enseñarlo
 *
 * ► NO ES `seed-qa.mjs`
 *   Aquel llena UN torneo fijo con `qa_NNN@rally.test` y nombres de relleno:
 *   sirve para ejercitar el motor, no para que un cliente mire la pantalla. En
 *   una demo los nombres se leen, y "QA 0017 / QA 0018" dice que esto es un
 *   juguete.
 *
 *   Aquí los jugadores tienen nombre y apellido mexicanos, y las parejas mixtas
 *   se forman con un hombre y una mujer — que es como se juega un mixto.
 *
 * ► LAS CUENTAS SON DE VERDAD
 *   Se crean en `auth` para que el trigger escriba su fila en `users`. Sin eso
 *   `fetchParejasPublicas` no las encuentra y el cuadro sale con guiones.
 *
 * ► IDEMPOTENTE
 *   Los correos son deterministas por índice y categoría. Correrlo dos veces no
 *   duplica parejas: se comprueba quién está ya en la categoría, que es la
 *   misma regla que impone la base.
 *
 * Uso:
 *   node scripts/sembrar-parejas.mjs <tournament_id> "5ª Mixto=10" "6ª Varonil=10"
 *   node scripts/sembrar-parejas.mjs <tournament_id> --dry "6ª Varonil=8"
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HOMBRES = [
  'Mateo', 'Santiago', 'Emiliano', 'Diego', 'Leonardo', 'Iker', 'Rodrigo', 'Ángel',
  'Julián', 'Maximiliano', 'Sebastián', 'Damián', 'Gael', 'Thiago', 'Bruno', 'Axel',
  'Patricio', 'Ignacio', 'Mauricio', 'Rogelio', 'Fernando', 'Ricardo', 'Alonso', 'Joaquín',
];
const MUJERES = [
  'Valentina', 'Regina', 'Camila', 'Renata', 'Ximena', 'Mariana', 'Fernanda', 'Daniela',
  'Paulina', 'Andrea', 'Natalia', 'Isabela', 'Luciana', 'Alejandra', 'Montserrat', 'Carolina',
];
const APELLIDOS = [
  'Vargas', 'Peña', 'Núñez', 'Cordero', 'Salas', 'Vega', 'Rojas', 'Cabrera',
  'Delgado', 'Montes', 'Quiroga', 'Ibáñez', 'Serrano', 'Lara', 'Pardo', 'Cuevas',
  'Zamora', 'Orozco', 'Barrios', 'Arriaga', 'Tamayo', 'Valdés', 'Mejía', 'Pacheco',
];

/**
 * 'Mateo Vargas', por un contador GLOBAL del torneo.
 *
 * ► NO BASTA CON DESPLAZAR POR CATEGORÍA
 *   El primer intento daba a cada categoría un desplazamiento sacado de su
 *   nombre, y 'Leonardo Salas' salió en las tres. El motivo: el nombre de pila
 *   ciclaba cada 24 y el apellido también, así que dos desplazamientos
 *   separados por un múltiplo de 24 producen exactamente la misma persona.
 *
 *   El cliente ve el mismo nombre tres veces, con compañeros distintos, y deja
 *   de creerse la demo. Son cuentas distintas —correos distintos— pero eso no
 *   se ve en pantalla.
 *
 * ► ASÍ NO SE REPITE NINGUNO
 *   El nombre de pila avanza de uno en uno y el apellido cambia cada vuelta
 *   completa: 24 × 24 = 576 personas distintas antes de repetir una. Un torneo
 *   de demo no llega ni de lejos.
 */
const nombreDe = (g, mujer) => {
  const pila = mujer ? MUJERES : HOMBRES;
  return `${pila[g % pila.length]} ${APELLIDOS[Math.floor(g / pila.length) % APELLIDOS.length]}`;
};

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

const morir = (m) => { console.error(`\n  ✕ ${m}\n`); process.exit(1); };
const aSlug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const [tournamentId, ...pares] = args.filter((a) => a !== '--dry');
  if (!tournamentId || pares.length === 0) {
    morir('Uso: node scripts/sembrar-parejas.mjs <tournament_id> "5ª Mixto=10" ...');
  }

  const pedido = pares.map((p) => {
    const i = p.lastIndexOf('=');
    if (i === -1) morir(`No entiendo "${p}". Usa "Nombre de categoría=parejas".`);
    return { categoria: p.slice(0, i), parejas: Number(p.slice(i + 1)) };
  });

  const env = leerEnv();
  const supa = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: torneo } = await supa
    .from('tournaments').select('name, status').eq('id', tournamentId).maybeSingle();
  if (!torneo) morir('No existe ese torneo.');
  if (torneo.status !== 'registration_open') {
    morir(`El torneo está en '${torneo.status}': ya no admite parejas.`);
  }

  const { data: cats } = await supa
    .from('categories').select('id, display_name, gender').eq('tournament_id', tournamentId);

  console.log(`\n  ${torneo.name}\n`);
  for (const p of pedido) {
    const c = (cats ?? []).find((x) => x.display_name === p.categoria);
    if (!c) morir(`No hay categoría "${p.categoria}". Hay: ${(cats ?? []).map((x) => x.display_name).join(', ')}`);
    console.log(`    ${p.categoria.padEnd(14)} ${String(p.parejas).padStart(2)} parejas  (${c.gender})`);
  }
  if (dry) { console.log('\n  --dry: no se escribió nada.\n'); return; }

  // Los contadores van FUERA del bucle: son del torneo entero, no de cada
  // categoría. Ver `nombreDe`.
  let hombresUsados = 0;
  let mujeresUsadas = 0;

  for (const p of pedido) {
    const cat = cats.find((x) => x.display_name === p.categoria);
    // Un mixto se juega con un hombre y una mujer; lo demás, del mismo género.
    const mixto = cat.gender === 'mixed';
    const soloMujeres = cat.gender === 'female';

    const base = aSlug(p.categoria);
    const jugadores = [];
    for (let n = 0; n < p.parejas * 2; n++) {
      // En mixto alternan: el par de cada pareja es hombre + mujer.
      const mujer = mixto ? n % 2 === 1 : soloMujeres;
      jugadores.push({
        correo: `${base}_${String(n).padStart(2, '0')}@rally.test`,
        nombre: nombreDe(mujer ? mujeresUsadas++ : hombresUsados++, mujer),
      });
    }

    const { data: yaUsuarios } = await supa
      .from('users').select('id, email, full_name').in('email', jugadores.map((j) => j.correo));
    const idPorCorreo = new Map((yaUsuarios ?? []).map((u) => [u.email, u.id]));

    // SI YA EXISTEN CON OTRO NOMBRE, SE CORRIGEN. Una siembra anterior pudo
    // dejarlos con nombres repetidos entre categorías, y volver a correr esto
    // tiene que arreglarlo en vez de dejarlo como estaba.
    const porRenombrar = jugadores.filter((j) => {
      const u = (yaUsuarios ?? []).find((x) => x.email === j.correo);
      return u && u.full_name !== j.nombre;
    });
    if (porRenombrar.length > 0) {
      await enTanda(porRenombrar.map((j) => async () => {
        const id = idPorCorreo.get(j.correo);
        await supa.auth.admin.updateUserById(id, { user_metadata: { full_name: j.nombre } });
        await supa.from('users').update({ full_name: j.nombre }).eq('id', id);
      }), CONCURRENCIA);
      console.log(`  ${p.categoria}: ${porRenombrar.length} nombres corregidos`);
    }

    const porCrear = jugadores.filter((j) => !idPorCorreo.has(j.correo));
    if (porCrear.length > 0) {
      let fallos = 0;
      await enTanda(porCrear.map((j) => async () => {
        const { data, error } = await supa.auth.admin.createUser({
          email: j.correo, password: 'demo-rally-2026', email_confirm: true,
          user_metadata: { full_name: j.nombre, created_by: 'demo' },
        });
        if (error) {
          if (/already/i.test(error.message)) {
            const { data: u } = await supa.from('users').select('id').eq('email', j.correo).maybeSingle();
            if (u) { idPorCorreo.set(j.correo, u.id); return; }
          }
          fallos++; console.error(`    ✕ ${j.correo}: ${error.message}`);
          return;
        }
        idPorCorreo.set(j.correo, data.user.id);
      }), CONCURRENCIA);
      if (fallos > 0) morir('Hubo fallos creando jugadores.');
    }

    // Idempotencia: la base impide que un jugador esté dos veces en la misma
    // categoría, así que se comprueba con la misma regla antes de insertar.
    const { data: yaParejas } = await supa
      .from('pairs').select('player1_id, player2_id').eq('category_id', cat.id);
    const ocupado = new Set((yaParejas ?? []).flatMap((x) => [x.player1_id, x.player2_id]));

    const nuevas = [];
    for (let k = 0; k < p.parejas; k++) {
      const a = idPorCorreo.get(jugadores[k * 2].correo);
      const b = idPorCorreo.get(jugadores[k * 2 + 1].correo);
      if (ocupado.has(a) || ocupado.has(b)) continue;
      nuevas.push({
        tournament_id: tournamentId, category_id: cat.id,
        player1_id: a, player2_id: b,
        // Cuota 0: el camino real deja 'paid_offline', no 'pending'.
        payment_status: 'paid_offline',
      });
    }

    if (nuevas.length > 0) {
      const { error } = await supa.from('pairs').insert(nuevas);
      if (error) morir(`Parejas de ${p.categoria}: ${error.message}`);
    }
    console.log(`  ${p.categoria}: ${(yaParejas ?? []).length + nuevas.length} parejas (${nuevas.length} nuevas)`);
  }

  console.log('\n  Listo. Cierra inscripciones por categoría desde el panel.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
