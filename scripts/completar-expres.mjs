/**
 * RALLY · Llenar un torneo EXPRÉS hasta su cupo
 *
 * ► POR QUÉ NO SIRVE `completar-parejas.mjs`
 *   Aquel es de Cimepa y da por hecho dos cosas que un exprés no tiene:
 *
 *     · OCHO CATEGORÍAS con objetivos fijos. Un exprés tiene UNA, y si no
 *       están las ocho aquel script para en seco antes de escribir nada.
 *     · BLOQUES HORARIOS. Allí cada pareja elige franja y el script reparte
 *       respetando la retícula. En un exprés nadie elige hora: las cinco
 *       rondas salen del sorteo, `pair_block_choices` no se usa, y escribir
 *       ahí metería filas que ninguna pantalla lee.
 *
 *   Mismo criterio que el resto del exprés: VIVE APARTE. Meter un `if` en el
 *   otro script lo habría dejado con dos modos y un único juego de pruebas.
 *
 * ► EL CUPO MANDA, Y TIENE QUE SER PAR
 *   Sale de `expres_config.cupo`. No se inventa un objetivo: el organizador ya
 *   dijo cuántas parejas caben y el fixture está calculado para ese número.
 *
 *   Y tiene que ser par en los dos sentidos: cinco partidos por pareja es
 *   IMPAR, así que cada grupo necesita un número par de parejas — con el cupo
 *   repartido en dos grupos, eso quiere decir cupo múltiplo de 4 para que los
 *   dos salgan pares. El script lo comprueba antes de escribir, porque un
 *   sorteo con un grupo impar no se puede repartir y el fallo aparecería
 *   mucho después, al sortear.
 *
 * ► LO QUE NO HACE, A PROPÓSITO
 *   · No crea la categoría. Si falta, lo dice y para.
 *   · No toca las parejas que ya existen. La tuya es una inscripción de
 *     verdad y perderla sería peor que no sembrar nada.
 *   · No sortea. Eso se hace desde la app, que es justo lo que se va a probar.
 *
 * ► LAS CUENTAS, COMO LAS CREA LA APP
 *   Quien inscribe tiene contraseña; su compañero NO, y lleva
 *   `created_by: 'player'`. Es lo que hace `pair-register-self`, y es lo que
 *   ejercita el camino de activación de la migración 057.
 *
 * ► EL PATRÓN DE CORREO
 *   `qa_3NNN@rally.test`. Dentro de `qa_%@rally.test` —que es lo que barre
 *   `clean-qa.mjs`— y fuera de los rangos de los otros sembradores:
 *   seed-qa 100–799, seed-cimepa 1000–1799, completar-parejas 2000–2799.
 *
 * USO
 *   node scripts/completar-expres.mjs <tournament_id>
 *   node scripts/completar-expres.mjs <tournament_id> --dry
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Primer índice de correo. Ver el patrón en la cabecera. */
const BASE = 3000;

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
 * En mixto la pareja es un hombre y una mujer: no es cosmético, es lo que
 * significa la categoría, y un dato de prueba que no lo respete no se parece
 * al real.
 */
const generosDe = (gender) =>
  gender === 'mixed' ? ['male', 'female'] : [gender, gender];

/**
 * De qué lado juega y con qué mano, repartido.
 *
 * Se escribe AL CREAR y no en una pasada aparte: sin esto, la ficha del rival
 * y el buscador de pareja salen vacíos en todo el torneo de prueba, que es
 * justo lo que se quiere ver funcionando. El patrón deja zurdos de revés —la
 * configuración más temida en pádel— porque es el caso que la ficha existe
 * para avisar.
 */
