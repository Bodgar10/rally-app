/**
 * RALLY · Las preguntas del organizador, y dónde se contestan
 *
 * EL PROBLEMA
 *   El panel tiene trece apartados y ninguno explica qué hace. "Cuántos
 *   clasifican" y "Horarios de la fase de grupos" son títulos que ya sabe leer
 *   quien ya sabe qué son; el organizador nuevo abre y deduce.
 *
 * ESTE ARCHIVO ES EL TEXTO, Y SOLO EL TEXTO
 *   Para cambiar una respuesta, añadir una pregunta o cambiar a dónde lleva un
 *   enlace, se toca AQUÍ y no se toca ningún componente. `AyudaOrganizador`
 *   pinta lo que haya en `PREGUNTAS`; no sabe cuántas son ni de qué hablan.
 *
 * CÓMO SE ESCRIBEN
 *   · La PREGUNTA, como la haría él: "¿Cómo cambio las fechas?", no
 *     "Configuración de fechas". Si no se puede leer en voz alta sin sonar a
 *     manual, está mal escrita.
 *   · La RESPUESTA, dos frases. Lo que hace y lo que hay que saber antes de
 *     hacerlo. Un párrafo largo aquí no se lee: quien abre la ayuda tiene la
 *     pantalla a medias y a alguien esperando.
 *   · Y SIEMPRE termina en la pantalla donde se hace. Una respuesta que
 *     explica pero no lleva obliga a buscar la tarjeta en una rejilla de trece.
 *
 * EL ORDEN LO PONE EL CONTEXTO, NO EL AUTOR
 *   Las de la pantalla donde está el usuario van primero. El resto sigue
 *   debajo, visible: el que no sabe dónde está es justo el que necesita buscar,
 *   y esconder las otras doce lo dejaría sin nada.
 */

/**
 * El último segmento de la ruta del organizador: 'fechas', 'horarios'…
 * `'panel'` es el índice del torneo, y `'otra'` cualquier sitio que no sea de
 * este panel (o uno nuevo que nadie ha registrado todavía).
 */
export type PantallaOrg = string;

export interface PreguntaDeAyuda {
  id: string;
  /** Tal como la haría el organizador, en voz alta. */
  pregunta: string;
  /** Dos frases. Qué hace y qué hay que saber antes. */
  respuesta: string;
  /**
   * Segmento de la pantalla donde se hace. `null` = el panel del torneo.
   * El enlace se arma con el id del torneo en tiempo de render.
   */
  pantalla: string | null;
  /** Texto del enlace: "Ir a Fechas". */
  enlace: string;
}

/**
 * Las preguntas.
 *
 * Añadir una es añadir un objeto aquí. El orden de este array solo decide los
 * desempates dentro de un mismo grupo: el orden que se ve lo pone el contexto.
 */
