/**
 * RALLY · La forma del cuadro antes de que exista
 *
 * EL SÍNTOMA
 *   3.ª Mixto —3 grupos, 1 por grupo + 2 repescados = 5 clasificados— enseñaba
 *   UN SOLO cruce de cuartos, sin semifinales ni final. El diagrama se estaba
 *   construyendo desde `match_schedule`, y el plan solo reserva cancha para los
 *   cruces QUE SE JUEGAN: un bye no ocupa pista ni horario. Con 5 clasificados
 *   en un cuadro de 8 hay 3 byes y un único partido de cuartos, así que el plan
 *   tenía una sola fila y el diagrama la copiaba.
 *
 * LA FORMA NO SALE DEL PLAN, SALE DE LOS CLASIFICADOS
 *   `cuadroDe` ya dice el tamaño y cuántos byes hay. Con eso se dibujan los
 *   cuatro cruces de cuartos, las dos semifinales y la final, existan o no en
 *   `match_schedule`. El plan pasa a ser lo que siempre debió ser: el relleno
 *   de hora y cancha donde lo haya.
 *
 * DÓNDE CAEN LOS BYES: SE PREGUNTA, NO SE DEDUCE
 *   La regla la tiene `computeSeeding`, que es la que siembra de verdad. Aquí se
 *   la llama con clasificados de mentira —rating descendente y cada uno de un
 *   grupo distinto, para que la evitación de rematches no mueva nada— y se lee
 *   qué cruces quedan con un lado vacío. Reimplementar la serpiente aquí sería
 *   tener dos versiones de la misma regla, y la segunda se desincronizaría el
 *   día que alguien tocara la primera.
 *
 *   Comprobado con la siembra real: 5 clasificados en cuadro de 8 dan
 *   `s1/— · s4/s5 · s2/— · s3/—`, o sea los byes para los tres MEJORES.
 *
 * A QUIÉN LE TOCAN: NO SE NOMBRA A NADIE
 *   El orden de siembra exacto no se conoce hasta que terminan los grupos, así
 *   que poner nombres sería inventar. Lo que sí es cierto desde el principio es
 *   la regla —los N mejores clasificados pasan directos—, y eso es justo lo que
 *   el jugador quiere saber: si le compensa pelear por el primer puesto.
 */

import { computeSeeding } from './engine/seeding';
import { cuadroDe, rondaDeCuadro, NOMBRE_RONDA } from './cuadro-tamano';

/** Un cruce de la primera ronda del cuadro. */
export interface CruceInicial {
  /** Posición dentro de la ronda, 0-based. */
  indice: number;
  /** Es un pase directo: no se juega. */
  esBye: boolean;
  /** Puesto de siembra que se lo lleva (1 = mejor clasificado). null si no es bye. */
  puesto: number | null;
}

export interface FormaDelCuadro {
  clasificados: number;
  bracketSize: number;
  byes: number;
  /** Los `bracketSize / 2` cruces de la primera ronda, byes incluidos. */
  cruces: CruceInicial[];
  /** "Los 3 mejores clasificados pasan directo a semifinales." null si no hay byes. */
  fraseDeByes: string | null;
}

/**
 * La forma del cuadro que sale de estas perillas.
 *
 * `null` cuando no hay cuadro que dibujar: sin grupos, sin clasificados, o con
 * menos de dos —`computeSeeding` exige dos y con uno no hay eliminatorias.
 */
export function formaDelCuadro(
  grupos: number,
  pasanPorGrupo: number,
  repescados: number,
): FormaDelCuadro | null {
  if (grupos <= 0 || pasanPorGrupo <= 0) return null;

  const c = cuadroDe(grupos, pasanPorGrupo, repescados);
  if (c.clasificados < 2) return null;

  // Clasificados de mentira: solo importa el ORDEN, que es lo que decide dónde
  // caen los huecos. Grupos distintos para que la evitación de rematches —que
  // sí mueve parejas— no entre en juego.
  const falsos = Array.from({ length: c.clasificados }, (_, i) => ({
    pairId: `s${i + 1}`,
    groupId: `g${i}`,
    rating: c.clasificados - i,
  }));

  let cruces: CruceInicial[];
  try {
    cruces = computeSeeding(falsos, c.bracketSize).matches.map((m, i) => {
      const vacioA = m.pairAId === null;
      const vacioB = m.pairBId === null;
      const ocupado = vacioA ? m.pairBId : m.pairAId;
      return {
        indice: i,
        esBye: vacioA || vacioB,
        // 's3' -> 3. Es el puesto de siembra, no el nombre de nadie.
        puesto: (vacioA || vacioB) && ocupado
          ? Number(ocupado.slice(1)) || null
          : null,
      };
    });
  } catch {
    return null;
  }

  return {
    clasificados: c.clasificados,
    bracketSize: c.bracketSize,
    byes: c.byes,
    cruces,
    fraseDeByes: fraseDeByes(c.byes, c.bracketSize),
  };
}

/**
 * "Los 3 mejores clasificados pasan directo a semifinales."
 *
 * Sin nombres: hasta que no terminan los grupos no se sabe quiénes son, y la
 * frase útil es la REGLA — le dice al jugador si le compensa pelear por el
 * primer puesto de su grupo.
 */
function fraseDeByes(byes: number, bracketSize: number): string | null {
  if (byes <= 0) return null;

  // La ronda a la que llegan: la mitad del cuadro.
  const siguiente = NOMBRE_RONDA[rondaDeCuadro(bracketSize / 2)];
  const quienes = byes === 1
    ? 'El mejor clasificado pasa directo'
    : `Los ${byes} mejores clasificados pasan directo`;

  return `${quienes} a ${siguiente}: se saltan la primera ronda.`;
}
