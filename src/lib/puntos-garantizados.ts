/**
 * src/lib/puntos-garantizados.ts
 *
 * RALLY · Puntos de ranking garantizados de una pareja, y lo que sumarían si
 * ganan el partido que viene.
 *
 * TS puro, corre en el cliente. NUNCA reimplementa la tabla de puntos: toda
 * la aritmética sale de `computeRankingPoints` (@/lib/engine/ranking-points),
 * con las mismas `DEFAULT_RANKING_RULES` que usa
 * supabase/functions/compute-ranking-points/index.ts al cerrar el torneo de
 * verdad. Este módulo solo arma la entrada del motor dos veces —la de ahora
 * y la de "si ganan"— y deja que el motor haga la cuenta.
 *
 * SIN NÚMERO INVENTADO. Si falta un dato para calcular (tier, parejas
 * inscritas, victorias de grupo, si ya clasificó, o la ronda alcanzada), la
 * función devuelve `null`. Nunca 0, nunca una aproximación: un número
 * inventado aquí es peor que no enseñar nada.
 */

import {
  computeRankingPoints,
  DEFAULT_RANKING_RULES,
  type PlayerTournamentResult,
  type RoundReached,
  type Tier,
} from '@/lib/engine/ranking-points';

// ─── El mismo criterio que compute-ranking-points/index.ts ─────────────────
//
// `STAGE_TOKEN` de ahí, copiado y no inventado: el engine no tiene 'r32'
// —quien se queda en round_of_32 no tiene tier de ronda, solo el bono de
// clasificación si aplica— y `third_place` cuenta como 'semi': disputar el
// tercer puesto es haber llegado a semis.
const STAGE_A_RONDA: Record<string, Exclude<RoundReached, 'none' | 'champion'>> = {
  round_of_16: 'r16',
  quarter: 'quarter',
  semi: 'semi',
  third_place: 'semi',
  final: 'final',
};

/** `stage` de `matches` → token de ronda del engine. 'none' sin equivalente
 *  (fase de grupos, round_of_32, o cualquier valor que no reconozcamos). */
function rondaDeStage(stage: string): RoundReached {
  return STAGE_A_RONDA[stage] ?? 'none';
}

/** De menos a más lejana, para poder comparar dos rondas. */
const ORDEN_DE_RONDA: RoundReached[] = ['none', 'r16', 'quarter', 'semi', 'final', 'champion'];

function masLejana(a: RoundReached, b: RoundReached): RoundReached {
  return ORDEN_DE_RONDA.indexOf(a) >= ORDEN_DE_RONDA.indexOf(b) ? a : b;
}

/**
 * La ronda más lejana que una pareja ya tiene asegurada, a partir del
 * `stage` de sus partidos de CUADRO ya resueltos (terminados, con
 * ganador — un bye cuenta: estar en el cuadro sin haber jugado también es
 * haber llegado).
 *
 * Para uso de quien llama: reúne los `stage` de esos partidos y llama aquí
 * en vez de reinventar el criterio de precedencia.
 */
export function rondaMasLejanaAlcanzada(stagesDeCuadroResueltos: string[]): RoundReached {
  return stagesDeCuadroResueltos
    .map(rondaDeStage)
    .reduce((acc, r) => masLejana(acc, r), 'none' as RoundReached);
}

export interface EstadoParaPuntos {
  /** Tier del torneo, de `tournaments.tier`. */
  tier: Tier | null | undefined;
  /** Parejas INSCRITAS en la categoría (no las del cuadro), de `pairs` por `category_id`. */
  parejasEnCategoria: number | null | undefined;
  /** Victorias de grupo ya jugadas. */
  groupWins: number | null | undefined;
  /**
   * ¿Ya tiene la clasificación asegurada? Puede ser porque ya está colocada
   * en el cuadro eliminatorio, o porque el motor de clinch ya la dio por
   * clasificada aunque el cuadro todavía no exista.
   */
  qualified: boolean | null | undefined;
  /** Ronda más lejana YA asegurada (ver `rondaMasLejanaAlcanzada`). 'none' si ninguna todavía. */
  furthestRound: RoundReached | null | undefined;
  /**
   * `stage` del próximo partido, tal cual llega de `matches.stage`. `null`
   * o `undefined` cuando no hay partido pendiente que proyectar — ahí
   * `siGanan` sale igual a `garantizados`.
   */
  proximoStage?: string | null;
}

export interface PuntosGarantizados {
  /** Lo que la pareja tiene asegurado con lo ya jugado, gane o pierda el próximo partido. */
  garantizados: number;
  /** Lo que tendría si gana el próximo partido pendiente. Igual a `garantizados` sin partido que proyectar. */
  siGanan: number;
}

const TIERS_VALIDOS = new Set<Tier>(['major', 'p1', 'p2']);
const RONDAS_VALIDAS = new Set<RoundReached>(['none', 'r16', 'quarter', 'semi', 'final', 'champion']);

/**
 * Dado el estado de una pareja en su torneo, cuántos puntos de ranking tiene
 * garantizados y cuántos tendría si gana el partido que viene.
 *
 * Llama a `computeRankingPoints` dos veces con la misma entrada, salvo el
 * resultado del partido pendiente:
 * - En fase de grupos, una victoria más suma `groupWinPoints` (no cambia
 *   `qualified` ni `furthestRound`: ganar hoy no decide si clasificas, eso
 *   lo dice `clinch_status` por separado).
 * - En el cuadro, ganar implica estar clasificada (si no lo estaba ya) y
 *   sube la ronda más lejana a la del partido que se ganó.
 *
 * `null` si falta cualquier dato — nunca un número aproximado.
 */
export function puntosGarantizados(estado: EstadoParaPuntos): PuntosGarantizados | null {
  const { tier, parejasEnCategoria, groupWins, qualified, furthestRound, proximoStage } = estado;

  if (!tier || !TIERS_VALIDOS.has(tier)) return null;
  if (typeof parejasEnCategoria !== 'number' || parejasEnCategoria <= 0) return null;
  if (typeof groupWins !== 'number' || groupWins < 0) return null;
  if (typeof qualified !== 'boolean') return null;
  if (!furthestRound || !RONDAS_VALIDAS.has(furthestRound)) return null;

  const base: PlayerTournamentResult = {
    groupWins,
    qualified,
    furthestRound,
    // El tipo del engine lo exige, pero `computeRankingPoints` no lo usa en
    // el cálculo (solo aplica `tierMultipliers`, nunca
    // `drawsizeMultipliers` — ver el propio motor). Se manda igual a
    // `parejasEnCategoria` por coherencia; no cambia el resultado.
    drawSize: parejasEnCategoria,
    roundRobinOnly: false,
    wonRoundRobin: false,
    tier,
    parejasEnCategoria,
  };

  const garantizados = computeRankingPoints(base, DEFAULT_RANKING_RULES);

  if (!proximoStage) {
    return { garantizados, siGanan: garantizados };
  }

  const proyectado: PlayerTournamentResult = proximoStage === 'group'
    ? { ...base, groupWins: groupWins + 1 }
    : {
        ...base,
        // Ganar cualquier partido de cuadro implica haber estado colocada
        // en él para poder jugarlo.
        qualified: true,
        furthestRound: masLejana(furthestRound, rondaDeStage(proximoStage)),
      };

  const siGanan = computeRankingPoints(proyectado, DEFAULT_RANKING_RULES);

  return { garantizados, siGanan };
}
