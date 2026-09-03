/**
 * RALLY · Qué se juega ahora mismo en mi cancha, y cuánto va tarde
 *
 * EL CASO REAL
 *   Un jugador tenía partido a las 10:00. Se levantó a las 8:30, llegó a las
 *   9:30 y jugó a las 10:40, porque su cancha estaba ocupada con una categoría
 *   que no era la suya. La información que necesitaba no estaba en su
 *   categoría: estaba en la cancha.
 *
 * DOS SEÑALES, Y LA BUENA ES NUEVA
 *   `matches.status = 'in_progress'` es la respuesta directa a "qué se está
 *   jugando". Cuando se escribió este módulo NADIE la escribía —un partido iba
 *   de 'scheduled' a 'finished' de golpe al capturar—, así que había que
 *   deducirlo. Con la captura set a set el estado sí se escribe, y se usa
 *   cuando está: `enJuego`.
 *
 *   La deducción por cola se queda porque sigue haciendo falta. Un partido al
 *   que aún no le han capturado el primer set está en 'scheduled' aunque la
 *   gente esté en la pista, y ahí la cola es lo único que hay.
 *
 * LA CANCHA ES UNA COLA, Y CON ESO BASTA CUANDO NO HAY SEÑAL
 *   Una cancha juega sus partidos en orden de horario, uno detrás de otro. El
 *   que la ocupa es EL PRIMERO SIN TERMINAR. No hay que adivinar duraciones: un
 *   partido que lleva 75 minutos sigue siendo el primero sin terminar, así que
 *   sigue ocupando — que es justo el caso que rompe "el que empezó hace menos de
 *   una hora".
 *
 * EL RETRASO SE PROPAGA POR LA COLA, COMO EN EL CLUB
 *   El inicio real de cada partido es `max(su hora prevista, cuándo acabó el
 *   anterior)`. De un partido terminado sabemos cuándo acabó: `played_at`, que
 *   la RPC de captura pone a `now()`. Encadenando eso desde el principio del día
 *   sale la hora a la que de verdad va a entrar cada uno, y la diferencia con su
 *   hora publicada es el retraso — el número que convierte "levántate a las
 *   8:30" en "puedes dormir media hora más".
 *
 * LO QUE ESTO ASUME, Y CUÁNDO FALLA
 *   Que el juez captura al terminar. Si captura media hora tarde, esta función
 *   cree que el partido anterior sigue en la cancha y sobrestima el retraso.
 *   Es el error seguro: hace llegar antes, no después.
 *
 *   Con la captura set a set eso se corrige solo: en cuanto el juez anota el
 *   primer set, el partido pasa a 'in_progress' y `enJuego` manda sobre
 *   cualquier deducción.
 */

/** Un partido de la cancha, con lo mínimo para ordenarlo y cronometrarlo. */
export interface PartidoEnCancha {
  id: string;
  /** Hora publicada. Null = sin programar; no entra en la cola. */
  scheduledAt: string | null;
  /** Cuándo se capturó ≈ cuándo terminó. Null si sigue sin terminar. */
  playedAt: string | null;
  finished: boolean;
  /**
   * El partido está EN JUEGO ahora mismo (`matches.status = 'in_progress'`).
   *
   * CUANDO SE ESCRIBIÓ ESTE MÓDULO NADIE ESCRIBÍA ESE ESTADO: un partido iba de
   * 'scheduled' a 'finished' de golpe, así que la única forma de saber qué
   * ocupaba la cancha era deducirlo de la cola. Con la captura set a set el
   * estado SÍ se escribe, y es una señal mucho mejor que cualquier deducción:
   * no hay que suponer que empezó a su hora.
   *
   * Un partido en juego ocupa la cancha SIN MIRAR EL RELOJ. La deducción por
   * cola exige que su hora ya haya llegado —si no, la cancha está libre
   * esperándolo—, pero un partido que arrancó antes de lo previsto está
   * ocupando la pista igualmente, y decir "libre" ahí sería falso.
   */
  enJuego?: boolean;
}