export const PREGUNTAS: PreguntaDeAyuda[] = [
  // ── Configuración del torneo ──────────────────────────────────────────────
  {
    id: 'fechas',
    pregunta: '¿Cómo cambio las fechas del torneo?',
    respuesta:
      'Eliges el día de inicio y el de cierre en el calendario. Si ya hay ' +
      'partidos programados, cambiar las fechas no los mueve solo: revisa el ' +
      'calendario después.',
    pantalla: 'fechas',
    enlace: 'Ir a Fechas',
  },
  {
    id: 'sede',
    pregunta: '¿Dónde pongo el club donde se juega?',
    respuesta:
      'La sede es lo que ven los jugadores al inscribirse y lo que sale en su ' +
      'pantalla el día del torneo. Si el club no está en la lista, se crea ahí ' +
      'mismo.',
    pantalla: 'sede',
    enlace: 'Ir a Sede',
  },
  {
    id: 'categorias',
    pregunta: '¿Cómo agrego o quito una categoría?',
    respuesta:
      'Cada categoría es una competencia aparte, con sus grupos y su cuadro. ' +
      'Quitar una borra sus inscripciones, así que solo se puede mientras no ' +
      'tenga parejas.',
    pantalla: 'categorias',
    enlace: 'Ir a Categorías',
  },
  {
    id: 'cuota',
    pregunta: '¿Cómo cambio el precio de la inscripción?',
    respuesta:
      'La cuota es por pareja y se cobra al inscribirse. Puedes poner una ' +
      'distinta en una categoría concreta sin tocar las demás.',
    pantalla: 'cuota',
    enlace: 'Ir a Cuota de inscripción',
  },
  {
    id: 'canchas',
    pregunta: '¿Para qué sirve decir cuántas canchas tengo?',
    respuesta:
      'Con las canchas y los horarios, la app calcula si el torneo cabe en los ' +
      'días que le diste. Sin ese dato no puede avisarte de que no cabe.',
    pantalla: 'canchas',
    enlace: 'Ir a Canchas',
  },
  {
    id: 'horarios',
    pregunta: '¿Qué son los horarios del torneo?',
    respuesta:
      'Es la ventana de juego de cada día: de qué hora a qué hora se usa el ' +
      'club. De ahí sale cuántos partidos entran, junto con las canchas y la ' +
      'duración de cada uno.',
    pantalla: 'horarios',
    enlace: 'Ir a Horarios',
  },
  {
    id: 'formato',
    pregunta: '¿Juego el partido por el tercer lugar?',
    respuesta:
      'Con el tercer lugar activado, los dos perdedores de semifinales juegan ' +
      'un partido más por categoría. Ocupa canchas el último día, justo cuando ' +
      'más apretado va.',
    pantalla: 'formato',
    enlace: 'Ir a Formato',
  },
  {
    id: 'clasificados',
    pregunta: '¿Cuántos pasan de cada grupo?',
    respuesta:
      'Eliges cuántos avanzan por grupo y cuántos entran de repesca entre los ' +
      'mejores que no pasaron. Los dos números deciden el tamaño del cuadro.',
    pantalla: 'clasificados',
    enlace: 'Ir a Cuántos clasifican',
  },
  {
    id: 'bloques',
    pregunta: '¿Qué son los horarios de la fase de grupos?',
    respuesta:
      'Cada grupo juega sus partidos seguidos en una cancha: eso es un bloque. ' +
      'Aquí se ve si los bloques caben en los días y las canchas que tienes.',
    pantalla: 'bloques',
    enlace: 'Ir a Horarios de la fase de grupos',
  },

  // ── El paso que cambia el torneo de estado ────────────────────────────────
  {
    id: 'cerrar-inscripciones',
    pregunta: '¿Qué pasa cuando cierro inscripciones?',
    respuesta:
      'Se arman los grupos de esa categoría y se crean sus partidos: a partir ' +
      'de ahí nadie más se puede inscribir en ella. Se cierra categoría por ' +
      'categoría, no el torneo entero de golpe.',
    pantalla: 'cerrar-inscripciones',
    enlace: 'Ir a Cerrar inscripciones',
  },
  {
    id: 'sembrar',
    pregunta: '¿Cuándo puedo armar el cuadro?',
    respuesta:
      'Cuando la fase de grupos de esa categoría esté terminada y las ' +
      'posiciones no dependan de ningún partido pendiente. La pantalla te dice ' +
      'cuáles están listas y qué le falta a las demás.',
    pantalla: 'sembrar',
    enlace: 'Ir a Sembrar los cuadros',
  },

  // ── Durante el torneo ─────────────────────────────────────────────────────
  {
    id: 'calendario',
    pregunta: '¿Dónde asigno las horas y las canchas?',
    respuesta:
      'El calendario reparte los partidos del último día entre las canchas y ' +
      'las horas disponibles. Te avisa si dos partidos de la misma pareja se ' +
      'enciman.',
    pantalla: 'calendario',
    enlace: 'Ir a Calendario',
  },
  {
    id: 'grupos',
    pregunta: '¿Dónde veo las tablas y capturo resultados?',
    respuesta:
      'En Grupos están las tablas de cada categoría y sus partidos. Puedes ' +
      'capturar un marcador desde ahí sin ser el juez asignado.',
    pantalla: 'grupos',
    enlace: 'Ir a Grupos',
  },
  {
    id: 'empate',
    pregunta: '¿Qué pasa si dos parejas empatan en todo?',
    respuesta:
      'El reglamento las separa por puntos, sets, games y el partido entre ' +
      'ellas. Cuando ni eso alcanza —tres parejas que se ganaron en círculo—, ' +
      'la app te lo marca en la tabla del grupo para que lo resuelvas tú.',
    pantalla: 'grupos',
    enlace: 'Ir a Grupos',
  },
  {
    id: 'jueces',
    pregunta: '¿Cómo pongo a alguien a capturar resultados?',
    respuesta:
      'Un juez asignado ve los partidos del torneo en su teléfono y captura ' +
      'los marcadores. No hace falta que sea del club: basta con que tenga ' +
      'cuenta.',
    pantalla: 'jueces',
    enlace: 'Ir a Jueces',
  },

  // ── Parejas ───────────────────────────────────────────────────────────────
  {
    id: 'agregar-pareja',
    pregunta: '¿Cómo agrego una pareja a mano?',
    respuesta:
      'Para quien te pagó por fuera o no usa la app. Los inscribes tú por su ' +
      'nombre y quedan igual que si se hubieran inscrito solos.',
    pantalla: 'agregar-pareja',
    enlace: 'Ir a Registrar pareja a mano',
  },
  {
    id: 'parejas',
    pregunta: '¿Dónde veo quién está inscrito?',
    respuesta:
      'La lista de parejas por categoría, con quién pagó y quién no. Desde ahí ' +
      'también se da de baja a una pareja.',
    pantalla: 'parejas',
    enlace: 'Ir a Inscritas',
  },
];

