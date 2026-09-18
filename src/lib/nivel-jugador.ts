/**
 * RALLY · "Tu nivel", contado en español de jugador.
 *
 * EL DATO MÁS VALIOSO QUE TENEMOS ESTÁ ESCONDIDO
 *   `player_ratings` guarda un Glicko-2 por jugador y división, y
 *   `rating_history` guarda una fila POR PARTIDO con el rating antes y después.
 *   Eso es, literalmente, la gráfica de cómo ha mejorado cada jugador — ya
 *   calculada, ya guardada, y hoy solo se usa por dentro para sembrar cuadros.
 *
 * UN NÚMERO SUELTO NO SIGNIFICA NADA PARA UN JUGADOR
 *   "1612" no le dice nada a nadie. "Tercera fuerza, te faltan 100 puntos para
 *   segunda" sí, porque las divisiones son el idioma en el que ya piensa: es
 *   como se inscribe a los torneos.
 *
 * ► LA DIVISIÓN QUE SE ENSEÑA ES EN LA QUE JUEGA, NO LA QUE DICE SU RATING
 *   Esto lo tuve mal y hay que dejarlo escrito. NADIE EMPIEZA EN SEXTA: los
 *   torneos tienen varias categorías y el jugador se inscribe en la suya, así
 *   que un debutante puede entrar directo a tercera. El motor lo sabe —
 *   `isEligibleToRegister` permite el cold-start con RD alta porque "lo declara
 *   el jugador y lo valida el organizador"— y `player_ratings` está justamente
 *   partido POR DIVISIÓN.
 *
 *   `divisionForRating()` NO dice dónde juega: dice qué mide su rating, y sirve
 *   para otra cosa —promoverlo si se le queda chica, o impedir que baje de
 *   categoría—. Usarla como etiqueta le diría "quinta fuerza" a alguien que
 *   lleva un año jugando tercera, que es falso y además ofende.
 *
 *   Así que la etiqueta sale de `player_ratings.division` y el rating solo
 *   dice si va camino de subir DENTRO de esa división.
 *
 * ► Y SI EL NÚMERO NO ES FIABLE, NO SE ENSEÑA COMO SI LO FUERA
 *   Glicko arranca en 1500 con una incertidumbre (RD) de 350, y el propio
 *   motor considera fiable un rating solo por debajo de RD 100
 *   (`rdConfidentThreshold`). Con tres partidos jugados, el 1500 que sale es
 *   el valor de fábrica y no una medición: enseñarlo como nivel sería inventar
 *   una precisión que no existe, y el jugador lo descubre en cuanto pierde
 *   contra alguien "de su nivel".
 *
 *   Mientras RD siga alta se dice lo que es —"todavía te estamos midiendo"— y
 *   se cuenta cuántos partidos lleva. Eso además da un motivo para jugar más,
 *   que es exactamente lo que el producto quiere.
 */

import { DEFAULT_BAND_CONFIG } from '@/lib/engine/rating/category-bands';
import type { Division } from '@/lib/engine/types';

/** RD por debajo de la cual el rating significa algo. Gemelo del motor. */
export const RD_FIABLE = DEFAULT_BAND_CONFIG.rdConfidentThreshold;

/** RD de arranque de Glicko-2. Gemelo del esquema (player_ratings default). */
export const RD_INICIAL = 350;

export const NOMBRE_DIVISION: Record<Division, string> = {
  primera: 'Primera',
  segunda: 'Segunda',
  tercera: 'Tercera',
  cuarta: 'Cuarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
};

/** De menor a mayor. Gemelo del orden de DEFAULT_BANDS. */
const ESCALERA: Division[] = ['sexta', 'quinta', 'cuarta', 'tercera', 'segunda', 'primera'];

/** Dónde cae su rating medido respecto a la banda de su división. */
export type PosicionEnLaBanda = 'abajo' | 'dentro' | 'arriba';

