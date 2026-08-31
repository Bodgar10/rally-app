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
    // `hasta` es la hora a la que TERMINA el último partido, no a la que
    // empieza. En el torneo real hubo partidos arrancando a las 22:00.
    { dia: '2026-09-11', desde: '14:00', hasta: '23:00' },   //  9 h → 72 slots
    { dia: '2026-09-12', desde: '08:00', hasta: '23:00' },   // 15 h → 120
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

// ── Jugadores en dos categorías ─────────────────────────────────────────────
//
// EL CASO QUE EL SEED NO SABÍA REPRESENTAR
//   Hasta ahora cada jugador aparecía en una sola categoría, así que las 165
//   parejas eran 330 personas distintas. En el Cimepa real no fue así:
//   Santiago Cantillo tenía semifinal de 2ª y final de 3ª a las 17:00 del
//   mismo domingo. El scheduler razona en parejas por categoría y nunca en
//   personas — con este seed era imposible siquiera reproducir el problema.
//
// LOS TRES DOCUMENTADOS son reales. El resto son sintéticos, hasta rondar el
// 8% de personas en dos categorías, con el patrón que se ve en el club: una
// de fuerza más una de mixtos. No se cruzan dos fuerzas — salvo Cantillo, que
// es precisamente el caso raro que motivó todo esto.
//
// El número de PAREJAS no cambia: 165, y los mismos conteos por categoría. Lo
// que baja es el número de personas distintas. Un cruce reescribe la identidad
// de un hueco de pareja para que apunte a alguien que ya juega en otra parte.

const clave = (division, gender) => `${division}|${gender}`;

const C = {
  '2A':  clave('segunda', 'male'),
  '3A':  clave('tercera', 'male'),
  '4A':  clave('cuarta',  'male'),
  '5A':  clave('quinta',  'male'),
  '6A':  clave('sexta',   'male'),
  '5F':  clave('quinta',  'female'),
  'MxD': clave('cuarta',  'mixed'),
  'MxC': clave('tercera', 'mixed'),
};

/**
 * Gente con nombre y apellido, para que los avisos de empalme se lean como en
 * el torneo real y no como `qa_1103@rally.test`.
 */
const PERSONAS = {
  cantillo:   { correo: 'qa_cantillo@rally.test',   nombre: 'Santiago Cantillo' },
  tapia:      { correo: 'qa_tapia@rally.test',      nombre: 'Rodolfo Tapia' },
  robelo:     { correo: 'qa_robelo@rally.test',     nombre: 'Carlos Robelo' },
  minana:     { correo: 'qa_minana@rally.test',     nombre: 'Nat Miñana' },
  mandujano:  { correo: 'qa_mandujano@rally.test',  nombre: 'Mariana Mandujano' },
  paz:        { correo: 'qa_paz@rally.test',        nombre: 'Victor Paz' },
  edgar:      { correo: 'qa_edgar@rally.test',      nombre: 'Edgar Sánchez' },
};

/**
 * Los tres cruces reales, puestos a mano en la pareja 0 de cada categoría.
 *
 * En mixtos el hueco 0 es el hombre y el 1 la mujer (ver generosDePareja), así
 * que Robelo va al 0 de Mixtos C y Mandujano al 1 de Mixtos D.
 *
 * Un `null` deja el hueco como lo generó el plan: no toda pareja real tiene
 * los dos nombres documentados, e inventarlos sería peor dato de prueba.
 *
 * MANDUJANO VA EN 5ª FEMENIL, NO EN 6ª FUERZA. En la captura aparece en una
 * pareja de 6ª, pero aquí las categorías de Fuerza son varoniles —lo dice la
 * cabecera de CATEGORIAS— y meter una mujer rompería justo la invariante que
 * ese comentario defiende. Su cruce con Mixtos D, que es lo que importa para
 * probar los empalmes, se conserva igual.
 */
const CRUCES_REALES = [
  // Cantillo: 2ª con Tapia, 3ª con Robelo. Dos FUERZAS: el caso documentado.
  { cat: '2A',  pareja: 0, huecos: ['cantillo', 'tapia'] },
  { cat: '3A',  pareja: 0, huecos: ['cantillo', 'robelo'] },
  // Robelo: 3ª con Cantillo, Mixtos C con Miñana.
  { cat: 'MxC', pareja: 0, huecos: ['robelo', 'minana'] },
  // Mandujano: 5ª Femenil + Mixtos D con Edgar.
  { cat: '5F',  pareja: 0, huecos: ['mandujano', null] },
  { cat: 'MxD', pareja: 0, huecos: ['edgar', 'mandujano'] },
  // Paz se queda en 6ª Fuerza. Que Mandujano no estuviera ahí no lo saca a él.
  { cat: '6A',  pareja: 0, huecos: ['paz', null] },
];

