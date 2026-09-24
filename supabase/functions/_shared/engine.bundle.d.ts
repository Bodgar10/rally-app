type Division = 'septima' | 'sexta' | 'quinta' | 'cuarta' | 'tercera' | 'segunda' | 'primera';
type FormatType = 'round_robin' | 'groups_then_knockout' | 'knockout_only';
type KnockoutStart = 'final' | 'semi' | 'quarter' | 'r16' | 'r32';
type Stage = 'group' | 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'final' | 'third_place';
/**
 * Estado de clasificación anticipada de una pareja.
 *
 * `repechage_pending` NO existía y por eso el motor eliminaba de más: con
 * plazas de repesca abiertas y grupos enteros sin jugar, una pareja que ya no
 * puede ganar SU grupo sigue viva en la carrera de mejores segundos de la
 * categoría. Decirle "eliminada" era mentirle.
 *
 * GEMELO: el enum `public.clinch_status` de la base. Si añades un valor aquí,
 * añádelo allí con una migración ANTES de desplegar match-result, o la RPC
 * revienta al castear.
 */
type ClinchStatus = 'clinched' | 'eliminated' | 'alive' | 'repechage_pending';
/** Resultado de un partido tal como lo consume el engine (no es la fila de BD). */
interface MatchResultInput {
    matchId: string;
    pairAId: string;
    pairBId: string;
    /**
     * null si el partido aún no se juega.
     *
     * ► O si el formato NO TIENE GANADOR. Ver `sinGanador`: en un suma 6 esto
     *   es null incluso con el partido terminado, y confundir las dos cosas es
     *   lo que hacía que un exprés con los 40 partidos capturados dijera que
     *   tenía 40 sin resultado.
     */
    winnerPairId: string | null;
    /** Sets capturados; vacío si no se ha jugado. */
    sets: SetScore[];
    played: boolean;
    /**
     * El formato no produce ganador (suma 6).
     *
     * Opcional para no tocar los cientos de sitios que construyen esto para un
     * torneo largo, donde siempre hay ganador. Ausente se lee como `false`.
     */
    sinGanador?: boolean;
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
    /**
     * True cuando esta pareja empata con otra(s) en TODOS los criterios de
     * desempate y el reglamento no las separa.
     *
     * El orden que devuelve `computeStandings` en ese caso sale del orden de
     * entrada: es estable pero NO deportivo. El flag existe para que la interfaz
     * pueda decirlo en vez de publicar un orden inventado como si fuera firme.
     */
    empateSinResolver: boolean;
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
    /**
     * Cómo se juega el SET DECISIVO. Decisión del torneo, no del motor.
     *
     * En el set decisivo un 5-4 es legal de dos formas: camino de un set
     * completo o camino de una súper muerte. Nada en los números lo distingue,
     * así que el motor no puede deducirlo — y mientras lo intentaba, rechazaba
     * los marcadores en curso del tercer set como si fueran imposibles.
     *
     * Sale de `tournaments.tercer_set_formato` (migración 063).
     */
    deciderFormat: 'super' | 'full';
}
declare const DEFAULT_SCORE_CONFIG: ScoreConfig;
interface ValidatedScore {
    /** El marcador es un partido COMPLETO y legal. Lo que decide si se cierra. */
    valid: boolean;
    errors: string[];
    /** Ganador derivado del marcador. null si inválido o incompleto. */
    winnerSide: 'A' | 'B' | null;
    setsA: number;
    setsB: number;
    /**
     * ¿Algún lado llegó ya a los sets necesarios?
     *
     * `valid` responde "¿se puede cerrar el partido?" y `completo` responde
     * "¿está decidido?". Son casi lo mismo salvo cuando hay otro error —un set
     * mal escrito, sets de más—, y separarlas es lo que permite guardar un set
     * suelto sin que el motor exija el partido entero.
     */
    completo: boolean;
}
/** Qué formato tiene un par de números, si es que tiene alguno. */
type FormatoDeSet = 'normal' | 'super' | null;
/**
 * Clasifica un marcador de set POR SUS NÚMEROS.
 *
 * NO HACE FALTA PREGUNTAR SI ES SUPER MUERTE: los dos formatos no se solapan.
 *   · Set normal: termina en 6 con 4 o menos enfrente (6-0 … 6-4), o en 7 con
 *     5 o 6 (7-5, 7-6). El máximo posible es 7.
 *   · Super muerte: llega a 10 o más con dos de diferencia (10-0, 10-8, 12-10).
 *     El mínimo posible del ganador es 10.
 *
 * Entre 7 y 10 no hay nada, así que ningún marcador puede ser las dos cosas.
 * El interruptor "super muerte" de la pantalla del juez preguntaba un dato que
 * ya estaba escrito en los números — y que se podía contestar mal.
 *
 * Devuelve null si no cabe en ninguno de los dos.
 */
declare function clasificarSet(a: number, b: number, cfg?: ScoreConfig): FormatoDeSet;
/**
 * En qué punto está un set, deducido de sus DOS NÚMEROS y de nada más.
 *
 *   'terminado' — 6-0…6-4, 7-5, 7-6, y la súper muerte a 10+ con dos de
 *                 diferencia. El 7-6 SIEMPRE está terminado: si llegaron a
 *                 6-6 el único desenlace posible es 7-6, no existe un 7-6 en
 *                 curso.
 *   'en_curso'  — cualquier otro marcador legal: 3-1, 5-4, 6-5, 6-6. Al 6-6
 *                 se le está jugando el tiebreak, cuyos puntos no se capturan.
 *   null        — lo imposible: 8-3, 6-8, 9-4, y el 0-0, que no es una foto
 *                 de nada.
 *
 * Es el mismo criterio con el que `clasificarSet` deduce la súper muerte sin
 * preguntar: los números ya lo dicen. Aquí solo se le añade el escalón que
 * faltaba entre "válido" e "imposible".
 */
type EstadoDeSet = 'terminado' | 'en_curso' | null;
/**
 * @param esDecisivo el set que decide el partido. Es el único que puede
 *   jugarse con otro formato, y por eso hay que decirlo: sin ese dato, el
 *   mismo 5-4 es dos cosas distintas.
 */
declare function estadoDeSet(a: number, b: number, cfg?: ScoreConfig, esDecisivo?: boolean): EstadoDeSet;
/**
 * Valida un marcador completo y deriva el ganador.
 * No persiste nada; solo dice si el marcador es legal y quién ganó.
 */
declare function validateScore(sets: SetScore[], config?: ScoreConfig): ValidatedScore;
/**
 * ¿Es LEGAL lo capturado hasta ahora, aunque el partido siga?
 *
 * Igual que `validateScore` salvo en dos cosas, y solo dos:
 *   · no exige que haya ganador;
 *   · admite que el ÚLTIMO set esté EN CURSO, para que el juez pueda ir
 *     actualizando el marcador del set que se está jugando.
 *
 * Los sets anteriores sí tienen que estar cerrados: `[3-1, 2-0]` es imposible,
 * porque no se empieza un set sin terminar el anterior.
 */
declare function validateParcial(sets: SetScore[], config?: ScoreConfig): ValidatedScore;

interface StandingsConfig {
    pointsWin: number;
    /**
     * Puntos por partido JUGADO y PERDIDO. Hoy 0. Ver DEFAULT_STANDINGS_CONFIG.
     * Se conserva como parámetro porque `computeClinch` lo usa como cota
     * inferior de puntos por partido restante.
     */
    pointsPlayedLoss: number;
    /** Cómo cuentan los games del super muerte para el desempate. */
    superTiebreakGames: 'one' | 'score';
    /**
     * Ignorar los partidos en curso, con sets capturados pero sin ganador.
     *
     * Por defecto NO se ignoran: sus sets y games entran en la tabla en cuanto
     * el juez los teclea, que es el punto de la captura set a set. Lo que no
     * entra son los PUNTOS ni los PJ — ver `computeStats`.
     *
     * `computeClinch` lo pone en true, y esa decisión tiene motivo propio: ver
     * la cabecera de ../clinch/index.ts.
     */
    soloTerminados?: boolean;
    /**
     * Cómo se juega un set en ESTE torneo. Hace falta para saber si el set
     * decisivo cerró: un 7-5 termina un set normal y no termina una súper
     * muerte, y el motor ya no lo adivina (migración 063).
     */
    score?: ScoreConfig;
    /**
     * El orden que el organizador SORTEÓ entre parejas que el reglamento no
     * separa. `pairId -> 1, 2, 3…` dentro de su bloque.
     *
     * Solo se aplica a un bloque que sigue siendo un empate irresoluble Y cuyas
     * parejas son exactamente las que traen valor. Si un resultado se corrige y
     * el empate desaparece o cambia de miembros, el sorteo se ignora solo — así
     * un dato viejo no puede reordenar una tabla que sí está decidida.
     *
     * Sale de `group_standings.desempate_manual` (migración 064).
     */
    desempateManual?: Record<string, number>;
}
/**
 * 2 por victoria, 0 por derrota. Los puntos son victorias × 2, punto.
 *
 * ► NO LO DEVUELVAS A 1 PENSANDO QUE PREMIA LA PARTICIPACIÓN. Era 1 y hubo
 *   que quitarlo. El punto por presentarse no premia a nadie: se lo lleva
 *   TODO el que juega, así que no distingue entre parejas — lo único que
 *   hace es escalar la columna PTS con el número de partidos del grupo.
 *
 *   Y los grupos no son todos del mismo tamaño. `computeFormat` reparte el
 *   resto (ver `distribute` en ../format/index.ts) y la tabla literal tiene
 *   escritos a mano los mixtos: 10 = [4,3,3], 16 = [4,3,3,3,3],
 *   20 = [4,4,3,3,3,3], 32 = [4,4,3,3,3,3,3,3,3,3]. En todos ellos pasa 1
 *   por grupo y el resto del cuadro se llena con los MEJORES SEGUNDOS, que
 *   `selectQualifiers` compara entre grupos distintos por esta misma columna.
 *
 *   Con 1 por derrota, un 1-2 en grupo de 4 sumaba 4 puntos y un 1-1 en
 *   grupo de 3 sumaba 3: el que perdió dos de tres clasificaba por encima
 *   del que ganó uno de dos, y ni siquiera se llegaban a comparar los sets.
 *   Peor: un 0-3 en grupo de 4 sumaba 3 y EMPATABA con ese 1-1.
 *
 *   Con 0, ambos quedan en 2 puntos y decide el desempate, que son
 *   diferencias y no acumulados. La tabla además se lee sola: el jugador que
 *   ve 2 puntos sabe que ganó un partido. No hacía falta normalizar por
 *   partidos jugados; hacía falta dejar de repartir puntos por jugar.
 */
