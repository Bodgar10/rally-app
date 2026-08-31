/**
 * RALLY · Completar las parejas de un torneo hasta los números de Cimepa
 *
 * PARA QUÉ
 *   Un torneo creado a mano desde la app, con unas pocas parejas de verdad, se
 *   rellena hasta el tamaño del Sexto Torneo Cimepa para poder probarlo con
 *   carga real sin volver a teclear 160 inscripciones.
 *
 * LO QUE NO HACE, A PROPÓSITO
 *   · No crea categorías. Si al torneo le falta alguna de las ocho, lo dice y
 *     para: crearlas es una decisión del organizador y desde la app quedan con
 *     su cuota y su configuración, que aquí habría que adivinar.
 *   · No toca las parejas que ya existen ni sus bloques. Son inscripciones
 *     reales y perderlas o duplicarlas sería peor que no sembrar nada.
 *   · No inventa capacidad. Si la retícula no da para los objetivos, para
 *     antes de escribir: sembrar de más deja parejas sin horario y el fallo
 *     aparece mucho después, al cerrar.
 *
 * LAS CUENTAS SE CREAN COMO LAS CREA LA APP
 *   El jugador que inscribe tiene contraseña; su compañero NO, y lleva
 *   `created_by: 'player'`. Es exactamente lo que hace `pair-register-self`, y
 *   es lo que ejercita el camino de activación que arreglamos en la migración
 *   057. Sembrar con contraseña a los dos daría un torneo de prueba donde ese
 *   camino nunca se recorre — que es como se nos escapó la primera vez.
 *
 * EL PATRÓN DE CORREO
 *   `qa_2NNN@rally.test`. Dentro de `qa_%@rally.test`, que es lo que barre
 *   `clean-qa.mjs`, y FUERA del rango 1000–1799 de `seed-cimepa.mjs`, para que
 *   `reseed-cimepa.mjs` no se lleve por delante las de este torneo.
 *
 * USO
 *   node scripts/completar-parejas.mjs <tournament_id>
 *   node scripts/completar-parejas.mjs <tournament_id> --dry
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generarBloques, bloquesDisponibles, PAREJAS_POR_GRUPO,
} from '../supabase/functions/_shared/engine.bundle.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Los ocho tamaños del Cimepa real, por división y género.
 *
 * `base` es el primer índice de correo de cada categoría; bloques de 100 desde
 * 2000 para no chocar con seed-qa (100–799) ni con seed-cimepa (1000–1799).
 */
const OBJETIVOS = [
  { division: 'segunda', gender: 'male',   parejas: 21, base: 2000 },
  { division: 'tercera', gender: 'male',   parejas: 30, base: 2100 },
  { division: 'cuarta',  gender: 'male',   parejas: 30, base: 2200 },
  { division: 'quinta',  gender: 'male',   parejas: 30, base: 2300 },
  { division: 'sexta',   gender: 'male',   parejas: 15, base: 2400 },
  { division: 'quinta',  gender: 'female', parejas: 12, base: 2500 },
  { division: 'cuarta',  gender: 'mixed',  parejas: 18, base: 2600 },
  { division: 'tercera', gender: 'mixed',  parejas:  9, base: 2700 },
];

const NOMBRES_H = [
  'Alejandro', 'Bruno', 'Carlos', 'Daniel', 'Eduardo', 'Fernando', 'Gerardo',
  'Héctor', 'Ignacio', 'Javier', 'Luis', 'Manuel', 'Néstor', 'Óscar', 'Pablo',
  'Ricardo', 'Sergio', 'Tomás', 'Víctor', 'Andrés',
];
const NOMBRES_M = [
  'Ana', 'Beatriz', 'Carmen', 'Daniela', 'Elena', 'Fernanda', 'Gabriela',
  'Helena', 'Isabel', 'Julia', 'Karla', 'Lucía', 'Mariana', 'Natalia', 'Olivia',
];
const APELLIDOS = [
  'García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz',
  'Torres', 'Flores', 'Rivera', 'Cruz', 'Morales', 'Ortiz', 'Ramos', 'Castro',
];

const correoDe = (i) => `qa_${String(i).padStart(4, '0')}@rally.test`;

/** Determinista: el mismo índice da siempre el mismo nombre. */
function nombreDe(indice, genero) {
  const pila = genero === 'female' ? NOMBRES_M : NOMBRES_H;
  return `${pila[indice % pila.length]} ${APELLIDOS[(indice * 7 + 3) % APELLIDOS.length]}`;
}

