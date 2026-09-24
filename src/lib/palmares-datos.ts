/**
 * RALLY · De dónde sale el palmarés.
 *
 * La regla —qué logro es cada torneo y en qué orden van— vive en
 * `@/lib/palmares` y es pura. Esto solo la alimenta.
 *
 * TRES CONSULTAS Y NINGUNA VISTA NUEVA: sus partidos, los torneos de esos
 * partidos y sus puntos. Está acotado a un jugador, que es el volumen de una
 * carrera entera: decenas de filas, no miles.
 */

import { supabase } from '@/lib/supabase/client';
import {
  palmares, type LineaDePalmares, type PartidoDelPalmares, type TorneoDelPalmares,
} from '@/lib/palmares';

export async function fetchPalmares(
  pairIds: string[],
  playerId: string,
): Promise<LineaDePalmares[]> {
  if (pairIds.length === 0) return [];

  const { data, error } = await supabase
    .from('matches')
    .select(
      `stage, pair_a_id, pair_b_id, winner_pair_id,
       categories:category_id ( display_name, tournament_id,
         tournaments:tournament_id ( name, end_date ) )`,
    )
    .eq('status', 'finished')
    .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`);

  if (error) {
    console.warn('[palmares]', error.message);
    return [];
  }

  const filas = (data ?? []) as unknown as Array<{
    stage: string;
    pair_a_id: string | null; pair_b_id: string | null; winner_pair_id: string | null;
    categories: {
      display_name: string; tournament_id: string;
      tournaments: { name: string; end_date: string | null } | null;
    } | null;
  }>;

  const mios = new Set(pairIds);

  const partidos: PartidoDelPalmares[] = [];
  /** Un torneo por id, con la categoría en la que jugó. */
  const torneos = new Map<string, TorneoDelPalmares>();

  for (const r of filas) {
    const cat = r.categories;
    if (!cat) continue;
    const miPar = r.pair_a_id && mios.has(r.pair_a_id) ? r.pair_a_id : r.pair_b_id;
    partidos.push({
      tournamentId: cat.tournament_id,
      stage: r.stage,
      // En un suma 6 `winner_pair_id` es null y esto queda en false, que es lo
      // correcto: ese partido no se gana.
      gane: !!r.winner_pair_id && r.winner_pair_id === miPar,
    });
    if (!torneos.has(cat.tournament_id)) {
      torneos.set(cat.tournament_id, {
        tournamentId: cat.tournament_id,
        torneo: cat.tournaments?.name ?? '—',
        categoria: cat.display_name,
        fin: cat.tournaments?.end_date ?? null,
        puntos: null,
      });
    }
  }

  // Los puntos, solo de los torneos ya cerrados. Un torneo sin cerrar se queda
  // con su ronda y sin número: es exactamente lo que se sabe de él.
  const ids = [...torneos.keys()];
  if (ids.length > 0) {
    const { data: pts } = await supabase
      .from('tournament_ranking_points')
      .select('tournament_id, points')
      .eq('player_id', playerId)
      .in('tournament_id', ids);
    for (const row of pts ?? []) {
      const t = torneos.get(row.tournament_id);
      if (t) t.puntos = row.points;
    }
  }

  return palmares(partidos, [...torneos.values()]);
}
