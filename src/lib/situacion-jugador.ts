/**
 * RALLY · Qué le pasa al jugador, dicho en su idioma
 *
 * EL PROBLEMA
 *   Un jugador de padel no sabe si le toca jugar. Persigue al organizador,
 *   espera el altavoz, o pregunta. Y la noche del sábado es peor: son las doce,
 *   no sabe si es mejor primero, ni si juega octavos o cuartos, ni si
 *   levantarse a las siete o dormir.
 *
 *   La app lo sabe. `group_standings.clinch_status` lo tiene calculado desde que
 *   se captura el último resultado del grupo. Simplemente no se lo decía.
 *
 * TRADUCIR, NO ENSEÑAR EL DATO
 *   `repechage_pending` no significa nada para quien juega. Significa "ya no
 *   puedes ser primero de tu grupo, pero sigues vivo como mejor segundo", y eso
 *   sí es una frase que cambia lo que hace esa noche.
 *
 * EL NÚMERO ES LO QUE CONVIERTE LA ANGUSTIA EN ESPERA
 *   "Sigues vivo" a secas deja al jugador refrescando la app cada diez minutos.
 *   "Faltan 3 grupos por terminar" le dice cuánto falta para saberlo. Es la
 *   diferencia entre una incertidumbre abierta y una acotada, y no cuesta nada:
 *   el número ya está en la base.
 *
 * Módulo puro y aparte para poder probarlo: son las frases que lee el jugador y
 * no pueden depender de que alguien abra la pantalla para verlas.
 */

/** Los cuatro estados que calcula el motor de clinch. */
export type ClinchStatus = 'clinched' | 'repechage_pending' | 'alive' | 'eliminated';

/**
 * El tono con que se pinta, no el estado.
 *
 * Separado a propósito: `eliminated` se dice con respeto y en gris, no en rojo
 * de error. Quedarse fuera de un torneo no es un fallo del sistema ni culpa de
 * nadie — es lo que pasa en la mitad de los cuadros.
 */
export type TonoSituacion = 'clasificado' | 'espera' | 'vivo' | 'fuera';

/**
 * Un partido concreto del que depende el jugador.
 *
 * HOY NADIE LLENA ESTO. El motor de clinch dice SI sigues vivo, no de qué
 * partidos depende que lo sigas estando — enumerar escenarios es trabajo de
 * motor que todavía no existe.
 *
 * La estructura se deja preparada porque el texto genérico y el concreto no son
 * la misma frase con más datos: son dos frases distintas, y descubrirlo cuando
 * el motor esté listo obligaría a rehacer la traducción entera. Con esto, ese
 * día solo hay que llenar el array.
 */
export interface PartidoDelQueDependes {
  /** "Luis / Pedro vs Sofía / Regina", ya resuelto a nombres. */
  partido: string;
  /** Qué te conviene: "que ganen Luis / Pedro", "que se decida en tres sets". */
  queTeConviene: string;
  /** Cuándo se juega, si se sabe. */
  cuando?: string | null;
}

export interface Situacion {
  titulo: string;
  detalle: string;
  tono: TonoSituacion;
  /**
   * Los partidos de los que depende, si se saben.
   *
   * Vacío = no se sabe todavía, y entonces `detalle` lleva la versión genérica.
   * La pantalla decide cómo pintarlos; aquí solo se dice cuáles son.
   */
  dependeDe: PartidoDelQueDependes[];
}

/**
 * Cuántos grupos faltan por terminar, dicho como se dice.
 *
 * Cero no se enseña: si no falta ninguno el resultado ya está decidido y la
 * frase sobraría.
 */
function faltanGrupos(n: number): string {
  if (n <= 0) return 'Ya terminaron todos los grupos de tu categoría: el resultado está por confirmarse.';
  if (n === 1) return 'Falta 1 grupo por terminar en tu categoría.';
  return `Faltan ${n} grupos por terminar en tu categoría.`;
}

/**
 * La situación de una pareja, en lenguaje de jugador.
 *
 * `gruposPendientes` solo se usa en `repechage_pending`, que es el único estado
 * que es una espera. En los otros tres ya no hay nada que esperar: o pasaste, o
 * depende de lo que hagas tú, o se acabó.
 */
