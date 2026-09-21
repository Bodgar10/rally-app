/**
 * RALLY · De dónde salen los torneos del dashboard.
 *
 * Separado de `torneos-para-ti.ts` por lo de siempre: aquel es puro y tiene
 * tests, este toca el cliente de Supabase y arrastra AsyncStorage, que no
 * carga en jest.
 */

import { supabase } from '@/lib/supabase/client';
import {
  torneosParaTi, type TorneoListable, type TorneoRecomendado,
} from '@/lib/torneos-para-ti';
import type { TierTorneo } from '@/lib/tier-torneo';

/** Solo lo que se puede jugar. Un torneo terminado no es una recomendación. */
const ABIERTOS = ['registration_open'] as const;

export interface TorneosDelDashboard {
  lista: TorneoRecomendado[];
  /** La ciudad donde juega, para el encabezado. Null si aún no lo sabemos. */
  zona: string | null;
}

/**
 * Los torneos a los que este jugador se puede apuntar hoy, ya ordenados.
 *
 * Nunca lanza: el dashboard entero no se cae porque falle una sección.
 */
export async function cargarTorneosParaTi(
  userId: string,
  limite = 4,
): Promise<TorneosDelDashboard> {
  try {
    const [{ data: torneos }, { data: ratings }, { data: zona }] = await Promise.all([
      supabase
        .from('tournaments')
        .select(
          'id, name, start_date, end_date, status, registration_fee, tier, modo, '
          + 'venues(city), categories(division, status)',
        )
        .in('status', ABIERTOS)
        .order('start_date', { ascending: true }),
      supabase.from('player_ratings').select('division').eq('player_id', userId),
      supabase.rpc('zona_del_jugador', { p_player: userId }),
    ]);

    const filas = (torneos ?? []) as unknown as Array<{
      id: string; name: string; start_date: string; end_date: string;
      registration_fee: number | string | null;
      tier: string | null; modo: string | null;
      venues: { city: string } | null;
      categories: { division: string; status: string }[] | null;
    }>;

    const listables: TorneoListable[] = filas.map((f) => ({
      id: f.id,
      nombre: f.name,
      inicio: f.start_date,
      fin: f.end_date,
      ciudad: f.venues?.city ?? null,
      tier: (f.tier as TierTorneo | null) ?? null,
      modo: f.modo,
      // Solo las categorías todavía ABIERTAS: una cerrada no es una a la que
      // se pueda apuntar, y contarla haría que el torneo saliera como "de tu
      // nivel" justo cuando ya no lo es para él.
      divisiones: (f.categories ?? [])
        .filter((c) => c.status === 'open')
        .map((c) => c.division),
      cuota: Number(f.registration_fee ?? 0),
    }));

    // Las divisiones en las que de verdad juega, sin repetir.
    const divisiones = Array.from(
      new Set(((ratings ?? []) as { division: string }[]).map((r) => r.division)),
    );

    const ciudad = typeof zona === 'string' && zona.length > 0 ? zona : null;

    return {
      lista: torneosParaTi(listables, { zona: ciudad, divisiones }, limite),
      zona: ciudad,
    };
  } catch {
    return { lista: [], zona: null };
  }
}
