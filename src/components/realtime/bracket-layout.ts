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
  /**
   * Tamaño del cuadro, cuando se sabe.
   *
   * SIN ESTO, EL ANCHO DE LA PRIMERA RONDA SE DEDUCÍA DE LO QUE HUBIERA — y lo
   * que hay, en una categoría sin sembrar, son las filas del PLAN. El plan solo
   * reserva cancha para los cruces que se juegan, así que con byes tiene menos
   * filas que cruces tiene el cuadro: 3.ª Mixto, con 5 clasificados y 3 byes,
   * enseñaba UN cuartos en vez de cuatro, y de ahí para abajo todo salía mal.
   *
   * La forma del cuadro sale de los clasificados, no del horario.
   */
  bracketSize?: number,
  /**
   * En qué ronda arranca el cuadro, cuando se sabe.
   *
   * Va con `bracketSize` y sirve para el caso en que NO hay ni una fila: sin
   * esto, un cuadro sin sembrar y sin plan no tendría por dónde empezar y no se
   * pintaría nada.
   */
  etapaInicial?: EtapaCuadro,
): ColumnaCuadro<T>[] {
  const conPartidos = ORDEN_ETAPAS.filter((e) => (porEtapa[e]?.length ?? 0) > 0);
  if (conPartidos.length === 0 && !etapaInicial) return [];

  // Desde la primera ronda que existe —o la que diga la forma del cuadro, que
  // manda: lo que haya puede ser solo el plan, y el plan no cuenta los byes.
  const primera = etapaInicial ?? conPartidos.find((e) => CAMINO.includes(e));
  if (primera === undefined) {
    // Solo hay 3.er lugar (o algo raro): se pinta lo que haya, sin inventar.
    return conPartidos.map((etapa) => ({ etapa, partidos: porEtapa[etapa] ?? [], huecos: 0 }));
  }

  const desde = CAMINO.indexOf(primera);
  const columnas: ColumnaCuadro<T>[] = [];

  // Cuántos partidos tiene la ronda de la que venimos. La primera manda: si
  // arranca en cuartos con 4, la siguiente son 2 y la última 1.
  //
  // Con el tamaño del cuadro conocido manda ÉL: media llave son los cruces de
  // la primera ronda, byes incluidos. Lo que haya en `porEtapa` puede ser solo
  // el plan, que no cuenta los byes.
  let anchoPrevio = bracketSize
    ? Math.max(bracketSize / 2, (porEtapa[primera] ?? []).length)
    : (porEtapa[primera] ?? []).length;

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

// ───────────────────────────────────────────
// El cuadro ANTES de que exista
// ───────────────────────────────────────────

/**
 * SE SABE CUÁNDO Y DÓNDE MUCHO ANTES DE SABER QUIÉN.
 *
 * La pestaña de eliminatorias decía "El cuadro aún no está disponible. Se
 * generará al cerrar la fase de grupos", y eso solo es cierto a medias: lo que
 * no se sabe es QUIÉN juega. La hora y la cancha de todas las rondas están en
 * `match_schedule` desde que se programa el torneo, identificadas por
 * (category_id, stage, slot_index).
 *
 * Es justo el dato que el jugador necesita el viernes por la noche: si clasifica
 * juega octavos el domingo a las 10:00 en la Cancha 3. Sin eso se desvela sin
 * información, que es el problema que esta app viene a resolver.
 *
 * CÓMO SE EMPAREJAN PLAN Y PARTIDOS
 *   `matches` no tiene `slot_index` y `match_schedule` no tiene ids de partido,
 *   así que se emparejan POSICIONALMENTE dentro de cada ronda: partidos
 *   ordenados por `round_label` contra slots ordenados por `slot_index`. Es el
 *   mismo criterio con el que `schedule-knockout` vuelca el plan sobre las
 *   filas reales — si aquí se emparejara de otra forma, la hora que enseña la
 *   pantalla no sería la que se guardó.
 *
 *   Los slots que sobran son rondas todavía sin materializar: salen como celdas
 *   con hora y cancha, y sin parejas.
 */

/** Una fila de `match_schedule`, con lo mínimo para colocarla. */
export interface SlotPlanificado {
  stage: EtapaCuadro;
  slotIndex: number;
  scheduledAt: string | null;
  courtLabel: string | null;
}

/** Lo que necesita el layout de un partido para fusionarse con el plan. */
export interface PartidoFusionable extends PartidoDeCuadro {
  id: string;
  roundLabel: string | null;
  scheduledAt: string | null;
  courtLabel?: string | null;
}

/**
 * Añade al cuadro las celdas que solo existen en el plan.
 *
 * Los partidos reales mandan: si una ronda ya está materializada, su hora sale
 * de `matches` —que es donde queda un cambio hecho a mano— y el plan solo
 * rellena lo que falta. El plan nunca pisa un partido existente.
 */
export function fusionarConElPlan<T extends PartidoFusionable>(
  partidos: T[],
  plan: SlotPlanificado[],
  /** Cómo fabricar una celda que aún no tiene fila en `matches`. */
  celdaFutura: (slot: SlotPlanificado, indice: number) => T,
): T[] {
  const salida = [...partidos];

  const porEtapa = new Map<EtapaCuadro, T[]>();
  for (const p of partidos) {
    const ya = porEtapa.get(p.stage);
    if (ya) ya.push(p);
    else porEtapa.set(p.stage, [p]);
  }

  const planPorEtapa = new Map<EtapaCuadro, SlotPlanificado[]>();
  for (const s of plan) {
    const ya = planPorEtapa.get(s.stage);
    if (ya) ya.push(s);
    else planPorEtapa.set(s.stage, [s]);
  }

  for (const [etapa, slots] of planPorEtapa) {
    const reales = (porEtapa.get(etapa) ?? [])
      // `round_label` lleva zero-padding justamente para que el orden
      // lexicográfico coincida con el numérico (ver generate-bracket).
      .sort((a, b) => (a.roundLabel ?? '').localeCompare(b.roundLabel ?? ''));
    const ordenados = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);

    // Los que sobran del plan: rondas que aún no tienen fila en `matches`.
    for (let i = reales.length; i < ordenados.length; i++) {
      salida.push(celdaFutura(ordenados[i], i));
    }
  }

  return salida;
}
