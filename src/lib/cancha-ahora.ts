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
 * UN PARTIDO EMPIEZA CUANDO SE LIBERA LA CANCHA
 *   No cuando alguien lo apunta. `in_progress` se escribe al capturar el primer
 *   set —cuarenta minutos después de que la gente entrara— y `played_at` es la
 *   hora de la captura, no la del último punto. La única señal fiable de que un
 *   partido arrancó es que el ANTERIOR de esa cancha se cerró:
 *
 *       inicioReal = max(hora prevista, played_at del anterior en esa cancha)
 *
 *   El primero de la cola no tiene anterior y cuenta desde su hora prevista. Si
 *   el anterior acabó tarde, manda el anterior —contar desde la hora prevista
 *   exageraría el tiempo jugado—; si acabó pronto, manda la hora prevista,
 *   porque nadie entra a la cancha media hora antes.
 *
 *   Las tres cifras de la tarjeta —cuánto lleva, cuánto va de retraso y a qué
 *   hora entro— salen de ese mismo `inicioReal`, para que cuenten la misma
 *   historia.
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
   *
   * Decide QUIÉN ocupa, no DESDE CUÁNDO: el momento en que se escribe este
   * estado es el de la primera captura, que llega bastante después del primer
   * punto. Para el reloj manda `inicioReal`.
   */
  enJuego?: boolean;
  /**
   * Lo que hace falta para PINTAR este partido en la cola detallada
   * (`EstadoDeCancha.colaDetallada`), no para calcular nada de lo de arriba.
   * Opcionales: quien solo necesita `ocupanteId`/`partidosAntesDelMio` —el
   * comportamiento de siempre— no tiene que mandarlos.
   */
  categoria?: string;
  etapa?: string;
  parejaA?: string;
  parejaB?: string;
  /**
   * Los games de cada set, por pareja: `[[6,2],[3,1]]` es 6-2 y 3-1. Mismo
   * formato que `Ocupante.sets` en EnMiCancha, para poder reusar `ganaA`/
   * `ganaB` sobre la cola entera. Vacío o ausente = sin sets capturados —
   * nunca se rellena con un `[0,0]` inventado.
   */
  marcador?: Array<[number, number]>;
}

/**
 * Un partido de la cola, ya con lo necesario para pintarlo (no solo su id).
 * Ver `EstadoDeCancha.colaDetallada`.
 */
export interface PartidoDeCola {
  id: string;
  categoria: string;
  etapa: string;
  parejaA: string;
  parejaB: string;
  /** Hora publicada, ISO. Nunca null aquí: `cola` ya descartó los sin hora. */
  scheduledAt: string;
  finished: boolean;
  enJuego: boolean;
  /** Como `Ocupante.sets`. `[]` sin sets capturados. */
  marcador: Array<[number, number]>;
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
  /**
   * Los partidos de esta cancha ANTES del mío, en orden de hora — con
   * categoría, parejas, hora y marcador para poder pintarlos.
   *
   * NO es lo mismo que `colaAntesDelMio`: aquella solo cuenta lo que falta
   * por jugar (los terminados no cuentan, porque no hay nada que esperar de
   * ellos). Esta trae TODOS los de antes, terminados incluidos — porque aquí
   * no se cuenta una espera, se pinta una cola: "el de las 14:00 ya acabó
   * 6-4 6-3, el de las 15:00 va 6-2 3-1 ahora mismo".
   *
   * El bye no aparece: nace sin `scheduled_at` (no ocupa cancha, no se
   * juega) y `cola` ya descarta los partidos sin hora.
   */
  colaDetallada: PartidoDeCola[];
  /**
   * Lo de esta cancha ya no es de hoy: no hay NADA que decir.
   *
   * EL BUG QUE LO TRAE: "Tu cancha lleva 52 horas y 34 minutos de retraso",
   * en un torneo que había terminado dos días antes. Un partido que nunca se
   * capturó se queda 'sin terminar' para siempre, y como el ocupante empuja la
   * cola hasta `ahora`, el retraso de lo que viene detrás crecía sin límite.
   *
   * Con esto en `true` el resto del estado va vacío y quien pinta se calla. No
   * se inventa un mensaje: la app no puede distinguir "el torneo terminó" de
   * "ese partido no se jugó", y las dos cosas se contestan igual — callándose.
   */
  sinJornada: boolean;
}

const MIN = 60_000;

/**
 * Cuánto puede estirarse una jornada antes de que la cancha deje de significar
 * nada.
 *
 * DOCE HORAS. Un día de torneo va de la mañana a la noche —las ventanas que
 * captura el organizador rondan 8:00–22:00— así que doce horas cubren de sobra
 * cualquier retraso real y no llegan a cubrir el día siguiente. Por encima de
 * eso no hay retraso que contar: hay una fila que nadie cerró.
 *
 * Se mide en horas y no en días de calendario a propósito: el módulo es puro y
 * no sabe de husos, y "hace catorce horas" es igual de inútil un martes que un
 * miércoles.
 */
