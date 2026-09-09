/**
 * src/lib/cabeza-de-serie.ts
 *
 * RALLY · Orden de las parejas de una categoría por puntos de ranking
 * combinados de sus dos jugadores — el criterio de Premier Padel.
 *
 * Es informativo: NO toca la siembra real del cuadro (`src/lib/engine/seeding`),
 * que siembra por el desempeño DENTRO del torneo (posición de grupo), no por
 * el ranking histórico de los jugadores. Esto es "quién trae más puntos
 * acumulados", no "quién sembró dónde".
 *
 * `ranking_public` es legible por cualquier autenticado y sin filtro de fila
 * (`grant select ... to authenticated`, migración 028) — se puede leer la
 * posición de OTROS jugadores, no solo la propia.
 */

import { supabase } from '@/lib/supabase/client';

export interface JugadorConRanking {
  playerId: string;
  /** Posición en `ranking_public` para esta división/temporada. `null` sin fila. */
  posicion: number | null;
  /** Puntos en `ranking_public`. 0 si no tiene fila — no es un caso especial, aporta cero. */
  puntos: number;
}

export interface ParejaOrdenada {
  pairId: string;
  jugador1: JugadorConRanking;
  jugador2: JugadorConRanking;
  /** Suma de puntos de los dos jugadores. El criterio de orden. */
  puntosCombinados: number;
  /** 1 = la pareja con más puntos combinados de la categoría. */
  cabezaDeSerie: number;
}

/**
 * El orden de las parejas de una categoría por puntos de ranking combinados,
 * de mayor a menor.
 *
 * `null` cuando TODAS las parejas suman 0 — ordenar a todos empatados en
 * cero es ruido, no información. Hoy (con `ranking_points` vacía hasta que
 * cierre el primer torneo) es el caso normal: la función devuelve `null` y
 * quien la usa no pinta nada.
 */
export async function fetchCabezaDeSerie(categoryId: string): Promise<ParejaOrdenada[] | null> {
  const { data: cat } = await supabase
    .from('categories')
    .select('division')
    .eq('id', categoryId)
    .maybeSingle();
  if (!cat?.division) return null;

  const { data: pares } = await supabase
    .from('pairs')
    .select('id, player1_id, player2_id')
    .eq('category_id', categoryId);
  if (!pares || pares.length === 0) return null;

  const playerIds = [...new Set(pares.flatMap((p) => [p.player1_id, p.player2_id]))];

  // Misma división que la categoría, misma temporada que el resto de la app
  // (ver ranking.tsx): sin esto se mezclarían divisiones o años distintos.
  const temporada = new Date().getFullYear();
  const { data: filas } = await supabase
    .from('ranking_public')
    .select('player_id, points, position')
    .in('player_id', playerIds)
    .eq('division', cat.division)
    .eq('season', temporada);

  const porJugador = new Map<string, { puntos: number; posicion: number | null }>();
  for (const f of filas ?? []) {
    if (!f.player_id) continue;
    porJugador.set(f.player_id, { puntos: f.points ?? 0, posicion: f.position ?? null });
  }

  const datosDe = (playerId: string): JugadorConRanking => {
    const r = porJugador.get(playerId);
    return { playerId, puntos: r?.puntos ?? 0, posicion: r?.posicion ?? null };
  };

  const combinadas = pares.map((p) => {
    const jugador1 = datosDe(p.player1_id);
    const jugador2 = datosDe(p.player2_id);
    return { pairId: p.id, jugador1, jugador2, puntosCombinados: jugador1.puntos + jugador2.puntos };
  });

  if (combinadas.every((c) => c.puntosCombinados === 0)) return null;

  // Empate en puntos combinados: se resuelve por `pairId` para que el orden
  // sea reproducible y no dependa de en qué orden devolvió las filas
  // Postgres — mismo motivo que el desempate final en el motor de siembra
  // (ver `select-qualifiers.ts`), aunque aquí no es deportivo, solo estable.
  return [...combinadas]
    .sort((a, b) => b.puntosCombinados - a.puntosCombinados || a.pairId.localeCompare(b.pairId))
    .map((c, i) => ({ ...c, cabezaDeSerie: i + 1 }));
}
