// src/lib/engine/expres/sorteo.ts
// El sorteo de grupos: quién va al A y quién al B, y en qué orden.
//
// ALEATORIO PARA EL ORGANIZADOR, DETERMINISTA PARA EL MOTOR
//
//   En un exprés los grupos se sortean: no se siembra por nivel, no se separan
//   cabezas de serie. Pero `Math.random()` aquí sería un error de los caros —
//   un fixture que cambia cada vez que se recalcula no se puede reproducir, no
//   se puede testear, y ante una reclamación ("¿por qué me tocó el grupo de la
//   muerte?") no hay nada que enseñar.
//
//   La salida es una SEMILLA guardada. El organizador la genera una vez —al
//   cerrar inscripciones—, se persiste junto al torneo, y a partir de ahí el
//   sorteo es una función pura de (parejas, semilla). Se puede recalcular mil
//   veces y sale idéntico, y se puede auditar: con la semilla y la lista,
//   cualquiera reproduce el sorteo entero.
//
//   Es la misma idea que ya se usa en `sortear_desempate` (migración 065): la
//   app decide, la base guarda la decisión, y el motor solo la aplica.
//
// EL ALGORITMO
//
//   cyrb128 convierte la semilla (texto) en cuatro enteros de 32 bits;
//   mulberry32 los convierte en una secuencia uniforme; Fisher-Yates baraja
//   con esa secuencia. Los tres son deterministas, sin dependencias y sin
//   estado global. No es criptografía y no pretende serlo: hace falta que el
//   sorteo sea imparcial y reproducible, no que sea impredecible para un
//   atacante.

import { GRUPO_MINIMO, type GrupoId } from './reglas';

/** Semilla (texto) → cuatro enteros de 32 bits. */
function cyrb128(texto: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < texto.length; i++) {
    const k = texto.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/** Generador uniforme en [0, 1) a partir de un estado de 32 bits. */
function mulberry32(estado: number): () => number {
  let a = estado;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generador determinista a partir de una semilla de texto. */
export function generadorDeSemilla(semilla: string): () => number {
  const [a] = cyrb128(semilla);
  return mulberry32(a);
}

/**
 * Fisher-Yates con el generador dado. No muta la entrada.
 *
 * Se recorre de atrás hacia delante porque es la única variante en la que cada
 * permutación sale con la misma probabilidad. La versión "intuitiva" que
 * recorre hacia delante e intercambia con cualquier posición está sesgada, y el
 * sesgo no se ve mirando un sorteo suelto.
 */
export function barajar<T>(lista: readonly T[], rnd: () => number): T[] {
  const out = [...lista];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export interface RepartoGrupos {
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
export function tamanosDeGrupo(cupo: number): { A: number; B: number } {
  let a = Math.ceil(cupo / 2);
  if (a % 2 !== 0) a += 1;
  const b = cupo - a;
  return { A: a, B: b };
}

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
export function repartirGrupos(pairIds: readonly string[], semilla: string): RepartoGrupos {
  const { A, B } = tamanosDeGrupo(pairIds.length);
  if (A < GRUPO_MINIMO || B < GRUPO_MINIMO) {
    throw new Error(
      `repartirGrupos: el cupo ${pairIds.length} daría grupos de ${A} y ${B}, y ` +
        `el mínimo es ${GRUPO_MINIMO} por grupo.`,
    );
  }
  const canonica = [...pairIds].sort();
  const barajadas = barajar(canonica, generadorDeSemilla(semilla));
  return { A: barajadas.slice(0, A), B: barajadas.slice(A) };
}

/** Los dos grupos, en orden de presentación. */
export const GRUPOS: readonly GrupoId[] = ['A', 'B'] as const;