declare const DEFAULT_STANDINGS_CONFIG: StandingsConfig;
/**
 * LA CADENA DE DESEMPATE, EN UN SOLO SITIO.
 *
 * Estaba escrita a mano dentro del `sort` y no se podía ni nombrar ni reusar:
 * la interfaz no tenía cómo decir POR QUÉ el primero es el primero, y nadie
 * podía saber si dos parejas estaban de verdad empatadas en todo o si el orden
 * lo había puesto el `sort`.
 *
 * Orden (Doc B §2): primero la mini-tabla SOLO entre las empatadas —lo que
 * pasó cuando se enfrentaron—, y solo si eso no separa, las diferencias del
 * grupo entero.
 */
type CriterioDesempate = 'minitabla_puntos' | 'minitabla_sets' | 'minitabla_games' | 'minitabla_games_favor' | 'sets' | 'games' | 'games_favor'
/** Lo decidió el sorteo del organizador, no el reglamento. */
 | 'sorteo' | 'sin_resolver';
/**
 * Un empate resuelto (o no) dentro de una tabla, para poder explicarlo.
 * `criterio` es el que separó a la PRIMERA del resto: es la respuesta a
 * "¿por qué el #1 es el #1?".
 */
interface DesempateAplicado {
    /** Puntos en los que empataban. */
    puntos: number;
    /** Parejas implicadas, en el orden final. Siempre 2 o más. */
    pairIds: string[];
    criterio: CriterioDesempate;
}
/** Tabla de un grupo + los empates que hubo que resolver para ordenarla. */
interface StandingsDetalle {
    filas: StandingRow[];
    /** Un elemento por cada corrida de parejas empatadas a puntos (2 o más). */
    desempates: DesempateAplicado[];
}
/**
 * Igual que `computeStandings` pero devolviendo también CÓMO se desempató.
 *
 * Existe porque la tabla sola no se explica: el organizador ve un orden entre
 * tres parejas con los mismos puntos y no tiene forma de saber si lo decidió
 * la mini-tabla, los games, o nada. Con esto la pantalla puede decirlo.
 */
declare function computeStandingsDetalle(pairIds: string[], matches: MatchResultInput[], config?: StandingsConfig): StandingsDetalle;
/**
 * Calcula la tabla de posiciones ordenada de un grupo.
 * `pairIds` = parejas del grupo; `matches` = partidos del grupo (jugados o no).
 *
 * El ORDEN es el mismo de siempre. Lo único nuevo es `empateSinResolver` en
 * cada fila: aditivo, para no romper a nadie que ya consumía esta tabla.
 */
declare function computeStandings(pairIds: string[], matches: MatchResultInput[], config?: StandingsConfig): StandingRow[];

interface ClinchResult {
    groupId: string;
    pairId: string;
    status: ClinchStatus;
    /** Partidos restantes de los que depende su clasificación (para el mensaje "alive"). */
    dependsOnMatchIds: string[];
}
/** Un grupo de la categoría, con sus parejas y sus partidos (jugados o no). */
interface ClinchGroup {
    groupId: string;
    pairIds: string[];
    matches: MatchResultInput[];
}
interface ClinchInput {
    /** TODOS los grupos de la categoría. Con uno solo no hay carrera de repesca. */
    groups: ClinchGroup[];
    /** categories.advance_per_group. Obligatorio. */
    advancePerGroup: number;
    /** categories.best_extra_qualifiers. Obligatorio, aunque sea 0. */
    bestExtraQualifiers: number;
    config?: StandingsConfig;
}
/**
 * Estado de clasificación de TODAS las parejas de una categoría.
 *
 * Cuatro estados y una regla: nadie es 'eliminated' mientras le quede una vía
 * matemática, sea ganar su grupo o colarse por repesca.
 *
 *   clinched          — pasa en todos los escenarios posibles.
 *   alive             — todavía puede terminar dentro del corte de SU grupo.
 *   repechage_pending — ya no puede ser directa, pero la carrera de mejores
 *                       segundos de la categoría sigue abierta para ella.
 *   eliminated        — ninguna de las dos cosas. Y solo entonces.
 *
 * LA COTA DE REPESCA ES CONSERVADORA A PROPÓSITO. Enumerar los escenarios de
 * la categoría entera es 2^(partidos que faltan) — con 10 grupos son 2^30. En
 * su lugar se cuenta cuántos grupos AJENOS tienen ya garantizado un segundo
 * que supera en puntos a esta pareja en su mejor caso. Si esos grupos no
 * llenan las plazas de repesca, la carrera sigue abierta. Puede sobrar
 * 'repechage_pending' de más; nunca puede faltar. El error caro es el otro.
 */
declare function computeClinch(input: ClinchInput): ClinchResult[];

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
    /**
     * Posición dentro de la ronda, 0-based. Es la clave del plan.
     *
     * `match_schedule` reserva hora y cancha para TODAS las rondas desde que se
     * programa el día, incluidas las que todavía no tienen fila en `matches`, y
     * las identifica por (categoría, etapa, slot_index) — la posición es lo
     * único que existe antes que el partido. Sin este dato el partido nacía sin
     * hora y salía como "POR PROGRAMAR" aunque su hueco ya estuviera decidido.
     */
    slotIndex: number;
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
declare function planAvance(partidos: PartidoCuadro[], matchId: string, winnerPairId: string, 
/**
 * ¿El torneo juega el 3.er lugar? Decisión de torneo (migración 052).
 * Default true: es lo que se venía haciendo antes de que fuera configurable.
 */
tercerLugar?: boolean): PlanAvance;

/**
 * Bloques horarios de fase de grupos.
 *
 * Un grupo de 3 parejas se juega como un BLOQUE de partidos consecutivos en una
 * sola cancha (round robin de 3 = 3 partidos). Con 60 min por partido eso es un
 * bloque de 3 horas. Asi se jugo el Sexto Torneo Cimepa: 52 de 55 grupos
 * siguieron esa regla exacta.
 *
 * Decision de producto: la pareja ELIGE su bloque al inscribirse, de los que
 * tengan cupo. No se pregunta disponibilidad para repartir despues; se reserva,
 * como un asiento. Los bloques agotados se ocultan.
 *
 * Logica pura y determinista: misma entrada -> misma salida. Su unica
 * dependencia es FACTOR_RETRASO, que se importa en vez de copiarse: el retraso
 * de un partido es un hecho del deporte, no de cada motor.
 */
/**
 * Parejas del grupo tipico. NO es una constante del dominio: `computeFormat`
 * produce grupos de 4 y de 5 cuando el numero de parejas no es multiplo de 3.
 * Es el default de quien no dice nada.
 */
declare const PAREJAS_POR_GRUPO = 3;
/**
 * Partidos que caben en un carril de un bloque.
 *
 * Es la MISMA cifra que `partidosPorGrupo` de `generarBloques`, y no por
 * casualidad: el bloque se dimensiona como "lo que tarda un grupo tipico", asi
 * que un carril-bloque mide exactamente 3 partidos. Separarlas de nombre
 * importa porque un grupo de 4 son 6 partidos y ya no cabe en un carril.
 */
declare const PARTIDOS_POR_CARRIL = 3;
/**
 * Ventana de juego de un dia.
 *
 * OJO CON `hasta`: es la hora a la que TERMINA el ultimo partido, no a la que
 * empieza. Una ventana 14:00-23:00 con partidos de 60 min admite un partido
 * que arranca a las 22:00 y cierra a las 23:00. Un bloque cabe si
 * `desde + duracion <= hasta`.
 */