export function situacionDe(
  estado: ClinchStatus,
  gruposPendientes: number,
  /**
   * Los partidos de los que depende, cuando se sepan.
   *
   * Por defecto vacío, que es el estado de hoy: el motor no los enumera. Es un
   * parámetro y no un cálculo aquí porque quien los sabe es el motor, no la
   * traducción — este módulo solo elige las palabras.
   */
  dependeDe: PartidoDelQueDependes[] = [],
): Situacion {
  switch (estado) {
    case 'clinched':
      return {
        titulo: 'Ya clasificaste',
        detalle: 'Espera los resultados de los demás para saber cuándo juegas.',
        tono: 'clasificado',
        dependeDe: [],   // ya no dependes de nadie: estás dentro
      };

    case 'repechage_pending':
      return {
        titulo: 'Sigues vivo como mejor segundo',
        detalle:
          'Ya no puedes ser primero de tu grupo, pero entras si tu segundo puesto ' +
          `es de los mejores. ${faltanGrupos(gruposPendientes)}`,
        tono: 'espera',
        dependeDe,
      };

    case 'alive':
      return {
        titulo: 'Todavía puedes clasificar',
        // "Depende de lo que pase en tus partidos que faltan" es cierto y
        // vacío: el jugador ya sabe que depende de algo, lo que no sabe es de
        // QUÉ. Con la lista concreta la frase cambia de forma, no solo de
        // longitud — por eso son dos textos y no uno con relleno.
        detalle: dependeDe.length > 0
          ? `Depende de ${dependeDe.length === 1 ? 'este partido' : `estos ${dependeDe.length} partidos`}:`
          : 'Depende de lo que pase en tus partidos que faltan. Cuando se sepa de qué resultados concretos, aparecerá aquí.',
        tono: 'vivo',
        dependeDe,
      };

    case 'eliminated':
      // Sin "lo sentimos" ni consuelo de oficina: se dice lo que pasó, se
      // agradece, y debajo van sus resultados — que es lo que de verdad
      // quiere ver quien acaba de quedar fuera.
      return {
        titulo: 'Tu torneo terminó aquí',
        detalle: 'No alcanzaste la clasificación esta vez. Gracias por jugar.',
        tono: 'fuera',
        dependeDe: [],   // ya no depende de nada
      };
  }
}

/**
 * Cuántos grupos de una categoría siguen sin terminar.
 *
 * Un grupo está terminado cuando TODOS sus partidos lo están. Se cuenta sobre
 * los partidos y no sobre una columna de estado del grupo porque esa columna no
 * existe: el grupo es un conjunto de partidos, y su final es que no quede
 * ninguno pendiente.
 */
export function gruposSinTerminar(
  partidos: Array<{ groupId: string | null; finished: boolean }>,
): number {
  const pendientesPorGrupo = new Set<string>();
  for (const p of partidos) {
    if (p.groupId && !p.finished) pendientesPorGrupo.add(p.groupId);
  }
  return pendientesPorGrupo.size;
}

/**
 * ¿Por qué no hay próximo partido?
 *
 * Callarse era lo peor que podía hacer la pantalla: el jugador que ya clasificó
 * y no ve nada no sabe si la app se rompió, si le olvidaron, o si es que
 * todavía no se puede saber. Esto último es casi siempre la respuesta, y
 * decirlo cuesta una frase.
 */
export function porQueNoHayPartido(estado: ClinchStatus | null, gruposPendientes: number): string {
  if (estado === 'eliminated') {
    return 'No tienes más partidos en este torneo.';
  }
  if (estado === 'clinched') {
    return gruposPendientes > 0
      ? `Ya estás dentro, pero tu cruce depende de cómo terminen los otros grupos. ${faltanGrupos(gruposPendientes)}`
      : 'Ya estás dentro. En cuanto se arme el cuadro aparece aquí tu hora y tu cancha.';
  }
  if (estado === 'repechage_pending') {
    return `Tu siguiente partido depende de resultados que todavía no están. ${faltanGrupos(gruposPendientes)}`;
  }
  return 'Todavía no hay hora asignada. En cuanto se publique el horario, aparece aquí.';
}
