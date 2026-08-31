/**
 * RALLY · Bloques: presentación y capacidad
 *
 * Lógica PURA sobre la retícula de bloques: cómo se dice una hora, cómo se dice
 * un cupo, y si la inscripción cabe.
 *
 * POR QUÉ VIVE APARTE DE `bloques-torneo.ts`
 *   Aquel importa el cliente de Supabase, que lanza si no hay variables de
 *   entorno. Estas funciones son aritmética y texto: separarlas las hace
 *   testeables sin montar media app, y deja claro cuál de los dos archivos
 *   habla con la red.
 *
 * No duplica al motor: el cupo por bloque lo sigue calculando `cupoDeBloque`.
 * Aquí está la cuenta AGREGADA del torneo entero, que el motor no hace porque
 * no sabe cuántas parejas hay inscritas.
 */

import {
  carrilesDeGrupo, PARTIDOS_POR_CARRIL, type ReticulaBloques,
} from '@/lib/engine/schedule/bloques';
import { computeFormat } from '@/lib/engine/format';

/** '08:00' → '8:00'. Sin cero a la izquierda: así se dice y así se lee. */
export function horaLegible(hhmm: string): string {
  return hhmm.replace(/^0/, '');
}

/** '08:00' + '11:00' → '8:00 a 11:00'. */
export function rangoLegible(desde: string, hasta: string): string {
  return `${horaLegible(desde)} a ${horaLegible(hasta)}`;
}

/** El cupo como se le dice a alguien que está a punto de elegir. */
export function textoCupo(cupo: number): string {
  if (cupo <= 0) return 'Lleno';
  if (cupo === 1) return 'Queda 1 lugar';
  return `Quedan ${cupo} lugares`;
}

/**
 * `${dia}-${desde}` → sus dos partes. El id lo genera el motor y es estable,
 * pero puede venir de una elección vieja apuntando a un bloque que ya no
 * existe: por eso devuelve null en vez de romper.
 */
export function partesDeBloqueId(id: string): { dia: string; desde: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/.exec(id);
  return m ? { dia: m[1], desde: m[2] } : null;
}


// ── Tamaño de grupo por categoría ──────────────────────────────────────────

/**
 * Cuántas parejas va a tener un grupo de cada categoría.
 *
 * POR QUÉ NO ES SIEMPRE 3
 *   `computeFormat` reparte en grupos de 3 a 5 según cuántas parejas haya. Con
 *   8 parejas da [4,4]; con 20, [4,4,3,3,3,3]. Y un grupo de 4 son SEIS
 *   partidos: dos bloques de 3 h, no uno. El motor de bloques no lo puede
 *   deducir solo — no depende del motor de formato a propósito —, así que se
 *   lo pasamos desde aquí.
 *
 * POR QUÉ UN SOLO NÚMERO SI EL REPARTO ES MIXTO
 *   Porque el cupo es un PRONÓSTICO: se calcula mientras la gente todavía se
 *   inscribe y el total no está cerrado. Se toma el tamaño que domina el
 *   reparto, y los empates se rompen hacia el grande, que es el lado que no
 *   promete lugares de más. La cuenta exacta, sobre la inscripción real, la
 *   hace `capacidadDelTorneo` con el reparto completo.
 */
export function tamanosDeGrupo(
  parejasPorCategoria: Record<string, number>,
): Record<string, number> {
  const salida: Record<string, number> = {};

  for (const cat of Object.keys(parejasPorCategoria)) {
    const n = parejasPorCategoria[cat] ?? 0;
    if (n < 2) continue;                       // computeFormat lanza por debajo

    const sizes = computeFormat(n).groupSizes;
    if (sizes.length === 0) continue;          // cuadro directo: no hay grupos

    const veces = new Map<number, number>();
    for (const s of sizes) veces.set(s, (veces.get(s) ?? 0) + 1);

    let mejor = sizes[0];
    for (const [tamano, cuantos] of veces) {
      const cuantosMejor = veces.get(mejor) ?? 0;
      if (cuantos > cuantosMejor || (cuantos === cuantosMejor && tamano > mejor)) {
        mejor = tamano;
      }
    }
    salida[cat] = mejor;
  }

  return salida;
}

/**
 * Carriles que consume una categoría entera, con su reparto REAL.
 *
 * Aquí no se aproxima: se suma el coste de cada grupo del reparto que
 * `computeFormat` va a producir. 20 parejas son [4,4,3,3,3,3] = 2+2+1+1+1+1 =
 * 8 carriles, no los 7 que daría `ceil(20/3)`.
 */
export function carrilesDeCategoria(
  parejas: number,
  partidosPorCarril: number = PARTIDOS_POR_CARRIL,
): number {
  if (parejas < 2) return parejas > 0 ? 1 : 0;   // una pareja suelta ocupa carril igual
  const sizes = computeFormat(parejas).groupSizes;
  if (sizes.length === 0) return 0;              // cuadro directo, sin fase de grupos
  return sizes.reduce((a, s) => a + carrilesDeGrupo(s, partidosPorCarril), 0);
}

