/**
 * RALLY · La lista de canchas que se está editando
 *
 * ► POR QUÉ ESTO NO VIVE EN LA PANTALLA
 *   Renombrar, añadir, quitar y validar parece trivial hasta que hay dos sedes:
 *   el orden tiene que seguir siendo único en TODO el torneo (no por sede), los
 *   nombres también, y quitar la última cancha de una sucursal tiene que
 *   quitar la sucursal entera. Cada una de esas se puede equivocar de una forma
 *   distinta, y dentro de un `useState` no se prueban.
 *
 * ► EL ORDEN ES DEL TORNEO, NO DE LA SEDE
 *   `tournament_courts` lo exige único por torneo, y el planificador lo usa
 *   para repartir de forma estable. Que Narvarte vaya del 1 al 2 y Alberca del
 *   3 al 5 no es cosmética: es lo que hace que una categoría que vuelve a jugar
 *   caiga en sus canchas de siempre.
 */

/** Una cancha en el editor. Sin id mientras no se haya guardado. */
export interface CanchaEditada {
  nombre: string;
  /** `venues.id`. Null = la sede del torneo. */
  venueId: string | null;
}

export interface ProblemaDeCanchas {
  /** El nombre que falla, para poder señalarlo. */
  nombre: string;
  motivo: 'vacio' | 'repetido' | 'largo';
}

/** Lo que el CHECK de la migración 091 permite. */
const MAX_NOMBRE = 40;

/**
 * Qué impide guardar. Lista vacía = se puede.
 *
 * Se comprueba aquí y no en la base porque un UNIQUE violado llega como un
 * error de Postgres sin decir CUÁL de las treinta filas sobra.
 */
export function problemasDeCanchas(canchas: readonly CanchaEditada[]): ProblemaDeCanchas[] {
  const problemas: ProblemaDeCanchas[] = [];
  const vistos = new Set<string>();

  for (const c of canchas) {
    const nombre = c.nombre.trim();
    if (nombre.length === 0) {
      problemas.push({ nombre: c.nombre, motivo: 'vacio' });
      continue;
    }
    if (nombre.length > MAX_NOMBRE) {
      problemas.push({ nombre, motivo: 'largo' });
      continue;
    }
    // Sin distinguir mayúsculas: 'Cancha 1' y 'cancha 1' son la misma para
    // quien la busca en una lista, y el UNIQUE de la base no lo ve así.
    const clave = nombre.toLocaleLowerCase('es-MX');
    if (vistos.has(clave)) problemas.push({ nombre, motivo: 'repetido' });
    vistos.add(clave);
  }

  return problemas;
}

/** El mensaje de un problema, dicho como se le dice a una persona. */
export function textoDelProblema(p: ProblemaDeCanchas): string {
  if (p.motivo === 'vacio') return 'Hay una cancha sin nombre.';
  if (p.motivo === 'largo') return `«${p.nombre}» no cabe: máximo ${MAX_NOMBRE} letras.`;
  return `«${p.nombre}» está dos veces. Los nombres no se pueden repetir.`;
}

/**
 * Las filas listas para escribir, con su orden.
 *
 * El orden sale de la POSICIÓN en la lista, agrupando por sede: así el
 * planificador recorre una sucursal entera antes de pasar a la siguiente, que
 * es como se juega de verdad.
 */
export function paraGuardar(
  canchas: readonly CanchaEditada[],
): { nombre: string; venue_id: string | null; orden: number }[] {
  return canchas.map((c, i) => ({
    nombre: c.nombre.trim(),
    venue_id: c.venueId,
    orden: i + 1,
  }));
}

/**
 * Un nombre libre para la cancha que se añade a una sede.
 *
 * 'Cancha 3' si la sede no tiene nombre, 'Narvarte 3' si lo tiene. Y si ese
 * nombre ya existe sigue subiendo: añadir dos veces seguidas no puede producir
 * dos canchas iguales y un error al guardar.
 */
export function nombreLibre(
  canchas: readonly CanchaEditada[],
  sedeNombre: string | null,
): string {
  const base = sedeNombre ?? 'Cancha';
  const usados = new Set(canchas.map((c) => c.nombre.trim().toLocaleLowerCase('es-MX')));
  for (let n = 1; n <= 99; n++) {
    const intento = `${base} ${n}`;
    if (!usados.has(intento.toLocaleLowerCase('es-MX'))) return intento;
  }
  return `${base} ${canchas.length + 1}`;
}
