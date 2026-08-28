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
