type Division = 'sexta' | 'quinta' | 'cuarta' | 'tercera' | 'segunda' | 'primera';
type FormatType = 'round_robin' | 'groups_then_knockout' | 'knockout_only';
type KnockoutStart = 'final' | 'semi' | 'quarter' | 'r16' | 'r32';
type Stage = 'group' | 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'final' | 'third_place';
type ClinchStatus = 'clinched' | 'eliminated' | 'alive';
/** Resultado de un partido tal como lo consume el engine (no es la fila de BD). */
interface MatchResultInput {
    matchId: string;
    pairAId: string;
    pairBId: string;
    /** null si el partido aún no se juega. */
    winnerPairId: string | null;
    /** Sets capturados; vacío si no se ha jugado. */
    sets: SetScore[];
    played: boolean;
}
interface SetScore {
    gamesA: number;
    gamesB: number;
    isSuperTiebreak: boolean;
    tiebreakA?: number | null;
    tiebreakB?: number | null;
}
/** Fila de tabla de posiciones calculada por el motor de standings. */
interface StandingRow {
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
interface GlickoRating {
    rating: number;
    rd: number;
    volatility: number;
}

interface FormatPlan {
    formatType: FormatType;
    groupSizes: number[];
    advancePerGroup: number;
    bestExtraQualifiers: number;
    knockoutStart: KnockoutStart;
    ambiguous: boolean;
    alternatives?: FormatPlan[];
}

/**
 * Calcula el formato de una categoría dado el nº de parejas.
 * Usa la tabla literal (Doc B §1.1) si N está listado; si no, deriva.
 */
declare function computeFormat(numPairs: number): FormatPlan;

interface Fixture {
    round: number;
    pairAId: string;
    pairBId: string;
}
/**
 * Genera todos los partidos de un grupo (todos contra todos, una vez).
 * @param pairIds parejas del grupo (>= 2).
 * @returns lista de partidos con su nº de ronda.
 */
declare function generateRoundRobin(pairIds: string[]): Fixture[];

interface ScoreConfig {
    bestOf: number;
    setTarget: number;
    setWinBy: number;
    /** Tope de games de un set normal con tiebreak (a 6-6 → 7-6). */
    setTiebreakCap: number;
    superTiebreakTarget: number;
    superTiebreakWinBy: number;
}
interface ValidatedScore {
    valid: boolean;
    errors: string[];
    /** Ganador derivado del marcador. null si inválido o incompleto. */
    winnerSide: 'A' | 'B' | null;
    setsA: number;
    setsB: number;
}
/**
 * Valida un marcador completo y deriva el ganador.
 * No persiste nada; solo dice si el marcador es legal y quién ganó.
 */
declare function validateScore(sets: SetScore[], config?: ScoreConfig): ValidatedScore;

interface StandingsConfig {
    pointsWin: number;
    pointsPlayedLoss: number;
    /** Cómo cuentan los games del super muerte para el desempate. */
    superTiebreakGames: 'one' | 'score';
}
/**
 * Calcula la tabla de posiciones ordenada de un grupo.
 * `pairIds` = parejas del grupo; `matches` = partidos del grupo (jugados o no).
 */
declare function computeStandings(pairIds: string[], matches: MatchResultInput[], config?: StandingsConfig): StandingRow[];

interface ClinchResult {
    pairId: string;
    status: ClinchStatus;
    /** Partidos restantes de los que depende su clasificación (para el mensaje "alive"). */
    dependsOnMatchIds: string[];
}
declare function computeClinch(pairIds: string[], matches: MatchResultInput[], advanceCount: number, config?: StandingsConfig): ClinchResult[];

/** Fila de group_standings necesaria para seleccionar y ordenar clasificados. */
type QualifierStanding = {
    pairId: string;
    groupId: string;
    position: number;
    points: number;
    setsWon: number;
    setsLost: number;
    gamesWon: number;
    gamesLost: number;
};
/**
 * Selecciona los clasificados (directos + mejores extra) y devuelve SeedInput[]
 * con un rating SINTÉTICO derivado del resultado de grupo (NO del Glicko):
 * mejor posición de grupo → mejor seed; dentro de misma posición desempata cmpTiebreak.
 *
 * Determinista. No conoce Glicko ni BD.
 */
declare function selectQualifiers(standings: QualifierStanding[], advancePerGroup: number, bestExtraQualifiers: number): SeedInput[];

/** Etiquetas reales del enum match_stage de la BD (NO 'r16'/'r32' del engine). */
type MatchStage = 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'final';
/** Mapea el tamaño de cuadro (potencia de 2) al stage de esa ronda. Determinista. */
declare function stageForBracketSize(bracketSize: number): MatchStage;

interface SeedInput {
    pairId: string;
    groupId: string;
    /** Rating de la pareja (mayor = mejor). Define el orden de siembra. */
    rating: number;
}
interface BracketMatch {
    slotA: number;
    slotB: number;
    /**
     * null = bye.
     *
     * NO ES UN CASO REAL DEL PRODUCTO, y conviene saberlo antes de invertir en
     * él: `computeFormat` está diseñado para que el número de clasificados sea
     * SIEMPRE potencia de 2 — para eso existe `bestExtraQualifiers`, que rellena
     * hasta la potencia con los mejores de la posición `advancePerGroup + 1`
     * (los segundos cuando pasa 1 por grupo, los terceros cuando pasan 2).
     * Verificado con los siete
     * tamaños que producen planes distintos (5, 8, 16, 24, 32, 4, 9): ninguno
     * deja un hueco.
     *
     * Los byes solo aparecerían si alguien alimenta computeSeeding saltándose
     * computeFormat. El soporte de aquí es defensivo, no un camino que la app
     * recorra.
     */
    pairAId: string | null;
    pairBId: string | null;
    isRematch: boolean;
}
interface SeedingResult {
    bracketSize: number;
    matches: BracketMatch[];
    /** Descripción de los rematches que no se pudieron evitar. */
    rematchesAllowed: string[];
}
/**
 * Calcula la siembra del cuadro eliminatorio.
 * @param qualifiers parejas clasificadas (cualquier orden); se siembran por rating desc.
 * @param bracketSize tamaño del cuadro (potencia de 2). Default = el menor que las contiene.
 */
declare function computeSeeding(qualifiers: SeedInput[], bracketSize?: number): SeedingResult;

interface RoundMatch {
    matchId: string;
    pairAId: string | null;
    pairBId: string | null;
    winnerPairId: string | null;
}
interface NextMatch {
    pairAId: string | null;
    pairBId: string | null;
    /** Partidos de la ronda previa que alimentan este (para enlazar en BD). */
    sourceMatchIds: [string, string];
}
interface AdvanceResult {
    next: NextMatch[];
    /** true si ya se conocen TODOS los ganadores de la ronda. */
    complete: boolean;
}
/**
 * Construye los emparejamientos de la siguiente ronda a partir de la actual.
 * La ronda debe venir EN ORDEN de bracket (como la entrega el motor de siembra).
 */
declare function advanceBracket(round: RoundMatch[]): AdvanceResult;
/**
 * Partido de 3.er lugar a partir de las dos semifinales (perdedores).
 * Devuelve null si no se conocen ambos perdedores todavía.
 */
declare function thirdPlaceFromSemis(semis: [RoundMatch, RoundMatch]): {
    pairAId: string;
    pairBId: string;
    sourceMatchIds: [string, string];
} | null;

/** Partido de cuadro tal y como está hoy en la base. */
interface PartidoCuadro {
    id: string;
    stage: string;
    roundLabel: string | null;
    pairAId: string | null;
    pairBId: string | null;
    winnerPairId: string | null;
    status: string;
    /** Partidos de la ronda previa que lo alimentan. Null en la ronda sembrada. */
    sourceMatchIds: string[] | null;
}
/** Partido de la ronda siguiente que hay que CREAR. */
interface CrearPartido {
    stage: MatchStage | 'third_place';
    roundLabel: string;
    pairAId: string | null;
    pairBId: string | null;
    sourceMatchIds: [string, string];
}
/** Partido que ya existe y al que hay que cambiarle las parejas. */
interface ReapuntarPartido {
    matchId: string;
    pairAId: string | null;
    pairBId: string | null;
}
interface PlanOk {
    ok: true;
    /** El partido ya estaba capturado: esto es una corrección. */
    esCorreccion: boolean;
    /** Con este resultado, la ronda queda completa. */
    rondaCompleta: boolean;
    /** Etapa que se crea, si toca. Null si no hay avance. */
    siguienteEtapa: MatchStage | null;
    crear: CrearPartido[];
    reapuntar: ReapuntarPartido[];
}
interface PlanRechazo {
    ok: false;
    motivo: 'match_not_found' | 'not_a_bracket_match' | 'is_a_bye' | 'winner_not_in_match' | 'downstream_already_played';
    detalle: string;
    /** Ids de los partidos ya jugados que bloquean la corrección. */
    bloqueadoPor?: string[];
}
type PlanAvance = PlanOk | PlanRechazo;
/** `${stage}-01`. Con cero delante: así el orden lexicográfico es el numérico. */
declare const etiquetaDeRonda: (stage: string, indice: number) => string;
/**
 * Qué escribir en el cuadro al capturar `matchId` con `winnerPairId`.
 *
 * `partidos` son TODOS los partidos de eliminatorias de la categoría, tal como
 * están hoy. No se muta nada.
 */
declare function planAvance(partidos: PartidoCuadro[], matchId: string, winnerPairId: string): PlanAvance;

/**
 * Scheduler de eliminatorias.
 * Asigna hora y cancha a cada partido del último día del torneo.
 * Lógica pura y determinista: misma entrada -> misma salida. Sin dependencias.
 */
interface CategoriaCuadro {
    id: string;
    clasificados: number;
    /** Ids de jugadores que podrian llegar a eliminatorias en esta categoria. */
    jugadores?: string[];
}
interface EntradaScheduler {
    canchas: number;
    desde: string;
    hasta: string;
    categorias: CategoriaCuadro[];
    minutosPorPartido?: number;
    descansoMinimo?: number;
    paso?: number;
}
interface PartidoProgramado {
    categoryId: string;
    ronda: number;
    totalRondas: number;
    etapa: EtapaEliminatoria;
    indiceEnRonda: number;
    inicio: string;
    inicioMin: number;
    cancha: number;
}
interface FranjaOcupacion {
    hora: string;
    canchas: number;
}
interface DiagnosticoScheduler {
    partidosSinProgramar: number;
    canchasQueFaltan: number;
    horasQueFaltan: number;
}
interface Calendario {
    cabe: boolean;
    partidos: PartidoProgramado[];
    totalPartidos: number;
    ultimoInicio: string | null;
    /** Hora de fin si todo corre a tiempo. */
    finEstimado: string | null;
    /** Hora de fin con los retrasos habituales. Es la que se le muestra al organizador. */
    finRealista: string | null;
    /** Hora de fin realista si una cancha se cae. Null si solo hay una cancha. */
    finRealistaUnaCanchaMenos: string | null;
    cotaInferior: string;
    ocupacionPorFranja: FranjaOcupacion[];
    /** Categorias hermanadas que aun asi quedaron a la misma hora. */
    empalmes: {
        categoriaA: string;
        categoriaB: string;
        hora: string;
        etapa: string;
    }[];
    avisos: string[];
    diagnostico?: DiagnosticoScheduler;
}
/**
 * Programa el dia de eliminatorias y dice a que hora termina de verdad.
 *
 * POR QUE TRES CORRIDAS Y NO UNA
 *   Un partido planificado a 60 minutos dura unos 75. En fase de grupos ese
 *   retraso se diluye —los partidos son independientes y se reabsorbe entre
 *   canchas—, pero en eliminatorias NO: las rondas van encadenadas, no se
 *   juega la semifinal antes de los cuartos, y el retraso se suma en linea
 *   recta ronda tras ronda. Un cuadro de 4 rondas acumula una hora entera.
 *
 *   Por eso el organizador necesita un rango. La hora del plan sirve para
 *   ordenar el dia; la realista es la que decide si cabe.
 *
 *   Y la tercera: si el formato solo termina a tiempo usando TODAS las
 *   canchas, una averia el domingo por la manana deja el torneo sin final.
 *   Eso no se ve en ningun porcentaje de ocupacion — hay que simularlo.
 *
 * Solo la primera corrida produce partidos, avisos y diagnostico. De las
 * otras dos se toma la hora y nada mas: sus avisos hablan de una entrada que
 * el organizador no configuro (23:59, otra duracion) y mezclarlos seria
 * contarle cosas de un torneo que no es el suyo.
 */
declare function programarEliminatorias(entrada: EntradaScheduler): Calendario;
/** Valores del enum match_stage de la base para eliminatorias. */
type EtapaEliminatoria = 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'final';
/**
 * Mapea una ronda del calendario al enum match_stage.
 * Se calcula por distancia a la final, no por numero de ronda,
 * para que funcione igual en cuadros de 4 y de 32.
 */
declare function etapaDeRonda(ronda: number, totalRondas: number): EtapaEliminatoria;

interface OpponentResult {
    rating: number;
    rd: number;
    /** 1 = ganó el jugador, 0 = perdió, 0.5 = empate (no aplica en padel). */
    score: number;
}
/**
 * Actualiza el rating de un jugador tras un periodo con uno o más oponentes.
 * Si no hay oponentes, solo infla RD por inactividad (φ* = sqrt(φ² + σ²)).
 */
declare function updateRating(player: GlickoRating, opponents: OpponentResult[], tau?: number): GlickoRating;
/** Combina dos rivales en un oponente virtual: rating promedio, RD media cuadrática. */
declare function combineOpponentPair(a: GlickoRating, b: GlickoRating): {
    rating: number;
    rd: number;
};

interface Band {
    division: Division;
    min: number;
    max: number;
}
interface BandConfig {
    bands: Band[];
    /** RD por debajo de la cual el rating se considera confiable (no cold-start). */
    rdConfidentThreshold: number;
    /** Nº de torneos por encima del techo para forzar promoción (anti-sandbagger). */
    promotionTournamentsThreshold: number;
}
declare function divisionForRating(rating: number, cfg?: BandConfig): Division;

type RoundReached = 'none' | 'r16' | 'quarter' | 'semi' | 'final' | 'champion';
interface RankingRules {
    groupWinPoints: number;
    qualifyBonus: number;
    roundPoints: Record<Exclude<RoundReached, 'none'>, number>;
    drawsizeMultipliers: {
        lte8: number;
        from9to16: number;
        from17to32: number;
        gte33: number;
    };
    roundrobinChampionBonus: number;
    applyMultiplierToTotal: boolean;
}
interface PlayerTournamentResult {
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
}
/**
 * Calcula los puntos de ranking de un jugador por su desempeño en UN torneo.
 * El hito de ronda ya incluye las rondas previas (un finalista suma 650, no
 * cuartos+semis+final).
 */
declare function computeRankingPoints(result: PlayerTournamentResult, rules?: RankingRules): number;

export { type AdvanceResult, type BracketMatch, type Calendario, type CategoriaCuadro, type ClinchResult, type ClinchStatus, type CrearPartido, type DiagnosticoScheduler, type Division, type EntradaScheduler, type EtapaEliminatoria, type Fixture, type FormatPlan, type FormatType, type FranjaOcupacion, type GlickoRating, type KnockoutStart, type MatchResultInput, type MatchStage, type NextMatch, type PartidoCuadro, type PartidoProgramado, type PlanAvance, type PlanOk, type PlanRechazo, type PlayerTournamentResult, type QualifierStanding, type RankingRules, type ReapuntarPartido, type RoundMatch, type RoundReached, type ScoreConfig, type SeedInput, type SeedingResult, type SetScore, type Stage, type StandingRow, type StandingsConfig, type ValidatedScore, advanceBracket, combineOpponentPair, computeClinch, computeFormat, computeRankingPoints, computeSeeding, computeStandings, divisionForRating, etapaDeRonda, etiquetaDeRonda, generateRoundRobin, planAvance, programarEliminatorias, selectQualifiers, stageForBracketSize, thirdPlaceFromSemis, updateRating, validateScore };
