/**
 * RALLY · De dónde salen las categorías que decide `cierreDeTorneo`
 *
 * La regla vive en `@/lib/cierre-de-torneo` y es pura. Esto solo la alimenta,
 * y vive aparte por lo de siempre: la regla se prueba sin red.
 *
 * DOS CONSULTAS Y NINGÚN AGREGADO. PostgREST no agrupa, y montar una vista
 * para contar partidos por categoría sería una migración a cambio de dos
 * bucles. El volumen está atado a UN torneo, que es lo que el panel ya lee.
 */

import { supabase } from '@/lib/supabase/client';
import { cierreDeTorneo, type CategoriaAlCierre, type CierreDeTorneo } from '@/lib/cierre-de-torneo';

/**
 * El estado del cierre de un torneo, leído de la base.
 *
 * `donde` va tal cual a `cierreDeTorneo`: decide si la instrucción manda al
 * panel o señala el botón de la propia pantalla.
 */
export async function fetchCierreDeTorneo(
  tournamentId: string,
  donde: 'panel' | 'aqui' = 'panel',
): Promise<CierreDeTorneo> {
  const [{ data: cats }, { data: ms }] = await Promise.all([
    supabase.from('categories')
      .select('id, display_name, format_type')
      .eq('tournament_id', tournamentId),
    supabase.from('matches')
      .select('category_id, stage, status, winner_pair_id')
      .eq('tournament_id', tournamentId),
  ]);

  const partidos = (ms ?? []) as Array<{
    category_id: string | null; stage: string; status: string; winner_pair_id: string | null;
  }>;

  const categorias: CategoriaAlCierre[] = (cats ?? []).map((c) => {
    const suyos = partidos.filter((m) => m.category_id === c.id);
    return {
      nombre: c.display_name,
      // Un round robin se resuelve por tabla: no hay final que esperar.
      conCuadro: c.format_type !== 'round_robin',
      sinTerminar: suyos.filter((m) => m.status !== 'finished').length,
      finalDecidida: suyos.some((m) => m.stage === 'final' && m.winner_pair_id != null),
    };
  });

  return cierreDeTorneo(categorias, donde);
}