/**
 * De dónde salen los cruces sintéticos. Se alías un hueco de MIXTOS a alguien
 * que ya juega una categoría de fuerza — nunca al revés, para no tocar los
 * cuadros de fuerza, y nunca dentro de la misma categoría, que rompería la
 * pareja.
 *
 * Hombres al hueco 0 de mixtos, mujeres al 1. Las parejas 0 quedan fuera:
 * ya las ocupan los casos reales.
 */
// 6A entra aquí como todas: el varón de 6ª que cruza a Mixtos D sale de este
// zigzag, ocupando el sitio del cruce que estaba mal atribuido a Mandujano.
const FUENTES_H = ['2A', '3A', '4A', '5A', '6A'];
const DESTINOS_MIXTOS = [
  { cat: 'MxD', desde: 1, hasta: 17 },   // 17 parejas libres
  { cat: 'MxC', desde: 1, hasta: 8  },   //  8 parejas libres
];

/** Cuántos cruces sintéticos, repartidos entre hombres y mujeres. */
const CRUCES_H = 13;
const CRUCES_M = 9;

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
 * Qué correos son de Cimepa. LO DECIDE ESTE ARCHIVO, que es quien los crea.
 *
 * EL PROBLEMA QUE RESUELVE
 *   `reseed-cimepa.mjs` llevaba su propia copia escrita a mano:
 *
 *       /^qa_(1\d{3}|cantillo|tapia|robelo|minana|mandujano|paz|edgar)@rally\.test$/
 *
 *   Siete nombres y un rango, repetidos. En cuanto aquí se añadiera una persona
 *   a PERSONAS o una categoría con `base` fuera del rango, el reseed dejaría de
 *   reconocer a esos usuarios — y no fallaría: los saltaría en silencio. El
 *   borrado se quedaría a medias y la siguiente siembra los encontraría ya
 *   creados, con sus parejas viejas colgando. `pairs.player1_id` es `on delete
 *   restrict`, así que el residuo bloquea el borrado siguiente y el fallo
 *   aparece lejos de su causa.
 *
 * CÓMO SE DERIVA
 *   Los nombres salen de las claves de PERSONAS. El rango numérico sale de los
 *   `base` de CATEGORIAS: bloques de 100 documentados arriba, así que la
 *   ventana es [min(base), max(base) + 100). Añadir una categoría con base 1800
 *   la extiende sola.
 *
 *   `seed-qa.mjs` usa 100..799 y por eso el rango tiene que ser concreto: un
 *   `qa_%@rally.test` a secas se llevaría por delante el otro juego de datos.
 */
const BASES = CATEGORIAS.map((c) => c.base);
const RANGO_CIMEPA = { desde: Math.min(...BASES), hasta: Math.max(...BASES) + 100 };

export const NOMBRES_PROPIOS_CIMEPA = Object.keys(PERSONAS);

/** True si ese correo lo creó este seed. */
export function esCorreoDeCimepa(correo) {
  if (typeof correo !== 'string') return false;
  const m = /^qa_([^@]+)@rally\.test$/.exec(correo);
  if (!m) return false;
  const local = m[1];
  if (NOMBRES_PROPIOS_CIMEPA.includes(local)) return true;
  if (!/^\d{4}$/.test(local)) return false;
  const n = Number(local);
  return n >= RANGO_CIMEPA.desde && n < RANGO_CIMEPA.hasta;
}

/** Los límites, para que quien los use pueda decirlos por pantalla. */
export const RANGO_CORREOS_CIMEPA = RANGO_CIMEPA;

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

/**
 * Aplica los cruces sobre un plan ya construido y devuelve el recuento.
 *
 * Pura y exportada para poder verificar el porcentaje sin tocar la base: es la
 * única parte del seed cuyo resultado es un número que hay que comprobar.
 */