export interface EstadoDeCancha {
  /** El partido que ocupa la cancha AHORA. Null si está libre. */
  ocupanteId: string | null;
  /** Inicio real estimado del ocupante, ISO. */
  ocupanteDesde: string | null;
  /** Minutos que lleva jugándose. 0 si no hay ocupante. */
  ocupanteLleva: number;
  /**
   * Cuándo entra de verdad MI partido, ISO. Null si no está en la cola.
   * Es `max(mi hora, cuando se libere la cancha)`.
   */
  miInicioEstimado: string | null;
  /** Minutos que voy a entrar más tarde de lo publicado. 0 si voy en hora. */
  miRetraso: number;
  /**
   * Partidos que faltan en esta cancha ANTES del mío, el que se está jugando
   * incluido. Los ya terminados no cuentan: no queda nada por esperar de ellos.
   *
   * "Cuál se juega ahora" no contesta la pregunta que se hace el jugador. Saber
   * que hay DOS partidos por delante en vez de ser el siguiente es la diferencia
   * entre ir saliendo de casa y sentarse otra vez.
   *
   * 0 = el siguiente en entrar soy yo.
   */
  partidosAntesDelMio: number;
  /** Los ids de esos partidos, en orden de cancha. El primero es el ocupante. */
  colaAntesDelMio: string[];
}

const MIN = 60_000;

const ms = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * El estado de una cancha en un instante.
 *
 * `partidos` son TODOS los de esa cancha, de cualquier categoría — la del
 * jugador y las demás, que es de donde venía la sorpresa.
 */
export function estadoDeCancha(args: {
  partidos: PartidoEnCancha[];
  /** El partido del usuario en esa cancha. */
  miMatchId: string;
  /** Instante de referencia, en ms. Se pasa para poder probarlo. */
  ahora: number;
  /** Duración nominal. Solo se usa para PROYECTAR lo que aún no ha empezado. */
  minutosPorPartido: number;
}): EstadoDeCancha {
  const { miMatchId, ahora, minutosPorPartido } = args;
  const dur = minutosPorPartido * MIN;

  // Sin hora no hay sitio en la cola: un partido sin programar no ocupa nada.
  const cola = args.partidos
    .filter((p) => ms(p.scheduledAt) !== null)
    .sort((a, b) => (ms(a.scheduledAt)! - ms(b.scheduledAt)!) || a.id.localeCompare(b.id));

  const vacio: EstadoDeCancha = {
    ocupanteId: null, ocupanteDesde: null, ocupanteLleva: 0,
    miInicioEstimado: null, miRetraso: 0,
    partidosAntesDelMio: 0, colaAntesDelMio: [],
  };
  if (cola.length === 0) return vacio;

  /** Cuándo queda libre la cancha, según lo recorrido hasta ahora. */
  let libreDesde = -Infinity;
  let ocupanteId: string | null = null;
  let ocupanteDesde: number | null = null;
  let miInicio: number | null = null;
  let miPrevisto: number | null = null;
  /**
   * Lo que queda por jugarse delante de mí. Se va acumulando y se CORTA al
   * llegar a mi partido: lo que viene detrás no me hace esperar.
   */
  const antesDelMio: string[] = [];
  let yaLlegueAlMio = false;

  for (const p of cola) {
    const previsto = ms(p.scheduledAt)!;
    // No puede empezar antes de su hora ni antes de que la cancha se libere.
    const inicioReal = Math.max(previsto, libreDesde);

    if (p.id === miMatchId) {
      miInicio = inicioReal;
      miPrevisto = previsto;
      yaLlegueAlMio = true;
    } else if (!yaLlegueAlMio && !p.finished) {
      // Sin terminar y por delante: es tiempo que voy a esperar de verdad.
      antesDelMio.push(p.id);
    }

    if (p.finished) {
      // Terminado: sabemos cuándo acabó de verdad. Sin `played_at` —no debería
      // pasar, la RPC lo pone siempre— se cae a la duración nominal.
      const fin = ms(p.playedAt) ?? inicioReal + dur;
      // `max` con el inicio: un `played_at` anterior al inicio dejaría la cola
      // corriendo hacia atrás.
      libreDesde = Math.max(fin, inicioReal);
      continue;
    }

    // El primero sin terminar. Ocupa la cancha si su hora real ya llegó — o si
    // está EN JUEGO, que es una señal directa y no una deducción: un partido
    // que arrancó antes de su hora ocupa la pista igual.
    if (ocupanteId === null && (p.enJuego || ahora >= inicioReal)) {
      ocupanteId = p.id;
      // Si arrancó antes de lo previsto, lleva jugándose desde antes de su
      // hora; contarlo desde `inicioReal` daría un "lleva -10 min".
      ocupanteDesde = p.enJuego ? Math.min(inicioReal, ahora) : inicioReal;
    }

    // Para lo que viene detrás: si está en juego, lo antes que puede acabar es
    // su duración nominal, pero nunca antes de ahora — lleva 75 minutos y sigue.
    libreDesde = Math.max(inicioReal + dur, ocupanteId === p.id ? ahora : inicioReal + dur);
  }

  return {
    ocupanteId,
    ocupanteDesde: ocupanteDesde === null ? null : new Date(ocupanteDesde).toISOString(),
    ocupanteLleva: ocupanteDesde === null ? 0 : Math.max(0, Math.round((ahora - ocupanteDesde) / MIN)),
    miInicioEstimado: miInicio === null ? null : new Date(miInicio).toISOString(),
    miRetraso: miInicio === null || miPrevisto === null
      ? 0
      : Math.max(0, Math.round((miInicio - miPrevisto) / MIN)),
    partidosAntesDelMio: antesDelMio.length,
    colaAntesDelMio: antesDelMio,
  };
}

