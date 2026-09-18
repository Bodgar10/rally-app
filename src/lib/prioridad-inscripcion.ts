/**
 * RALLY · "Los suscriptores entran antes", contado en español.
 *
 * QUÉ PROBLEMA RESUELVE LA PRIORIDAD
 *   Un exprés tiene 16 cupos y un club con 40 socios interesados. La ventana se
 *   abre y en horas está llena. Entrar antes es lo único de toda la oferta que
 *   el jugador YA quiere y hoy no puede comprar — y a diferencia de un
 *   análisis, lo necesita cuarenta veces al año.
 *
 * ► LOS DOS MENSAJES SON DISTINTOS, Y EL SEGUNDO ES EL QUE VENDE
 *   Al suscriptor se le confirma lo que compró, en el momento en que le está
 *   sirviendo. Al que no lo es se le dice la hora exacta a la que podrá
 *   entrar — que es el dato que necesita— y de paso se entera de que otros ya
 *   están entrando. Ese segundo mensaje no es publicidad colocada de lado: es
 *   la información que pidió, dicha entera.
 *
 * NO SE DRAMATIZA
 *   Nada de "¡te quedas fuera!". El cupo puede perfectamente no llenarse, y un
 *   jugador al que se le mete miedo y luego encuentra sitio de sobra aprende a
 *   no creer el aviso la próxima vez.
 */

/** Momento en que la inscripción se abre para todos. null = ya está abierta. */
export type PrioridadHasta = string | null | undefined;

export interface EstadoDePrioridad {
  /** Hay ventana y todavía no ha pasado. */
  enVentana: boolean;
  /** Puede inscribirse ahora mismo. */
  puedeInscribirse: boolean;
  /** Cuándo abre para todos. null si no hay ventana. */
  abreParaTodos: Date | null;
}

export function estadoDePrioridad(
  prioridadHasta: PrioridadHasta,
  esSuscriptor: boolean,
  ahora: Date,
): EstadoDePrioridad {
  if (!prioridadHasta) {
    return { enVentana: false, puedeInscribirse: true, abreParaTodos: null };
  }
  const abre = new Date(prioridadHasta);
  if (Number.isNaN(abre.getTime())) {
    // Una fecha ilegible no puede cerrar una inscripción: ante la duda, abierto.
    return { enVentana: false, puedeInscribirse: true, abreParaTodos: null };
  }
  const enVentana = abre.getTime() > ahora.getTime();
  return {
    enVentana,
    puedeInscribirse: !enVentana || esSuscriptor,
    abreParaTodos: enVentana ? abre : null,
  };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * "el domingo a las 18:00" / "hoy a las 18:00" / "mañana a las 09:00".
 *
 * Con día de la semana y no con fecha: a menos de una semana vista, "el
 * domingo" se entiende de un vistazo y "el 21 de septiembre" hay que pensarlo.
 */
export function cuandoAbre(abre: Date, ahora: Date): string {
  const hora = `${String(abre.getHours()).padStart(2, '0')}:${String(abre.getMinutes()).padStart(2, '0')}`;
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(abre) - dia(ahora)) / 86400000);

  if (dias <= 0) return `hoy a las ${hora}`;
  if (dias === 1) return `mañana a las ${hora}`;
  if (dias < 7) return `el ${DIAS[abre.getDay()]} a las ${hora}`;
  return `el ${abre.getDate()}/${abre.getMonth() + 1} a las ${hora}`;
}

/** El aviso. null cuando no hay nada que avisar. */
export function textoDePrioridad(e: EstadoDePrioridad, esSuscriptor: boolean, ahora: Date): string | null {
  if (!e.enVentana || !e.abreParaTodos) return null;
  const cuando = cuandoAbre(e.abreParaTodos, ahora);
  return esSuscriptor
    ? `Estás entrando antes que el resto: las inscripciones abren para todos ${cuando}.`
    : `Ahora mismo solo pueden inscribirse los suscriptores. Abre para todos ${cuando}.`;
}
