#!/usr/bin/env node
/**
 * RALLY · Dar de alta un organizador con su cuenta
 *
 * ► PARA QUÉ
 *   Enseñarle la plataforma a un club funciona cuando entra con SU cuenta y ve
 *   SU torneo, no el de otro. Hacerlo a mano son cuatro pasos —crear el
 *   usuario en auth, esperar al trigger que lo copia a `users`, crear el
 *   organizador y hacerlo owner— y el tercero depende del segundo, así que es
 *   fácil dejarlo a medias y no enterarse hasta que el panel rebota.
 *
 * ► EL USUARIO SE CREA EN `auth`, NO EN `users`
 *   La fila de `public.users` la escribe el trigger `on_auth_user_created`.
 *   Insertarla a mano la dejaría huérfana: sin fila en auth, sin poder entrar,
 *   y con el trigger sin disparar. Mismo criterio que `seed-qa.mjs`.
 *
 * ► IDEMPOTENTE
 *   Busca por correo y por nombre antes de crear. Correrlo dos veces no
 *   duplica nada y sirve para comprobar que quedó bien.
 *
 * Uso:
 *   node scripts/crear-organizador.mjs "Padel Hype" padelhype@padelcrown.mx
 *   node scripts/crear-organizador.mjs "Padel Hype" correo@x.mx --password "..."
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/** 'Padel Hype' -> 'padel-hype'. `organizers.slug` es NOT NULL y único. */
const aSlug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
   .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const morir = (m) => { console.error(`\n  ✕ ${m}\n`); process.exit(1); };

async function main() {
  const [nombre, correo] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!nombre || !correo) {
    morir('Uso: node scripts/crear-organizador.mjs "Nombre del club" correo@dominio.mx');
  }

  const i = process.argv.indexOf('--password');
  // Una contraseña legible por teléfono: se la vas a dictar a alguien.
  const password = i !== -1 ? process.argv[i + 1] : `${aSlug(nombre)}-2026`;

  const env = leerEnv();
  const supa = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n  ${nombre}\n`);

  // ── 1. La cuenta ──────────────────────────────────────────────────────────
  let { data: ya } = await supa.from('users').select('id, full_name').eq('email', correo).maybeSingle();

  if (ya) {
    console.log(`  Cuenta: ya existía (${ya.full_name ?? correo})`);
  } else {
    const { data, error } = await supa.auth.admin.createUser({
      email: correo,
      password,
      // Sin esto le llega un correo de confirmación que no va a abrir.
      email_confirm: true,
      user_metadata: { full_name: nombre },
    });
    if (error) morir(`Cuenta: ${error.message}`);
    ya = { id: data.user.id, full_name: nombre };
    console.log(`  Cuenta creada: ${correo}`);
  }

  // ── 2. El organizador ─────────────────────────────────────────────────────
  let { data: org } = await supa.from('organizers').select('id, name').eq('name', nombre).maybeSingle();

  if (!org) {
    const { data, error } = await supa.from('organizers')
      .insert({ name: nombre, slug: aSlug(nombre), contact_email: correo })
      .select('id, name').single();
    if (error) morir(`Organizador: ${error.message}`);
    org = data;
    console.log(`  Organizador creado: ${nombre}`);
  } else {
    console.log(`  Organizador: ya existía`);
  }

  // ── 3. Owner ──────────────────────────────────────────────────────────────
  // Es lo que abre el panel: el guard de `(organizer)` comprueba exactamente
  // esta fila, no un campo del perfil.
  const { data: miembro } = await supa.from('organizer_members')
    .select('member_role').eq('organizer_id', org.id).eq('user_id', ya.id).maybeSingle();

  if (!miembro) {
    const { error } = await supa.from('organizer_members')
      .insert({ organizer_id: org.id, user_id: ya.id, member_role: 'owner' });
    if (error) morir(`Owner: ${error.message}`);
    console.log('  Owner: asignado');
  } else {
    console.log(`  Owner: ya lo era (${miembro.member_role})`);
  }

  console.log(`
  LISTO. Entra en padelcrown.mx con:

    correo      ${correo}
    contraseña  ${password}

  Desde ahí: Organizar → Nuevo torneo.
`);
}

main().catch((e) => { console.error(e); process.exit(1); });
