/**
 * RALLY · Selección de rango de fechas
 *
 * La lógica del calendario, separada del componente: es una máquina de estados
 * de tres reglas, y como función pura se puede fijar con tests sin renderizar
 * nada. El componente solo la llama y pinta el resultado.
 *
 * Las tres reglas (las mismas que Airbnb y Booking, porque es lo que la gente
 * ya espera de un calendario de rango):
 *
 *   1. Sin inicio, o con el rango ya completo → el toque fija un inicio nuevo
 *      y limpia el fin. Volver a tocar después de elegir un rango empieza otro,
 *      en vez de obligar a un botón de "limpiar".
 *
 *   2. Con inicio y sin fin, tocando en el inicio o después → fija el fin.
 *      Tocar el MISMO día es válido: un torneo de un día es un torneo.
 *
 *   3. Con inicio y sin fin, tocando ANTES del inicio → ese día pasa a ser el
 *      inicio nuevo, sin fin. NO es un error y no se avisa: quien toca una
 *      fecha anterior está corrigiendo el inicio, no pidiendo un rango
 *      invertido. Un mensaje de error aquí sería culpar al usuario de un
 *      gesto que tiene sentido.
 */

import { compararPorDia, parseFechaISO } from './fechas';

export interface RangoSeleccion {
  /** 'YYYY-MM-DD' o null. */
  inicio: string | null;
  fin:    string | null;
}

export const RANGO_VACIO: RangoSeleccion = { inicio: null, fin: null };

/**
 * Aplica un toque sobre un día y devuelve el rango resultante.
 *
 * `isoTocado` debe ser una fecha válida; si no lo es, el rango no cambia.
 */
export function tocarDia(estado: RangoSeleccion, isoTocado: string): RangoSeleccion {
  const tocado = parseFechaISO(isoTocado);
  if (!tocado) return estado;

  const inicio = parseFechaISO(estado.inicio);

  // Regla 1 — sin inicio, o rango ya cerrado: empieza uno nuevo.
  if (!inicio || estado.fin !== null) {
    return { inicio: isoTocado, fin: null };
  }

  // Regla 3 — anterior al inicio: se convierte en el inicio nuevo.
  if (compararPorDia(tocado, inicio) < 0) {
    return { inicio: isoTocado, fin: null };
  }

  // Regla 2 — igual o posterior: cierra el rango.
  return { inicio: estado.inicio, fin: isoTocado };
}

/** Un rango con ambos extremos: lo único que se puede escribir en BD. */
export interface RangoCerrado {
  inicio: string;
  fin:    string;
}

/**
 * ¿El rango está completo y listo para guardar?
 *
 * Es un type guard, que estrecha el tipo a `RangoCerrado` y documenta la
 * precondición de escribir en BD (`start_date` y `end_date` son NOT NULL).
 *
 * OJO — NO protege en tiempo de compilación al llamar a Supabase: el cliente
 * no está tipado contra el esquema, así que `.insert({ start_date: null })`
 * compila igual. Verificado quitando la comprobación de nuevo.tsx: tsc no
 * dice nada. Lo que protege de verdad es la comprobación EN RUNTIME antes de
 * guardar; el predicado solo ayuda a quien lea el código.
 */
export function rangoCompleto(r: RangoSeleccion): r is RangoSeleccion & RangoCerrado {
  return r.inicio !== null && r.fin !== null;
}

export type PosicionEnRango = 'fuera' | 'inicio' | 'fin' | 'intermedio' | 'unico';

/**
 * Dónde cae un día dentro del rango. El componente lo usa para decidir el
 * fondo: los extremos llevan grad-gold, los intermedios el dorado translúcido
 * sin radio para que el rango se lea continuo.
 *
 * `'unico'` es inicio y fin a la vez — el torneo de un solo día, que se pinta
 * como un círculo suelto y no como el arranque de una barra.
 */
export function posicionEnRango(iso: string, r: RangoSeleccion): PosicionEnRango {
  const d = parseFechaISO(iso);
  const i = parseFechaISO(r.inicio);
  if (!d || !i) return 'fuera';

  const f = parseFechaISO(r.fin);

  // Rango a medias: solo el inicio está marcado.
  if (!f) return compararPorDia(d, i) === 0 ? 'unico' : 'fuera';

  const vsInicio = compararPorDia(d, i);
  const vsFin    = compararPorDia(d, f);

  if (vsInicio === 0 && vsFin === 0) return 'unico';
  if (vsInicio === 0) return 'inicio';
  if (vsFin === 0)    return 'fin';
  if (vsInicio > 0 && vsFin < 0) return 'intermedio';
  return 'fuera';
}