interface VentanaDia {
    /** 'YYYY-MM-DD' */
    dia: string;
    /** Hora a la que empieza el primer partido. 'HH:MM' */
    desde: string;
    /** Hora a la que TERMINA el ultimo partido, no a la que empieza. 'HH:MM' */
    hasta: string;
}
interface EntradaBloques {
    ventanas: VentanaDia[];
    canchas: number;
    minutosPorPartido: number;
    /** Default 3: grupo de 3 parejas, round robin. */
    partidosPorGrupo?: number;
}
interface Bloque {
    /** `${dia}-${desde}`, estable y determinista. */
    id: string;
    dia: string;
    desde: string;
    /** Hora a la que TERMINA el bloque si todo corre a tiempo. */
    hasta: string;
    /**
     * Hora a la que termina de VERDAD, con los retrasos habituales.
     *
     * Un partido planificado a 60 minutos dura 75 de media (FACTOR_RETRASO), y
     * los tres de un grupo van encadenados en la misma cancha: el retraso del
     * primero empuja al segundo. Un bloque de 20:00 a 23:00 acaba realmente
     * cerca de las 23:45.
     *
     * OJO CON LO QUE ESTO NO MODELA: es el retraso de ESTE bloque, no la deriva
     * acumulada del dia. Si el bloque anterior de la misma cancha tambien se
     * alargo, el siguiente empieza tarde y esta hora se queda corta. No se
     * acumula a proposito — un club recupera entre bloques, y encadenar cinco
     * retrasos daria una hora que nadie va a ver.
     */
    hastaRealista: string;
    /**
     * El bloque se sale de la ventana del dia con los retrasos habituales.
     *
     * No lo convierte en invalido: Cimepa jugo a las 22:00 de verdad y el bloque
     * de las 20:00 existe porque la gente lo usa. Lo que no puede pasar es que
     * alguien lo elija sin saberlo.
     */
    seSaleDeLaVentana: boolean;
    /** Carriles simultaneos = canchas del club. Cada carril aloja un grupo. */
    carriles: number;
}
interface DiaGenerado {
    dia: string;
    bloques: number;
    /** Minutos de la ventana que no alcanzaron para un bloque entero. */
    minutosSobrantes: number;
    /** true cuando el dia se reservo para eliminatorias y no genero bloques. */
    eliminatorias: boolean;
}
interface ReticulaBloques {
    bloques: Bloque[];
    /** Duracion de cada bloque en minutos. */
    minutosPorBloque: number;
    /** Suma de carriles de todos los bloques. */
    capacidadCarriles: number;
    /** Parejas que caben en total = carriles x 3. El llamador compara contra su inscripcion. */
    capacidadParejas: number;
    /** Un renglon por dia de la entrada, en orden. */
    dias: DiaGenerado[];
    /** Dia excluido por ser de eliminatorias. Null si no se excluyo ninguno. */
    diaEliminatorias: string | null;
    avisos: string[];
}
/** Parejas ya inscritas en un bloque, por categoria. */
type OcupacionBloque = Record<string, number>;
/** Ocupacion de todos los bloques, indexada por id de bloque. */
type Ocupacion = Record<string, OcupacionBloque>;
interface BloqueDisponible extends Bloque {
    /** Parejas mas que caben en este bloque para la categoria consultada. */
    cupo: number;
}
/**
 * Construye la reticula de bloques a partir de las ventanas del torneo.
 *
 * Los bloques salen consecutivos desde `desde`. El ultimo que no quepa entero
 * en la ventana se descarta y sus minutos se reportan en `dias[].minutosSobrantes`.
 * `hasta` es la hora de FIN del ultimo partido: un bloque cabe mientras
 * `inicio + minutosPorBloque <= hasta`.
 *
 * El ULTIMO dia del torneo es de eliminatorias y no genera bloques de grupos.
 * Si solo hay una ventana si los genera, y lo dice en `avisos`.
 */
declare function generarBloques(entrada: EntradaBloques): ReticulaBloques;
/**
 * Carriles-bloque que consume un grupo de n parejas.
 *
 * ESTE ES EL ARREGLO. Antes se contaba en parejas —"3 parejas = 1 carril"— y
 * eso solo es cierto para el grupo tipico. `computeFormat` produce grupos de 4
 * cuando el numero de parejas no es multiplo de 3 (20 parejas -> [4,4,3,3,3,3]),
 * y un grupo de 4 son SEIS partidos: dos bloques de 3 horas, no uno. Contarlo
 * como un carril anunciaba capacidad que no existe.
 *
 * La cuenta correcta es en partidos: un carril-bloque son `partidosPorCarril`
 * partidos, y un grupo cuesta `n(n-1)/2`.
 *
 *   3 parejas ->  3 partidos -> 1 carril
 *   4 parejas ->  6 partidos -> 2 carriles
 *   5 parejas -> 10 partidos -> 4 carriles
 *   2 parejas ->  1 partido  -> 1 carril  (el minimo: el carril es la unidad
 *                                          de reserva, no se parte)
 */
declare function carrilesDeGrupo(parejas: number, partidosPorCarril?: number): number;
interface OpcionesCupo {
    /**
     * Parejas por grupo que va a usar cada categoria, por id. Lo decide
     * `computeFormat` a partir de cuantas parejas lleva la categoria; este motor
     * no lo deriva para no depender del motor de formato.
     *
     * Una categoria sin entrada usa PAREJAS_POR_GRUPO. Un valor que no sea un
     * entero >= 2 se ignora y cae al default: esta funcion corre dentro de un
     * render, y reventar ahi tumba la pantalla de inscripcion entera.
     */
    parejasPorGrupo?: Record<string, number>;
    /** Partidos que caben en un carril. Default PARTIDOS_POR_CARRIL. */
    partidosPorCarril?: number;
}
/**
 * Cuantas parejas MAS caben en un bloque para una categoria.
 *
 * No es una division simple, por dos razones que se acumulan:
 *
 *   1. Un grupo son parejas de la MISMA categoria y ocupa carriles enteros. Los
 *      huecos de un grupo a medias NO sirven para otra categoria.
 *   2. Cuantos carriles ocupa un grupo depende de su tamano (ver
 *      `carrilesDeGrupo`): 3 parejas = 1 carril, 4 parejas = 2.
 *
 *   carrilesUsados  = suma sobre categorias de
 *                       ceil(parejas[cat] / G[cat]) * carrilesDeGrupo(G[cat])
 *   carrilesLibres  = carriles - carrilesUsados
 *   huecoEnMiGrupo  = (G - (mias % G)) % G
 *   gruposQueCaben  = floor(carrilesLibres / carrilesDeGrupo(G))
 *   cupo            = huecoEnMiGrupo + gruposQueCaben * G
 *
 * Con G = 3 en todo sale exactamente la formula de antes; el cambio no mueve
 * el caso normal.
 *
 * EJEMPLO DEL BUG QUE ARREGLA
 *   Categoria de 8 parejas -> computeFormat da [4,4] -> G = 4. Un bloque vacio
 *   de 8 carriles admite 4 grupos de 4 (16 parejas), no 8 grupos de 3 (24).
 *   Antes decia 24: ocho parejas de mas que no tenian donde jugar.
 *
 * ES UN PRONOSTICO, NO UN CUPO EXACTO. Se calcula mientras la gente todavia se
 * esta inscribiendo, asi que G sale del numero de parejas de ESTE momento y
 * puede cambiar con la siguiente inscripcion. La cuenta fina, sobre la
 * inscripcion cerrada, es `capacidadDelTorneo`.
 */
declare function cupoDeBloque(bloque: Bloque, ocupacion: OcupacionBloque | undefined, categoriaId: string, opciones?: OpcionesCupo): number;
/**
 * Los bloques con cupo > 0 para la categoria, cada uno con su cupo.
 * Conserva el orden de `bloques`. Los agotados no salen: la UI los oculta.
 */
declare function bloquesDisponibles(bloques: Bloque[], ocupacion: Ocupacion | undefined, categoriaId: string, opciones?: OpcionesCupo): BloqueDisponible[];

