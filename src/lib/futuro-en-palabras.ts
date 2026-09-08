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

/**
 * Un partido del que depende, ya redactado.
 *
 * EL SUYO NO ES UN PARTIDO MÁS DE LA LISTA
 *   La tarjeta le decía a Eduardo "Eduardo / Fernanda vs Néstor / Natalia · Te
 *   conviene que gane Eduardo / Fernanda". Le estaba diciendo que le conviene
 *   ganarse a sí mismo, y metiendo su propio partido en la misma lista que los
 *   ajenos bajo "son los únicos que pueden cambiar tu suerte".
 *
 *   Su partido no es algo que le pase: es algo que él hace. Va primero, se
 *   redacta como una instrucción —"Gana tu partido contra…"— y no comparte
 *   encabezado con lo que depende de otros.
 */
export interface PartidoRedactado {
  matchId: string;
  /**
   * Ajeno: "Luis / Pedro vs Sofía / Regina".
   * Suyo:  "Gana tu partido contra Néstor / Natalia".
   */
  partido: string;
  /** "Grupo C". */
  grupo: string;
  /** "Te conviene que ganen Luis / Pedro", o null si ningún lado le sirve más. */
  meConviene: string | null;
  /** Lo juega él. Ver arriba: cambia el texto y el orden. */
  esMio: boolean;
}

export type TonoFuturo = 'tranquilo' | 'espera' | 'fuera';

/**
 * Una cifra suelta, para pintarla como dato y no dentro de una frase.
 *
 * La tarjeta decía "Vas entre 1.º y 6.º en la pelea por 6 puestos de mejor
 * segundo. […] Hay 17 parejas empatadas contigo a puntos". Todo cierto, pero
 * había que leer el párrafo entero para sacar tres números — y es lo primero
 * que se ve al abrir la app, con el teléfono en una mano.
 */
export interface CifraDeCarrera {
  /** "6", "1.º–6.º", "17". */
  valor: string;
  /** "cupos", "tu posición", "empatados". */
  etiqueta: string;
}

export interface CarreraEnCifras {
  cifras: CifraDeCarrera[];
  /**
   * Lo que NO es un número y por eso sigue siendo prosa: quién ya está fuera de
   * su alcance, y qué separa a los empatados.
   */
  notas: string[];
}

export interface FuturoEnPalabras {
  /** La frase principal. Sustituye al texto genérico. */
  titular: string;
  /** El detalle, o null si el titular se basta. */
  detalle: string | null;
  tono: TonoFuturo;
  /** Los partidos que de verdad cambian su suerte. Vacío si no hay ninguno. */
  partidos: PartidoRedactado[];
  /** Las cifras de la pelea, para pintarlas sueltas. `null` si no hay carrera. */
  carrera: CarreraEnCifras | null;
  /**
   * El cierre accionable: que la app avisa sola.
   *
   * Solo cuando su suerte depende de resultados que NO controla, que es el
   * problema de origen — el jugador persiguiendo al organizador para saber si
   * le toca. Con la situación ya resuelta no hay nada que esperar y sobra.
   */
  aviso: string | null;
  /**
   * El bye está ASEGURADO: entra en la segunda ronda del cuadro pase lo que
   * pase.
   *
   * Es la condición que deja mirar `match_schedule` y decirle a qué hora juega
   * antes de que exista el cuadro. Sin garantía no se sabe ni en qué ronda
   * entra, y cualquier hora sería inventada. Ver `@/lib/hora-de-mi-ronda`.
   */
  byeGarantizado: boolean;
}

const ORDINAL = [
  '', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto',
  'séptimo', 'octavo', 'noveno', 'décimo',
];

/** "el sexto mejor segundo" / "el 12.º mejor segundo" cuando se sale de la tabla. */
function puestoDeMejorSegundo(n: number): string {
  // "el primer mejor segundo" es un trabalenguas: siendo el primero, lo que se
  // es es EL mejor segundo, sin ordinal delante.
  if (n === 1) return 'el mejor segundo';
  return ORDINAL[n] ? `el ${ORDINAL[n]} mejor segundo` : `el ${n}.º mejor segundo`;
}

/** "Luis / Pedro y Sofía / Regina" — una lista que se lee, no un array. */
function enumerar(xs: string[]): string {
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
}

/**
 * @param miPareja el nombre de la pareja del jugador, tal como lo devuelve el
 *   motor en `parejaA`/`parejaB`. Es lo que permite reconocer su partido.
 *
 *   Se compara por NOMBRE y no por id porque es lo único que el motor pone en
 *   `PartidoQueImporta`. Los nombres salen del mismo mapa `nombres` que se le
 *   pasó a `analizarFuturo`, así que la cadena es idéntica: no hay dos formas
 *   de escribir la misma pareja.
 */
