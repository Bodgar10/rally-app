// Entrada ÚNICA para el pre-bundle de Edge Functions.
// Importa de los módulos explícitos (NO del barrel @/lib/engine) para
// treeshakear solo el subset que el servidor necesita y evitar arrastrar IA.
// esbuild resuelve los imports de valor sin extensión entre motores (clinch->standings).

// Formato + fixtures (ya usados por close-registration)
export { computeFormat } from './format';
export { generateRoundRobin } from './fixtures';

// Captura de resultado -> tabla + clasificación
export { validateScore } from './score';
export { computeStandings } from './standings';
export { computeClinch } from './clinch';

// Eliminatorias
export { computeSeeding, selectQualifiers, stageForBracketSize } from './seeding';
export type { QualifierStanding, MatchStage } from './seeding';
export { advanceBracket, thirdPlaceFromSemis } from './bracket';

// Rating (lo consume el cron de recompute; lo exponemos aquí para reuso)
// NOTA: combineOpponentPair YA vive en glicko2.ts (no en un combine-pair.ts) → CAMBIO 1 del prompt se saltó.
export { updateRating, combineOpponentPair } from './rating/glicko2';
export { divisionForRating } from './rating/category-bands';

// Puntos de ranking (cierre de torneo)
export { computeRankingPoints } from './ranking-points';
export type { RankingRules, PlayerTournamentResult, RoundReached } from './ranking-points';

// --- Tipos de dominio compartidos ---
// NOTA: FormatPlan y Fixture NO viven en ./types; se exportan desde su módulo real
// (igual que el shim de close-registration/engine.ts). El resto sí está en ./types.
export type { FormatPlan } from './format';
export type { Fixture } from './fixtures';
export type { ValidatedScore, ScoreConfig } from './score';
export type { StandingsConfig } from './standings';
export type { ClinchResult } from './clinch';
export type { SeedInput, BracketMatch, SeedingResult } from './seeding';
export type { RoundMatch, NextMatch, AdvanceResult } from './bracket';
export type {
  Division,
  FormatType,
  KnockoutStart,
  Stage,
  ClinchStatus,
  MatchResultInput,
  SetScore,
  StandingRow,
  GlickoRating,
} from './types';
