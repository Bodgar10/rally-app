/**
 * RALLY · Los puntos de ranking del partido que viene — UNA sola cuenta
 *
 * LAS DOS TARJETAS DEL JUGADOR DABAN NÚMEROS DISTINTOS
 *   `MyNextMatch` y `YaEstasEnLaSiguiente` hablan del MISMO jugador en el MISMO
 *   torneo, y llegaron a decirle 510 y 1700. Dos cifras para un solo hecho es
 *   peor que no dar ninguna: la que se crea es la última que vio.
 *
 *   Los dos motivos, los dos reales y verificados contra la base:
 *
 *   1 · CONTAR LAS PAREJAS CON `pairs`. `pairs_select` (migración 008) es
 *       `player1_id = auth.uid() or player2_id = auth.uid()`: un jugador
 *       contando ahí SE CUENTA A SÍ MISMO y a nadie más. Y el número no es
 *       decorativo — `tierEfectivo` tiene un piso de parejas inscritas, así que
 *       con 1 una categoría 'major' de 30 parejas caía dos escalones a 'p2' y
 *       los puntos salían a 0.6× en vez de 2×. Un número creíble y falso.
 *
 *       Se cuenta con `bracket_pairs_public` (migración 039), que publica las
 *       parejas de la categoría saltándose esa RLS — la misma vista de la que
 *       ya salen los nombres de los rivales.
 *
 *   2 · MEDIR LA RONDA POR EL ÚLTIMO PARTIDO GANADO. Iba un peldaño por
 *       debajo: quien ganó su semifinal ESTÁ en la final, y estar en la final
 *       ya garantiza los 650 aunque no la haya jugado — el subcampeón también
 *       se los lleva. La ronda alcanzada es la del partido QUE VA A JUGAR.
 *
 * LA ARITMÉTICA NO ESTÁ AQUÍ. Sale entera de `puntosGarantizados`, que a su vez
 * llama al motor (`computeRankingPoints`) con las mismas reglas que usa la Edge
 * Function al cerrar el torneo de verdad. Este módulo decide QUÉ preguntarle, y
 * lo decide UNA vez para las dos tarjetas.
 */

import { supabase } from '@/lib/supabase/client';
import { leerConReintento } from '@/lib/lectura-reintentada';
import {
  puntosGarantizados, rondaMasLejanaAlcanzada,
  type PuntosGarantizados,
} from '@/lib/puntos-garantizados';
import type { RoundReached, Tier } from '@/lib/engine/ranking-points';

/**
 * A qué ronda te sube GANAR el partido de esa etapa. La escalera, no la cuenta.
 *
 * Hace falta porque el peldaño de arriba de la final NO TIENE `stage`: no
 * existe una fila de `matches` para ser campeón. Por eso la final apunta a
 * `'champion'` y no a otra etapa, y por eso no vale el `proximoStage` de
 * `puntosGarantizados` —que proyecta "si ganas LLEGAS a esta ronda", cuando
 * aquí la ronda ya está alcanzada por estar en ella.
 */
const RONDA_SI_GANA: Record<string, RoundReached> = {
  // El motor no puntúa la ronda de 32: ganarla te mete en octavos, que sí.
  round_of_32: 'r16',
  round_of_16: 'quarter',
  quarter: 'semi',
  semi: 'final',
  final: 'champion',
  // El 3.er lugar cuenta como semis y ganarlo no sube de ronda: el tope es el
  // mismo se gane o se pierda. Ver `rondaMasLejanaAlcanzada`.
  third_place: 'semi',
};

/** Lo que hay que saber de la pareja, ya leído. */
export interface EstadoDeLaPareja {
  /** `matches.stage` del partido que VA A JUGAR. `'group'` en fase de grupos. */
  stage: string;
  tier: Tier | null;
  /** Parejas INSCRITAS en la categoría. De `bracket_pairs_public`, no de `pairs`. */
  parejasEnCategoria: number | null;
  groupWins: number | null;
}

/**
 * Los puntos que ya tiene asegurados y los que tendría ganando ese partido.
 *
 * Puro: la misma entrada da siempre la misma salida, y es lo que garantiza que
 * las dos tarjetas no puedan divergir. `null` si falta cualquier dato — nunca
 * un número aproximado.
 */
export function puntosDelPartido(estado: EstadoDeLaPareja): PuntosGarantizados | null {
  const { stage, tier, parejasEnCategoria, groupWins } = estado;
  const base = { tier, parejasEnCategoria, groupWins };

  // FASE DE GRUPOS: todavía no se ha llegado al cuadro, así que no hay ronda
  // que garantizar. Lo que suma una victoria es un `groupWinPoints`, y de eso
  // ya sabe `puntosGarantizados` por su camino de `proximoStage`.
  if (stage === 'group') {
    return puntosGarantizados({
      ...base, qualified: false, furthestRound: 'none', proximoStage: 'group',
    });
  }

  // EN EL CUADRO: estar en la ronda ya la garantiza, la haya jugado o no.
  const aqui = puntosGarantizados({
    ...base, qualified: true, furthestRound: rondaMasLejanaAlcanzada([stage]),
  });
  const arriba = puntosGarantizados({
    ...base, qualified: true, furthestRound: RONDA_SI_GANA[stage] ?? rondaMasLejanaAlcanzada([stage]),
  });
  if (!aqui || !arriba) return null;

  return { garantizados: aqui.garantizados, siGanan: arriba.garantizados };
}

/**
 * Lo mismo, leyendo de la base lo que hace falta.
 *
 * Las tres lecturas van en paralelo y con reintento. `null` si cualquiera falla
 * o si falta un dato: los puntos son un extra y no pueden apagar una tarjeta.
 */
export async function fetchPuntosDelPartido(args: {
  categoryId: string;
  miPairId: string;
  /** `matches.stage` del partido que va a jugar. */
  stage: string;
  /** Si quien llama ya lo tiene a mano, se ahorra una consulta. */
  tier?: string | null;
}): Promise<PuntosGarantizados | null> {
  const { categoryId, miPairId, stage } = args;

  const [cat, parejas, standing] = await Promise.all([
    args.tier !== undefined
      ? Promise.resolve({ ok: true as const, data: null })
      : leerConReintento('puntos/tier', () =>
          supabase.from('categories')
            .select('tournaments:tournament_id ( tier )').eq('id', categoryId).limit(1)),
    leerConReintento('puntos/parejas-de-la-categoria', () =>
      supabase.from('bracket_pairs_public').select('pair_id').eq('category_id', categoryId)),
    leerConReintento('puntos/victorias-de-grupo', () =>
      supabase.from('group_standings').select('won').eq('pair_id', miPairId).limit(1)),
  ]);

  if (!cat.ok || !parejas.ok || !standing.ok) return null;

  const fila = (cat.data ?? [])[0] as { tournaments: { tier: string | null } | null } | undefined;

  return puntosDelPartido({
    stage,
    tier: (args.tier !== undefined ? args.tier : fila?.tournaments?.tier ?? null) as Tier | null,
    parejasEnCategoria: (parejas.data ?? []).length,
    groupWins: ((standing.data ?? [])[0] as { won: number } | undefined)?.won ?? null,
  });
}
