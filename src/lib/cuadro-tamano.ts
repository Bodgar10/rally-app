/**
 * RALLY · De qué depende el tamaño del cuadro
 *
 * EL CASO QUE LO DESTAPÓ
 *   La 3.ª Varonil salía con ronda de 32 y nadie sabía por qué. Son 30 parejas
 *   en 10 grupos con 2 que pasan por grupo: 20 clasificados. Y 20 no caben en
 *   16, así que el cuadro abre a 32 con 12 byes. En padel una ronda de 32 no se
 *   ve, y el organizador la encontró YA SEMBRADA, sin ninguna pantalla que le
 *   hubiera dicho que ese número salía de multiplicar los suyos.
 *
 *   La cuenta no es difícil; simplemente no estaba escrita en ningún sitio:
 *
 *       clasificados = grupos × pasan por grupo + repescados
 *       cuadro       = la menor potencia de 2 que contenga a los clasificados
 *
 * EL PISO NO ES UNA PREFERENCIA, ES ARITMÉTICA
 *   Bajar los repescados a cero no arregla la 3.ª Varonil: aunque no pase
 *   ningún segundo, siguen pasando los 10 primeros de grupo, y 10 no caben en
 *   8. Con 10 grupos el cuadro no baja de octavos POR MÁS que se toquen las
 *   perillas — para bajarlo de verdad hay que armar menos grupos, que es una
 *   decisión de otra pantalla.
 *
 *   Es la parte que más confunde, porque las dos perillas visibles se quedan
 *   sin efecto en el mínimo y parece que la pantalla no responde.
 *
 * NO SE FUERZA NADA A POTENCIA DE 2
 *   Los byes son normales en padel. Esto solo CUENTA y lo dice; no cambia el
 *   motor de formato ni empuja al organizador a un número "redondo".
 *
 * Módulo puro y aparte para poder probarlo, y para que las dos pantallas que
 * lo enseñan —la de cerrar inscripciones, donde se configura, y la de grupos,
 * donde se sufre— digan exactamente lo mismo.
 */

import type { KnockoutStart } from './engine/types';

/**
 * Nombre de cada ronda de arranque.
 *
 * `r32` es el tope del vocabulario del motor (ver `KnockoutStart`): un cuadro
 * de 64 se seguiría llamando así. No se amplía aquí a propósito — sería una
 * palabra que el motor no conoce, y en padel no se llega.
 */
export const NOMBRE_RONDA: Record<KnockoutStart, string> = {
  final:   'final directa',
  semi:    'semifinales',
  quarter: 'cuartos de final',
  r16:     'octavos',
  r32:     'ronda de 32',
};

/** La menor potencia de 2 que contiene a n. Mínimo 2: un cuadro es una final. */
export function pow2AlMenos(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}

/**
 * Ronda en la que arranca un cuadro de ese tamaño.
 *
 * Mismos cortes que `knockoutStartForBracket` del motor de formato, a
 * propósito: si las dos discreparan, la pantalla anunciaría una ronda y la
 * siembra crearía otra.
 */
export function rondaDeCuadro(bracketSize: number): KnockoutStart {
  if (bracketSize <= 2) return 'final';
  if (bracketSize <= 4) return 'semi';
  if (bracketSize <= 8) return 'quarter';
  if (bracketSize <= 16) return 'r16';
  return 'r32';
}

export interface Cuadro {
  clasificados: number;
  bracketSize: number;
  ronda: KnockoutStart;
  /** 'octavos', 'ronda de 32'… */
  nombreRonda: string;
  /** Parejas que pasan sin jugar la primera ronda. */
  byes: number;
  /** Partidos de la primera ronda. */
  primeraRonda: number;
}

/** La cuenta completa, a partir de las tres perillas. */
export function cuadroDe(grupos: number, pasanPorGrupo: number, repescados: number): Cuadro {
  const clasificados = Math.max(0, grupos * pasanPorGrupo + repescados);
  const bracketSize = pow2AlMenos(clasificados);
  const ronda = rondaDeCuadro(bracketSize);
  return {
    clasificados,
    bracketSize,
    ronda,
    nombreRonda: NOMBRE_RONDA[ronda],
    byes: Math.max(0, bracketSize - clasificados),
    // Con menos clasificados que media llave no hay primera ronda que jugar.
    primeraRonda: Math.max(0, clasificados - bracketSize / 2),
  };
}

/**
 * El cuadro MÁS PEQUEÑO posible sin cambiar el número de grupos.
 *
 * De cada grupo pasa al menos su primero —si no, el grupo no habría servido de
 * nada—, así que el suelo es `grupos` clasificados. Bajar de ahí exige armar
 * menos grupos, no mover estas perillas.
 */
export function pisoDeCuadro(grupos: number): Cuadro {
  return cuadroDe(grupos, 1, 0);
}

/** ¿La configuración actual ya está en el mínimo que permiten sus grupos? */
export function estaEnElPiso(grupos: number, pasanPorGrupo: number, repescados: number): boolean {
  return cuadroDe(grupos, pasanPorGrupo, repescados).bracketSize
    === pisoDeCuadro(grupos).bracketSize;
}

/**
 * La frase que explica el tamaño: de dónde sale y hasta dónde puede bajar.
 *
 * Devuelve `null` cuando no hay nada que explicar (sin grupos, o un solo grupo
 * donde no hay cuadro que dimensionar).
 */
export function explicarCuadro(
  grupos: number,
  pasanPorGrupo: number,
  repescados: number,
): string | null {
  if (grupos <= 0 || pasanPorGrupo <= 0) return null;

  const actual = cuadroDe(grupos, pasanPorGrupo, repescados);
  const piso = pisoDeCuadro(grupos);

  // De dónde sale el número. La multiplicación, escrita.
  const partes = [`${grupos} ${grupos === 1 ? 'grupo' : 'grupos'} × ${pasanPorGrupo}`];
  if (repescados > 0) partes.push(`${repescados} repescad${repescados === 1 ? 'o' : 'os'}`);
  const cuenta = `${partes.join(' + ')} = ${actual.clasificados} clasificados`;

  if (actual.bracketSize === piso.bracketSize) {
    // Ya está en el suelo: decirlo evita que se sigan moviendo las perillas
    // esperando un cuadro más chico que no puede existir.
    return `${cuenta}. Es el cuadro más chico posible con ${grupos} ` +
      `${grupos === 1 ? 'grupo' : 'grupos'}: aunque no pase ningún segundo, ` +
      `${grupos === 1 ? 'el primero entra' : `los ${grupos} primeros no caben en ${piso.bracketSize / 2}`}.`;
  }

  return `${cuenta}, que no caben en ${actual.bracketSize / 2}: el cuadro abre en ` +
    `${actual.nombreRonda} con ${actual.byes} ${actual.byes === 1 ? 'bye' : 'byes'}. ` +
    `Lo más abajo que llega con ${grupos} grupos es ${piso.nombreRonda}; ` +
    `para menos que eso hay que armar menos grupos.`;
}
