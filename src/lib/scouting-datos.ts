/**
 * RALLY · Juntar la ficha del rival a partir de lo que ya hay en la base.
 *
 * ► UNA "PAREJA" ES POR TORNEO, Y ESO CAMBIA TODAS LAS CONSULTAS
 *   `pairs` tiene `tournament_id`: Ana y Beto son una fila distinta en cada
 *   torneo que juegan. Así que "¿cuántas veces nos hemos enfrentado?" NO se
 *   puede contestar comparando `pair_id`, porque nunca coincidirían.
 *
 *   Hay que preguntarlo por JUGADORES: todas las filas de `pairs` cuyos dos
 *   jugadores sean estos dos, en cualquier orden. De ahí salen los ids de
 *   pareja de cada duo a lo largo de su historia, y solo entonces se pueden
 *   buscar los partidos entre ellos.
 *
 *   El mismo truco da gratis "cuántos torneos llevan juntos": son las filas de
 *   `pairs` de ese duo.
 *
 * SOLO CUENTAN LOS PARTIDOS TERMINADOS CON GANADOR
 *   Un suma 6 del exprés no tiene ganador, y un partido a medias tampoco. Ni
 *   uno ni otro dicen quién es mejor, así que no entran en el head-to-head.
 */

import { supabase } from '@/lib/supabase/client';
import { fichaDelRival, type EntradaScouting, type FichaDelRival, type NivelJugador } from '@/lib/scouting';
import type { Division } from '@/lib/engine/types';

interface FilaPareja {
  id: string;
  tournament_id: string;
  player1_id: string;
  player2_id: string;
}

/** Todas las encarnaciones de un duo a lo largo de su historia. */
async function parejasDelDuo(a: string, b: string): Promise<FilaPareja[]> {
  const { data } = await supabase
    .from('pairs')
    .select('id, tournament_id, player1_id, player2_id')
    .or(
      `and(player1_id.eq.${a},player2_id.eq.${b}),and(player1_id.eq.${b},player2_id.eq.${a})`,
    );
  return (data ?? []) as FilaPareja[];
}

/** El nivel de varios jugadores en una división. */
async function nivelesDe(
  ids: readonly string[],
  division: Division,
  nombres: Map<string, string>,
): Promise<Map<string, NivelJugador>> {
  const { data } = await supabase
    .from('player_ratings')
    .select('player_id, rating, rd')
    .in('player_id', [...ids])
    .eq('division', division);

  const out = new Map<string, NivelJugador>();
  for (const id of ids) {
    const fila = (data ?? []).find((r) => r.player_id === id);
    out.set(id, {
      id,
      nombre: nombres.get(id) ?? '—',
      // Sin fila todavía no ha jugado en esta división: arranca en 1500/350,
      // que es lo mismo que dice el esquema. Y con RD 350 la ficha se marcará
      // como no fiable sola, que es lo correcto.
      rating: Number(fila?.rating ?? 1500),
      rd: Number(fila?.rd ?? 350),
    });
  }
  return out;
}

export interface EntradaFicha {
  /** Los dos jugadores de cada lado. */
  nosotros: [string, string];
  ellos: [string, string];
  /** Nombre por id, para poder decir quién es el más fuerte. */
  nombres: Map<string, string>;
  division: Division;
}

/**
 * Nunca lanza. Sin ficha, la pantalla no enseña el bloque — que es mejor que
 * un error donde iba a ir un pronóstico.
 */
export async function armarFichaDelRival(e: EntradaFicha): Promise<FichaDelRival | null> {
  try {
    const [nuestras, suyas, niveles] = await Promise.all([
      parejasDelDuo(e.nosotros[0], e.nosotros[1]),
      parejasDelDuo(e.ellos[0], e.ellos[1]),
      nivelesDe([...e.nosotros, ...e.ellos], e.division, e.nombres),
    ]);

    const idsNuestros = nuestras.map((p) => p.id);
    const idsSuyos = suyas.map((p) => p.id);

    let historial: EntradaScouting['historial'] = [];
    if (idsNuestros.length > 0 && idsSuyos.length > 0) {
      const { data: partidos } = await supabase
        .from('matches')
        .select('pair_a_id, pair_b_id, winner_pair_id, played_at')
        .eq('status', 'finished')
        .not('winner_pair_id', 'is', null)
        .in('pair_a_id', [...idsNuestros, ...idsSuyos])
        .in('pair_b_id', [...idsNuestros, ...idsSuyos]);

      const nuestros = new Set(idsNuestros);
      const suyos = new Set(idsSuyos);
      historial = (partidos ?? [])
        .filter(
          (m) =>
            (nuestros.has(m.pair_a_id!) && suyos.has(m.pair_b_id!)) ||
            (suyos.has(m.pair_a_id!) && nuestros.has(m.pair_b_id!)),
        )
        .map((m) => ({
          fecha: m.played_at ?? '',
          ganamos: nuestros.has(m.winner_pair_id!),
        }));
    }

    return fichaDelRival({
      nosotros: [niveles.get(e.nosotros[0])!, niveles.get(e.nosotros[1])!],
      ellos: [niveles.get(e.ellos[0])!, niveles.get(e.ellos[1])!],
      historial,
      torneosJuntos: new Set(suyas.map((p) => p.tournament_id)).size,
    });
  } catch {
    return null;
  }
}