export function aplicarCruces(plan) {
// ── Cruces: la misma persona en dos categorías ────────────────────────────
// Se aplican SOBRE el plan ya construido, reescribiendo la identidad de un
// hueco. Por eso el número de parejas no se mueve: solo dejan de ser 330
// personas distintas.
//
// Determinista de punta a punta: correrlo dos veces cruza a la misma gente.
const porCat = new Map();
plan.forEach((p, i) => {
  const k = clave(p.categoria.division, p.categoria.gender);
  if (!porCat.has(k)) porCat.set(k, []);
  porCat.get(k).push(i);
});

const hueco = (cat, pareja, j) => {
  const idxs = porCat.get(C[cat]);
  if (!idxs || pareja >= idxs.length) return null;
  return plan[idxs[pareja]].jugadores[j];
};

// 1) Los tres reales.
for (const r of CRUCES_REALES) {
  r.huecos.forEach((persona, j) => {
    if (!persona) return;                       // hueco sin nombre documentado
    const h = hueco(r.cat, r.pareja, j);
    if (h) Object.assign(h, PERSONAS[persona]);
  });
}

// 2) Los sintéticos. Un hueco de mixtos pasa a ser alguien de fuerza.
//    `usados` impide que la misma persona acabe en tres categorías o que un
//    origen se reutilice: cada cruce es una persona nueva en dos cuadros.
const usados = new Set(Object.values(PERSONAS).map((p) => p.correo));
// Intercalados entre Mixtos D y Mixtos C: si se llenara primero D, todos los
// cruces caerían en el cuadro grande y Mixtos C —que es el más pequeño, y por
// tanto el que antes llega a semifinales— se quedaría sin ninguno.
const libres = [];
for (let p = 1; libres.length < 60; p++) {
  let quedan = false;
  for (const d of DESTINOS_MIXTOS) {
    if (p >= d.desde && p <= d.hasta) { libres.push({ cat: d.cat, pareja: p }); quedan = true; }
  }
  if (!quedan) break;
}

// Los orígenes se recorren en zigzag entre categorías para no vaciar de
// jugadores cruzados una sola: si todos los cruces salieran de 3ª, el cuadro
// de 3ª sería el único con riesgo de empalme y el dato de prueba mentiría.
const origenesH = [];
for (let vuelta = 1; origenesH.length < CRUCES_H && vuelta < 30; vuelta++) {
  for (const cat of FUENTES_H) {
    if (origenesH.length >= CRUCES_H) break;
    origenesH.push({ cat, pareja: vuelta, j: 0 });
  }
}
const origenesM = [];
for (let pareja = 1; origenesM.length < CRUCES_M && pareja < 12; pareja++) {
  origenesM.push({ cat: '5F', pareja, j: pareja % 2 });
}

let cruzados = 0;
const aplicar = (origenes, j) => {
  for (const o of origenes) {
    const destino = libres.find((l) => !l[`tomado${j}`]);
    if (!destino) break;
    const fuente = hueco(o.cat, o.pareja, o.j);
    const dest   = hueco(destino.cat, destino.pareja, j);
    if (!fuente || !dest || usados.has(fuente.correo)) continue;
    destino[`tomado${j}`] = true;
    usados.add(fuente.correo);
    Object.assign(dest, { correo: fuente.correo, nombre: fuente.nombre });
    cruzados++;
  }
};
aplicar(origenesH, 0);
aplicar(origenesM, 1);

// 3) Verificación: nadie puede quedar dos veces en la MISMA categoría — eso
//    no es un cruce, es una pareja rota que el insert descartaría en
//    silencio y dejaría la categoría corta.
const enCategoria = new Set();
for (const p of plan) {
  for (const j of p.jugadores) {
    const k = `${p.categoria.id}|${j.correo}`;
    if (enCategoria.has(k)) {
      console.error(`\n  Cruce inválido: ${j.correo} dos veces en la misma categoría.\n`);
      process.exit(1);
    }
    enCategoria.add(k);
  }
}

  const personas = new Set(plan.flatMap((p) => p.jugadores.map((j) => j.correo)));
  const veces = new Map();
  for (const p of plan) {
    for (const j of p.jugadores) veces.set(j.correo, (veces.get(j.correo) ?? 0) + 1);
  }
  const enDos = [...veces.values()].filter((n) => n >= 2).length;
  return { cruzados, personas: personas.size, enDos };
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

  const stats = aplicarCruces(plan);
  console.log(`\n  Cruces: ${stats.cruzados} sintéticos + 3 reales`);
  console.log(`  Personas distintas: ${stats.personas} (antes ${plan.length * 2})`);
  console.log(`  En dos categorías:  ${stats.enDos} (${(stats.enDos / stats.personas * 100).toFixed(1)}%)`);

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

// Solo al ejecutar el script; importarlo (para verificar aplicarCruces) no siembra nada.
if (process.argv[1] && process.argv[1].endsWith('seed-cimepa.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
