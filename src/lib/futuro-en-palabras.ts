/**
 * RALLY · El futuro del jugador, dicho en su idioma
 *
 * `analizarFuturo` (motor) contesta la pregunta con precisión y en su propio
 * vocabulario: estados, carreras, peorPuestoPosible, plazas. Aquí se traduce a
 * lo que alguien lee a las doce de la noche en el club, que es otra cosa.
 *
 * LA FRASE QUE RESUELVE LA NOCHE DEL SÁBADO
 *   Cuando el motor dice que está dentro, el titular es "Ya clasificaste" y no
 *   lleva condiciones. El número —"lo peor que te puede tocar es ser el sexto
 *   mejor segundo"— va detrás, como prueba, no como respuesta.
 *
 * TRES PREGUNTAS, TRES ESTADOS
 *   `analizarFuturo.estado` responde SOLO a "¿clasifico?". El pase directo es
 *   otra pregunta y trae su propio estado, que puede seguir sin respuesta
 *   cuando la primera ya la tiene: se es primero de grupo —dentro seguro— y
 *   todavía faltan 27 partidos para saber si además se salta una ronda.
 *
 *   Se cuentan en ese orden: PRIMERO LA CERTEZA, DESPUÉS LO PENDIENTE. Al revés,
 *   la incertidumbre del bye tapaba la certeza de la clasificación y la pantalla
 *   decía "todavía es pronto para saberlo" a alguien que ya había clasificado.
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

import type {
  AnalisisFuturo, Carrera, PartidoQueImporta, PuestoActual,
} from '@/lib/engine/futuro';

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

/**
 * ¿Esta carrera está ganada?
 *
 * `peorPuestoPosible <= plazas` con el peor puesto conocido. Sin peor puesto no
 * se afirma nada: el motor no pudo enumerar y decir que sí sería inventárselo.
 */
function estaGanada(c: Carrera | undefined): boolean {
  return !!c && c.peorPuestoPosible !== null && c.peorPuestoPosible <= c.plazas;
}

/** "3.º" — el puesto como se escribe. */
const puestoNum = (n: number): string => `${n}.º`;

/**
 * Dónde va, dicho con la precisión que hay.
 *
 * `puestoActual` es un PAR a propósito: con empates a puntos no existe un
 * puesto limpio. `mejor` cuenta solo a quien le saca puntos; `peor` cuenta
 * también a los empatados, o sea suponiendo que pierde todos los desempates.
 * Cuando coinciden hay un puesto; cuando no, lo honesto es el rango — "entre
 * 1.º y 6.º" es exactamente lo que se sabe, y redondearlo a uno de los dos
 * extremos sería prometer o asustar de más.
 */
function fraseDelPuesto(p: PuestoActual): string {
  return p.mejor === p.peor
    ? `Vas ${puestoNum(p.mejor)}`
    : `Vas entre ${puestoNum(p.mejor)} y ${puestoNum(p.peor)}`;
}

/**
 * HASTA CUÁNTOS RIVALES SE NOMBRAN.
 *
 * Con 12 partidos pendientes la carrera de mejores segundos puede tener a
 * dieciséis parejas empatadas a puntos, y la tarjeta las listaba todas:
 * "estás empatado con Alejandro Castro / Bruno Ruiz, Alejandro Sánchez /
 * Bruno Rivera, …" — dieciséis nombres. Es cierto y no sirve de nada: decirle
 * a alguien que compite contra dieciséis parejas es decirle que compite contra
 * todo el mundo, que ya lo sabía, y además no puede seguirle la pista a
 * dieciséis nombres.
 *
 * Con dos o tres, los nombres SÍ son accionables: son rivales concretos, sabe
 * quiénes son y puede mirar sus partidos. A partir de ahí el número informa y
 * la lista abruma, así que se dice cuántos son y se acabó.
 */
const RIVALES_QUE_SE_NOMBRAN = 3;

