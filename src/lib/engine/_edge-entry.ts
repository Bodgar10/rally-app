// Entrada ÚNICA para el pre-bundle de Edge Functions.
// Importa de los módulos explícitos (NO del barrel @/lib/engine) para
// treeshakear solo el subset que el servidor necesita y evitar arrastrar IA.
// esbuild resuelve los imports de valor sin extensión entre motores (clinch->standings).

// Formato + fixtures (ya usados por close-registration)
export { computeFormat } from './format';
export { generateRoundRobin } from './fixtures';

// Captura de resultado -> tabla + clasificación
export { validateScore, validateParcial, clasificarSet, estadoDeSet, DEFAULT_SCORE_CONFIG } from './score';
export { computeStandings, computeStandingsDetalle, DEFAULT_STANDINGS_CONFIG } from './standings';
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

// Movimiento manual de un partido: lo valida la pantalla EN VIVO y lo
// revalida la Edge Function `move-match` con el mismo codigo. Que la regla
// viva en un solo sitio es el punto.
export { validarMovimiento } from './schedule/mover';
export type {
  PartidoEnCalendario, Movimiento, Conflicto, ResultadoMovimiento, MotivoConflicto,
} from './schedule/mover';

// Cupo de los bloques horarios de la fase de grupos. `generarBloques` ya
// estaba; faltaban las dos que deciden si una pareja cabe.
export { bloquesDisponibles, cupoDeBloque, PAREJAS_POR_GRUPO } from './schedule/bloques';
export type { OcupacionBloque, Ocupacion, BloqueDisponible } from './schedule/bloques';

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
export { computeRankingPoints, tierEfectivo } from './ranking-points';
export type { RankingRules, PlayerTournamentResult, RoundReached, Tier } from './ranking-points';

// --- Tipos de dominio compartidos ---
// NOTA: FormatPlan y Fixture NO viven en ./types; se exportan desde su módulo real
// (igual que el shim de close-registration/engine.ts). El resto sí está en ./types.
export type { FormatPlan } from './format';
export type { Fixture } from './fixtures';
export type { ValidatedScore, ScoreConfig, FormatoDeSet, EstadoDeSet } from './score';
export type { StandingsConfig, StandingsDetalle, DesempateAplicado, CriterioDesempate } from './standings';
export type { ClinchResult, ClinchGroup, ClinchInput } from './clinch';
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

// Lo que hay que comprobar ANTES de sembrar (lo corre la pantalla y lo exige
// generate-bracket: el botón deshabilitado es una pista, no una garantía).
export { validarSiembra } from './validacion-siembra';
export type {
  Validacion, Problema, CodigoProblema, EntradaValidacion,
  GrupoAValidar, FilaDeGrupo,
} from './validacion-siembra';

// ── TORNEO EXPRÉS ───────────────────────────────────────────────────────────
//
// Se importa de los módulos explícitos, como todo lo de arriba, y no del barrel
// de expres: así el treeshake deja fuera lo que solo usa la app (el
// planificador de la tarde lo consume la pantalla de alta, no el servidor —
// pero sí entra, porque el sorteo necesita las horas para escribir
// `scheduled_at` en cada partido).
//
// Nada de esto toca los motores de arriba. Son módulos paralelos: el servidor
// elige uno u otro según `tournaments.modo`, y por eso un fallo aquí no puede
// alcanzar a los torneos largos.
export { generarFixtureExpres } from './expres/index';
export { repartirGrupos, tamanosDeGrupo, generadorDeSemilla } from './expres/sorteo';
export { computeTablaExpres } from './expres/tabla';
export { computeClinchExpres } from './expres/clinch';
export { prepararCapturaExpres, partidosPendientes } from './expres/captura';
export { planificarExpres, MINUTOS_ESTANDAR } from './expres/plan';
// Cómo se juega cada partido del cuadro exprés. Lo consume `match-result`:
// un cuarto es UN set, y validarlo con la regla del torneo largo (mejor de 3)
// rechazaba el 6-4 que lo cerraba.
export { scoreConfigDeFormato, esFormatoDeCuadro, setsDeEntrada } from './expres/formato';
export type { FormatoPartido, FormatoDeCuadro } from './expres/formato';
export { validarMarcadorSuma6, esMarcadorSuma6, MARCADORES_SUMA6, GAMES_POR_PARTIDO } from './expres/suma6';
export {
  PARTIDOS_POR_PAREJA, CLASIFICAN_POR_GRUPO, CUPO_MINIMO, GRUPO_MINIMO,
} from './expres/reglas';

export type { FixtureExpres, GrupoExpres, PartidoExpres, FranjaExpres, GrupoId } from './expres/reglas';
export type { ResultadoSuma6, TablaExpres, FilaTablaExpres, EmpateExpres, CriterioExpres } from './expres/tabla';
export type { ClinchExpresResult, EstadoClinchExpres } from './expres/clinch';
export type { CapturaExpres, FilaStandingExpres, EntradaCapturaExpres } from './expres/captura';
export type { PlanExpres, FranjaPlanificada, MinutosPorEtapa, VentanaExpres, ZonaExpres } from './expres/plan';
