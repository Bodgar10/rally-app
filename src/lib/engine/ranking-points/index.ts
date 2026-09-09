// src/lib/engine/ranking-points/index.ts
// Motor de puntos de ranking (Doc B §5). Determinista.
// Modelo ATP/Premier: puntos por RONDA alcanzada + extra por victoria de grupos.

export type RoundReached =
  | 'none'
  | 'r16'
  | 'quarter'
  | 'semi'
  | 'final'
  | 'champion';

// Tier del torneo, declarado por el organizador al crearlo. Determina el
// multiplicador de puntos (sustituye a drawsizeMultipliers).
export type Tier = 'major' | 'p1' | 'p2';

export interface RankingRules {
  groupWinPoints: number;
  qualifyBonus: number;
  roundPoints: Record<Exclude<RoundReached, 'none'>, number>;
  drawsizeMultipliers: {
    lte8: number;
    from9to16: number;
    from17to32: number;
    gte33: number;
  };
  // Multiplicador por tier efectivo (tras aplicar el piso de tierMinimos).
  tierMultipliers: {
    major: number;
    p1: number;
    p2: number;
  };
  // Mínimo de parejas INSCRITAS EN LA CATEGORÍA para sostener el tier.
  // p2 no tiene piso: es el piso final.
  tierMinimos: {
    major: number;
    p1: number;
  };
  roundrobinChampionBonus: number;
  applyMultiplierToTotal: boolean;
}

// Defaults de Doc A §4.18 / Doc B §5.1–5.2 (punto de partida, configurable por torneo).
export const DEFAULT_RANKING_RULES: RankingRules = {
  groupWinPoints: 50,
  qualifyBonus: 100,
  roundPoints: {
    r16: 150,
    quarter: 250,
    semi: 400,
    final: 650,
    champion: 1000,
  },
  drawsizeMultipliers: {
    lte8: 0.7,
    from9to16: 1.0,
    from17to32: 1.3,
    gte33: 1.5,
  },
  tierMultipliers: {
    major: 2.0,
    p1: 1.0,
    p2: 0.6,
  },
  tierMinimos: {
    major: 24,
    p1: 12,
  },
  roundrobinChampionBonus: 1000,
  applyMultiplierToTotal: true,
};

export interface PlayerTournamentResult {
  /** Nº de victorias en fase de grupos. */
  groupWins: number;
  /** ¿Pasó de la fase de grupos? */
  qualified: boolean;
  /** Ronda más lejana alcanzada en eliminatoria. */
  furthestRound: RoundReached;
  /** Nº de parejas de la categoría (para el multiplicador). */
  drawSize: number;
  /** Formato solo round-robin (sin eliminatoria). */
  roundRobinOnly: boolean;
  /** Ganó el round-robin (1.er lugar) — solo aplica si roundRobinOnly. */
  wonRoundRobin: boolean;
  /** Tier declarado por el organizador al crear el torneo. Obligatorio. */
  tier: Tier;
  /** Nº de parejas INSCRITAS en la categoría (no las del cuadro eliminatorio). */
  parejasEnCategoria: number;
}

export function drawMultiplier(drawSize: number, rules: RankingRules): number {
  const m = rules.drawsizeMultipliers;
  if (drawSize <= 8) return m.lte8;
  if (drawSize <= 16) return m.from9to16;
  if (drawSize <= 32) return m.from17to32;
  return m.gte33;
}

/**
 * Tier efectivo tras aplicar el piso de parejas inscritas en la categoría.
 * 'major' por debajo de tierMinimos.major cae a 'p1'; el resultado (incluido
 * un 'major' ya degradado) por debajo de tierMinimos.p1 cae a 'p2'. Un
 * 'major' con muy pocas parejas puede caer dos escalones hasta 'p2'.
 * 'p2' no tiene piso: se queda 'p2' siempre.
 */
export function tierEfectivo(
  tier: Tier,
  parejasEnCategoria: number,
  rules: RankingRules,
): Tier {
  let efectivo: Tier = tier;
  if (efectivo === 'major' && parejasEnCategoria < rules.tierMinimos.major) {
    efectivo = 'p1';
  }
  if (efectivo === 'p1' && parejasEnCategoria < rules.tierMinimos.p1) {
    efectivo = 'p2';
  }
  return efectivo;
}

/**
 * Calcula los puntos de ranking de un jugador por su desempeño en UN torneo.
 * El hito de ronda ya incluye las rondas previas (un finalista suma 650, no
 * cuartos+semis+final).
 */
export function computeRankingPoints(
  result: PlayerTournamentResult,
  rules: RankingRules = DEFAULT_RANKING_RULES,
): number {
  if (!result.tier) {
    throw new Error('tier es obligatorio: viene de tournaments.tier');
  }
  if (!(typeof result.parejasEnCategoria === 'number' && result.parejasEnCategoria > 0)) {
    throw new Error('parejasEnCategoria es obligatorio');
  }

  let total = result.groupWins * rules.groupWinPoints;

  if (result.roundRobinOnly) {
    if (result.wonRoundRobin) total += rules.roundrobinChampionBonus;
  } else {
    if (result.qualified) total += rules.qualifyBonus;
    if (result.furthestRound !== 'none') {
      total += rules.roundPoints[result.furthestRound];
    }
  }

  if (rules.applyMultiplierToTotal) {
    total *= rules.tierMultipliers[tierEfectivo(result.tier, result.parejasEnCategoria, rules)];
  }

  return Math.round(total);
}
