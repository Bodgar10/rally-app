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

/**
 * EL TORNEO ESTÁ CERRADO Y NADIE TIENE PUNTOS.
 *
 * ► NO ES HIPOTÉTICO: ASÍ ACABÓ EL PRIMER TORNEO QUE SE CERRÓ
 *   `finish-tournament` cambia el estado y después dispara el reparto de
 *   puntos. Ese segundo paso devolvía 400 —llamaba a la RPC sin el actor a
 *   nombre de quien escribir— y la función seguía contestando `ok: true` con el
 *   fallo escondido dentro. El torneo quedó 'finished' con cero puntos y el
 *   organizador leyó "Torneo terminado ✓".
 *
 * ► POR QUÉ SE COMPRUEBA EN VEZ DE CONFIAR
 *   El cierre son tres pasos y solo el primero es atómico. Cualquiera de los
 *   otros dos puede fallar por su cuenta —una función caída, un timeout— y
 *   dejar el mismo agujero. Preguntarle a la base si los puntos están escritos
 *   es la única respuesta que no depende de que nada haya ido bien.
 *
 * ► Y SE PUEDE REINTENTAR
 *   Las tres piezas son idempotentes: volver a llamar a `terminarTorneo` sobre
 *   un torneo ya cerrado vuelve a disparar el reparto. Por eso esto no es un
 *   diagnóstico, es un botón.
 */
export async function faltanRepartirPuntos(
  tournamentId: string,
  status: string | null,
): Promise<boolean> {
  if (status !== 'finished') return false;
  const { count, error } = await supabase
    .from('tournament_ranking_points')
    .select('player_id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  // Sin respuesta no se afirma nada: ofrecer un reintento por un fallo de red
  // sería inventar un problema que quizá no existe.
  if (error) return false;
  return (count ?? 0) === 0;
}
