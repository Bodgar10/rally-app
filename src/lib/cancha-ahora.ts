/**
 * RALLY · Qué se juega ahora mismo en mi cancha, y cuánto va tarde
 *
 * EL CASO REAL
 *   Un jugador tenía partido a las 10:00. Se levantó a las 8:30, llegó a las
 *   9:30 y jugó a las 10:40, porque su cancha estaba ocupada con una categoría
 *   que no era la suya. La información que necesitaba no estaba en su
 *   categoría: estaba en la cancha.
 *
 * `matches.status` NO SIRVE PARA SABER QUÉ SE ESTÁ JUGANDO
 *   El enum tiene 'in_progress', pero nadie lo escribe nunca: un partido pasa de
 *   'scheduled' a 'finished' cuando el juez captura, sin estado intermedio. Así
 *   que "qué partido está en juego" no está guardado en ninguna columna.
 *
 * LA CANCHA ES UNA COLA, Y ESO ES TODO LO QUE HACE FALTA
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
 *   Es el error seguro: hace llegar antes, no después. Cuando exista la captura
 *   incremental —el otro chat la está haciendo— habrá una señal mejor de "esto
 *   está en juego", y solo cambia `ocupanteDe`.
 */

/** Un partido de la cancha, con lo mínimo para ordenarlo y cronometrarlo. */
export interface PartidoEnCancha {
  id: string;
  /** Hora publicada. Null = sin programar; no entra en la cola. */
  scheduledAt: string | null;
  /** Cuándo se capturó ≈ cuándo terminó. Null si sigue sin terminar. */
  playedAt: string | null;
  finished: boolean;
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
  };
  if (cola.length === 0) return vacio;

  /** Cuándo queda libre la cancha, según lo recorrido hasta ahora. */
  let libreDesde = -Infinity;
  let ocupanteId: string | null = null;
  let ocupanteDesde: number | null = null;
  let miInicio: number | null = null;
  let miPrevisto: number | null = null;

  for (const p of cola) {
    const previsto = ms(p.scheduledAt)!;
    // No puede empezar antes de su hora ni antes de que la cancha se libere.
    const inicioReal = Math.max(previsto, libreDesde);

    if (p.id === miMatchId) {
      miInicio = inicioReal;
      miPrevisto = previsto;
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

    // El primero sin terminar. Ocupa la cancha si su hora real ya llegó; si no,
    // la cancha está libre esperándolo.
    if (ocupanteId === null && ahora >= inicioReal) {
      ocupanteId = p.id;
      ocupanteDesde = inicioReal;
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
  };
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
