/**
 * RALLY · Guards de autenticación y roles
 *
 * Reemplaza al middleware de Next.js de Pasas.
 * Usado en los _layout.tsx de cada grupo de rutas (Expo Router).
 *
 * Modelo de roles (decisión Sesión 3 — "modelo Airbnb"):
 *   - users.role ∈ { 'player', 'admin' }  → nivel de plataforma
 *   - "organizador" y "juez" son membresías en organizer_members
 *     con member_role ∈ { 'owner', 'judge' }
 *   - Todos nacen como 'player'; el admin se asigna manualmente en BD.
 */

import { supabase } from '@/lib/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

// ───────────────────────────────────────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────────────────────────────────────

export type PlatformRole = 'player' | 'admin';

export interface OrganizerMembership {
  organizer_id:  string;
  member_role:   'owner' | 'judge';
  organizer_name: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers de sesión
// ───────────────────────────────────────────────────────────────────────────

/**
 * Devuelve la sesión activa o null si no hay ninguna.
 * Úsalo en _layout.tsx para decidir si redirigir a login.
 */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[guards] getSession error:', error.message);
    return null;
  }
  return data.session;
}

/**
 * Devuelve el usuario autenticado o null.
 * Más ligero que getSession cuando solo necesitas el user.
 */
export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Lanza un error (o devuelve null) si no hay sesión activa.
 * Usar en _layout.tsx de rutas protegidas:
 *
 *   const session = await requireSession();
 *   if (!session) { router.replace('/(auth)/login'); return; }
 */
export async function requireSession(): Promise<Session | null> {
  const session = await getSession();
  return session; // el _layout decide qué hacer si es null
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers de rol de plataforma (users.role)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el rol de plataforma del usuario autenticado.
 * Consulta public.users para leer el campo `role`.
 */
export async function getPlatformRole(userId: string): Promise<PlatformRole> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return 'player'; // default seguro
  return (data.role as PlatformRole) ?? 'player';
}

/**
 * Devuelve true si el usuario es admin de plataforma.
 * Usar en _layout.tsx de (admin)/.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const role = await getPlatformRole(userId);
  return role === 'admin';
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers de membresía de organizador (organizer_members)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Devuelve las membresías de organizador del usuario.
 * Si el array está vacío → el usuario NO es organizador ni juez en ningún club.
 *
 * Usar en _layout.tsx de (organizer)/ y (judge)/:
 *
 *   const memberships = await getOrganizerMemberships(userId);
 *   if (!memberships.length) { router.replace('/'); return; }
 */
export async function getOrganizerMemberships(
  userId: string,
): Promise<OrganizerMembership[]> {
  const { data, error } = await supabase
    .from('organizer_members')
    .select(`
      organizer_id,
      member_role,
      organizers ( name )
    `)
    .eq('user_id', userId);

  if (error || !data) return [];

  return data.map((row: any) => ({
    organizer_id:   row.organizer_id,
    member_role:    row.member_role,
    organizer_name: row.organizers?.name ?? '',
  }));
}

/**
 * Atajo: devuelve true si el usuario tiene al menos una membresía
 * de organizador (owner O judge en cualquier organización).
 *
 * Usar para mostrar/ocultar el switch de modo "Organizar" en el dashboard.
 */
export async function hasOrganizerMembership(userId: string): Promise<boolean> {
  const memberships = await getOrganizerMemberships(userId);
  return memberships.length > 0;
}

/**
 * Atajo: devuelve true si el usuario es OWNER de al menos un organizador.
 * Usar para guard del panel de "Crear torneo".
 */
export async function isOrganizerOwner(userId: string): Promise<boolean> {
  const memberships = await getOrganizerMemberships(userId);
  return memberships.some((m) => m.member_role === 'owner');
}

/**
 * Atajo: devuelve true si el usuario es JUDGE en al menos un organizador.
 * Usar para guard del panel de captura del juez.
 */
export async function isJudge(userId: string): Promise<boolean> {
  const memberships = await getOrganizerMemberships(userId);
  return memberships.some((m) => m.member_role === 'judge');
}
