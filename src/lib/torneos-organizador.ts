/**
 * RALLY · Los torneos que el usuario ORGANIZA, resumidos para el dashboard
 *
 * EL AGUJERO QUE CIERRA
 *   Un owner con un torneo EN CURSO abría la app y leía "Sin partidos
 *   programados · Inscríbete a un torneo para ver tu próximo partido aquí". Su
 *   torneo no aparecía en ningún sitio: el único acceso era el botón Organizar
 *   de la barra, que además no dice nada de lo que está pasando dentro.
 *
 *   Es el mismo agujero que tenía el juez —la pantalla existía y era
 *   inalcanzable— pero de peor especie: aquí la pantalla SÍ contestaba algo, y
 *   lo que contestaba era falso.
 *
 * DOS FACETAS, NO DOS APPS
 *   Un organizador juega sus propios torneos. Las dos cosas conviven en la
 *   misma pantalla y el orden lo decide la urgencia, no el rol: si tiene
 *   partido, el partido va primero —es lo que pasa en la próxima hora—; si no
 *   tiene, lo que organiza sube al hueco.
 *
 * QUÉ SE LE DICE DE CADA TORNEO
 *   Lo justo para decidir si entra o no: el nombre, las fechas y UNA cosa que
 *   atender. Una lista de métricas aquí sería un panel, y el panel ya existe a
 *   un toque de distancia.
 *
 * Módulo puro: qué torneos entran, cómo se ordenan y qué frase les toca. La
 * consulta vive en `useOrganizerTournaments`; esto se puede probar sin red.
 */

/** Estados en los que un torneo todavía le pide algo al organizador. */
const ESTADOS_VIVOS = [
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
] as const;

/**
 * Lo que hay que saber de un torneo para resumirlo.
 *
 * Los dos contadores salen de dos consultas acotadas a estos torneos (ver el
 * hook). No hay agregados nuevos en la base: se cuentan filas que el panel del
 * organizador ya lee de todos modos.
 */
export interface TorneoOrganizado {
  id: string;
  nombre: string;
  status: string;
  inicio: string | null;
  fin: string | null;
  /** Categorías todavía en `open`: sin sorteo y sin grupos armados. */
  categoriasAbiertas: number;
  /**
   * Partidos con hora ya pasada y sin resultado.
   *
   * "Sin capturar" en el vocabulario del juez, pero aquí importa por lo que
   * BLOQUEA: sin ese marcador la tabla no avanza, y los jugadores de esa
   * categoría están mirando una pantalla que no se mueve.
   */
  partidosSinCapturar: number;
}

/** La única cosa que se le dice de un torneo, además del nombre y las fechas. */
export interface AvisoDeTorneo {
  texto: string;
  /** `true` pinta el aviso en oro: hay gente esperando ahora mismo. */
  urge: boolean;
}

/** ¿Este torneo sigue pidiendo algo? */
export function estaVivo(status: string): boolean {
  return (ESTADOS_VIVOS as readonly string[]).includes(status);
}

/**
 * Qué se atiende primero, dentro de un torneo.
 *
 * UNA SOLA FRASE, Y LA QUE MÁS DUELE. Se puede tener a la vez un partido sin
 * capturar y tres categorías sin cerrar; enumerar las dos convierte la tarjeta
 * en un informe y el organizador deja de leerla. La que sale es la que tiene
 * gente esperando delante.
 *
 *   1. Partidos jugados sin resultado — la tabla está congelada AHORA.
 *   2. Categorías sin cerrar con el torneo ya arrancado — se juega en unas y
 *      en otras ni siquiera hay grupos.
 *   3. Torneo en borrador — no lo ve nadie todavía.
 *   4. Categorías sin cerrar antes de empezar — es el trabajo normal, no una
 *      alarma: se dice sin urgencia.
 *
 * `null` = no hay nada pendiente, y entonces la tarjeta se calla en vez de
 * inventar un "todo en orden" que nadie pidió.
 */
export function queAtender(t: TorneoOrganizado): AvisoDeTorneo | null {
  if (t.partidosSinCapturar > 0) {
    return {
      texto: t.partidosSinCapturar === 1
        ? '1 partido jugado sin resultado'
        : `${t.partidosSinCapturar} partidos jugados sin resultado`,
      urge: true,
    };
  }

  const empezado = t.status === 'in_progress';

  if (t.categoriasAbiertas > 0 && empezado) {
    return {
      texto: t.categoriasAbiertas === 1
        ? '1 categoría sin cerrar'
        : `${t.categoriasAbiertas} categorías sin cerrar`,
      urge: true,
    };
  }

  if (t.status === 'draft') {
    return { texto: 'Sin publicar', urge: false };
  }

  if (t.categoriasAbiertas > 0) {
    return {
      texto: t.categoriasAbiertas === 1
        ? '1 categoría por cerrar'
        : `${t.categoriasAbiertas} categorías por cerrar`,
      urge: false,
    };
  }

  return null;
}

/** Cómo se llama el estado del torneo en la tarjeta. */
export function etiquetaDeEstado(status: string): string {
  return {
    draft:               'Borrador',
    registration_open:   'Inscripciones abiertas',
    registration_closed: 'Inscripciones cerradas',
    in_progress:         'En curso',
  }[status] ?? '';
}

/**
 * El orden de la lista: lo que ya se está jugando arriba.
 *
 * Dentro de cada grupo, por fecha de inicio ascendente — el que antes empieza
 * es el que antes le va a pedir algo. Sin fecha caen al final: un torneo sin
 * fechas no compite por la atención de nadie.
 */
const PESO: Record<string, number> = {
  in_progress: 0,
  registration_closed: 1,
  registration_open: 2,
  draft: 3,
};

export function ordenarTorneos(a: TorneoOrganizado, b: TorneoOrganizado): number {
  const pa = PESO[a.status] ?? 9;
  const pb = PESO[b.status] ?? 9;
  if (pa !== pb) return pa - pb;
  if (!a.inicio) return b.inicio ? 1 : 0;
  if (!b.inicio) return -1;
  return a.inicio.localeCompare(b.inicio);
}
