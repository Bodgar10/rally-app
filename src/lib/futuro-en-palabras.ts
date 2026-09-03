/**
 * RALLY · El futuro del jugador, dicho en su idioma
 *
 * `analizarFuturo` (motor) contesta la pregunta con precisión y en su propio
 * vocabulario: estados, carreras, peorPuestoPosible, plazas. Aquí se traduce a
 * lo que alguien lee a las doce de la noche en el club, que es otra cosa.
 *
 * LA FRASE QUE RESUELVE LA NOCHE DEL SÁBADO
 *   `peorPuestoPosible <= plazas` significa que ya no hay nada que pueda
 *   dejarle fuera. Eso no se dice con un número: se dice "pase lo que pase
 *   entras, ya puedes descansar". El número va detrás, como prueba, no como
 *   respuesta.
 *
 * LO QUE NO SE INVENTA
 *   El motor no calcula probabilidades, así que aquí no hay porcentajes ni
 *   "es probable que". `dependeDeGamesContra` se dice tal cual —dependes de la
 *   diferencia de games contra Fulano— porque prometer más sería inventarlo.
 *
 * NADA DE VOCABULARIO DE MOTOR
 *   Ni "clinch", ni "repesca", ni "carrera", ni los nombres de los estados. El
 *   jugador no tiene por qué aprender cómo está hecho esto por dentro; hay un
 *   test que lo fija.
 */

import type { AnalisisFuturo, Carrera, PartidoQueImporta } from '@/lib/engine/futuro';

/** Un partido del que depende, ya redactado. */
export interface PartidoRedactado {
  matchId: string;
  /** "Luis / Pedro vs Sofía / Regina". */
  partido: string;
  /** "Grupo C". */
  grupo: string;
  /** "Te conviene que ganen Luis / Pedro", o null si ningún lado le sirve más. */
  meConviene: string | null;
}

export type TonoFuturo = 'tranquilo' | 'espera' | 'fuera';

export interface FuturoEnPalabras {
  /** La frase principal. Sustituye al texto genérico. */
  titular: string;
  /** El detalle, o null si el titular se basta. */
  detalle: string | null;
  tono: TonoFuturo;
  /** Los partidos que de verdad cambian su suerte. Vacío si no hay ninguno. */
  partidos: PartidoRedactado[];
  /** "Dependes de la diferencia de games contra…", o null. */
  games: string | null;
}

const ORDINAL = [
  '', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto',
  'séptimo', 'octavo', 'noveno', 'décimo',
];

/** "el sexto mejor segundo" / "el 12.º mejor segundo" cuando se sale de la tabla. */
function puestoDeMejorSegundo(n: number): string {
  return ORDINAL[n] ? `el ${ORDINAL[n]} mejor segundo` : `el ${n}.º mejor segundo`;
}

/** "Luis / Pedro y Sofía / Regina" — una lista que se lee, no un array. */
function enumerar(xs: string[]): string {
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
}

function redactar(p: PartidoQueImporta): PartidoRedactado {
  return {
    matchId: p.matchId,
    partido: `${p.parejaA} vs ${p.parejaB}`,
    grupo: `Grupo ${p.grupo}`,
    // `null` del motor significa "importa, pero ningún resultado es mejor":
    // se dice así en vez de callarlo, porque un partido listado sin nada al
    // lado parece un dato a medias.
    meConviene: p.meConviene
      ? `Te conviene que gane ${p.meConviene}`
      : 'Cualquiera de los dos resultados puede servirte, según lo demás',
  };
}

function fraseDeGames(contra: string[]): string | null {
  if (contra.length === 0) return null;
  return contra.length === 1
    ? `Estás empatado a puntos con ${contra[0]}: os separa la diferencia de games.`
    : `Estás empatado a puntos con ${enumerar(contra)}: os separa la diferencia de games.`;
}

/**
 * ¿Esta carrera está ganada?
 *
 * `peorPuestoPosible <= plazas` con el peor puesto conocido. Sin peor puesto no
 * se afirma nada: el motor no pudo enumerar y decir que sí sería inventárselo.
 */