/**
 * Cuántos partidos faltan antes del mío, dicho como se dice.
 *
 * `null` cuando soy el siguiente: "faltan 0 partidos" es una forma rara de dar
 * una buena noticia, y ese caso lo dice mejor `fraseDeTurno`.
 */
export function fraseDeCola(partidosAntes: number): string | null {
  if (partidosAntes <= 0) return null;
  if (partidosAntes === 1) return 'Falta 1 partido antes del tuyo.';
  return `Faltan ${partidosAntes} partidos antes del tuyo.`;
}

/**
 * El turno, para el caso bueno: eres el siguiente en entrar.
 *
 * Se separa de `fraseDeCola` porque no es la misma información — una dice
 * cuánto esperas, la otra que no esperas nada— y porque es la única que hace
 * levantarse del sillón.
 */
export function fraseDeTurno(partidosAntes: number, hayOcupante: boolean): string | null {
  if (partidosAntes > 0) return null;
  return hayOcupante
    ? 'Eres el siguiente: entras cuando acabe este partido.'
    : 'Tu cancha está libre: eres el siguiente en entrar.';
}

/**
 * El retraso, dicho como se dice.
 *
 * Por debajo de 10 minutos no se menciona: en un torneo real eso es puntualidad,
 * y anunciarlo entrenaría al jugador a ignorar el aviso justo antes del día en
 * que sean cuarenta.
 */
export function fraseDeRetraso(minutos: number): string | null {
  if (minutos < 10) return null;
  if (minutos < 60) return `Tu cancha lleva ${minutos} minutos de retraso.`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  const horas = `${h} ${h === 1 ? 'hora' : 'horas'}`;
  return m === 0
    ? `Tu cancha lleva ${horas} de retraso.`
    : `Tu cancha lleva ${horas} y ${m} minutos de retraso.`;
}
