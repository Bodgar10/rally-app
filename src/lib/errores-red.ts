/**
 * RALLY · Fallos de red, dichos con honestidad
 *
 * EL PROBLEMA QUE RESUELVE
 *   Media docena de pantallas envolvían su `fetch` en un `catch` sin
 *   parámetro y respondían siempre lo mismo:
 *
 *       } catch {
 *         setError('Sin conexión con el servidor. Revisa tu internet.');
 *       }
 *
 *   Dos cosas mal, y las dos duelen en el mismo sitio.
 *
 *   La primera: el error se PIERDE. Un `res.json()` sobre una respuesta vacía,
 *   un `undefined` al que se le llama una propiedad, un token caducado — todo
 *   desaparece sin dejar rastro, y nadie puede depurar después lo que nunca se
 *   escribió.
 *
 *   La segunda: se AFIRMA una causa que no se comprobó. El usuario mira su
 *   wifi, que funciona, y vuelve a intentarlo con el mismo resultado. Un bug
 *   nuestro se le presenta como un problema suyo.
 *
 *   Aquí se distingue el fallo de red de verdad —el `fetch` que ni sale— de
 *   todo lo demás, y se registra siempre lo que pasó con dónde pasó.
 */

/**
 * ¿Este error es de verdad un fallo de red?
 *
 * Un `fetch` que no llega a hablar con el servidor rechaza con un TypeError
 * cuyo mensaje varía por plataforma: 'Failed to fetch' en navegadores,
 * 'Network request failed' en React Native, 'Load failed' en Safari. Un error
 * lanzado DESPUÉS de recibir respuesta —parsear, leer una propiedad de null—
 * no entra aquí, y por eso no puede acabar diciéndole al usuario que revise su
 * internet.
 */
export function esFalloDeRed(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && 'name' in e) {
    const nombre = (e as { name?: unknown }).name;
    // AbortError es una cancelación nuestra, no un problema de la red.
    if (nombre === 'AbortError') return false;
  }
  const msg =
    e instanceof Error ? e.message
    : typeof e === 'string' ? e
    : '';
  return /failed to fetch|network request failed|networkerror|load failed|err_internet|err_network|fetch failed/i.test(msg);
}

/**
 * Registra el error con su contexto. Un `console.error` a secas no dice desde
 * dónde, y con seis pantallas haciendo lo mismo eso es la mitad del dato.
 */
export function registrarFallo(contexto: string, e: unknown, extra?: Record<string, unknown>): void {
  console.error(`[${contexto}]`, {
    mensaje: e instanceof Error ? e.message : String(e),
    nombre: e instanceof Error ? e.name : typeof e,
    esRed: esFalloDeRed(e),
    ...(e instanceof Error && e.stack ? { stack: e.stack } : {}),
    ...(extra ?? {}),
  });
}

const MENSAJE_RED = 'Sin conexión con el servidor. Revisa tu internet.';

/**
 * Frase para el usuario: la de red SOLO si de verdad lo fue.
 *
 * Para lo demás se devuelve el mensaje genérico de quien llama, que dice que
 * algo falló sin inventarse la causa.
 */
export function mensajeDeFallo(e: unknown, generico: string): string {
  return esFalloDeRed(e) ? MENSAJE_RED : generico;
}

/**
 * Registra y devuelve la frase, que es lo que las pantallas hacen siempre a la
 * vez. `contexto` es el prefijo del log: 'inscripcion', 'agregar-pareja'…
 */
export function fallo(contexto: string, e: unknown, generico: string, extra?: Record<string, unknown>): string {
  registrarFallo(contexto, e, extra);
  return mensajeDeFallo(e, generico);
}