/**
 * Scheduler de fase de grupos.
 * Asigna cancha y hora a los partidos de cada grupo, DENTRO del bloque que el
 * grupo ya tiene asignado. Logica pura y determinista: misma entrada -> misma
 * salida. Sin dependencias mas alla del grafo de hermandad de `knockout.ts`.
 *
 * Especificacion: `docs/scheduler-fase-de-grupos.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE MOTOR NO DECIDE
 *   En que bloque juega cada grupo. Eso lo eligio la pareja al inscribirse
 *   (`pair_block_choices`) y lo materializo `repartirPorBloque` al cerrar. Aqui
 *   entra hecho y no se toca. Es la unica promesa que se le hizo al jugador.
 *
 * LA HUELLA DE UN GRUPO SALE DE SUS RONDAS, NO DE UN NUMERO QUE LE PASEN
 *   `generateRoundRobin` ya agrupa los partidos en RONDAS donde ninguna pareja
 *   se repite. Eso da las dos medidas que hacen falta:
 *
 *     rondas  = cuantos turnos consecutivos ocupa el grupo
 *     anchura = partidos de la ronda mas cargada = canchas simultaneas
 *
 *     3 parejas -> 3 rondas x 1 cancha  = 1 carril   (3 h)
 *     4 parejas -> 3 rondas x 2 canchas = 2 carriles (3 h en DOS canchas)
 *     5 parejas -> 5 rondas x 2 canchas = 4 carriles (2 bloques)
 *     2 parejas -> 1 ronda  x 1 cancha  = 1 carril   (sobran 2 h)
 *
 *   Coincide con `carrilesDeGrupo` de `bloques.ts` en los cuatro casos, y es
 *   preferible a recibir `carriles` como dato: un numero que el llamador puede
 *   equivocarse al calcular es un numero que acabara desincronizado.
 *
 *   El grupo de 4 sale asi en DOS canchas del mismo bloque —3 horas, no 6—,
 *   que es la forma que pide la especificacion (§6.4 A) y la que respeta el
 *   trato de Cimepa: la gente esta 3 horas en el club.
 *
 * EL CARRIL ES LA UNIDAD DE RESERVA, Y NO SE PARTE
 *   Un grupo de 2 ocupa una cancha las 3 horas aunque solo juegue una. Rellenar
 *   ese hueco con otro grupo rompe la continuidad de categoria (§2.1) y le
 *   complica la vida al juez por una hora de cancha.
 *
 * LA OCUPACION ES UN DATO, NO UN OBJETIVO
 *   Sale de dividir los partidos colocados entre la capacidad de la reticula
 *   ENTERA. Cimepa: 165 partidos sobre 192 canchas-hora = 85,9 %. Ese numero no
 *   se puede subir programando mejor —los partidos son los que son—, solo
 *   usando menos bloques, que es exactamente lo que no hay que hacer: las horas
 *   ociosas del viernes por la tarde son las horas a las que la gente trabaja.
 */

/** Un partido tal como lo emitio `generateRoundRobin`, ya creado en `matches`. */
interface PartidoDeEntrada {
    matchId: string;
    pairAId: string;
    pairBId: string;
    /** 1-based. Dentro de una ronda ninguna pareja se repite. */
    ronda: number;
}
interface GrupoAProgramar {
    /** groups.id */
    id: string;
    categoryId: string;
    /** 'A', 'B', … Solo para desempatar de forma estable y para los avisos. */
    nombre: string;
    partidos: PartidoDeEntrada[];
    /**
     * Bloque en el que juega, ya resuelto por `repartirPorBloque`. Null solo si
     * ninguna de sus parejas eligio horario: entonces sale sin programar y no
     * estorba al resto.
     */
    bloqueId: string | null;
}
interface EntradaSchedulerGrupos {
    /** La reticula tal cual la emite `generarBloques`. No se recalcula aqui. */
    bloques: Bloque[];
    minutosPorPartido: number;
    grupos: GrupoAProgramar[];
    /** Por categoria, los jugadores que la juegan. Alimenta el grafo de hermandad. */
    jugadoresPorCategoria?: Record<string, string[]>;
    /**
     * Solo 'corrido'. El modo 'espaciado' de la especificacion (§5.4) exigiria
     * sacar partidos del bloque que la pareja eligio, que es justo lo que este
     * motor no hace. Queda documentado como conflicto abierto, no implementado a
     * medias.
     */
    modo?: 'corrido';
}
interface PartidoDeGrupo {
    matchId: string;
    groupId: string;
    categoryId: string;
    bloqueId: string;
    /** 'YYYY-MM-DDTHH:MM', hora local del club. La zona la pone el llamador. */
    inicio: string;
    /** 1..carriles. Se escribe como `Cancha ${n}`, igual que el knockout. */
    cancha: number;
    /** Turno dentro del bloque, 0-based. */
    ordenEnBloque: number;
    /**
     * El partido cayo en un bloque distinto al del grupo. Solo puede pasar en
     * grupos que necesitan mas turnos de los que tiene un bloque (5 parejas).
     */
    desplazado: boolean;
}
type MotivoSinProgramar = 'sin_bloque' | 'bloque_desconocido' | 'bloque_sobrevendido' | 'no_cabe_en_el_bloque';
interface GrupoSinProgramar {
    groupId: string;
    categoryId: string;
    motivo: MotivoSinProgramar;
}
interface Empalme {
    bloqueId: string;
    categoriaA: string;
    categoriaB: string;
}
interface BloqueSobrevendido {
    bloqueId: string;
    /** Carriles que exigen los grupos asignados a este bloque. */
    carrilesPedidos: number;
    /** Carriles que tiene: una cancha por carril. */
    carriles: number;
    grupos: number;
}
interface CalendarioGrupos {
    partidos: PartidoDeGrupo[];
    sinProgramar: GrupoSinProgramar[];
    empalmes: Empalme[];
    sobrevendidos: BloqueSobrevendido[];
    /** Dato, nunca objetivo. Ver la cabecera. */
    ocupacion: {
        canchasHoraUsadas: number;
        canchasHoraDisponibles: number;
        /** 0..100, con un decimal. */
        porcentaje: number;
    };
    /** Canchas ocupadas en cada turno de cada bloque. Para pintar el calendario. */
    ocupacionPorBloque: {
        bloqueId: string;
        canchasUsadas: number;
        carriles: number;
    }[];
    avisos: string[];
}
interface HuellaGrupo {
    /** Turnos consecutivos que ocupa. */
    rondas: number;
    /** Canchas simultaneas: los partidos de la ronda mas cargada. */
    anchura: number;
    /** Los partidos de cada ronda, en orden de ronda y estable dentro de ella. */
    porRonda: PartidoDeEntrada[][];
}
/**
 * Cuantos turnos y cuantas canchas necesita un grupo.
 *
 * Las rondas se toman como vienen de `generateRoundRobin` y se renumeran a
 * 0..n-1 por si llegan con huecos: lo que importa es el ORDEN, no la etiqueta.
 * Dentro de una ronda el orden es el de entrada, que ya es determinista.
 */
declare function huellaDeGrupo(partidos: PartidoDeEntrada[]): HuellaGrupo;
/**
 * Coloca cada grupo en su bloque: cancha (o canchas) y turno de cada partido.
 *
 * No lanza nunca por datos de torneo: un grupo que no cabe sale en
 * `sinProgramar` y el resto del calendario se hace igual. Un grupo sin horario
 * no puede impedir que los otros 54 tengan el suyo.
 */
declare function programarGrupos(entrada: EntradaSchedulerGrupos): CalendarioGrupos;

/**
 * Reparto de parejas en grupos, POR BLOQUE.
 *
 * Lo consume `close-registration` al cerrar una categoria. Logica pura y
 * determinista: misma entrada -> misma salida. Sin dependencias.
 *
 * ANTES ERA UN SNAKE SOBRE created_at Y ROMPÍA LA ELECCIÓN DE HORARIO
 *   La pareja elige su bloque al inscribirse (`pair_block_choices`, migración
 *   051) y un grupo se juega como un bloque de 3 horas seguidas en una cancha.
 *   El snake repartía sobre la categoría entera ordenada por fecha de alta, así
 *   que un grupo podía acabar con tres parejas de tres bloques distintos: tres
 *   personas citadas a horas diferentes para jugar entre ellas. Con eso, el
 *   scheduler de fase de grupos no habría podido programar casi nada.
 *
 * LO QUE NO CAMBIA: EL NÚMERO Y EL TAMAÑO DE LOS GRUPOS
 *   `plan.groupSizes` no es negociable aquí. De su LONGITUD salen el cuadro de
 *   eliminatorias, `advancePerGroup` y `bestExtraQualifiers`, todos calculados
 *   ya por `computeFormat`. Este reparto decide QUIÉN va con quién, nunca
 *   cuántos grupos hay ni de qué tamaño.
 *
 *   Por eso el snake ya no hace falta para equilibrar: el equilibrio vive en
 *   `groupSizes`. Dentro de un bloque el orden sigue siendo `created_at`.
 *
 * EL CASO DE LOS RESTOS
 *   Un bloque con 7 parejas de una categoría da dos grupos —de 4 y de 3, o dos
 *   de 3— y puede dejar una suelta. Esa pareja se junta con los restos de los
 *   otros bloques de SU categoría y forman un grupo mezclado, cuyo bloque es el
 *   de la mayoría. Se marca y se reporta.
 *
 *   NUNCA se deja una pareja sin grupo: sin grupo no juega, y ya pagó. Un
 *   horario incómodo se negocia; quedarse fuera del torneo, no.
 */
interface GrupoRepartido<T> {
    items: T[];
    /** Bloque del grupo: el de sus parejas, o el de la mayoría si vienen de varios. */
    bloqueId: string | null;
    /** Parejas que aporta cada bloque. Con más de una entrada, el grupo es mezclado. */
    desde: Record<string, number>;
}
/**
 * Reparte `parejas` en grupos de los tamaños EXACTOS de `sizes`, agrupando por
 * bloque siempre que se pueda. Determinista: mismo orden de entrada -> misma
 * salida.
 *
 * Precondición: `sum(sizes) === parejas.length`. La valida el llamador; aquí se
 * asume, y es lo que garantiza que los restos encajen justo en los tamaños que
 * sobran.
 */
