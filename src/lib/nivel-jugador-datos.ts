/**
 * RALLY · Leer el nivel y la curva del jugador.
 *
 * Separado de `nivel-jugador.ts` por la misma razón de siempre: aquel son
 * funciones puras con tests, este toca el cliente de Supabase y arrastra
 * AsyncStorage, que no carga en jest.
 *
 * DE DÓNDE SALE CADA COSA
 *   · `player_ratings` — un Glicko por jugador y DIVISIÓN. Se toma la del
 *     último partido: un jugador puede tener rating en dos divisiones si
 *     cambió, y el que vale es el de donde está jugando ahora.
 *   · `rating_history` — una fila por partido, con el rating antes y después.
 *     Es la gráfica, ya calculada por el cron de Glicko.
 */

import { supabase } from '@/lib/supabase/client';
import {
  RD_INICIAL,
  curvaDeRating,
  nivelDelJugador,
  resumenDeProgreso,
  type NivelDelJugador,
  type PuntoDeCurva,
  type ResumenDeProgreso,
} from '@/lib/nivel-jugador';

export interface NivelYCurva {
  nivel: NivelDelJugador;
  curva: PuntoDeCurva[];
  progreso: ResumenDeProgreso | null;
  /** Nunca ha jugado un partido con rating. La pantalla dice otra cosa. */
  sinDatos: boolean;
}

const VACIO: NivelYCurva = {
  // 'sexta' es solo el relleno de "sin datos": esta tarjeta no se pinta.
  nivel: nivelDelJugador('sexta', 1500, RD_INICIAL, 0),
  curva: [],
  progreso: null,
  sinDatos: true,
};

/**
 * Nunca lanza. Si algo falla devuelve "sin datos" y la tarjeta enseña la
 * invitación a jugar, que es lo mismo que vería un jugador nuevo — y es mejor
 * que un error donde debería ir su nivel.
 */
export async function leerNivelYCurva(userId: string): Promise<NivelYCurva> {
  try {
    const { data: ratings, error: re } = await supabase
      .from('player_ratings')
      .select('division, rating, rd, last_played_at')
      .eq('player_id', userId)
      .order('last_played_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (re || !ratings || ratings.length === 0) return VACIO;

    const actual = ratings[0];

    const { data: historial } = await supabase
      .from('rating_history')
      .select('rating_after, played_at')
      .eq('player_id', userId)
      .eq('division', actual.division)
      .order('played_at', { ascending: true });

    const curva = curvaDeRating(
      (historial ?? []).map((h) => ({
        rating_after: Number(h.rating_after),
        played_at: h.played_at,
      })),
    );

    return {
      // LA DIVISIÓN SALE DE LA FILA, no del rating: es donde compite de verdad.
      nivel: nivelDelJugador(
        actual.division,
        Number(actual.rating),
        Number(actual.rd),
        curva.length,
      ),
      curva,
      progreso: resumenDeProgreso(curva),
      sinDatos: curva.length === 0,
    };
  } catch {
    return VACIO;
  }
}
