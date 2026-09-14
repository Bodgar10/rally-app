/**
 * RALLY · Una lectura que no se rinde a la primera, y que DICE por qué se rindió
 *
 * EL BUG QUE LO MOTIVA
 *   "No hay nada que enseñar" y "no se pudo leer" acababan los dos en un `null`
 *   con un `console.warn`, y la tarjeta desaparecía igual. Un fallo de
 *   transporte —la red del club, un reintento disparado por Realtime justo sin
 *   cobertura— apagaba la tarjeta de un jugador que SÍ tenía algo que ver, y no
 *   quedaba nada que mirar después.
 *
 *   Y el warn tampoco servía: decía `undefined`, porque el error de un `fetch`
 *   que ni sale no es un `Error` y no trae `.message`.
 *
 * VIVE APARTE porque lo usan las dos tarjetas del jugador: la de "ya estás en
 * la siguiente ronda" y la de los puntos, que las dos leen de la base y las dos
 * tienen que distinguir el silencio del fallo.
 */

import { esFalloDeRed, registrarFallo } from '@/lib/errores-red';

/**
 * ¿El error impidió HABLAR con la base, o lo dijo la base?
 *
 * Un error de Postgres o de PostgREST SIEMPRE trae `code` ('42501', 'PGRST116'…).
 * Un `fetch` que no llegó a salir deja un objeto sin código —en la sonda que
 * destapó esto llegó literalmente vacío— y ese es el único que tiene sentido
 * reintentar: repetir un `42501` devuelve `42501` otra vez.
 */
export function esFalloDeTransporte(e: unknown): boolean {
  if (esFalloDeRed(e)) return true;
  if (typeof e === 'object' && e !== null) {
    const { code } = e as { code?: unknown };
    return code === undefined || code === null || code === '';
  }
  return false;
}

/**
 * Lo que de verdad trae un error de Supabase.
 *
 * `registrarFallo` lee `.message`, que en un error de red no existe: por eso el
 * log decía `undefined`. Aquí se sacan los cuatro campos de `PostgrestError` a
 * mano, y si el objeto viene vacío se dice eso mismo en vez de callar.
 */
function detalleDelError(e: unknown): Record<string, unknown> {
  if (typeof e !== 'object' || e === null) return { crudo: String(e) };
  const o = e as Record<string, unknown>;
  if (Object.keys(o).length === 0) return { crudo: 'objeto vacío: el fetch no llegó a salir' };
  return { code: o.code ?? null, message: o.message ?? null, details: o.details ?? null, hint: o.hint ?? null };
}

/** Esperas entre intentos. Cortas: el jugador está mirando la pantalla. */
const ESPERAS_MS = [300, 900];

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Una lectura, reintentada SOLO si no se pudo hablar con la base.
 *
 * `{ ok: false }` cuando se agotaron los intentos o cuando el error lo dijo la
 * base, que reintentado daría lo mismo. Quien llama decide si eso apaga la
 * tarjeta entera o solo le quita un dato.
 *
 * `contexto` es el prefijo del log y va entero: 'siguiente-ronda/cuadro'.
 */
export async function leerConReintento<T>(
  contexto: string,
  leer: () => PromiseLike<{ data: T | null; error: unknown }>,
  esperas: number[] = ESPERAS_MS,
): Promise<{ ok: true; data: T | null } | { ok: false }> {
  for (let intento = 0; intento <= esperas.length; intento++) {
    const { data, error } = await leer();
    if (!error) return { ok: true, data };

    const reintentable = esFalloDeTransporte(error) && intento < esperas.length;
    registrarFallo(contexto, error, {
      intento: intento + 1,
      de: esperas.length + 1,
      reintentable,
      ...detalleDelError(error),
    });
    if (!reintentable) return { ok: false };
    await dormir(esperas[intento]);
  }
  return { ok: false };
}