declare function repartirPorBloque<T>(parejas: T[], bloqueDe: (p: T) => string | null, sizes: number[]): GrupoRepartido<T>[];
/**
 * A qué bloque pertenece un grupo, a partir de lo que eligió cada pareja.
 *
 * Mayoría; empate al bloque más temprano —los ids son `${dia}-${desde}`, así
 * que alfabético es cronológico—. "Sin bloque" solo gana si es el único
 * máximo: un horario real vale más que la ausencia de horario.
 *
 * VIVE AQUÍ Y SE EXPORTA porque hay DOS sitios que necesitan la respuesta y
 * tienen que dar la misma. `close-registration` la usa al formar los grupos, y
 * `schedule-groups` la vuelve a calcular al programar, porque el bloque del
 * grupo no se guarda en ninguna columna (ver §8 de la especificación). Dos
 * implementaciones de esta regla se desincronizarían el día que alguien toque
 * una y no la otra, y el sintoma seria un torneo con horarios que no cuadran.
 */
declare function bloqueDeGrupo(elecciones: (string | null)[]): string | null;

/** Un partido con su sitio en el calendario, tal como está hoy. */
interface PartidoEnCalendario {
    id: string;
    categoryId: string;
    /** 'group' | 'round_of_32' | ... | 'third_place'. */
    stage: string;
    roundLabel: string | null;
    /** Los cuatro jugadores. Menos de cuatro si alguna pareja falta todavía. */
    jugadores: string[];
    /** 'YYYY-MM-DD' en la zona del club. Null si aún no tiene hora. */
    dia: string | null;
    /** Minutos desde medianoche. Null si aún no tiene hora. */
    inicioMin: number | null;
    /** Etiqueta de la cancha tal como la ve el organizador: 'Cancha 3'. */
    cancha: string | null;
    status: string;
    /** Los partidos de la ronda previa que lo alimentan. Null en grupos y siembra. */
    sourceMatchIds: string[] | null;
}
/** A dónde se quiere mover. */
interface Movimiento {
    matchId: string;
    dia: string;
    inicioMin: number;
    cancha: string;
}
type MotivoConflicto = 'partido_no_encontrado' | 'cancha_ocupada' | 'jugador_ocupado' | 'descanso_insuficiente' | 'ronda_previa_sin_hora' | 'ronda_previa_despues' | 'hora_invalida';
interface Conflicto {
    motivo: MotivoConflicto;
    /** Redactado para el organizador, con nombres. */
    mensaje: string;
    /** El partido que estorba, si lo hay. */
    matchId?: string;
}
interface ResultadoMovimiento {
    /**
     * ¿Se puede hacer el movimiento?
     *
     * NO es `conflictos.length === 0`. El descanso insuficiente es un AVISO, no
     * un impedimento: en un torneo de padel se juega seguido, y el respiro entre
     * rondas es consecuencia de que falten canchas, no una regla. Bloquear un
     * movimiento por eso era el motor arbitrando una decisión que es del
     * organizador, que además tiene delante a las parejas y sabe si aguantan.
     */
    ok: boolean;
    conflictos: Conflicto[];
}
interface EntradaMovimiento {
    /** TODOS los partidos del torneo, con su horario actual. */
    partidos: PartidoEnCalendario[];
    movimiento: Movimiento;
    minutosPorPartido?: number;
    /** Minutos que una pareja necesita entre dos partidos suyos. Default 30. */
    descansoMinimo?: number;
    /** playerId -> nombre. Lo que falte sale como "Un jugador". */
    nombres?: Record<string, string>;
}
/**
 * ¿Se puede mover `movimiento.matchId` a ese día, hora y cancha?
 *
 * Devuelve TODOS los conflictos, no el primero: el organizador que mueve una
 * semifinal quiere ver de una vez que la cancha está ocupada Y que dos de sus
 * jugadores vienen de jugar, no descubrirlo de uno en uno.
 */
declare function validarMovimiento(entrada: EntradaMovimiento): ResultadoMovimiento;

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
    /**
     * ¿Se juega el partido por el 3.er lugar? Default true.
     *
     * Es una decisión de TORNEO, no de categoría: o se juega en todas o en
     * ninguna. Cuenta para el presupuesto porque ocupa una cancha, y lo hace en
     * el peor momento —a la vez que las finales, cuando las ocho categorías
     * convergen— así que ignorarlo era subestimar justo la hora más cargada.
     */
    tercerLugar?: boolean;
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
type EtapaEliminatoria = 'round_of_32' | 'round_of_16' | 'quarter' | 'semi' | 'final' | 'third_place';
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
/**
 * Combina dos rivales en un oponente virtual: rating promedio, RD media
 * cuadrática.
 *
 * Pide solo `rating` y `rd` —y no un `GlickoRating` entero— porque son los
 * únicos que usa. Exigir además la volatilidad obligaba a inventarse un valor
 * a quien solo quiere saber cuánto vale una pareja, que es justo lo que
 * necesita el scouting.
 */