/**
 * Dónde va en la pelea y qué le falta — no contra quién compite.
 *
 * `esDeSegundos` cambia solo el nombre de lo que se reparte: puestos de mejor
 * segundo, o pases directos si es la del bye.
 *
 * EL ORDEN ES LA PRIORIDAD. Son tres cifras y la tarjeta tiene que seguir
 * leyéndose de un vistazo, así que van de más a menos útil: primero dónde va y
 * cuántas plazas hay —la respuesta—, después lo que ya no alcanza, y al final
 * los empatados. Si alguna no se sabe, se cae sola y las demás siguen en pie.
 */
function fraseDeLaCarrera(c: Carrera | undefined, esDeSegundos: boolean): string | null {
  if (!c) return null;

  const partes: string[] = [];

  const reparto = esDeSegundos
    ? `${c.plazas} ${c.plazas === 1 ? 'puesto' : 'puestos'} de mejor segundo`
    : `${c.plazas} ${c.plazas === 1 ? 'pase directo' : 'pases directos'}`;

  // 1 · Dónde va, y por cuántas plazas se pelea. La respuesta.
  if (c.puestoActual && c.plazas > 0) {
    partes.push(`${fraseDelPuesto(c.puestoActual)} en la pelea por ${reparto}.`);
  } else if (c.plazas > 0) {
    // Sin puesto —empate que el reglamento no resuelve— al menos se dice qué
    // se reparte, en vez de callar la frase entera.
    partes.push(`Se reparten ${reparto}.`);
  }

  // 2 · Lo que ya no alcanza. `null` = no se enumeró la categoría, y entonces
  //     el puesto sí se sabe pero lo inalcanzable no: esta parte se calla.
  if (c.porDelanteSeguros !== null) {
    partes.push(
      c.porDelanteSeguros === 0
        // Cero es una buena noticia y se dice como tal: todo el que va delante
        // sigue estando a tiro. Omitirlo desperdiciaría la única frase de
        // ánimo que hay en la tarjeta.
        ? 'Nadie está fuera de tu alcance todavía.'
        : c.porDelanteSeguros === 1
          ? 'Hay 1 pareja por delante que ya no puedes alcanzar.'
          : `Hay ${c.porDelanteSeguros} parejas por delante que ya no puedes alcanzar.`,
    );
  }

  // 3 · Los empatados a puntos: nombres si son pocos, número si son muchos.
  const contra = c.dependeDeGamesContra;
  if (contra.length > 0) {
    // "Otras" solo si ya se habló de las de delante; si no, empieza la frase.
    const yaHuboOtras = c.porDelanteSeguros !== null && c.porDelanteSeguros > 0;
    partes.push(
      contra.length <= RIVALES_QUE_SE_NOMBRAN
        ? `Estás empatado a puntos con ${enumerar(contra)}: los separa la diferencia de games.`
        // "Otras" solo encaja detrás de las de delante; suelta pide "Hay".
        : yaHuboOtras
          ? `Otras ${contra.length} están empatadas contigo a puntos: las separa la diferencia de games.`
          : `Hay ${contra.length} parejas empatadas contigo a puntos: las separa la diferencia de games.`,
    );
  }

  return partes.length > 0 ? partes.join(' ') : null;
}

/**
 * Lo que se sabe del pase directo, que es una pregunta APARTE de la
 * clasificación.
 *
 * `null` cuando no hay nada que decir: sin byes en el cuadro, o cuando al
 * jugador no le aplica esa carrera.
 */