function ladoYMano(i) {
  return {
    preferred_side: i % 5 === 4 ? 'ambos' : i % 2 === 0 ? 'drive' : 'reves',
    mano: i % 6 === 1 ? 'zurdo' : 'diestro',
  };
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
    console.error('\n  node scripts/completar-expres.mjs <tournament_id> [--dry]\n');
    process.exit(1);
  }

  const env = leerEnv();
  const s = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. El torneo ──────────────────────────────────────────────────────────
  const { data: t, error: te } = await s
    .from('tournaments')
    .select('id, name, status, modo, courts, tier, start_date')
    .eq('id', tournamentId).maybeSingle();
  if (te || !t) alto(`No se encontró el torneo: ${te?.message ?? 'sin filas'}`);

  if (t.modo !== 'expres') {
    alto(`"${t.name}" no es un exprés (modo=${t.modo ?? 'null'}). ` +
         'Para un torneo largo usa completar-parejas.mjs.');
  }
  log(`\n  ${t.name} · ${t.status} · ${t.start_date} · tier ${t.tier}`);

  if (t.status !== 'registration_open') {
    alto(`El torneo está en '${t.status}'. Las inscripciones tienen que estar ` +
         'abiertas para poder sembrar: con los grupos ya sorteados, las ' +
         'parejas nuevas se quedarían fuera del fixture.');
  }

  // ── 2. El cupo ────────────────────────────────────────────────────────────
  const { data: cfg } = await s
    .from('expres_config')
    .select('cupo, partidos_por_pareja, clasifican_por_grupo')
    .eq('tournament_id', tournamentId).maybeSingle();
  if (!cfg) alto('El torneo no tiene expres_config. ¿Se creó desde el alta de exprés?');

  const cupo = cfg.cupo;
  log(`  cupo ${cupo} · ${cfg.partidos_por_pareja} partidos por pareja · ` +
      `pasan ${cfg.clasifican_por_grupo} de cada grupo · ${t.courts} canchas`);

  // Dos grupos, y cada uno necesita un número PAR de parejas porque cinco
  // partidos por pareja es impar. Ver la cabecera.
  if (cupo % 4 !== 0) {
    alto(`El cupo ${cupo} no se puede repartir en dos grupos pares ` +
         `(${cupo / 2} y ${cupo / 2}). Tiene que ser múltiplo de 4.`);
  }

  // ── 3. La categoría ───────────────────────────────────────────────────────
  const { data: cats } = await s
    .from('categories').select('id, display_name, division, gender, status')
    .eq('tournament_id', tournamentId);

  if (!cats?.length) alto('El torneo no tiene categorías. Créala en la app y vuelve.');
  if (cats.length > 1) {
    alto(`Un exprés tiene UNA categoría y este tiene ${cats.length}: ` +
         `${cats.map((c) => c.display_name).join(', ')}.`);
  }
  const cat = cats[0];
  if (cat.status !== 'open') {
    alto(`La categoría "${cat.display_name}" está en '${cat.status}'. ` +
         'Sembrar con los grupos formados dejaría parejas fuera del cuadro.');
  }
  log(`  categoría: ${cat.display_name} (${cat.division}/${cat.gender})`);

  // ── 4. Lo que ya hay ──────────────────────────────────────────────────────
  const { data: yaParejas } = await s
    .from('pairs').select('id, player1_id, player2_id')
    .eq('tournament_id', tournamentId);

  const hay = (yaParejas ?? []).length;
  const faltan = cupo - hay;
  log(`\n  parejas: ${hay} de ${cupo} · faltan ${faltan}`);

  if (faltan < 0) {
    alto(`Hay ${hay} parejas y el cupo es ${cupo}. Sobran ${-faltan}: ` +
         'este script no borra nada, quítalas desde la app.');
  }
  if (faltan === 0) { log('\n  Ya está lleno. Nada que hacer.\n'); return; }
  if (dry) { log(`\n  --dry: se crearían ${faltan} parejas. No se escribió nada.\n`); return; }

  // Nadie puede estar dos veces en la misma categoría.
  const ocupado = new Set();
  for (const p of yaParejas ?? []) {
    ocupado.add(p.player1_id);
    ocupado.add(p.player2_id);
  }

  // ── 5. Las personas ───────────────────────────────────────────────────────
  // Se reutilizan por correo, así que correr esto dos veces no duplica a nadie.
  const { data: yaUsuarios } = await s
    .from('users').select('id, email').like('email', 'qa_3%@rally.test');
  const porCorreo = new Map((yaUsuarios ?? []).map((u) => [u.email, u.id]));

  async function usuario(correo, nombre, genero, i, conPassword) {
    let id = porCorreo.get(correo);
    if (!id) {
      const { data, error } = await s.auth.admin.createUser({
        email: correo,
        email_confirm: true,
        ...(conPassword ? { password: 'qa-rally-2026' } : {}),
        user_metadata: conPassword
          ? { full_name: nombre, created_by: 'qa_seed' }
          : { full_name: nombre, created_by: 'player' },
      });
      if (error) {
        if (!/already/i.test(error.message)) alto(`No se pudo crear ${correo}: ${error.message}`);
        const { data: u } = await s.from('users').select('id').eq('email', correo).maybeSingle();
        if (!u) alto(`${correo} existe en auth pero no en users.`);
        id = u.id;
      } else {
        id = data.user.id;
      }
      porCorreo.set(correo, id);
    }

    // El lado y la mano van siempre, también si la cuenta ya existía: el
    // torneo de prueba tiene que poder enseñar la ficha del rival.
    await s.from('users').update({ ...ladoYMano(i), gender: genero }).eq('id', id);
    return id;
  }

  log('\n  Creando cuentas y parejas…');
  const [g1, g2] = generosDe(cat.gender);
  const aInsertar = [];

  for (let k = 0; k < faltan; k++) {
    // El índice arranca donde acaban las que ya había, para que dos corridas
    // no se pisen ni dejen huecos.
    const i = BASE + (hay + k) * 2;
    const a = await usuario(correoDe(i),     nombreDe(i, g1),     g1, i,     true);
    const b = await usuario(correoDe(i + 1), nombreDe(i + 1, g2), g2, i + 1, false);

    if (ocupado.has(a) || ocupado.has(b)) continue;
    ocupado.add(a); ocupado.add(b);

    aInsertar.push({
      tournament_id:       tournamentId,
      category_id:         cat.id,
      player1_id:          a,
      player2_id:          b,
      payment_status:      'paid_offline',   // cuentan para el sorteo
      schedule_preference: 'any',
    });
  }

  for (let i = 0; i < aInsertar.length; i += 50) {
    const { error } = await s.from('pairs').insert(aInsertar.slice(i, i + 50));
    if (error) alto(`Insertando parejas: ${error.message}`);
  }
  log(`  ${aInsertar.length} parejas insertadas.`);

  // ── 6. Verificación: se relee la base ─────────────────────────────────────
  //
  // POR QUÉ NO SE MIRA `aInsertar`
  //   Eso es lo que el script CREÍA haber escrito. Un insert que falla a
  //   medias o una pareja que ya existía no aparecen ahí. La única fuente que
  //   no puede mentir es la tabla.
  const { data: fin } = await s
    .from('pairs').select('id, payment_status').eq('tournament_id', tournamentId);
  const total = (fin ?? []).length;
  const cuentan = (fin ?? []).filter(
    (p) => ['paid_online', 'paid_offline', 'comp'].includes(p.payment_status),
  ).length;

  log('\n  ── Resultado ───────────────────────────────');
  log(`    parejas          ${total} de ${cupo}`);
  log(`    cuentan al cerrar ${cuentan}`);
  log(`    dos grupos de    ${cupo / 2} y ${cupo / 2}`);

  // `pending` NO entra al sorteo: si la pareja real del organizador se quedó
  // sin pagar, el torneo se sortearía con una menos y con un grupo impar.
  if (cuentan !== total) {
    log(`\n    OJO · ${total - cuentan} pareja(s) en 'pending' NO entran al sorteo.`);
    log(`           El sorteo las dejaría fuera y los grupos saldrían impares.`);
  }
  if (total !== cupo) {
    alto(`Quedaron ${total} parejas y el cupo es ${cupo}.`);
  }

  log(`\n    ✓ listo. Sortea desde la app: Torneo exprés → Sortear los grupos.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