/**
 * De qué pantalla del panel viene una ruta.
 *
 * Las rutas del organizador son `/(organizer)/org/torneos/<id>/<pantalla>`, y
 * el índice del torneo no tiene último segmento propio. Se mira el segmento
 * final contra las pantallas que alguien nombró en `PREGUNTAS`, en vez de
 * mantener una segunda lista que se desincronice: una pantalla sin preguntas no
 * es un contexto, es una pantalla sin ayuda todavía.
 */
export function pantallaDeRuta(pathname: string): PantallaOrg {
  const conocidas = new Set(
    PREGUNTAS.map((p) => p.pantalla).filter((p): p is string => p !== null),
  );
  const ultimo = pathname.split('?')[0].split('/').filter(Boolean).pop() ?? '';
  return conocidas.has(ultimo) ? ultimo : 'otra';
}

/**
 * Las preguntas partidas en dos: las de aquí y todas las demás.
 *
 * NO SE FILTRA, SE ORDENA. Quitar las que no son de esta pantalla dejaría sin
 * respuesta justo al que se perdió, que es quien abre la ayuda. Lo que hace el
 * contexto es ahorrarle el desplazamiento, no decidir por él.
 */
export function preguntasPorContexto(pantalla: PantallaOrg): {
  aqui: PreguntaDeAyuda[];
  resto: PreguntaDeAyuda[];
} {
  if (pantalla === 'otra') return { aqui: [], resto: PREGUNTAS };
  return {
    aqui: PREGUNTAS.filter((p) => p.pantalla === pantalla),
    resto: PREGUNTAS.filter((p) => p.pantalla !== pantalla),
  };
}

/** La ruta a la que lleva el enlace de una pregunta. */
export function rutaDePregunta(p: PreguntaDeAyuda, tournamentId: string): string {
  const base = `/(organizer)/org/torneos/${tournamentId}`;
  return p.pantalla ? `${base}/${p.pantalla}` : base;
}