function redactar(p: PartidoQueImporta, miPareja: string | null): PartidoRedactado {
  const esMio = miPareja !== null && (p.parejaA === miPareja || p.parejaB === miPareja);
  const grupo = `Grupo ${p.grupo}`;

  if (esMio) {
    const rival = p.parejaA === miPareja ? p.parejaB : p.parejaA;

    // Lo normal: le conviene ganar. Se dice como lo que es, una instrucción, y
    // no como un pronóstico sobre sí mismo.
    if (p.meConviene === miPareja) {
      return { matchId: p.matchId, partido: `Gana tu partido contra ${rival}`, grupo,
               meConviene: null, esMio: true };
    }

    // Los dos casos raros, que existen y no se pueden redactar como el normal:
    //   · `null` — importa que se juegue, pero ningún resultado le sirve más.
    //   · el rival — hay combinaciones donde le conviene perder. Es incómodo de
    //     leer y aun así es lo cierto; callarlo sería peor.
    return {
      matchId: p.matchId,
      partido: `Tu partido contra ${rival}`,
      grupo,
      meConviene: p.meConviene
        ? `Aquí te conviene que gane ${p.meConviene}`
        : 'Cualquiera de los dos resultados puede servirte, según lo demás',
      esMio: true,
    };
  }

  return {
    matchId: p.matchId,
    partido: `${p.parejaA} vs ${p.parejaB}`,
    grupo,
    // `null` del motor significa "importa, pero ningún resultado es mejor":
    // se dice así en vez de callarlo, porque un partido listado sin nada al
    // lado parece un dato a medias.
    meConviene: p.meConviene
      ? `Te conviene que gane ${p.meConviene}`
      : 'Cualquiera de los dos resultados puede servirte, según lo demás',
    esMio: false,
  };
}

/**
 * La frase que encabeza la lista.
 *
 * "Son los únicos que pueden cambiar tu suerte" solo vale para los AJENOS: lo
 * que hace él no es suerte. Con los dos tipos mezclados se dicen las dos cosas
 * por separado, y con solo los suyos se dice justo lo contrario.
 */
