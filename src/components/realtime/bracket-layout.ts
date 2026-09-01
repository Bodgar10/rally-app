/**
 * RALLY · Estructura de un cuadro eliminatorio
 *
 * La parte SIN React de LiveBracket: qué rondas hay, en qué orden se pintan y
 * qué dice una celda que todavía no tiene parejas.
 *
 * POR QUÉ VIVE APARTE
 *   El proyecto no tiene infraestructura para tests de render —ni
 *   @testing-library/react-native ni react-test-renderer, y `testMatch` solo
 *   recoge `.test.ts`—, así que un componente entero es intesteable aquí. Lo
 *   que sí se puede fijar es su lógica, y es donde de verdad estaba el riesgo:
 *   el orden de las columnas, el filtrado de rondas vacías y el criterio de
 *   "pendiente". Sacarlo permite cubrirlo antes de tocar el componente.
 */

export type EtapaCuadro =
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter'
  | 'semi'
  | 'final'
  | 'third_place';

/** Izquierda a derecha, como se lee un cuadro. */
export const ORDEN_ETAPAS: EtapaCuadro[] = [
  'round_of_32',
  'round_of_16',
  'quarter',
  'semi',
  'final',
  'third_place',
];

export const ETIQUETA_ETAPA: Record<EtapaCuadro, string> = {
  round_of_32: 'Octavos (R32)',
  round_of_16: 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semifinal',
  final: 'Final',
  third_place: '3er Lugar',
};

/** Lo mínimo que necesita el layout. Cualquier partido con esta forma vale. */
export interface PartidoDeCuadro {
  stage: EtapaCuadro;
  pairAId: string | null;
  pairBId: string | null;
}

/** Agrupa por ronda conservando el orden de entrada dentro de cada una. */
export function agruparPorEtapa<T extends PartidoDeCuadro>(
  partidos: T[],
): Partial<Record<EtapaCuadro, T[]>> {
  const salida: Partial<Record<EtapaCuadro, T[]>> = {};
  for (const p of partidos) {
    const ya = salida[p.stage];
    if (ya) ya.push(p);
    else salida[p.stage] = [p];
  }
  return salida;
}

/**
 * Las rondas que se pintan: las que tienen partidos, en orden de cuadro.
 *
 * Filtrar las vacías importa — un cuadro de 8 no tiene ronda de 32, y una
 * columna vacía a la izquierda haría leer mal el tamaño del cuadro.
 */
export function etapasActivas(
  porEtapa: Partial<Record<EtapaCuadro, unknown[]>>,
): EtapaCuadro[] {
  return ORDEN_ETAPAS.filter((e) => (porEtapa[e]?.length ?? 0) > 0);
}

/** Un hueco del cuadro sin las dos parejas todavía. */
export function estaPendiente(p: PartidoDeCuadro): boolean {
  return !p.pairAId || !p.pairBId;
}

/**
 * Qué se escribe en un hueco pendiente.
 *
 * "Por definir" no decía nada: el organizador que abre el calendario antes de
 * jugar los grupos ve el cuadro entero así y no sabe si falta un dato o si el
 * sistema no lo sabe todavía. La primera ronda sale de los grupos; las demás,
 * de la ronda anterior.
 */
export function textoPendiente(etapa: EtapaCuadro, esPrimeraRonda: boolean): string {
  if (etapa === 'third_place') return 'Se define en semifinales';
  return esPrimeraRonda ? 'Se define en la fase de grupos' : 'Se define en la ronda anterior';
}

// ───────────────────────────────────────────
// El cuadro entero, no solo lo ya jugado
// ───────────────────────────────────────────

