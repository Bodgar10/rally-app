/**
 * RALLY · La ficha del rival, media hora antes del partido.
 *
 * TODO ESTO SALE DE DATOS QUE YA ESTÁN
 *   `player_ratings` da el nivel de cada uno de los cuatro. `matches` dice
 *   quién ganó cada partido de la historia. `pairs` dice con quién ha jugado
 *   cada uno. No hace falta capturar nada nuevo: hace falta juntarlo.
 *
 * LA PROBABILIDAD NO ES MARKETING
 *   Sale de `probabilidadDeVictoria`, que es la misma función con la que
 *   Glicko lleva tiempo decidiendo cuánto sube o baja cada jugador después de
 *   cada partido. El número que se le enseña al jugador es exactamente el que
 *   el sistema ya usaba por dentro.
 *
 * ► Y SI NO SE PUEDE SABER, NO SE INVENTA
 *   Con un rival recién llegado la incertidumbre es enorme y cualquier
 *   porcentaje sería una corazonada con cara de dato. Glicko ya lo refleja
 *   —empuja la probabilidad hacia el 50%— pero eso no basta: un "51%" se lee
 *   como "está parejo" cuando lo que pasa es que NO SE SABE. Por eso la ficha
 *   trae `fiable`, y la pantalla dice que todavía no hay con qué medirlo.
 *
 * LO QUE NO ESTÁ Y NO SE FINGE
 *   No hay nada de dentro del punto: ni saques, ni errores, ni dónde se ganó
 *   la bola. La unidad mínima del sistema es el game. Cualquier "punto fuerte
 *   del rival" sería inventado, así que no existe en esta ficha.
 */

import { combineOpponentPair, probabilidadDeVictoria } from '@/lib/engine/rating/glicko2';

/** El nivel de un jugador, tal como sale de `player_ratings`. */
export interface NivelJugador {
  id: string;
  nombre: string;
  rating: number;
  rd: number;
}

/** Un partido pasado entre los dos mismos duos. */
export interface EnfrentamientoPasado {
  fecha: string;
  /** true si lo ganó el duo que estamos mirando ("nosotros"). */
  ganamos: boolean;
}

/** RD por encima de la cual el rating de alguien no significa gran cosa. */
export const RD_FIABLE = 100;

/** Diferencia de rating a partir de la cual uno de los dos manda de verdad. */
export const DIFERENCIA_NOTABLE = 80;

export interface FichaDelRival {
  /** 0 a 1. Nuestras opciones de ganar este partido. */
  probabilidad: number;
  /** Los cuatro están medidos: el porcentaje se puede enseñar. */
  fiable: boolean;
  jugados: number;
  ganados: number;
  perdidos: number;
  /** El más fuerte de los dos rivales, si hay diferencia clara. */
  masFuerte: NivelJugador | null;
  /** Torneos que los dos rivales han jugado juntos. */
  torneosJuntos: number;
}

export interface EntradaScouting {
  nosotros: [NivelJugador, NivelJugador];
  ellos: [NivelJugador, NivelJugador];
  historial: readonly EnfrentamientoPasado[];
  torneosJuntos: number;
}

export function fichaDelRival(e: EntradaScouting): FichaDelRival {
  const a = combineOpponentPair(e.nosotros[0], e.nosotros[1]);
  const b = combineOpponentPair(e.ellos[0], e.ellos[1]);

  const todosMedidos = [...e.nosotros, ...e.ellos].every((j) => j.rd < RD_FIABLE);
  const diferencia = Math.abs(e.ellos[0].rating - e.ellos[1].rating);
  const masFuerte =
    todosMedidos && diferencia >= DIFERENCIA_NOTABLE
      ? e.ellos[0].rating > e.ellos[1].rating
        ? e.ellos[0]
        : e.ellos[1]
      : null;

  const ganados = e.historial.filter((h) => h.ganamos).length;

  return {
    probabilidad: probabilidadDeVictoria(a, b),
    fiable: todosMedidos,
    jugados: e.historial.length,
    ganados,
    perdidos: e.historial.length - ganados,
    masFuerte,
    torneosJuntos: e.torneosJuntos,
  };
}

// ── Cómo se cuenta ──────────────────────────────────────────────────────────

/** "38%". Redondeado al entero: más precisión sería fingir que la hay. */
export function textoDeProbabilidad(f: FichaDelRival): string | null {
  if (!f.fiable) return null;
  return `${Math.round(f.probabilidad * 100)}%`;
}

/**
 * El titular. Traduce el porcentaje a algo que se entienda de un vistazo,
 * porque "47%" y "53%" son el mismo partido y no se leen igual.
 */
export function textoDelPronostico(f: FichaDelRival): string {
  if (!f.fiable) return 'Todavía no hay con qué medir este partido.';
  const p = f.probabilidad;
  if (p >= 0.75) return 'Deberías ganarlo.';
  if (p >= 0.58) return 'Sales como favorito.';
  if (p > 0.42) return 'Está parejo.';
  if (p > 0.25) return 'Salen ellos como favoritos.';
  return 'La tienes cuesta arriba.';
}

/** El historial entre los dos duos. null si nunca se han visto. */
export function textoDelHistorial(f: FichaDelRival): string | null {
  if (f.jugados === 0) return null;
  if (f.jugados === 1) {
    return f.ganados === 1 ? 'Se han visto una vez y ganaste tú.' : 'Se han visto una vez y ganaron ellos.';
  }
  return `Se han visto ${f.jugados} veces: ${f.ganados}-${f.perdidos} a favor de ${
    f.ganados > f.perdidos ? 'ustedes' : f.ganados < f.perdidos ? 'ellos' : 'nadie'
  }.`;
}

/** Quién manda en la pareja rival. null si están parejos o no están medidos. */
export function textoDelMasFuerte(f: FichaDelRival): string | null {
  if (!f.masFuerte) return null;
  return `${f.masFuerte.nombre} es el más fuerte de los dos.`;
}

/**
 * Si son pareja fija o se juntaron para este torneo.
 *
 * Importa más de lo que parece: una pareja con veinte torneos encima se
 * entiende sin hablar, y una recién armada no. Es la información que un
 * jugador busca preguntando por el club.
 */
export function textoDeLaPareja(f: FichaDelRival): string | null {
  if (f.torneosJuntos <= 0) return null;
  if (f.torneosJuntos === 1) return 'Es la primera vez que juegan juntos.';
  if (f.torneosJuntos < 5) return `Llevan ${f.torneosJuntos} torneos juntos.`;
  return `Llevan ${f.torneosJuntos} torneos juntos: son pareja fija.`;
}

/** Todas las líneas que hay que decir, sin las vacías. */
export function lineasDeLaFicha(f: FichaDelRival): string[] {
  return [textoDelHistorial(f), textoDelMasFuerte(f), textoDeLaPareja(f)].filter(
    (x): x is string => x !== null,
  );
}