export function encabezadoDePartidos(partidos: PartidoRedactado[]): string | null {
  if (partidos.length === 0) return null;
  const mios = partidos.filter((p) => p.esMio).length;
  const ajenos = partidos.length - mios;

  if (mios === 0) return 'Son los únicos que pueden cambiar tu suerte; el resto ya no te afecta.';
  if (ajenos === 0) {
    return mios === 1
      ? 'No depende de nadie más: depende de ti.'
      : 'No dependen de nadie más: dependen de ti.';
  }
  return ajenos === 1
    ? 'El tuyo depende de ti. El otro es el único que puede cambiar tu suerte.'
    : 'El tuyo depende de ti. Los otros son los únicos que pueden cambiar tu suerte.';
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
function carreraEnCifras(
  c: Carrera | undefined,
  esDeSegundos: boolean,
): CarreraEnCifras | null {
  if (!c || c.plazas <= 0) return null;

  const cifras: CifraDeCarrera[] = [];
  const notas: string[] = [];

  // 1 · CUÁNTOS CUPOS HAY. La referencia contra la que se lee todo lo demás.
  cifras.push({
    valor: String(c.plazas),
    // ETIQUETAS CORTAS A PROPÓSITO: "cupos de mejor segundo" partía la fila de
    // tres cifras en dos líneas y se perdía el vistazo. Qué son esos cupos ya
    // lo dice la línea de reparto de arriba —"clasifican los 10 primeros de
    // grupo y los 6 mejores segundos"—, así que aquí sobra repetirlo.
    etiqueta: esDeSegundos
      ? (c.plazas === 1 ? 'cupo' : 'cupos')
      : (c.plazas === 1 ? 'pase directo' : 'pases directos'),
  });

  // 2 · EN QUÉ POSICIÓN VA. Un puesto si los empates lo permiten; si no, el
  //     rango, que es exactamente lo que se sabe.
  if (c.puestoActual) {
    const { mejor, peor } = c.puestoActual;
    cifras.push({
      valor: mejor === peor ? puestoNum(mejor) : `${puestoNum(mejor)}–${puestoNum(peor)}`,
      etiqueta: 'tu posición',
    });
  }

  // 3 · CON CUÁNTAS SE JUEGA EL PUESTO. Son DOS cosas distintas y no se suman:
  //
  //     · `dependeDeGamesContra` — todavía puede cambiar, porque a ellas (o a
  //       él) les quedan partidos.
  //     · `empatadosSinDesempate` — ya está todo jugado y salen exactamente
  //       iguales hasta el último criterio.
  //
  //     Solo una llega al tile, porque la fila es de TRES y una cuarta cifra la
  //     partía en dos líneas — que es justo lo que se acaba de arreglar. Manda
  //     lo que todavía se puede mover: es sobre lo que el jugador puede hacer
  //     algo. Las dos se cuentan en su nota, que es donde se explican.
  const enDisputa = c.dependeDeGamesContra;
  const igualadas = c.empatadosSinDesempate;

  //     LA ETIQUETA DICE QUÉ SE CUENTA. "en disputa" no decía ni que fueran
  //     parejas ni que les faltaran partidos: el 10 podía leerse como diez
  //     partidos pendientes. Ahora las dos empiezan por "parejas" y se separan
  //     por lo único que las distingue — si todavía se pueden mover o ya no.
  if (enDisputa.length > 0) {
    cifras.push({
      valor: String(enDisputa.length),
      etiqueta: enDisputa.length === 1 ? 'pareja por jugar' : 'parejas por jugar',
    });
  } else if (igualadas.length > 0) {
    cifras.push({
      valor: String(igualadas.length),
      etiqueta: igualadas.length === 1 ? 'pareja igualada' : 'parejas igualadas',
    });
  }

  // ── Lo que no es un número ───────────────────────────────────────────────

  // `null` = no se enumeró la categoría, y entonces el puesto sí se sabe pero
  // lo inalcanzable no: esta nota se calla.
  if (c.porDelanteSeguros !== null) {
    notas.push(
      c.porDelanteSeguros === 0
        // Cero es la única buena noticia de la tarjeta: se dice en positivo.
        ? 'Nadie está fuera de tu alcance todavía.'
        : c.porDelanteSeguros === 1
          ? 'Hay 1 pareja por delante que ya no puedes alcanzar.'
          : `Hay ${c.porDelanteSeguros} parejas por delante que ya no puedes alcanzar.`,
    );
  }

  // LO QUE TODAVÍA PUEDE CAMBIAR. A esas parejas les quedan partidos, así que
  // sus sets y sus games aún se mueven: no hay nada que afirmar todavía.
  if (enDisputa.length > 0) {
    notas.push(
      enDisputa.length <= RIVALES_QUE_SE_NOMBRAN
        // Pocos: los nombres son accionables, sabe a quién mirar.
        ? `Tu posición todavía puede cambiar: a ${enumerar(enDisputa)} les faltan partidos.`
        // Muchos: el número ya está en el tile, así que la nota no lo repite —
        // solo dice por qué está ahí.
        : 'Tu posición todavía puede cambiar: a esas parejas les faltan partidos.',
    );
  }

  // LO QUE YA NO SE PUEDE DECIDIR. Datos definitivos e idénticos hasta el
  // último criterio.
  //
  // AQUÍ NO SE PROMETE NINGÚN ORDEN. `selectQualifiers` sí las ordena —la
  // siembra necesita un orden total y cae a `pairId`—, pero eso es una decisión
  // técnica, no un hecho deportivo. Decirle al jugador que va por delante
  // porque su id ordena antes sería mentirle.
  if (igualadas.length > 0) {
    notas.push(
      igualadas.length <= RIVALES_QUE_SE_NOMBRAN
        ? `${enumerar(igualadas)} ${igualadas.length === 1 ? 'terminó' : 'terminaron'} con tus mismos puntos, sets y games. El reglamento no las separa de ti.`
        // Sin repetir el número, que ya está en el tile de arriba.
        : 'Terminaron con tus mismos puntos, sets y games. El reglamento no las separa de ti.',
    );
  }

  return { cifras, notas };
}

/**
 * CÓMO SE CLASIFICA EN ESTA CATEGORÍA. Faltaba por completo.
 *
 * "Pasan los primeros de cada grupo y 6 mejores segundos" y "pasan primeros,
 * segundos y algunos terceros" son torneos distintos, y el jugador leía su
 * posición sin saber cuál de los dos estaba jugando. Cada categoría del mismo
 * torneo puede repartir de otra forma, así que no vale con saberlo una vez.
 *
 * Sale de las mismas perillas que ya usa todo lo demás: grupos, cuántos pasan
 * por grupo y cuántos se repescan.
 */
export function comoSeClasifica(args: {
  categoria: string;
  grupos: number;
  pasanPorGrupo: number;
  repescados: number;
}): string | null {
  const { categoria, grupos, pasanPorGrupo, repescados } = args;
  if (grupos <= 0 || pasanPorGrupo <= 0) return null;

  const directos = pasanPorGrupo === 1
    ? `${grupos === 1 ? 'el primero' : `los ${grupos} primeros`} de grupo`
    : pasanPorGrupo === 2
      ? `los ${grupos * 2} primeros y segundos de grupo`
      : `los ${grupos * pasanPorGrupo} que pasan de cada grupo`;

  // La posición de los repescados sale de cuántos pasan directo: con 1 por
  // grupo son los mejores SEGUNDOS; con 2, los mejores terceros.
  const posicion = pasanPorGrupo === 1 ? 'segundos' : pasanPorGrupo === 2 ? 'terceros' : 'siguientes';
  const extra = repescados > 0
    ? ` y ${repescados === 1 ? `el mejor ${posicion.slice(0, -1)}` : `los ${repescados} mejores ${posicion}`}`
    : '';

  return `En ${categoria} clasifican ${directos}${extra}.`;
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
  /** El nombre de su pareja, para reconocer SU partido en la lista. */
  miPareja?: string | null,
): FuturoEnPalabras {
  // De qué carrera se habla. `repesca` viene `undefined` cuando el jugador es
  // primero de su grupo: NO ESTÁ EN ESA CARRERA, así que no se menciona ni se
  // pintan sus partidos — se cae a la del pase directo, que sí le aplica.
  // ASEGURADO = la carrera del bye está ganada: `peorPuestoPosible` cabe en
  // las plazas. Con `aplica` pero sin ganar, todavía se puede quedar fuera del
  // bye y entraría en la primera ronda — otra ronda y otra hora.
  const byeGarantizado = a.bye?.aplica === true && estaGanada(a.bye);

  const carreraVisible = a.repesca ?? (a.bye?.aplica ? a.bye : undefined);
  // EL SUYO PRIMERO. Es lo único de la lista sobre lo que puede hacer algo, y
  // leerlo después de tres partidos ajenos lo convierte en una nota al pie.
  // `sort` es estable, así que dentro de cada mitad se respeta el orden del
  // motor.
  const partidos = (carreraVisible?.partidosQueImportan ?? [])
    .map((p) => redactar(p, miPareja ?? null))
    .sort((x, y) => Number(y.esMio) - Number(x.esMio));
  const carrera = carreraEnCifras(carreraVisible, carreraVisible === a.repesca);

  /**
   * EL CIERRE ACCIONABLE.
   *
   * Es el problema de origen: el jugador que persigue al organizador para saber
   * si le toca. Decirle que la app avisa sola es lo que le deja guardar el
   * teléfono. Solo cuando de verdad hay algo que esperar — con la situación
   * resuelta no hay nada que avisar y sobraría.
   */
  const dependeDeOtros = a.estado === 'depende'
    || a.estado === 'demasiado_pronto'
    || a.estado === 'empate_sin_resolver'
    || (a.estado === 'dentro' && a.bye?.aplica === true && !estaGanada(a.bye));
  const aviso = dependeDeOtros
    ? 'No hace falta que preguntes: en cuanto se sepa, te lo decimos aquí.'
    : null;

  // ── Todavía no ha empezado ───────────────────────────────────────────────
  //
  //   Distinto de 'demasiado_pronto', que es un límite de cálculo. Aquí no hay
  //   nada que calcular: sin partidos propios no hay posición ni carrera, y
  //   decir "vas entre 1.º y 4.º" es presentar como posición la ausencia de
  //   datos — suena a que algo está decidido cuando no ha empezado nada.
  if (a.estado === 'sin_empezar') {
    return {
      titular: 'Todavía no has jugado',
      detalle: a.faltan > 0
        ? `Quedan ${a.faltan} ${a.faltan === 1 ? 'partido' : 'partidos'} en tu categoría. ` +
          'En cuanto juegues el primero, aquí te decimos a qué atenerte.'
        : 'En cuanto juegues el primero, aquí te decimos a qué atenerte.',
      tono: 'espera',
      partidos: [],
      // Sin carrera: no hay cifras que pintar, porque no hay nada que medir.
      carrera: null,
      // Nada que esperar todavía: el aviso es para cuando su suerte depende de
      // resultados que no controla, y aquí depende enteramente de él.
      aviso: null,
      // Sin haber jugado nada, ningún bye está asegurado.
      byeGarantizado: false,
    };
  }

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
      carrera: null,
      aviso,
      byeGarantizado,
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
      carrera,
      aviso,
      byeGarantizado,
    };
  }

  if (a.estado === 'fuera') {
    return {
      titular: 'Tu torneo terminó aquí',
      detalle: 'Ya no hay combinación de resultados que te meta en el cuadro. '
        + 'Gracias por jugar.',
      tono: 'fuera',
      partidos: [],
      carrera: null,
      aviso,
      byeGarantizado,
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
      carrera: null,
      aviso,
      byeGarantizado,
    };
  }

  // ── Depende ──────────────────────────────────────────────────────────────
  return {
    titular: partidos.length > 0
      ? (partidos.length === 1 ? 'Depende de un partido' : `Depende de ${partidos.length} partidos`)
      : 'Todavía depende de lo que pase',
    detalle: encabezadoDePartidos(partidos),
    tono: 'espera',
    partidos,
    carrera,
    aviso,
    byeGarantizado,
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