// ── Capacidad: ¿caben las parejas que se están inscribiendo? ────────────────

export interface Capacidad {
  /** Carriles (grupos) que exige la inscripción actual. */
  carrilesNecesarios: number;
  /** Carriles que ofrece la retícula: bloques x canchas. */
  capacidadCarriles:  number;
  /** > 0 cuando la inscripción ya no cabe. */
  faltanCarriles:     number;
  /** Lugares nominales de la retícula, suponiendo grupos de 3. */
  capacidadParejas:   number;
  inscritas:          number;
  /** Qué hacer, con números. Vacío si todavía cabe. */
  palancas:           string[];
}

/**
 * Si la inscripción cabe en los bloques, y si no, qué mover.
 *
 * LA CUENTA NO ES `inscritas <= capacidadParejas`
 *   Un grupo ocupa uno o más carriles enteros, y un carril es una cancha
 *   durante todo el bloque. Una categoría de 20 parejas se reparte en
 *   [4,4,3,3,3,3] y gasta 8 carriles: los dos grupos de 4 valen dos cada uno,
 *   porque 6 partidos no caben en 3 horas. Medir en lugares diría que 20
 *   parejas caben en 20 lugares, y no es verdad.
 *
 * Las palancas son las tres cosas que el organizador puede mover de verdad:
 * más canchas, más horas en los días que ya juega, o un día más. Se dicen en
 * CANCHAS, HORAS y PAREJAS, que es lo que él compra y lo que él cuenta. Nunca
 * en carriles: eso es una unidad del motor y en su pantalla no significa nada.
 * Las parejas van como aproximación —"unas 12"— calculada con la mezcla real
 * de este torneo y no con un 3 supuesto.
 */
export function capacidadDelTorneo(args: {
  reticula: ReticulaBloques;
  canchas:  number;
  /** Parejas inscritas por categoría. TODAS, hayan elegido bloque o no. */
  parejasPorCategoria: Record<string, number>;
  /** Partidos que caben en un carril. Default 3, como el bloque típico. */
  partidosPorCarril?: number;
}): Capacidad {
  const { reticula, canchas, parejasPorCategoria } = args;
  const ppc = args.partidosPorCarril ?? PARTIDOS_POR_CARRIL;

  let carrilesNecesarios = 0;
  let inscritas = 0;
  for (const cat of Object.keys(parejasPorCategoria)) {
    const n = parejasPorCategoria[cat] ?? 0;
    if (n <= 0) continue;
    inscritas += n;
    carrilesNecesarios += carrilesDeCategoria(n, ppc);
  }

  const capacidadCarriles = reticula.capacidadCarriles;
  const faltanCarriles = carrilesNecesarios - capacidadCarriles;

  const palancas: string[] = [];
  const nBloques = reticula.bloques.length;
  const horasPorBloque = reticula.minutosPorBloque / 60;

  /**
   * Parejas por carril de ESTE torneo, con su mezcla real de categorías. Con
   * todo en grupos de 3 da 3; con grupos de 4 baja, porque un carril de un
   * grupo de 4 solo lleva 2 parejas de media.
   */
  const parejasPorCarril = carrilesNecesarios > 0 ? inscritas / carrilesNecesarios : 3;
  const enParejas = (carriles: number) => Math.floor(carriles * parejasPorCarril);

  if (faltanCarriles > 0) {
    if (nBloques > 0) {
      const canchasExtra = Math.ceil(faltanCarriles / nBloques);
      palancas.push(
        `Conseguir ${canchasExtra} cancha${canchasExtra === 1 ? '' : 's'} más: ` +
        `caben unas ${enParejas(nBloques * canchasExtra)} parejas más.`,
      );
    }
    if (canchas > 0) {
      const bloquesExtra = Math.ceil(faltanCarriles / canchas);
      const horas = bloquesExtra * horasPorBloque;
      palancas.push(
        `Alargar el horario ${horas} h en total (${bloquesExtra} bloque` +
        `${bloquesExtra === 1 ? '' : 's'} de ${horasPorBloque} h), repartidas ` +
        `entre los días de fase de grupos.`,
      );
      palancas.push(
        `Abrir un día más de ${horas} h de juego: con tus ${canchas} cancha` +
        `${canchas === 1 ? '' : 's'} caben unas ${enParejas(bloquesExtra * canchas)} parejas más.`,
      );
    }
  }

  return {
    carrilesNecesarios,
    capacidadCarriles,
    faltanCarriles,
    capacidadParejas: reticula.capacidadParejas,
    inscritas,
    palancas,
  };
}