/**
 * Género de cada hueco de la pareja.
 *
 * En mixto la pareja es un hombre y una mujer: no es cosmético, es lo que
 * significa la categoría, y un dato de prueba que no lo respete no se parece
 * al real.
 */
const generosDe = (gender) =>
  gender === 'mixed' ? ['male', 'female'] : [gender, gender];

// ── PRNG y sesgo de bloque ──────────────────────────────────────────────────

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
 * Cuánto tira un bloque según la hora a la que empieza.
 *
 * El primero de cada día cae en horario laboral y casi nadie lo toma —en
 * Cimepa el viernes de 14 a 17 trabajaron 3 de 8 canchas— y los de tarde se
 * llenan primero. Repartir en orden daría un torneo idealizado que no prueba
 * nada. Mismo criterio que `elegir-bloques-qa.mjs`.
 */
function peso(bloque, esPrimeroDelDia) {
  const h = Number(bloque.desde.slice(0, 2));
  const base = h < 12 ? 3 : h < 15 ? 2 : h < 18 ? 8 : 10;
  return esPrimeroDelDia ? Math.max(1, Math.round(base / 3)) : base;
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

const log  = (...a) => console.log(...a);
const alto = (m) => { console.error(`\n  ALTO · ${m}\n`); process.exit(1); };

async function main() {
  const argv = process.argv.slice(2);
  const tournamentId = argv.find((a) => !a.startsWith('--'));
  const dry = argv.includes('--dry');
  if (!tournamentId) {
    console.error('\n  node scripts/completar-parejas.mjs <tournament_id> [--dry]\n');
    process.exit(1);
  }

  const env = leerEnv();
  const s = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. El torneo y su capacidad ───────────────────────────────────────────
  const { data: t, error: te } = await s
    .from('tournaments')
    .select('id, name, status, courts, match_minutes')
    .eq('id', tournamentId).maybeSingle();
  if (te || !t) alto(`No se encontró el torneo: ${te?.message ?? 'sin filas'}`);
  log(`\n  ${t.name} · ${t.status}`);

  if (!t.courts) alto('El torneo no tiene canchas capturadas. Ponlas en la app y vuelve.');

  const { data: ventanas } = await s
    .from('tournament_windows').select('dia, desde, hasta')
    .eq('tournament_id', tournamentId).order('dia');
  if (!ventanas?.length) {
    alto('El torneo no tiene ventanas horarias. Sin ellas no hay bloques que elegir.');
  }

  const reticula = generarBloques({
    ventanas: ventanas.map((w) => ({
      dia: w.dia, desde: w.desde.slice(0, 5), hasta: w.hasta.slice(0, 5),
    })),
    canchas: t.courts,
    minutosPorPartido: t.match_minutes ?? 60,
  });
  log(`  ${t.courts} canchas · ${ventanas.length} ventanas · ` +
      `${reticula.bloques.length} bloques · capacidad ${reticula.capacidadParejas} parejas`);
  for (const a of reticula.avisos) log(`    · ${a}`);
  if (reticula.bloques.length === 0) {
    alto('Las ventanas no dan para ningún bloque. Revisa los horarios.');
  }

  // ── 2. Las categorías que EXISTEN ─────────────────────────────────────────
  const { data: cats } = await s
    .from('categories').select('id, display_name, division, gender, status')
    .eq('tournament_id', tournamentId);

  const clave = (d, g) => `${d}|${g}`;
  const porClave = new Map((cats ?? []).map((c) => [clave(c.division, c.gender), c]));

  const faltan = OBJETIVOS.filter((o) => !porClave.has(clave(o.division, o.gender)));
  if (faltan.length > 0) {
    log('\n  Faltan categorías. NO se crean desde aquí:');
    for (const f of faltan) log(`    · ${f.division} / ${f.gender}  (objetivo ${f.parejas} parejas)`);
    alto('Créalas en la app y vuelve a correr esto.');
  }

  const sobran = (cats ?? []).filter((c) => !OBJETIVOS.some((o) => clave(o.division, o.gender) === clave(c.division, c.gender)));
  if (sobran.length > 0) {
    log('\n  Categorías del torneo que Cimepa no tenía (se dejan intactas, 0 parejas):');
    for (const x of sobran) log(`    · ${x.display_name} (${x.division}/${x.gender})`);
  }

  const cerradas = (cats ?? []).filter((c) => c.status !== 'open');
  if (cerradas.length > 0) {
    alto(`Hay ${cerradas.length} categoría(s) ya cerrada(s) (${cerradas.map((c) => c.display_name).join(', ')}). ` +
         'Sembrar en un torneo con grupos formados dejaría parejas fuera del cuadro.');
  }

  // ── 3. Lo que ya hay ──────────────────────────────────────────────────────
  const { data: yaParejas } = await s
    .from('pairs').select('id, category_id, player1_id, player2_id')
    .eq('tournament_id', tournamentId);

  const cuentaPorCat = new Map();
  const ocupado = new Set();          // categoria|persona, para no repetir a nadie
  for (const p of yaParejas ?? []) {
    cuentaPorCat.set(p.category_id, (cuentaPorCat.get(p.category_id) ?? 0) + 1);
    ocupado.add(`${p.category_id}|${p.player1_id}`);
    ocupado.add(`${p.category_id}|${p.player2_id}`);
  }

  const plan = [];
  let objetivoTotal = 0;
  log('\n  Plan por categoría:');
  for (const o of OBJETIVOS) {
    const cat = porClave.get(clave(o.division, o.gender));
    const hay = cuentaPorCat.get(cat.id) ?? 0;
    const faltan = Math.max(0, o.parejas - hay);
    objetivoTotal += o.parejas;
    plan.push({ cat, objetivo: o, hay, faltan });
    log(`    ${cat.display_name.padEnd(14)} ${String(hay).padStart(2)} de ${String(o.parejas).padStart(2)} · faltan ${faltan}`);
  }

  const totalNuevas = plan.reduce((a, p) => a + p.faltan, 0);
  const totalFinal = (yaParejas ?? []).length + totalNuevas;
  log(`\n  Existentes ${(yaParejas ?? []).length} · nuevas ${totalNuevas} · total ${totalFinal}`);

  if (totalFinal > reticula.capacidadParejas) {
    alto(`No caben: ${totalFinal} parejas para ${reticula.capacidadParejas} lugares ` +
         `(faltan ${totalFinal - reticula.capacidadParejas}). Alarga las ventanas o añade canchas.`);
  }
  if (totalNuevas === 0) { log('\n  Nada que sembrar: ya está completo.\n'); return; }
  if (dry) { log('\n  --dry: no se escribió nada.\n'); return; }

  // ── 4. Las personas ───────────────────────────────────────────────────────
  // Un jugador por hueco. Los que YA existen se reutilizan por correo, así que
  // correr esto dos veces no duplica a nadie.
  const { data: yaUsuarios } = await s
    .from('users').select('id, email').like('email', 'qa_2%@rally.test');
  const porCorreo = new Map((yaUsuarios ?? []).map((u) => [u.email, u.id]));

  /** Crea la cuenta si no existe. `conPassword` distingue al que inscribe. */
  async function usuario(correo, nombre, conPassword) {
    if (porCorreo.has(correo)) return porCorreo.get(correo);
    const { data, error } = await s.auth.admin.createUser({
      email: correo,
      email_confirm: true,
      // El compañero nace SIN contraseña y con `created_by`, igual que en
      // `pair-register-self`. Es lo que hace que su login caiga en
      // 'needs_activation' (migración 057) en vez de pedirle una que no tiene.
      ...(conPassword ? { password: 'qa-rally-2026' } : {}),
      user_metadata: conPassword
        ? { full_name: nombre, created_by: 'qa_seed' }
        : { full_name: nombre, created_by: 'player' },
    });
    if (error) {
      if (/already/i.test(error.message)) {
        const { data: u } = await s.from('users').select('id').eq('email', correo).maybeSingle();
        if (u) { porCorreo.set(correo, u.id); return u.id; }
      }
      alto(`No se pudo crear ${correo}: ${error.message}`);
    }
    porCorreo.set(correo, data.user.id);
    return data.user.id;
  }

  log('\n  Creando cuentas y parejas…');
  const aInsertar = [];
  const personasPorCat = new Map();   // para el reporte de cruces

  for (const { cat, objetivo, hay, faltan } of plan) {
    if (faltan === 0) continue;
    const [g1, g2] = generosDe(objetivo.gender);
    const suyas = [];

    for (let k = 0; k < faltan; k++) {
      // El índice arranca donde acaban las que ya había, para que dos corridas
      // no se pisen ni dejen huecos.
      const i = objetivo.base + (hay + k) * 2;
      const c1 = correoDe(i);
      const c2 = correoDe(i + 1);
      const a = await usuario(c1, nombreDe(i, g1), true);
      const b = await usuario(c2, nombreDe(i + 1, g2), false);

      if (ocupado.has(`${cat.id}|${a}`) || ocupado.has(`${cat.id}|${b}`)) continue;
      ocupado.add(`${cat.id}|${a}`);
      ocupado.add(`${cat.id}|${b}`);
      suyas.push(a, b);

      aInsertar.push({
        tournament_id:       tournamentId,
        category_id:         cat.id,
        player1_id:          a,
        player2_id:          b,
        payment_status:      'paid_offline',   // cuentan para el cuadro
        schedule_preference: 'any',
      });
    }
    personasPorCat.set(cat.id, suyas);
  }

  for (let i = 0; i < aInsertar.length; i += 50) {
    const { error } = await s.from('pairs').insert(aInsertar.slice(i, i + 50));
    if (error) alto(`Insertando parejas: ${error.message}`);
  }
  log(`  ${aInsertar.length} parejas insertadas.`);

  // ── 5. Bloque para las NUEVAS, con el sesgo ───────────────────────────────
  // Las que ya estaban conservan el suyo: se cargan como ocupación para que el
  // cupo salga bien, pero no se tocan.
  const { data: todas } = await s
    .from('pairs').select('id, category_id').eq('tournament_id', tournamentId).order('id');
  const { data: eleccionesYa } = await s
    .from('pair_block_choices').select('pair_id, bloque_id').eq('tournament_id', tournamentId);
  const yaEligio = new Map((eleccionesYa ?? []).map((e) => [e.pair_id, e.bloque_id]));
  const catDe = new Map((todas ?? []).map((p) => [p.id, p.category_id]));

  const ocupacion = {};
  for (const b of reticula.bloques) ocupacion[b.id] = {};
  for (const [pairId, bloqueId] of yaEligio) {
    const c = catDe.get(pairId);
    if (!c || !ocupacion[bloqueId]) continue;
    ocupacion[bloqueId][c] = (ocupacion[bloqueId][c] ?? 0) + 1;
  }

  const primeroDelDia = new Set();
  const vistos = new Set();
  for (const b of reticula.bloques) {
    if (vistos.has(b.dia)) continue;
    vistos.add(b.dia);
    primeroDelDia.add(b.id);
  }

  const elecciones = [];
  const sinHueco = [];
  for (const p of todas ?? []) {
    if (yaEligio.has(p.id)) continue;         // inscripción real: no se toca
    const libres = bloquesDisponibles(reticula.bloques, ocupacion, p.category_id);
    if (libres.length === 0) { sinHueco.push(p); continue; }

    const rnd = prng(p.id);
    const pesos = libres.map((b) => peso(b, primeroDelDia.has(b.id)));
    const total = pesos.reduce((a, x) => a + x, 0);
    let tirada = rnd() * total;
    let elegido = libres[libres.length - 1];
    for (let i = 0; i < libres.length; i++) {
      tirada -= pesos[i];
      if (tirada <= 0) { elegido = libres[i]; break; }
    }
    ocupacion[elegido.id][p.category_id] = (ocupacion[elegido.id][p.category_id] ?? 0) + 1;
    elecciones.push({ tournament_id: tournamentId, pair_id: p.id, bloque_id: elegido.id, forzado: false });
  }

  for (let i = 0; i < elecciones.length; i += 50) {
    const { error } = await s.from('pair_block_choices')
      .upsert(elecciones.slice(i, i + 50), { onConflict: 'pair_id' });
    if (error) alto(`Eligiendo bloques: ${error.message}`);
  }
  log(`  ${elecciones.length} bloques elegidos${sinHueco.length ? `, ${sinHueco.length} SIN HUECO` : ''}.`);

  // ── 6. El reporte ─────────────────────────────────────────────────────────
  const { data: finales } = await s
    .from('pairs').select('category_id, player1_id, player2_id').eq('tournament_id', tournamentId);
  const nom = new Map((cats ?? []).map((c) => [c.id, c.display_name]));

  const porCat = new Map();
  const catsDePersona = new Map();
  for (const p of finales ?? []) {
    porCat.set(p.category_id, (porCat.get(p.category_id) ?? 0) + 1);
    for (const j of [p.player1_id, p.player2_id]) {
      const ya = catsDePersona.get(j) ?? new Set();
      ya.add(p.category_id);
      catsDePersona.set(j, ya);
    }
  }

  log('\n  ── Resultado ───────────────────────────────');
  for (const o of OBJETIVOS) {
    const c = porClave.get(clave(o.division, o.gender));
    const n = porCat.get(c.id) ?? 0;
    log(`    ${nom.get(c.id).padEnd(14)} ${String(n).padStart(3)} / ${String(o.parejas).padStart(3)}` +
        `${n === o.parejas ? '' : '   ← no cuadra'}`);
  }
  const enDos = [...catsDePersona.values()].filter((x) => x.size > 1).length;
  log(`\n    parejas ${(finales ?? []).length} · personas ${catsDePersona.size} · en dos categorías ${enDos}`);

  const porBloque = {};
  for (const e of [...(eleccionesYa ?? []), ...elecciones]) {
    porBloque[e.bloque_id] = (porBloque[e.bloque_id] ?? 0) + 1;
  }
  log('\n    ocupación de los bloques:');
  for (const b of reticula.bloques) {
    const n = porBloque[b.id] ?? 0;
    log(`      ${b.dia} ${b.desde}-${b.hasta}  ${String(n).padStart(3)} parejas ` +
        `(${Math.ceil(n / PAREJAS_POR_GRUPO)} de ${b.carriles} carriles)`);
  }
  // ── 7. Verificación: TODAS las parejas tienen bloque ──────────────────────
  //
  // POR QUÉ SE RELEE LA BASE Y NO SE MIRA `elecciones`
  //   `elecciones` es lo que el script CREÍA haber escrito. Un upsert que
  //   falla a medias, una pareja que ya existía sin bloque, o un bloque que
  //   dejó de existir porque alguien cambió las ventanas mientras corría, no
  //   aparecen ahí. La única fuente que no puede mentir es la tabla.
  //
  // POR QUÉ FALLA RUIDOSAMENTE
  //   Una pareja sin bloque no rompe nada HOY: rompe al cerrar la categoría,
  //   días después, cuando ya nadie se acuerda de que corrió este script.
  //   Sembrar en silencio parejas que luego no se pueden cerrar es peor que no
  //   sembrarlas: el error aparece lejos de su causa.
  const { data: parejasFin } = await s
    .from('pairs').select('id, category_id').eq('tournament_id', tournamentId);
  const { data: bloquesFin } = await s
    .from('pair_block_choices').select('pair_id').eq('tournament_id', tournamentId);

  const conBloque = new Set((bloquesFin ?? []).map((e) => e.pair_id));
  const huerfanas = (parejasFin ?? []).filter((p) => !conBloque.has(p.id));

  if (huerfanas.length === 0) {
    log(`    ✓ las ${(parejasFin ?? []).length} parejas tienen horario.\n`);
    return;
  }

  const porCatHuerfana = new Map();
  for (const p of huerfanas) {
    porCatHuerfana.set(p.category_id, (porCatHuerfana.get(p.category_id) ?? 0) + 1);
  }

  console.error(`\n  ══════════════════════════════════════════════════════════`);
  console.error(`  ALTO · ${huerfanas.length} parejas quedaron SIN HORARIO`);
  console.error(`  ══════════════════════════════════════════════════════════\n`);
  for (const [cid, n] of [...porCatHuerfana].sort((a, b) => b[1] - a[1])) {
    console.error(`    ${(nom.get(cid) ?? cid).padEnd(16)} ${n}`);
  }
  console.error(`
  QUÉ PASÓ
    Los horarios se llenaron antes de repartirlas todas. El cupo no es una
    división: un grupo son ${PAREJAS_POR_GRUPO} parejas de la MISMA categoría y ocupa una
    cancha entera, así que los huecos sueltos de otras categorías no sirven.

  ESTA CATEGORÍA NO SE VA A PODER CERRAR bien hasta que tengan hora.

  CÓMO SE ARREGLA — cualquiera de las tres:
    · Alargar la ventana de un día en la pantalla de Horarios. Cada 3 h de
      más son ${reticula.bloques[0]?.carriles ?? 0} grupos nuevos.
    · Subir el número de canchas del torneo.
    · Asignarles horario a mano desde «Horarios de la fase de grupos»,
      aunque sea uno lleno: ahí se puede, con el aviso de la consecuencia.
`);
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