export const HORAS_DE_JORNADA = 12;

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
    partidosAntesDelMio: 0, colaAntesDelMio: [], colaDetallada: [],
    sinJornada: false,
  };
  if (cola.length === 0) return vacio;

  /** Pasó hace tanto que ya no es de esta jornada. Ver `HORAS_DE_JORNADA`. */
  const caducado = (t: number) => ahora - t > HORAS_DE_JORNADA * 60 * MIN;

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
  /** La cola completa de antes, terminados incluidos — ver `colaDetallada`. */
  const detalleAntesDelMio: PartidoDeCola[] = [];
  let yaLlegueAlMio = false;

  for (const p of cola) {
    const previsto = ms(p.scheduledAt)!;
    // No puede empezar antes de su hora ni antes de que la cancha se libere.
    const inicioReal = Math.max(previsto, libreDesde);

    if (p.id === miMatchId) {
      miInicio = inicioReal;
      miPrevisto = previsto;
      yaLlegueAlMio = true;
    } else if (!yaLlegueAlMio) {
      // Terminado o no, es un partido de esta cancha que va ANTES del mío en
      // la hora: entra en la cola que se pinta completa.
      detalleAntesDelMio.push({
        id: p.id,
        categoria: p.categoria ?? '—',
        etapa: p.etapa ?? '',
        parejaA: p.parejaA ?? '—',
        parejaB: p.parejaB ?? '—',
        scheduledAt: p.scheduledAt as string, // `cola` ya descartó los sin hora
        finished: p.finished,
        enJuego: !!p.enJuego,
        marcador: p.marcador ?? [],
      });
      if (!p.finished) {
        // Sin terminar y por delante: es tiempo que voy a esperar de verdad.
        antesDelMio.push(p.id);
      }
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
    // Y NO SI CADUCÓ. Un partido de anteayer sin capturar no está ocupando
    // ninguna pista: es una fila que nadie cerró. Dejarlo como ocupante era lo
    // que arrastraba la cola hasta `ahora` y disparaba el retraso de los de
    // atrás.
    if (ocupanteId === null && (p.enJuego || ahora >= inicioReal) && !caducado(inicioReal)) {
      ocupanteId = p.id;
      // `inicioReal` Y NADA MÁS.
      //
      // Aquí había un `Math.min(inicioReal, ahora)` para los partidos en juego,
      // y era el bug: `in_progress` se escribe cuando el juez captura el PRIMER
      // SET, o sea unos cuarenta minutos después de que la gente entrara a la
      // pista. Con ese `min`, el reloj arrancaba en ese instante y la tarjeta
      // decía "lleva 0 min" de un partido que llevaba media hora larga. Cierto
      // y sin ningún valor.
      //
      // El único instante que la app conoce de verdad es cuándo se liberó la
      // cancha —el `played_at` del anterior—, y eso ya está dentro de
      // `inicioReal`. Un negativo (partido en juego antes de su hora, sin nadie
      // delante) lo absorbe el clamp del `return`.
      ocupanteDesde = inicioReal;
    }

    // Para lo que viene detrás: lo antes que puede acabar es su duración
    // nominal, pero si está EN JUEGO tampoco antes de ahora — lleva 75 minutos
    // y sigue en la pista.
    const finPrevisto = inicioReal + dur;
    libreDesde = ocupanteId === p.id ? Math.max(finPrevisto, ahora) : finPrevisto;
  }

  // MI PARTIDO ERA DE OTRO DÍA: nada de esta cancha significa ya nada. Ni el
  // retraso, ni la hora de entrada, ni el reloj del ocupante — los tres salen
  // del mismo cálculo y los tres mienten igual.
  if (miPrevisto !== null && caducado(miPrevisto)) {
    return { ...vacio, sinJornada: true };
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
    colaDetallada: detalleAntesDelMio,
    sinJornada: false,
  };
}

/**
 * Cuántos partidos faltan antes del mío, dicho como se dice.
 *
 * "FALTA 1 PARTIDO ANTES DEL TUYO" SE LEÍA MAL.
 *   Con un partido en curso y el suyo detrás, esa frase da a entender que falta
 *   ESE MÁS OTRO: el que se está jugando ya no "falta", está pasando. El jugador
 *   entendía que le quedaban dos esperas cuando le quedaba una.
 *
 *   Un partido en juego no es una espera pendiente, es la espera actual. Así que
 *   cuando lo único que hay por delante es él, se dice por lo que es: "vas
 *   después de este partido".
 *
 * Contar sí tiene sentido de dos en adelante, porque ahí el número informa: dos
 * o tres partidos son esperas distintas.
 *
 * `null` cuando soy el siguiente: "faltan 0 partidos" es una forma rara de dar
 * una buena noticia, y ese caso lo dice mejor `fraseDeTurno`.
 */
export function fraseDeCola(partidosAntes: number, hayOcupante = false): string | null {
  if (partidosAntes <= 0) return null;
  if (partidosAntes === 1) {
    return hayOcupante
      ? 'Vas después de este partido.'
      // Uno por delante que TODAVÍA NO EMPIEZA sí es algo que falta.
      : 'Falta 1 partido antes del tuyo.';
  }
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
