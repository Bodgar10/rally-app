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
// Plan de avance al capturar: qué crear y qué reapuntar en el cuadro.
export { planAvance, etiquetaDeRonda } from './bracket/avance-captura';

// Scheduler de la fase de grupos (lo consume schedule-groups) + la reticula de
// bloques y la regla de a que bloque pertenece un grupo, que schedule-groups
// tiene que recalcular porque no se guarda en ninguna columna.
export { programarGrupos, huellaDeGrupo } from './schedule/grupos';
export type {
  EntradaSchedulerGrupos,
  GrupoAProgramar,
  PartidoDeEntrada,
  PartidoDeGrupo,
  CalendarioGrupos,
  MotivoSinProgramar,
} from './schedule/grupos';
export { generarBloques, carrilesDeGrupo, PARTIDOS_POR_CARRIL } from './schedule/bloques';
export type { Bloque, VentanaDia as VentanaBloques, ReticulaBloques } from './schedule/bloques';
export { bloqueDeGrupo, repartirPorBloque } from './schedule/reparto';

// Scheduler del dia de eliminatorias (lo consume schedule-knockout)
export { programarEliminatorias, etapaDeRonda } from './schedule/knockout';
export type {
  EntradaScheduler,
  CategoriaCuadro,
  PartidoProgramado,
  Calendario,
  FranjaOcupacion,
  DiagnosticoScheduler,
  EtapaEliminatoria,
} from './schedule/knockout';

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
  PartidoCuadro, CrearPartido, ReapuntarPartido, PlanAvance, PlanOk, PlanRechazo,
} from './bracket/avance-captura';
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