export interface NivelDelJugador {
  rating: number;
  rd: number;
  /** RD < 100: el número ya es una medición y no un valor de fábrica. */
  fiable: boolean;
  partidos: number;
  /** DONDE JUEGA. Sale de player_ratings.division, no del rating. */
  division: Division;
  /** La de arriba de la SUYA. null si ya está en primera. */
  siguiente: Division | null;
  /** Puntos hasta el techo de SU banda. null si ya está en primera o la pasó. */
  paraSubir: number | null;
  posicion: PosicionEnLaBanda;
}

export function nivelDelJugador(
  /** La división en la que compite. De `player_ratings.division`. */
  division: Division,
  rating: number,
  rd: number,
  partidos: number,
): NivelDelJugador {
  const i = ESCALERA.indexOf(division);
  const siguiente = i >= 0 && i < ESCALERA.length - 1 ? ESCALERA[i + 1] : null;
  const banda = DEFAULT_BAND_CONFIG.bands.find((b) => b.division === division);

  const posicion: PosicionEnLaBanda =
    !banda || !Number.isFinite(banda.min) || !Number.isFinite(banda.max)
      ? 'dentro'
      : rating > banda.max
        ? 'arriba'
        : rating < banda.min
          ? 'abajo'
          : 'dentro';

  const paraSubir =
    siguiente && banda && Number.isFinite(banda.max) && posicion !== 'arriba'
      ? Math.max(Math.ceil(banda.max + 1 - rating), 0)
      : null;

  return { rating, rd, fiable: rd < RD_FIABLE, partidos, division, siguiente, paraSubir, posicion };
}

/** El titular de la tarjeta. */
export function textoDeNivel(n: NivelDelJugador): string {
  if (!n.fiable) return 'Todavía te estamos midiendo';
  return `${NOMBRE_DIVISION[n.division]} fuerza`;
}

/**
 * La línea de debajo. Da el siguiente paso, no un dato.
 *
 * EL CASO 'abajo' NO ACUSA A NADIE.
 *   Un jugador puede competir en tercera con un rating medido de quinta: se
 *   inscribió ahí y el organizador lo validó. Decirle "eres de quinta" sería
 *   discutirle una decisión que no tomó solo. Se le dice dónde está DENTRO de
 *   su división —"en la parte baja de tercera"—, que es cierto, es útil y no
 *   es un juicio.
 */
export function textoDeSiguientePaso(n: NivelDelJugador): string {
  if (!n.fiable) {
    if (n.partidos === 0) return 'Juega tu primer torneo y empezamos a medir tu nivel.';
    const p = n.partidos === 1 ? 'un partido' : `${n.partidos} partidos`;
    return `Llevas ${p}. Con unos cuantos más tu nivel deja de ser provisional.`;
  }

  const suya = NOMBRE_DIVISION[n.division].toLowerCase();

  if (n.posicion === 'arriba') {
    return n.siguiente
      ? `Tu nivel ya está por encima de ${suya}: vas camino de ${NOMBRE_DIVISION[n.siguiente].toLowerCase()}.`
      : 'Estás en lo más alto. No hay división por encima.';
  }
  if (n.posicion === 'abajo') {
    return `Estás en la parte baja de ${suya}.`;
  }
  if (!n.siguiente || n.paraSubir === null) {
    return 'Estás en lo más alto. No hay división por encima.';
  }
  return `Te faltan ${n.paraSubir} puntos para ${NOMBRE_DIVISION[n.siguiente].toLowerCase()}.`;
}

/**
 * El número, o null si todavía no significa nada.
 *
 * Devolver null y no el 1500 de fábrica es el punto entero de este archivo.
 */
export function numeroVisible(n: NivelDelJugador): number | null {
  return n.fiable ? Math.round(n.rating) : null;
}

// ── La curva ────────────────────────────────────────────────────────────────