function fraseDelBye(a: AnalisisFuturo, primeraRonda?: string | null): string | null {
  const b = a.bye;
  if (!b || !b.aplica) return null;

  const ronda = primeraRonda ?? 'la primera ronda';

  // Ganado: es una segunda buena noticia y va detrás de la primera.
  if (estaGanada(b)) {
    return `Y te saltas ${ronda}: entras directo a la siguiente.`;
  }

  // TODAVÍA NO SE SABE. La carrera del pase directo no se puede resolver aún
  // aunque la clasificación sí. Se dice con los dos números —cuántos faltan y
  // con cuántos habrá respuesta—, que es lo que convierte una espera abierta
  // en una acotada.
  if (b.estado === 'demasiado_pronto') {
    const cuando = a.respondoCuandoQueden !== undefined
      ? ` Faltan ${a.faltan} partidos; te lo digo cuando queden ${a.respondoCuandoQueden}.`
      : ` Faltan ${a.faltan} partidos.`;
    return `Todavía no se sabe si te saltas ${ronda}.${cuando}`;
  }

  return null;
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
  // De qué carrera se habla. `repesca` viene `undefined` cuando el jugador es
  // primero de su grupo: NO ESTÁ EN ESA CARRERA, así que no se menciona ni se
  // pintan sus partidos — se cae a la del pase directo, que sí le aplica.
  const carreraVisible = a.repesca ?? (a.bye?.aplica ? a.bye : undefined);
  const partidos = (carreraVisible?.partidosQueImportan ?? []).map(redactar);
  const games = fraseDeLaCarrera(carreraVisible, carreraVisible === a.repesca);

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
  //
  // PRIMERO LA CERTEZA, DESPUÉS LO PENDIENTE.
  //   `estado` responde solo a "¿clasifico?", y aquí ya dijo que sí. Lo del bye
  //   es otra pregunta, con su propio estado, y puede seguir sin respuesta —
  //   Aldo va primero de su grupo con `advance_per_group` 1, así que está
  //   dentro seguro, y que se salte octavos o no depende de 27 partidos que no
  //   se han jugado.
  //
  //   Las dos cosas son ciertas a la vez. Contarlas al revés dejaba la
  //   incertidumbre del bye tapando la certeza de la clasificación, y la
  //   pantalla decía "todavía es pronto para saberlo" a alguien que ya había
  //   clasificado.
  if (a.estado === 'dentro') {
    // La certeza, con su prueba cuando la hay. `repesca` viene `undefined` si
    // el jugador es primero de grupo: no está en esa carrera, así que no se
    // habla de ella ni de su peor puesto.
    const peor = a.repesca?.peorPuestoPosible ?? null;
    const certeza = peor !== null
      ? `Pase lo que pase: lo peor que te puede tocar es ser ${puestoDeMejorSegundo(peor)}. Ya puedes descansar.`
      : 'Ningún resultado que quede puede dejarte fuera. Ya puedes descansar.';

    return {
      titular: 'Ya clasificaste',
      detalle: [certeza, fraseDelBye(a, primeraRonda)].filter(Boolean).join(' '),
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

/**
 * DÓNDE VA HOY: `Carrera.puestoActual` y `Carrera.porDelanteSeguros`
 *
 * Ya los devuelve el motor, con el MISMO comparador que usa `selectQualifiers`
 * al sembrar — deducirlos aquí, contando empatados y restando, habría creado
 * un segundo criterio que se separaría del real a la primera excepción.
 *
 *   · `puestoActual` NO es un número, es `{ mejor, peor }`, y a propósito. Con
 *     empates a puntos no hay un puesto limpio: si cinco parejas empatan con
 *     él, "vas 1.º" promete un desempate por games que no se ha jugado y "vas
 *     6.º" le esconde que puede ser el primero. Con `mejor === peor` la frase
 *     es "vas 4.º"; si no, "vas entre 1.º y 6.º", que es lo que se sabe.
 *
 *   · `porDelanteSeguros` son los que van delante en TODOS los escenarios: los
 *     que ya no alcanza pase lo que pase. `null` cuando la categoría no se
 *     pudo enumerar — ahí el puesto de hoy sí se sabe, pero lo inalcanzable no.
 *
 * Con eso esta función puede pasar de "en el peor de los casos quedarías 9.º"
 * a "vas 4.º y hay 3 por delante que ya no alcanzas".
 */
