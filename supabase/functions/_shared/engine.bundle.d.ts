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
 * Valida un marcador completo y deriva el ganador.
 * No persiste nada; solo dice si el marcador es legal y quién ganó.
 */
declare function validateScore(sets: SetScore[], config?: ScoreConfig): ValidatedScore;

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

export { type AdvanceResult, type Bloque, type BloqueDisponible, type BracketMatch, type Calendario, type CalendarioGrupos, type CategoriaCuadro, type ClinchResult, type ClinchStatus, type Conflicto, type CrearPartido, type DiagnosticoScheduler, type Division, type EntradaScheduler, type EntradaSchedulerGrupos, type EtapaEliminatoria, type Fixture, type FormatPlan, type FormatType, type FormatoDeSet, type FranjaOcupacion, type GlickoRating, type GrupoAProgramar, type KnockoutStart, type MatchResultInput, type MatchStage, type MotivoConflicto, type MotivoSinProgramar, type Movimiento, type NextMatch, type Ocupacion, type OcupacionBloque, PAREJAS_POR_GRUPO, PARTIDOS_POR_CARRIL, type PartidoCuadro, type PartidoDeEntrada, type PartidoDeGrupo, type PartidoEnCalendario, type PartidoProgramado, type PlanAvance, type PlanOk, type PlanRechazo, type PlayerTournamentResult, type QualifierStanding, type RankingRules, type ReapuntarPartido, type ResultadoMovimiento, type ReticulaBloques, type RoundMatch, type RoundReached, type ScoreConfig, type SeedInput, type SeedingResult, type SetScore, type Stage, type StandingRow, type StandingsConfig, type ValidatedScore, type VentanaDia as VentanaBloques, advanceBracket, bloqueDeGrupo, bloquesDisponibles, carrilesDeGrupo, clasificarSet, combineOpponentPair, computeClinch, computeFormat, computeRankingPoints, computeSeeding, computeStandings, cupoDeBloque, divisionForRating, etapaDeRonda, etiquetaDeRonda, generarBloques, generateRoundRobin, huellaDeGrupo, planAvance, programarEliminatorias, programarGrupos, repartirPorBloque, selectQualifiers, stageForBracketSize, thirdPlaceFromSemis, updateRating, validarMovimiento, validateScore };
