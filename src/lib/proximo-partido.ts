/**
 * RALLY · Cuál de sus partidos es EL de ahora
 *
 * EL BUG
 *   "Mi próximo partido" tomaba el primero de la lista ordenada por hora
 *   ascendente. O sea EL MÁS ANTIGUO de los que no han terminado — que no es lo
 *   mismo que el más próximo.
 *
 *   Un jugador con su semifinal del domingo a las 23:00 ya nacida, y un partido
 *   del viernes que nadie capturó, veía el del viernes. Y con la semifinal tres
 *   días atrás en el reloj, la veía bajo el rótulo "Próximo partido", que es
 *   directamente falso.
 *
 * EL CRITERIO, EN ORDEN
 *   1. LO QUE SE ESTÁ JUGANDO AHORA manda sobre cualquier hora escrita. Si su
 *      partido está en curso, es ese y no hay más que hablar.
 *   2. LO QUE VIENE: de los que aún no han llegado, el más cercano.
 *   3. LO QUE QUEDÓ ATRÁS: si no viene ninguno, el más reciente de los que ya
 *      pasaron. Un partido sin terminar del sábado sigue siendo suyo y sigue
 *      pendiente; callarlo sería peor.
 *   4. LO QUE NO TIENE HORA, al final: existe, pero no compite con nada que sí
 *      tenga una hora escrita.
 *
 * LO QUE ESTE MÓDULO NO HACE: contar el tiempo que falta.
 *   Nada de "faltan 3 horas" ni "lleva 2 días de retraso". En un torneo real la
 *   hora publicada se mueve toda la mañana, así que una cuenta atrás envejece
 *   mal y en cuanto se equivoca una vez deja de creerse. Lo que se dice es la
 *   fecha, entera y absoluta, y que el jugador saque su propia cuenta.
 *
 * Puro y aparte para poder probarlo con un reloj de mentira.
 */

import { diaDeTorneo } from '@/lib/fechas';

/** Lo mínimo para decidir cuál es el suyo. */
export interface PartidoCandidato {
  /** ISO, o null si todavía no tiene hora publicada. */
  scheduledAt: string | null;
  status: string;
}

/** En qué momento está ese partido respecto del reloj. */
export type MomentoDelPartido =
  /** Se está jugando. */
  | 'en_curso'
  /** Su hora todavía no ha llegado, o es hoy mismo. */
  | 'proximo'
  /** Su hora fue OTRO DÍA y sigue sin terminar. */
  | 'atrasado';

/**
 * Cuál de los tres momentos es, dado el reloj.
 *
 * LA FRONTERA ES EL DÍA, NO EL MINUTO. En padel los partidos se corren toda la
 * mañana: a las 10:40 empieza el de las 10:00 y eso es lo normal, no una
 * anomalía que haya que señalar —para eso está la tarjeta de la cancha—. Lo que
 * sí es otra cosa es un partido de ANTEAYER sin resultado: ahí "Próximo
 * partido" miente, y el rótulo tiene que decir otra cosa.
 */
export function momentoDelPartido(
  p: PartidoCandidato,
  ahora: number = Date.now(),
): MomentoDelPartido {
  if (p.status === 'in_progress') return 'en_curso';
  if (!p.scheduledAt) return 'proximo';
  const suyo = new Date(p.scheduledAt).getTime();
  if (Number.isNaN(suyo)) return 'proximo';
  if (suyo >= ahora) return 'proximo';
  // Ya pasó en el reloj. Solo cuenta como atrasado si además cambió el día,
  // en la zona del club — que es donde se juega.
  return diaDeTorneo(p.scheduledAt) === diaDeTorneo(new Date(ahora).toISOString())
    ? 'proximo'
    : 'atrasado';
}

/**
 * El partido que hay que enseñarle, de todos los que tiene sin terminar.
 *
 * `null` con la lista vacía. Determinista: con dos candidatos igual de buenos
 * gana el primero que llegó, así que el mismo dato pinta siempre lo mismo.
 */
export function elegirProximo<T extends PartidoCandidato>(
  candidatos: T[],
  ahora: number = Date.now(),
): T | null {
  if (candidatos.length === 0) return null;

  const instante = (p: T): number | null => {
    if (!p.scheduledAt) return null;
    const t = new Date(p.scheduledAt).getTime();
    return Number.isNaN(t) ? null : t;
  };

  // 1 · Lo que se está jugando AHORA. Si hay varios —no debería—, el primero
  //     por hora, para que la elección no dependa del orden de la consulta.
  const enCurso = candidatos.filter((p) => p.status === 'in_progress');
  if (enCurso.length > 0) {
    return [...enCurso].sort((a, b) => (instante(a) ?? Infinity) - (instante(b) ?? Infinity))[0];
  }

  const conHora = candidatos.filter((p) => instante(p) !== null);

  // 2 · Lo que viene: el más cercano por delante.
  const porVenir = conHora.filter((p) => (instante(p) as number) >= ahora);
  if (porVenir.length > 0) {
    return [...porVenir].sort((a, b) => (instante(a) as number) - (instante(b) as number))[0];
  }

  // 3 · Lo que quedó atrás: el más reciente, que es el que sigue doliendo.
  if (conHora.length > 0) {
    return [...conHora].sort((a, b) => (instante(b) as number) - (instante(a) as number))[0];
  }

  // 4 · Sin hora: existe, y es lo único que hay.
  return candidatos[0];
}