/** Una fila de `rating_history`, tal como sale de la base. */
export interface FilaHistorial {
  rating_after: number;
  played_at: string;
}

export interface PuntoDeCurva {
  fecha: string;
  rating: number;
}

/**
 * La curva, en orden cronológico.
 *
 * `rating_history` tiene una fila por partido y el jugador juega varios el
 * mismo día, así que la curva es por PARTIDO y no por fecha: agrupar por día
 * escondería justo lo que se quiere ver, que es cómo se movió dentro del
 * torneo.
 */
export function curvaDeRating(filas: readonly FilaHistorial[]): PuntoDeCurva[] {
  return [...filas]
    .filter((f) => Number.isFinite(f.rating_after) && !!f.played_at)
    .sort((a, b) => (a.played_at < b.played_at ? -1 : a.played_at > b.played_at ? 1 : 0))
    .map((f) => ({ fecha: f.played_at, rating: Number(f.rating_after) }));
}

export interface ResumenDeProgreso {
  /** Cuánto ha subido (o bajado) desde el primer partido medido. */
  delta: number;
  /** El más alto al que ha llegado. */
  techo: number;
  /** Cuánto se movió en su último torneo (los partidos del último día). */
  ultimoTorneo: number;
}

export function resumenDeProgreso(curva: readonly PuntoDeCurva[]): ResumenDeProgreso | null {
  if (curva.length < 2) return null;
  const primero = curva[0].rating;
  const ultimo = curva[curva.length - 1].rating;
  const diaFinal = curva[curva.length - 1].fecha.slice(0, 10);
  const delDia = curva.filter((p) => p.fecha.slice(0, 10) === diaFinal);
  const antesDelDia = curva[curva.length - delDia.length - 1]?.rating ?? primero;

  return {
    delta: Math.round(ultimo - primero),
    techo: Math.round(Math.max(...curva.map((p) => p.rating))),
    ultimoTorneo: Math.round(ultimo - antesDelDia),
  };
}

/** "+24 en tu último torneo" / "sin cambios". Con el menos de verdad. */
export function textoDeCambio(delta: number): string {
  if (delta === 0) return 'sin cambios';
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

// ── El dibujo ───────────────────────────────────────────────────────────────

/** Tamaño del lienzo de la curva. La pantalla la escala a su ancho. */
export const CURVA_ANCHO = 300;
export const CURVA_ALTO = 72;

/**
 * La curva convertida en un `path` de SVG.
 *
 * Está aquí y no en el componente porque es una CUENTA, y las cuentas se
 * equivocan: normalizar un rango, invertir el eje Y —en SVG crece hacia abajo—
 * y no dividir entre cero cuando el jugador nunca se movió. Tres sitios donde
 * fallar en silencio y pintar una gráfica que miente.
 *
 * Devuelve null con menos de dos puntos: una raya horizontal fingiría una
 * historia que no existe.
 */
export function pathDeCurva(
  curva: readonly PuntoDeCurva[],
  ancho = CURVA_ANCHO,
  alto = CURVA_ALTO,
): string | null {
  if (curva.length < 2) return null;

  const valores = curva.map((p) => p.rating);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  // Si nunca se movió, el rango es 0 y la línea iría al infinito. Con 1 queda
  // plana y centrada, que es exactamente lo que pasó.
  const rango = max - min || 1;
  const margen = 4;

  return curva
    .map((p, i) => {
      const x = (i / (curva.length - 1)) * ancho;
      const y = alto - ((p.rating - min) / rango) * (alto - margen * 2) - margen;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** El mismo trazo cerrado contra el suelo, para rellenar por debajo. */
export function areaDeCurva(
  curva: readonly PuntoDeCurva[],
  ancho = CURVA_ANCHO,
  alto = CURVA_ALTO,
): string | null {
  const linea = pathDeCurva(curva, ancho, alto);
  return linea ? `${linea} L${ancho},${alto} L0,${alto} Z` : null;
}