/**
 * LAS RONDAS QUE FALTAN TAMBIÉN SON EL CUADRO.
 *
 * `generate-bracket` materializa filas en `matches` RONDA A RONDA: hasta que no
 * se juegan los cuartos no existen las semifinales, porque no se sabe quién las
 * juega. `etapasActivas` filtra las rondas sin partidos, así que el cuadro de la
 * 6.ª Varonil se pintaba con una sola columna —CUARTOS— y nada más.
 *
 * Y un cuadro que no enseña hacia dónde va no sirve para lo que sirve un cuadro.
 * Lo que se mira en un cuadro es justamente el camino: cuántas rondas quedan,
 * contra quién se cruzaría, dónde está la final.
 *
 * LAS RONDAS QUE FALTAN SE DEDUCEN, NO SE CONSULTAN
 *   Un cuadro se divide por dos en cada ronda: 4 cuartos → 2 semis → 1 final. No
 *   hace falta preguntarle a nadie cuántas quedan ni de qué tamaño, y deducirlo
 *   evita depender de que `match_schedule` esté escrito (que solo lo está si ya
 *   se programó el torneo).
 *
 * EL 3.er LUGAR NO SE INVENTA
 *   Es opcional por torneo (`tercer_lugar`), así que un cuadro sin él no debe
 *   mostrarlo. Si existe, existe como fila y se pinta; si no, no se supone.
 *   Mismo criterio para la ronda de 32: no se añade hacia atrás, solo hacia
 *   delante — hacia atrás no hay nada que deducir, esas rondas ya se jugaron.
 */

/** Una columna del cuadro: sus partidos reales, y cuántos huecos faltan. */
export interface ColumnaCuadro<T> {
  etapa: EtapaCuadro;
  /** Los partidos que ya existen en la base. Vacío en una ronda futura. */
  partidos: T[];
  /**
   * Celdas que todavía no tienen fila. En una ronda futura son todas; en una a
   * medias, las que faltan.
   */
  huecos: number;
}

/** El camino principal del cuadro, sin el 3.er lugar, que va aparte. */
const CAMINO: EtapaCuadro[] = ['round_of_32', 'round_of_16', 'quarter', 'semi', 'final'];

/**
 * Las columnas a pintar: desde donde arranca el cuadro hasta la final.
 *
 * Las rondas ya materializadas salen con sus partidos; las que faltan, con
 * tantos huecos como partidos tendrán — la mitad que la ronda anterior.
 */
export function columnasDelCuadro<T extends PartidoDeCuadro>(
  porEtapa: Partial<Record<EtapaCuadro, T[]>>,
): ColumnaCuadro<T>[] {
  const conPartidos = ORDEN_ETAPAS.filter((e) => (porEtapa[e]?.length ?? 0) > 0);
  if (conPartidos.length === 0) return [];

  // Desde la primera ronda que existe: hacia atrás no hay nada que deducir.
  const primera = conPartidos.find((e) => CAMINO.includes(e));
  if (primera === undefined) {
    // Solo hay 3.er lugar (o algo raro): se pinta lo que haya, sin inventar.
    return conPartidos.map((etapa) => ({ etapa, partidos: porEtapa[etapa] ?? [], huecos: 0 }));
  }

  const desde = CAMINO.indexOf(primera);
  const columnas: ColumnaCuadro<T>[] = [];

  // Cuántos partidos tiene la ronda de la que venimos. La primera manda: si
  // arranca en cuartos con 4, la siguiente son 2 y la última 1.
  let anchoPrevio = (porEtapa[primera] ?? []).length;

  for (let i = desde; i < CAMINO.length; i++) {
    const etapa = CAMINO[i];
    const reales = porEtapa[etapa] ?? [];
    const esperados = i === desde ? anchoPrevio : Math.max(1, Math.floor(anchoPrevio / 2));

    columnas.push({
      etapa,
      partidos: reales,
      huecos: Math.max(0, esperados - reales.length),
    });

    anchoPrevio = esperados;
    if (esperados <= 1) break;   // la final cierra el camino
  }

  // El 3.er lugar solo si existe de verdad. Va al final, como en el papel.
  const tercero = porEtapa.third_place ?? [];
  if (tercero.length > 0) {
    columnas.push({ etapa: 'third_place', partidos: tercero, huecos: 0 });
  }

  return columnas;
}