function estaGanada(c: Carrera | undefined): boolean {
  return !!c && c.peorPuestoPosible !== null && c.peorPuestoPosible <= c.plazas;
}

/**
 * El análisis del motor, en palabras.
 *
 * `primeraRonda` es el nombre de la ronda que se salta quien tiene bye
 * ("octavos", "cuartos"). Lo sabe quien llama, que conoce el tamaño del cuadro.
 */
export function futuroEnPalabras(
  a: AnalisisFuturo,
  primeraRonda?: string | null,
): FuturoEnPalabras {
  const partidos = (a.repesca?.partidosQueImportan ?? a.bye?.partidosQueImportan ?? [])
    .map(redactar);
  const games = fraseDeGames(
    a.repesca?.dependeDeGamesContra ?? a.bye?.dependeDeGamesContra ?? [],
  );

  // ── Todavía no se puede saber ────────────────────────────────────────────
  if (a.estado === 'demasiado_pronto') {
    return {
      titular: 'Todavía es pronto para saberlo',
      // El número de vuelta es lo que lo hace accionable: "faltan 23" a secas
      // deja al jugador refrescando; "te digo algo cuando queden 13" no.
      detalle: a.respondoCuandoQueden !== undefined
        ? `Faltan ${a.faltan} partidos en tu categoría. Podré decirte a qué atenerte cuando queden ${a.respondoCuandoQueden}.`
        : `Faltan ${a.faltan} partidos en tu categoría.`,
      tono: 'espera',
      partidos: [],
      games: null,
    };
  }

  // ── El reglamento no llega ───────────────────────────────────────────────
  if (a.estado === 'empate_sin_resolver') {
    return {
      titular: 'Hay un empate que el reglamento no resuelve',
      // No se promete una posición: no la hay hasta que alguien sortee.
      detalle: 'Quedas igualado en todos los criterios de desempate, así que tu '
        + 'puesto lo decide un sorteo del organizador. En cuanto lo haga, aparece aquí.',
      tono: 'espera',
      partidos,
      games,
    };
  }

  if (a.estado === 'fuera') {
    return {
      titular: 'Tu torneo terminó aquí',
      detalle: 'Ya no hay combinación de resultados que te meta en el cuadro. '
        + 'Gracias por jugar.',
      tono: 'fuera',
      partidos: [],
      games: null,
    };
  }

  // ── Dentro ───────────────────────────────────────────────────────────────
  if (a.estado === 'dentro') {
    const conBye = estaGanada(a.bye) && a.bye?.aplica;
    const peor = a.repesca?.peorPuestoPosible ?? null;

    const pruebas: string[] = [];
    if (a.repesca && peor !== null) {
      pruebas.push(`Lo peor que te puede tocar es ser ${puestoDeMejorSegundo(peor)}.`);
    }
    if (conBye) {
      pruebas.push(primeraRonda
        ? `Y te saltas ${primeraRonda}: entras directo a la siguiente ronda.`
        : 'Y te saltas la primera ronda: entras directo a la siguiente.');
    }

    return {
      titular: 'Pase lo que pase, entras',
      detalle: pruebas.length > 0
        ? `${pruebas.join(' ')} Ya puedes descansar.`
        : 'Ningún resultado que quede puede dejarte fuera. Ya puedes descansar.',
      tono: 'tranquilo',
      partidos: [],
      games: null,
    };
  }

  // ── Depende ──────────────────────────────────────────────────────────────
  return {
    titular: partidos.length > 0
      ? (partidos.length === 1 ? 'Depende de un partido' : `Depende de ${partidos.length} partidos`)
      : 'Todavía depende de lo que pase',
    detalle: partidos.length > 0
      ? 'Son los únicos que pueden cambiar tu suerte; el resto ya no te afecta.'
      : null,
    tono: 'espera',
    partidos,
    games,
  };
}
