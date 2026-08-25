/**
 * RALLY · Identidad de las parejas del cuadro
 *
 * EL PROBLEMA QUE RESUELVE
 *   Los componentes del cuadro resolvían los nombres con un embed de
 *   PostgREST:
 *
 *       pairs:pair_id ( player1:player1_id ( full_name ), … )
 *
 *   Ese embed pasa por `users_select_own` (migración 008), que es
 *   `using (id = auth.uid())` — SOLO tu propia fila. O sea que un jugador
 *   INSCRITO veía '—' en el nombre de todos sus rivales. No era un problema de
 *   "cuadro público": estaba roto también para quien juega. No se notó porque
 *   los tres componentes siguen huérfanos.
 *
 *   `bracket_pairs_public` (migración 039) es el read-path que lo arregla:
 *   una vista sin `security_invoker` que se salta la RLS de `users` y publica
 *   solo identidad — nombre y foto. Ni correo, ni teléfono, ni el
 *   payment_status de la pareja.
 *
 * POR QUÉ UNA CONSULTA APARTE Y NO UN EMBED
 *   PostgREST solo embebe a través de claves foráneas, y una vista no tiene.
 *   Son dos viajes en vez de uno, pero el segundo se hace UNA vez y se cachea:
 *   un nombre no cambia a media noche del partido. Los números siguen llegando
 *   por Realtime, que es lo que sí cambia.
 */

import { supabase } from '@/lib/supabase/client';

export interface ParejaPublica {
  pair_id:       string;
  player1_id:    string;
  player2_id:    string;
  player1_name:  string;
  player1_photo: string | null;
  player2_name:  string;
  player2_photo: string | null;
}

/** "Ana Ruiz / Marta Gil". El separador es el mismo en cuadro y en tabla. */
export function nombreDePareja(p: ParejaPublica | undefined): string {
  if (!p) return '—';
  return `${p.player1_name} / ${p.player2_name}`;
}

/** True si el usuario juega en esa pareja. Compara por id, no por nombre. */
export function esMiPareja(p: ParejaPublica | undefined, userId?: string): boolean {
  if (!p || !userId) return false;
  return p.player1_id === userId || p.player2_id === userId;
}

/**
 * Resuelve varios pair_id de golpe.
 *
 * Devuelve un Map para que quien llama no tenga que buscar linealmente por cada
 * fila de la tabla. Los ids que la vista no devuelva simplemente no estarán:
 * puede pasar legítimamente si la categoría sigue abierta (la vista la filtra),
 * y el consumidor cae a '—' vía `nombreDePareja`.
 */
export async function fetchParejasPublicas(
  pairIds: (string | null | undefined)[],
): Promise<Map<string, ParejaPublica>> {
  // Dedup y descarte de nulos: un partido de eliminatorias puede tener pair_b_id
  // en null mientras no se sepa quién sube, e `in()` con un null da error.
  const ids = [...new Set(pairIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('bracket_pairs_public')
    .select('pair_id, player1_id, player2_id, player1_name, player1_photo, player2_name, player2_photo')
    .in('pair_id', ids);

  if (error) {
    // No se relanza: quedarse sin nombres degrada la tabla, no la rompe. Los
    // marcadores y las posiciones siguen siendo correctos y es lo que importa.
    console.error('[parejas-publicas] no se pudieron resolver los nombres:', {
      code: error.code, message: error.message, details: error.details,
    });
    return new Map();
  }

  // `bracket_pairs_public` es una VISTA, y Postgres no propaga NOT NULL a
  // través de una vista: el generador marca todas sus columnas nullable aunque
  // en el origen no lo sean (pairs.id es PK, users.full_name es NOT NULL).
  // Mismo caso que ranking_public. Se normaliza aquí, en el borde, para que el
  // resto del código trabaje con ParejaPublica y no con nulos imposibles.
  // Sin pair_id la fila no se puede indexar, así que se descarta.
  return new Map(
    (data ?? [])
      .filter((p): p is typeof p & { pair_id: string } => p.pair_id !== null)
      .map((p) => [p.pair_id, {
        pair_id:       p.pair_id,
        player1_id:    p.player1_id    ?? '',
        player2_id:    p.player2_id    ?? '',
        player1_name:  p.player1_name  ?? '—',
        player1_photo: p.player1_photo,
        player2_name:  p.player2_name  ?? '—',
        player2_photo: p.player2_photo,
      }]),
  );
}