declare function combineOpponentPair(a: {
    rating: number;
    rd: number;
}, b: {
    rating: number;
    rd: number;
}): {
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
type Tier = 'major' | 'p1' | 'p2';
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
    tierMultipliers: {
        major: number;
        p1: number;
        p2: number;
    };
    tierMinimos: {
        major: number;
        p1: number;
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
    /** Tier declarado por el organizador al crear el torneo. Obligatorio. */
    tier: Tier;
    /** Nº de parejas INSCRITAS en la categoría (no las del cuadro eliminatorio). */
    parejasEnCategoria: number;
}
/**
 * Tier efectivo tras aplicar el piso de parejas inscritas en la categoría.
 * 'major' por debajo de tierMinimos.major cae a 'p1'; el resultado (incluido
 * un 'major' ya degradado) por debajo de tierMinimos.p1 cae a 'p2'. Un
 * 'major' con muy pocas parejas puede caer dos escalones hasta 'p2'.
 * 'p2' no tiene piso: se queda 'p2' siempre.
 */
declare function tierEfectivo(tier: Tier, parejasEnCategoria: number, rules: RankingRules): Tier;
/**
 * Calcula los puntos de ranking de un jugador por su desempeño en UN torneo.
 * El hito de ronda ya incluye las rondas previas (un finalista suma 650, no
 * cuartos+semis+final).
 */
declare function computeRankingPoints(result: PlayerTournamentResult, rules?: RankingRules): number;

/** Una fila de `group_standings` tal como la lee quien va a sembrar. */
interface FilaDeGrupo extends QualifierStanding {
    clinchStatus: 'clinched' | 'eliminated' | 'alive' | 'repechage_pending';
}
interface GrupoAValidar {
    groupId: string;
    /** 'A', 'B'… lo que se le enseña al organizador. */
    nombre: string;
    pairIds: string[];
    matches: MatchResultInput[];
    /** Lo que hay HOY en `group_standings`, que es lo que la siembra va a usar. */
    filas: FilaDeGrupo[];
}
interface EntradaValidacion {
    grupos: GrupoAValidar[];
    advancePerGroup: number;
    bestExtraQualifiers: number;
    /** pairId -> 'Nombre / Nombre'. Los problemas se cuentan con nombres. */
    nombres: Record<string, string>;
    config?: StandingsConfig;
}
type CodigoProblema = 'numeros_no_cuadran' | 'clasifica_dos_veces' | 'eliminado_clasificado' | 'clasificado_fuera' | 'grupo_incompleto' | 'empate_sin_resolver' | 'posiciones_incoherentes';
interface Problema {
    codigo: CodigoProblema;
    gravedad: 'bloqueante' | 'aviso';
    /** Redactado para el organizador, con nombres y letras de grupo. */
    mensaje: string;
    /** Grupo al que pertenece, si es de uno. */
    grupo?: string;
    /** Parejas implicadas, por nombre. */
    parejas?: string[];
}
interface Validacion {
    bloqueantes: Problema[];
    avisos: Problema[];
    /** Sin bloqueantes. Los avisos se pueden saltar con confirmación explícita. */
    puedeSembrar: boolean;
}
declare function validarSiembra(entrada: EntradaValidacion): Validacion;

/** Identificador de grupo. Siempre dos, siempre estos. */
type GrupoId = 'A' | 'B';
/**
 * Partidos que juega cada pareja. CINCO, y no es un parámetro cualquiera.
 *
 * ► ES LA PROMESA AL JUGADOR, NO UNA CALIBRACIÓN.
 *   5 partidos × 30 minutos = 2 h 30 de pádel. Eso es lo que el organizador
 *   anuncia y lo que el jugador viene a jugar. Bajarlo a 4 no "optimiza el
 *   horario": vende otro producto.
 *
 * ► Y ES LO QUE HACE HONESTA LA TABLA.
 *   Como no hay ganador del partido, el orden sale del balance de games. Ese
 *   balance solo es comparable si todas las parejas han tenido los mismos
 *   games en juego. Con una jugando 5 partidos y otra 6, los balances se
 *   comparan contra escalas distintas y la tabla miente.
 */
declare const PARTIDOS_POR_PAREJA = 5;
/**
 * Clasifican 4 por grupo → 8 → cuartos exactos.
 *
 * Sin repescados y sin comparar entre grupos: cada grupo se resuelve solo.
 * Por eso el exprés NO necesita el `bestExtraQualifiers` que `computeClinch`
 * exige en los torneos largos — ahí la carrera de mejores segundos cruza
 * grupos; aquí no existe.
 */
declare const CLASIFICAN_POR_GRUPO = 4;
/**
 * Parejas mínimas por grupo.
 *
 * Pasan 4, así que con 5 el grupo sería "eliminamos a una". Y con 5 parejas
 * solo hay 4 rivales posibles: no caben 5 partidos sin repetir a alguien.
 */
declare const GRUPO_MINIMO = 6;
/**
 * Cupo mínimo del torneo: 12 (6+6).
 *
 * Con exactamente 12 el grupo de 6 juega los 5 partidos contra sus 5 rivales,
 * o sea round robin completo. Funciona y la tabla es correcta, pero ahí el
 * formato no ahorra nada. El punto dulce es 16: grupos de 8 donde juegas 5 de
 * tus 7 rivales y clasifica justo la mitad.
 */
declare const CUPO_MINIMO: number;
/** Un partido de la fase de grupos de un exprés. */
interface PartidoExpres {
    /**
     * Referencia estable y legible: 'A-R3-P2' = grupo A, ronda 3, segundo
     * partido de esa ronda.
     *
     * No es el id de base de datos —ese lo pone Postgres— sino la clave
     * determinista del fixture. Sirve para que insertar el mismo fixture dos
     * veces sea detectable, y para leer un test sin descifrar UUIDs.
     */
    ref: string;
    grupo: GrupoId;
    /** 1..partidosPorPareja. */
    ronda: number;
    /** Franja de juego dentro del torneo, 1..(2 × partidosPorPareja). */
    orden: number;
    /**
     * Las dos parejas.
     *
     * EL ORDEN NO SIGNIFICA NADA. En pádel no hay local ni visitante; aquí es
     * simplemente el orden del sorteo dentro del grupo, fijado para que el
     * fixture sea reproducible carácter por carácter.
     */
    pairAId: string;
    pairBId: string;
}
/** Un grupo con su sorteo y sus rondas. */
interface GrupoExpres {
    grupo: GrupoId;
    /** Parejas del grupo, en el orden que salió del sorteo. */
    pairIds: string[];
    /** `rondas[i]` son los partidos simultáneos de la ronda i+1. */
    rondas: PartidoExpres[][];
}
/**
 * Una franja de juego: un grupo entero jugando una ronda.
 *
 * Mientras un grupo juega, el otro descansa. Como los dos grupos tienen el
 * mismo número de rondas, la alternancia sale perfecta y sin huecos:
 * A1, B1, A2, B2, … Sin horas: aquí solo está el ORDEN. Las horas son del
 * planificador.
 */
interface FranjaExpres {
    orden: number;
    grupo: GrupoId;
    ronda: number;
    partidos: PartidoExpres[];
}
interface FixtureExpres {
    cupo: number;
    partidosPorPareja: number;
    clasificanPorGrupo: number;
    grupos: GrupoExpres[];
    /** Las 2×K franjas en orden de juego. */
    franjas: FranjaExpres[];
    /** Todos los partidos, planos, en orden de juego. */
    partidos: PartidoExpres[];
    /**
     * Canchas para meter una ronda entera en una franja: el grupo más grande
     * partido por dos.
     *
     * Con menos, la ronda se parte en tandas y la tarde se alarga en
     * proporción. Quien decide si eso cabe es el planificador, no este motor.
     */
    canchasNecesarias: number;
    /** Partidos totales de la fase de grupos. */
    totalPartidos: number;
}

/** Games que se juegan en un partido de grupo del exprés. Seis, siempre. */
declare const GAMES_POR_PARTIDO = 6;
/** Un marcador de suma 6 ya capturado. */
interface MarcadorSuma6 {
    gamesA: number;
    gamesB: number;
}
/**
 * Los únicos siete marcadores que existen.
 *
 * Se expone para la pantalla del juez: en vez de dos campos numéricos donde se
 * puede teclear un 7-2, son siete botones. Un marcador imposible que no se
 * puede ni escribir no hay que validarlo después.
 */
declare const MARCADORES_SUMA6: readonly MarcadorSuma6[];
/**
 * Errores de un marcador de suma 6. Array vacío = válido.
 *
 * Devuelve los motivos en vez de un booleano porque quien lo llama es la
 * captura, y "marcador inválido" no le dice al juez qué corregir.
 */
declare function validarMarcadorSuma6(gamesA: unknown, gamesB: unknown): string[];
/** ¿Es uno de los siete marcadores posibles? */
declare function esMarcadorSuma6(gamesA: unknown, gamesB: unknown): boolean;

/** Un partido de grupo tal como lo consume la tabla. */
interface ResultadoSuma6 {
    matchId: string;
    pairAId: string;
    pairBId: string;
    /** null los dos si todavía no se ha jugado. */
    gamesA: number | null;
    gamesB: number | null;
}
/** Qué colocó a una pareja en su puesto. */
type CriterioExpres = 
/** Su balance de games, sin empate que resolver. */
'balance'
/** Empataba, y lo que pasó cuando se enfrentaron las separó. */
 | 'directo'
/** Empataba y no había forma de separarlas: lo decidió el organizador. */
 | 'manual'
/** Empataba y nadie lo ha resuelto todavía. El puesto NO es deportivo. */
 | 'sin_resolver'
/**
 * Empata, pero todavía le quedan partidos por jugar.
 *
 * ► NO ES UN EMPATE SIN RESOLVER, Y CONFUNDIRLOS ERA EL FALLO
 *   Recién sorteado el grupo, las ocho parejas están a balance 0 y no se ha
 *   enfrentado ninguna. Formalmente eso es un bloque empatado que el
 *   reglamento no separa, así que la tabla salía con las ocho en rojo y
 *   "empate sin resolver" antes de que se jugara un solo punto.
 *
 *   Es verdad y es inútil. Un empate solo es un PROBLEMA cuando ya no se
 *   puede deshacer solo — es decir, cuando las implicadas jugaron todo lo
 *   suyo y su balance ya no va a cambiar. Antes de eso el puesto es
 *   provisional, que es otra cosa: no hay nada que resolver ni nada que
 *   decidirle al organizador.
 */
 | 'provisional';
interface FilaTablaExpres {
    pairId: string;
    posicion: number;
    jugados: number;
    gamesFavor: number;
    gamesContra: number;
    /** gamesFavor − gamesContra. La columna que ordena. */
    balance: number;
    criterio: CriterioExpres;
    /**
     * True cuando sigue empatada con otra(s) y el motor no puede separarlas.
     * El puesto que se publica es estable pero arbitrario: sale del id.
     */
    empateSinResolver: boolean;
    /** Con quién sigue empatada. Vacío si su puesto está decidido. */
    empatadaCon: string[];
}
interface EmpateExpres {
    balance: number;
    pairIds: string[];
    posiciones: number[];
    /** El empate cruza la línea de clasificación: decide quién juega cuartos. */
    decideClasificacion: boolean;
    motivo: 
    /** No se enfrentaron todas entre sí: la mini-tabla no significaría nada. */
    'no_se_enfrentaron'
    /** Se enfrentaron y el resultado entre ellas tampoco las separa. */
     | 'directo_no_separa';
}
interface TablaExpres {
    grupo: string;
    clasifican: number;
    filas: FilaTablaExpres[];
    /**
     * Todas han jugado el mismo número de partidos, así que los balances se
     * pueden comparar. En mitad del torneo es normal que sea false.
     */
    comparable: boolean;
    /** Todos los partidos del grupo están capturados. */
    grupoTerminado: boolean;
    empatesSinResolver: EmpateExpres[];
    /**
     * El grupo terminó y hay un empate sin resolver que decide quién pasa a
     * cuartos. ES LA SEÑAL PARA PEDIRLE AL ORGANIZADOR QUE DECIDA: mientras sea
     * true, el cuadro no se puede sembrar sin inventarse un orden.
     */
    bloqueaClasificacion: boolean;
}
interface EntradaTablaExpres {
    /** Etiqueta del grupo, solo para poder identificarlo en la salida. */
    grupo?: string;
    pairIds: readonly string[];
    /** Todos los partidos del grupo, jugados o no. */
    resultados: readonly ResultadoSuma6[];
    /** Por defecto CLASIFICAN_POR_GRUPO (4). */
    clasifican?: number;
    /**
     * El orden que el ORGANIZADOR decidió para un empate que el reglamento no
     * separa. `pairId -> 1, 2, 3…`.
     *
     * Solo se aplica a un bloque que sigue siendo un empate irresoluble Y cuyas
     * parejas son exactamente las que traen valor —la misma regla que
     * `group_standings.desempate_manual` (migración 064)—. Si se corrige un
     * resultado y el empate desaparece o cambia de miembros, el dato se ignora
     * solo: un orden viejo no puede reordenar una tabla que sí está decidida.
     */
    ordenManual?: Record<string, number>;
}
/**
 * Calcula la tabla de un grupo de exprés.
 *
 * El orden final es: balance → enfrentamiento directo (si existe y separa) →
 * decisión del organizador → sin resolver. No hay más criterios, y el
 * comentario de cabecera explica por qué no puede haberlos.
 */
declare function computeTablaExpres(entrada: EntradaTablaExpres): TablaExpres;

/**
 * Los tres estados que existen en un exprés.
 *
 * Es un subconjunto del enum `public.clinch_status` a propósito:
 * 'repechage_pending' no tiene sentido sin repesca, y dejarlo disponible
 * invitaría a producirlo. El tipo se importa para que sigan siendo gemelos: si
 * alguien renombra un valor en la base, esto deja de compilar.
 */
type EstadoClinchExpres = Extract<ClinchStatus, 'clinched' | 'alive' | 'eliminated'>;
interface ClinchExpresResult {
    pairId: string;
    estado: EstadoClinchExpres;
    balance: number;
    pendientes: number;
    /** Mejor y peor balance final alcanzable: `balance ± 6 × pendientes`. */
    balanceMaximo: number;
    balanceMinimo: number;
    /** Partidos que todavía pueden cambiar su suerte. Vacío si ya está decidida. */
    dependeDe: string[];
    /**
     * La respuesta salió de cotas y no de enumerar todos los escenarios.
     * Sigue siendo segura: solo puede pecar de prudente.
     */
    aproximado: boolean;
}
interface EntradaClinchExpres {
    pairIds: readonly string[];
    /** Todos los partidos del grupo, jugados o no. */
    resultados: readonly ResultadoSuma6[];
    /** Por defecto CLASIFICAN_POR_GRUPO (4). */
    clasifican?: number;
}
/**
 * Estado de clasificación de cada pareja de UN grupo.
 *
 *   clinched   — está dentro en todos los escenarios posibles.
 *   alive      — todavía puede entrar en alguno.
 *   eliminated — no puede entrar en ninguno. Y solo entonces.
 */
declare function computeClinchExpres(entrada: EntradaClinchExpres): ClinchExpresResult[];

/**
 * Una fila de `group_standings` tal como queda tras la captura.
 *
 * LAS COLUMNAS DEL TORNEO LARGO VAN A CERO, Y VAN EXPLÍCITAS.
 *   `won`, `lost`, `setsWon`, `setsLost` y `points` existen en la tabla desde
 *   la migración 001 y en un exprés no significan nada: no hay victorias que
 *   contar ni sets que ganar. Se escriben en 0 a propósito en vez de dejarlas
 *   como estaban, porque un valor viejo de una captura anterior se leería como
 *   un dato y no como un residuo. La pantalla de exprés no las muestra.
 */
interface FilaStandingExpres {
    pairId: string;
    played: number;
    gamesWon: number;
    gamesLost: number;
    /** gamesWon − gamesLost. En la base es columna generada; aquí va para poder verificarlo. */
    balance: number;
    position: number;
    clinchStatus: EstadoClinchExpres;
    won: 0;
    lost: 0;
    setsWon: 0;
    setsLost: 0;
    points: 0;
}
interface CapturaExpres {
    /** Lo que hay que escribir en `matches`. */
    partido: {
        matchId: string;
        /** 'finished' al capturar, 'scheduled' al borrar el marcador. */
        status: 'finished' | 'scheduled';
        /**
         * SIEMPRE null. No es que falte: es que un suma 6 no tiene ganador. Lo que
         * dice que el partido acabó es `status` — ver la migración 075.
         */
        winnerPairId: null;
        formato: 'suma_6';
    };
    /** La fila de `match_sets`. null cuando se está borrando el marcador. */
    marcador: {
        matchId: string;
        setNumber: 1;
        gamesA: number;
        gamesB: number;
        isSuperTiebreak: false;
    } | null;
    /** Una fila por pareja del grupo. Se escriben TODAS: un balance mueve la tabla entera. */
    standings: FilaStandingExpres[];
    /** La tabla resultante, para pintarla sin recalcular. */
    tabla: TablaExpres;
    clinch: ClinchExpresResult[];
}
interface EntradaCapturaExpres {
    grupo?: GrupoId | string;
    pairIds: readonly string[];
    /** Todos los partidos del grupo, tal como están ANTES de esta captura. */
    resultados: readonly ResultadoSuma6[];
    /** El partido que se captura. Tiene que estar en `resultados`. */
    matchId: string;
    /** Games de la pareja A. null en los dos para BORRAR el marcador. */
    gamesA: number | null;
    gamesB: number | null;
    clasifican?: number;
    ordenManual?: Record<string, number>;
}
/**
 * Aplica un marcador de suma 6 y devuelve todo lo que hay que persistir.
 *
 * No escribe nada. Lanza si el marcador o el partido no son válidos: en una
 * captura, un dato que no cuadra es un error del juez que hay que enseñarle,
 * no algo que corregir por lo bajo.
 */
declare function prepararCapturaExpres(entrada: EntradaCapturaExpres): CapturaExpres;
/**
 * Cuántos partidos del grupo faltan por capturar.
 *
 * La pantalla del juez lo necesita para saber cuándo enseñar el cierre del
 * grupo, y la del organizador para saber cuándo puede sembrar el cuadro.
 */
declare function partidosPendientes(resultados: readonly ResultadoSuma6[]): number;

type ZonaExpres = 'comodo' | 'ajustado' | 'limite' | 'no_cabe';
type EtapaExpres = 'group' | 'quarter' | 'semi' | 'final';
interface VentanaExpres {
    /** 'HH:MM'. */
    desde: string;
    hasta: string;
}
/** Minutos a los que se PLANIFICA cada etapa. Gemelo de `expres_etapa.minutos`. */
interface MinutosPorEtapa {
    group: number;
    quarter: number;
    semi: number;
    final: number;
}
declare const MINUTOS_ESTANDAR: MinutosPorEtapa;
interface FranjaPlanificada {
    orden: number;
    etapa: EtapaExpres;
    /** Solo en la fase de grupos. */
    grupo?: GrupoId;
    ronda?: number;
    partidos: number;
    /** Tandas en que se parte la franja por falta de canchas. 1 = cabe entera. */
    tandas: number;
    desde: string;
    hasta: string;
    minutos: number;
}
interface PlanExpres {
    cupo: number;
    tamanoGrupos: {
        A: number;
        B: number;
    };
    partidosPorPareja: number;
    canchas: number;
    /** Canchas para meter una ronda entera en una franja: la mitad del grupo mayor. */
    canchasNecesarias: number;
    franjas: FranjaPlanificada[];
    inicio: string;
    /** Hora de fin según el plan. */
    fin: string;
    /** Hora de fin si todo se retrasa lo que se retrasa siempre. */
    finRealista: string;
    /** A qué hora acaba la fase de grupos: quien no clasifica se va a esa hora. */
    finDeGrupos: string;
    minutosTotales: number;
    minutosDisponibles: number;
    holguraMinutos: number;
    ocupacion: number;
    zona: ZonaExpres;
    /** Lo que juega una pareja que no clasifica. La promesa del cartel. */
    minutosJugando: number;
    /** Lo que juega una que llega a la final. */
    minutosJugandoFinalista: number;
    /** El K más alto que cabe en esta ventana con estas canchas. null si no cabe ni 1. */
    partidosMaximosQueCaben: number | null;
    avisos: string[];
}
interface EntradaPlanExpres {
    cupo: number;
    /** Por defecto PARTIDOS_POR_PAREJA (5). */
    partidosPorPareja?: number;
    canchas: number;
    ventana: VentanaExpres;
    /** Por defecto MINUTOS_ESTANDAR. */
    minutos?: Partial<MinutosPorEtapa>;
    /** Por defecto MARGEN_CIERRE_EXPRES. */
    margenCierreMin?: number;
}
/**
 * Arma el horario completo de un exprés y dice si cabe.
 *
 * Las franjas de grupo se alternan A, B, A, B… porque mientras un grupo juega
 * el otro descansa. Como los dos tienen el MISMO número de rondas —siempre K,
 * sin importar cuántas parejas tenga cada uno— la alternancia sale sin huecos.
 */
declare function planificarExpres(entrada: EntradaPlanExpres): PlanExpres;

/**
 * RALLY · Cómo se juega cada partido de un exprés, en reglas de marcador
 *
 * ► EL BUG
 *   La captura del cuadro de un exprés pedía DOS SETS y ofrecía un tercero. Un
 *   cuarto de exprés es UN SET: se juega, lo gana quien lo gane, y a la
 *   siguiente ronda. El juez veía dos casillas vacías, tecleaba 6-4 y el botón
 *   seguía apagado diciéndole que faltaba el segundo set — un set que nadie iba
 *   a jugar. La pantalla usaba `scoreConfigDelTorneo`, que es la regla del
 *   TORNEO LARGO (mejor de 3 con súper muerte).
 *
 * ► EL FORMATO NO ES DEL TORNEO, ES DE LA ETAPA
 *   En un exprés cada etapa se juega distinto y así está guardado: los grupos a
 *   6 games sin ganador, cuartos y semis a un set, y la final como la eligió el
 *   organizador al crearlo. Está en `expres_etapa.formato` y el trigger de la
 *   migración 088 lo copia a `matches.formato`, así que cada partido lleva
 *   encima cómo se juega — no hay que deducirlo del stage ni preguntarlo aparte.
 *
 * ► EL PUNTO DE ORO NO SE VE EN EL MARCADOR
 *   `set_oro` y `set_star_point` valen lo mismo AQUÍ: los dos son un set a 6
 *   games, y lo que cambia es cómo se resuelve el deuce —un punto en vez de
 *   ventajas—, que no deja rastro en los números. 6-4 es 6-4 con ventajas y con
 *   punto de oro. Se distinguen en el nombre porque el organizador las nombra
 *   distinto por el micrófono, no porque el motor tenga que validarlas distinto.
 *
 * ► LA SÚPER MUERTE SIGUE SALIENDO DEL TORNEO
 *   `dos_sets_oro` sí tiene set decisivo, y a cuántos puntos se juega es un dato
 *   del torneo (`tercer_set_puntos`), no un 10 escondido aquí. Por eso la
 *   función recibe la configuración del torneo como base en vez de fabricarla:
 *   misma regla que `scoreConfigDelTorneo`, ningún default silencioso.
 */

/** `formato_partido` — el enum de la base (migración 074). */
type FormatoPartido = 'suma_6' | 'set_oro' | 'dos_sets_oro' | 'set_star_point';
/** Los formatos que se capturan con sets. `suma_6` no es uno de ellos. */
type FormatoDeCuadro = Exclude<FormatoPartido, 'suma_6'>;
declare function esFormatoDeCuadro(f: string): f is FormatoDeCuadro;
/**
 * Las reglas de marcador de un partido del cuadro exprés.
 *
 * `base` es la configuración del torneo (`scoreConfigDelTorneo`): de ahí sale a
 * cuántos puntos va la súper muerte, que es lo único que este módulo no sabe.
 *
 * Lanza con `suma_6`: un partido de grupos no tiene ganador y no pasa por
 * `validateScore` — tiene su propio motor (`validarMarcadorSuma6`). Devolver
 * aquí una configuración cualquiera lo dejaría validarse como un partido
 * normal, que es justo el error que este módulo existe para evitar.
 */
declare function scoreConfigDeFormato(formato: FormatoPartido, base?: ScoreConfig): ScoreConfig;
/** Cuántos sets se teclean de entrada. Es lo que decide cuántas filas pinta la captura. */
declare function setsDeEntrada(cfg: ScoreConfig): number;

/** Generador determinista a partir de una semilla de texto. */
declare function generadorDeSemilla(semilla: string): () => number;
interface RepartoGrupos {
    A: string[];
    B: string[];
}
/**
 * Tamaños de los dos grupos para un cupo dado. AMBOS PARES, siempre.
 *
 * ► POR QUÉ PARES, Y NO ES UNA MANÍA
 *   Cada pareja juega 5 partidos, que es impar. La suma de partidos de un
 *   grupo es entonces `tamaño × 5`, y como cada partido cuenta por dos, ese
 *   producto tiene que ser par. Con 5 impar, el tamaño tiene que ser par.
 *   Un grupo de 7 con 5 partidos por pareja no es difícil de calcular: no
 *   existe.
 *
 * ► CONSECUENCIA: EL CUPO TIENE QUE SER PAR
 *   12 → 6+6 · 14 → 8+6 · 16 → 8+8 · 18 → 10+8 · 20 → 10+10.
 *   Con 13 inscritas no hay reparto posible, y la salida no es inventarse uno
 *   sino que el organizador cierre en 12. Cuando los grupos salen desiguales,
 *   A es el grande: no significa nada, pero hay que fijarlo para que el
 *   fixture sea reproducible.
 */
declare function tamanosDeGrupo(cupo: number): {
    A: number;
    B: number;
};
/**
 * Reparte las parejas en los dos grupos usando la semilla.
 *
 * Baraja la lista completa y corta: las primeras al A, el resto al B. El orden
 * dentro de cada grupo también sale del sorteo, y es el que consume el círculo
 * para armar las rondas — así que dos semillas distintas no solo cambian quién
 * está con quién, cambian el calendario entero.
 *
 * ► SE ORDENA LA LISTA ANTES DE BARAJAR, Y ESO NO ES REDUNDANTE.
 *   Fisher-Yates depende del orden de entrada tanto como de la semilla. Sin
 *   este paso, la misma semilla y las mismas parejas dan sorteos DISTINTOS
 *   según cómo venga la lista —el `order by` de la consulta, una inscripción
 *   corregida, una pareja dada de baja y vuelta a alta—, y entonces la semilla
 *   guardada ya no reproduce nada: para auditar el sorteo habría que conservar
 *   también el orden exacto en que se leyeron las filas aquel día.
 *
 *   Ordenando primero, el sorteo pasa a ser función del CONJUNTO de parejas y
 *   la semilla. Nada más. Eso es lo que se puede prometer y volver a enseñar.
 */
declare function repartirGrupos(pairIds: readonly string[], semilla: string): RepartoGrupos;

interface EntradaFixtureExpres {
    /** Parejas inscritas al cerrar el cupo. El orden da igual: se sortea. */
    pairIds: readonly string[];
    /**
     * Semilla del sorteo. OBLIGATORIA, sin valor por defecto.
     *
     * Un default aquí —la fecha, el id del torneo, cualquier cosa— convierte un
     * dato que falta en un sorteo que nadie decidió y que además parece
     * legítimo. Que reviente con el nombre del campo.
     */
    semilla: string;
    /** Partidos por pareja. Por defecto PARTIDOS_POR_PAREJA (5). */
    partidosPorPareja?: number;
}
/**
 * Arma la fase de grupos completa de un exprés.
 *
 * QUÉ GARANTIZA, Y LO COMPRUEBA ANTES DE DEVOLVER
 *   · Todas las parejas juegan exactamente el mismo número de partidos.
 *   · Nadie repite rival.
 *   · Dentro de una ronda, nadie juega dos veces.
 *   · Las rondas de los dos grupos se alternan sin huecos: A1, B1, A2, B2, …
 *
 * QUÉ NO HACE
 *   Horas, canchas concretas y cuadro eliminatorio. Esto devuelve el ORDEN de
 *   juego; ponerle reloj es del planificador.
 */
declare function generarFixtureExpres(entrada: EntradaFixtureExpres): FixtureExpres;

export { type AdvanceResult, type Bloque, type BloqueDisponible, type BracketMatch, CLASIFICAN_POR_GRUPO, CUPO_MINIMO, type Calendario, type CalendarioGrupos, type CapturaExpres, type CategoriaCuadro, type ClinchExpresResult, type ClinchGroup, type ClinchInput, type ClinchResult, type ClinchStatus, type CodigoProblema, type Conflicto, type CrearPartido, type CriterioDesempate, type CriterioExpres, DEFAULT_SCORE_CONFIG, DEFAULT_STANDINGS_CONFIG, type DesempateAplicado, type DiagnosticoScheduler, type Division, type EmpateExpres, type EntradaCapturaExpres, type EntradaScheduler, type EntradaSchedulerGrupos, type EntradaValidacion, type EstadoClinchExpres, type EstadoDeSet, type EtapaEliminatoria, type FilaDeGrupo, type FilaStandingExpres, type FilaTablaExpres, type Fixture, type FixtureExpres, type FormatPlan, type FormatType, type FormatoDeCuadro, type FormatoDeSet, type FormatoPartido, type FranjaExpres, type FranjaOcupacion, type FranjaPlanificada, GAMES_POR_PARTIDO, GRUPO_MINIMO, type GlickoRating, type GrupoAProgramar, type GrupoAValidar, type GrupoExpres, type GrupoId, type KnockoutStart, MARCADORES_SUMA6, MINUTOS_ESTANDAR, type MatchResultInput, type MatchStage, type MinutosPorEtapa, type MotivoConflicto, type MotivoSinProgramar, type Movimiento, type NextMatch, type Ocupacion, type OcupacionBloque, PAREJAS_POR_GRUPO, PARTIDOS_POR_CARRIL, PARTIDOS_POR_PAREJA, type PartidoCuadro, type PartidoDeEntrada, type PartidoDeGrupo, type PartidoEnCalendario, type PartidoExpres, type PartidoProgramado, type PlanAvance, type PlanExpres, type PlanOk, type PlanRechazo, type PlayerTournamentResult, type Problema, type QualifierStanding, type RankingRules, type ReapuntarPartido, type ResultadoMovimiento, type ResultadoSuma6, type ReticulaBloques, type RoundMatch, type RoundReached, type ScoreConfig, type SeedInput, type SeedingResult, type SetScore, type Stage, type StandingRow, type StandingsConfig, type StandingsDetalle, type TablaExpres, type Tier, type Validacion, type ValidatedScore, type VentanaDia as VentanaBloques, type VentanaExpres, type ZonaExpres, advanceBracket, bloqueDeGrupo, bloquesDisponibles, carrilesDeGrupo, clasificarSet, combineOpponentPair, computeClinch, computeClinchExpres, computeFormat, computeRankingPoints, computeSeeding, computeStandings, computeStandingsDetalle, computeTablaExpres, cupoDeBloque, divisionForRating, esFormatoDeCuadro, esMarcadorSuma6, estadoDeSet, etapaDeRonda, etiquetaDeRonda, generadorDeSemilla, generarBloques, generarFixtureExpres, generateRoundRobin, huellaDeGrupo, partidosPendientes, planAvance, planificarExpres, prepararCapturaExpres, programarEliminatorias, programarGrupos, repartirGrupos, repartirPorBloque, scoreConfigDeFormato, selectQualifiers, setsDeEntrada, stageForBracketSize, tamanosDeGrupo, thirdPlaceFromSemis, tierEfectivo, updateRating, validarMarcadorSuma6, validarMovimiento, validarSiembra, validateParcial, validateScore };
