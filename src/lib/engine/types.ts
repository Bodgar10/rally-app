// src/lib/engine/types.ts
// Tipos compartidos por todos los motores deterministas de RALLY.
// TypeScript puro, agnóstico de plataforma. Sin dependencias de Supabase/React.
// Estos tipos son del DOMINIO del engine; el mapeo desde filas de BD lo hacen
// las Edge Functions / componentes que invocan a los motores.

export type Division =
  | 'sexta'
  | 'quinta'
  | 'cuarta'
  | 'tercera'
  | 'segunda'
  | 'primera';

export type FormatType =
  | 'round_robin'
  | 'groups_then_knockout'
  | 'knockout_only';

export type KnockoutStart = 'final' | 'semi' | 'quarter' | 'r16' | 'r32';

export type Stage =
  | 'group'
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter'
  | 'semi'
  | 'final'
  | 'third_place';

export type ClinchStatus = 'clinched' | 'eliminated' | 'alive';

/** Resultado de un partido tal como lo consume el engine (no es la fila de BD). */
export interface MatchResultInput {
  matchId: string;
  pairAId: string;
  pairBId: string;
  /** null si el partido aún no se juega. */
  winnerPairId: string | null;
  /** Sets capturados; vacío si no se ha jugado. */
  sets: SetScore[];
  played: boolean;
}

export interface SetScore {
  gamesA: number;
  gamesB: number;
  isSuperTiebreak: boolean;
  tiebreakA?: number | null;
  tiebreakB?: number | null;
}

/** Fila de tabla de posiciones calculada por el motor de standings. */
export interface StandingRow {
  pairId: string;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
  position: number;
}

/** Rating Glicko-2 de un jugador (escala de rating, no la interna). */
export interface GlickoRating {
  rating: number;
  rd: number;
  volatility: number;
}
