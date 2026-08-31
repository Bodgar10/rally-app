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

import { PAREJAS_POR_GRUPO, type ReticulaBloques } from '@/lib/engine/schedule/bloques';

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


// ── Capacidad: ¿caben las parejas que se están inscribiendo? ────────────────

export interface Capacidad {
  /** Carriles (grupos) que exige la inscripción actual. */
  carrilesNecesarios: number;
  /** Carriles que ofrece la retícula: bloques x canchas. */
  capacidadCarriles:  number;
  /** > 0 cuando la inscripción ya no cabe. */
  faltanCarriles:     number;
  /** Lugares nominales de la retícula (carriles x 3). */
  capacidadParejas:   number;
  inscritas:          number;
  /** Qué hacer, con números. Vacío si todavía cabe. */
  palancas:           string[];
}

/**
 * Si la inscripción cabe en los bloques, y si no, qué mover.
 *
 * LA CUENTA NO ES `inscritas <= capacidadParejas`
 *   Un grupo son 3 parejas de la MISMA categoría y ocupa un carril entero. Una
 *   categoría con 4 parejas necesita DOS carriles (uno de 3 y uno de 1), no
 *   1.33. Por eso se cuenta en carriles: `sum(ceil(parejas[cat] / 3))`. Medir
 *   en lugares diría que 4 parejas caben en 2 lugares libres, y no es verdad
 *   si esos lugares son de otra categoría.
 *
 * Las palancas son las tres cosas que el organizador puede mover de verdad:
 * más canchas, más horas en los días que ya juega, o un día más.
 */
export function capacidadDelTorneo(args: {
  reticula: ReticulaBloques;
  canchas:  number;
  /** Parejas inscritas por categoría. TODAS, hayan elegido bloque o no. */
  parejasPorCategoria: Record<string, number>;
}): Capacidad {
  const { reticula, canchas, parejasPorCategoria } = args;

  let carrilesNecesarios = 0;
  let inscritas = 0;
  for (const cat of Object.keys(parejasPorCategoria)) {
    const n = parejasPorCategoria[cat] ?? 0;
    if (n <= 0) continue;
    inscritas += n;
    carrilesNecesarios += Math.ceil(n / PAREJAS_POR_GRUPO);
  }

  const capacidadCarriles = reticula.capacidadCarriles;
  const faltanCarriles = carrilesNecesarios - capacidadCarriles;

  const palancas: string[] = [];
  const nBloques = reticula.bloques.length;
  const horasPorBloque = reticula.minutosPorBloque / 60;

  if (faltanCarriles > 0) {
    if (nBloques > 0) {
      const canchasExtra = Math.ceil(faltanCarriles / nBloques);
      palancas.push(
        `Conseguir ${canchasExtra} cancha${canchasExtra === 1 ? '' : 's'} más: ` +
        `cada cancha añade ${nBloques} grupo${nBloques === 1 ? '' : 's'} ` +
        `(${nBloques * PAREJAS_POR_GRUPO} parejas).`,
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
        `${canchas === 1 ? '' : 's'} suma ${bloquesExtra * canchas} grupos ` +
        `(${bloquesExtra * canchas * PAREJAS_POR_GRUPO} parejas).`,
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
