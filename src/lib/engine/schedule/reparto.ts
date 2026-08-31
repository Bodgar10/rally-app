/**
 * Reparto de parejas en grupos, POR BLOQUE.
 *
 * Lo consume `close-registration` al cerrar una categoria. Logica pura y
 * determinista: misma entrada -> misma salida. Sin dependencias.
 *
 * ANTES ERA UN SNAKE SOBRE created_at Y ROMPÍA LA ELECCIÓN DE HORARIO
 *   La pareja elige su bloque al inscribirse (`pair_block_choices`, migración
 *   051) y un grupo se juega como un bloque de 3 horas seguidas en una cancha.
 *   El snake repartía sobre la categoría entera ordenada por fecha de alta, así
 *   que un grupo podía acabar con tres parejas de tres bloques distintos: tres
 *   personas citadas a horas diferentes para jugar entre ellas. Con eso, el
 *   scheduler de fase de grupos no habría podido programar casi nada.
 *
 * LO QUE NO CAMBIA: EL NÚMERO Y EL TAMAÑO DE LOS GRUPOS
 *   `plan.groupSizes` no es negociable aquí. De su LONGITUD salen el cuadro de
 *   eliminatorias, `advancePerGroup` y `bestExtraQualifiers`, todos calculados
 *   ya por `computeFormat`. Este reparto decide QUIÉN va con quién, nunca
 *   cuántos grupos hay ni de qué tamaño.
 *
 *   Por eso el snake ya no hace falta para equilibrar: el equilibrio vive en
 *   `groupSizes`. Dentro de un bloque el orden sigue siendo `created_at`.
 *
 * EL CASO DE LOS RESTOS
 *   Un bloque con 7 parejas de una categoría da dos grupos —de 4 y de 3, o dos
 *   de 3— y puede dejar una suelta. Esa pareja se junta con los restos de los
 *   otros bloques de SU categoría y forman un grupo mezclado, cuyo bloque es el
 *   de la mayoría. Se marca y se reporta.
 *
 *   NUNCA se deja una pareja sin grupo: sin grupo no juega, y ya pagó. Un
 *   horario incómodo se negocia; quedarse fuera del torneo, no.
 */

/** Clave del cubo de las parejas que no eligieron bloque. No es un id válido. */
const SIN_BLOQUE = '\u0000sin-bloque';

export interface GrupoRepartido<T> {
  items: T[];
  /** Bloque del grupo: el de sus parejas, o el de la mayoría si vienen de varios. */
  bloqueId: string | null;
  /** Parejas que aporta cada bloque. Con más de una entrada, el grupo es mezclado. */
  desde: Record<string, number>;
}

/**
 * Reparte `parejas` en grupos de los tamaños EXACTOS de `sizes`, agrupando por
 * bloque siempre que se pueda. Determinista: mismo orden de entrada -> misma
 * salida.
 *
 * Precondición: `sum(sizes) === parejas.length`. La valida el llamador; aquí se
 * asume, y es lo que garantiza que los restos encajen justo en los tamaños que
 * sobran.
 */
export function repartirPorBloque<T>(
  parejas: T[],
  bloqueDe: (p: T) => string | null,
  sizes: number[],
): GrupoRepartido<T>[] {
  // 1. Cubos por bloque, conservando el orden de entrada dentro de cada uno.
  const cubos = new Map<string, T[]>();
  for (const p of parejas) {
    const clave = bloqueDe(p) ?? SIN_BLOQUE;
    const ya = cubos.get(clave);
    if (ya) ya.push(p);
    else cubos.set(clave, [p]);
  }

  // Orden canónico: los bloques por su id —que es `YYYY-MM-DD-HH:MM`, así que
  // alfabético es cronológico— y las parejas sin bloque al final, porque no
  // anclan nada y son las primeras candidatas a rellenar restos.
  const claves = [...cubos.keys()].sort((a, b) => {
    if (a === SIN_BLOQUE) return 1;
    if (b === SIN_BLOQUE) return -1;
    return a.localeCompare(b);
  });

  // 2. De grande a chico: un tamaño 4 solo cabe donde hay 4 parejas juntas, y
  //    dejarlo para el final lo condenaría a salir siempre mezclado.
  const pendientes = [...sizes].sort((a, b) => b - a);
  const grupos: GrupoRepartido<T>[] = [];

  const construir = (items: T[]): GrupoRepartido<T> => {
    const desde: Record<string, number> = {};
    for (const it of items) {
      const clave = bloqueDe(it) ?? SIN_BLOQUE;
      desde[clave] = (desde[clave] ?? 0) + 1;
    }
    return { items, bloqueId: bloqueDeGrupo(items.map(bloqueDe)), desde };
  };

  // 3. Grupos limpios: los que salen enteros de un solo bloque.
  for (const clave of claves) {
    const cubo = cubos.get(clave)!;
    let i = 0;
    for (;;) {
      const quedan = cubo.length - i;
      const idx = pendientes.findIndex((s) => s <= quedan);
      if (idx === -1) break;
      const size = pendientes.splice(idx, 1)[0];
      grupos.push(construir(cubo.slice(i, i + size)));
      i += size;
    }
    // Lo que no llenó un grupo entero se queda para la fase de restos.
    cubos.set(clave, cubo.slice(i));
  }

  // 4. Restos. Suman exactamente los tamaños que quedan (por la precondición),
  //    así que nadie se queda fuera.
  const restos: T[] = [];
  for (const clave of claves) restos.push(...cubos.get(clave)!);

  let j = 0;
  for (const size of pendientes) {
    grupos.push(construir(restos.slice(j, j + size)));
    j += size;
  }

  return grupos;
}

/**
 * A qué bloque pertenece un grupo, a partir de lo que eligió cada pareja.
 *
 * Mayoría; empate al bloque más temprano —los ids son `${dia}-${desde}`, así
 * que alfabético es cronológico—. "Sin bloque" solo gana si es el único
 * máximo: un horario real vale más que la ausencia de horario.
 *
 * VIVE AQUÍ Y SE EXPORTA porque hay DOS sitios que necesitan la respuesta y
 * tienen que dar la misma. `close-registration` la usa al formar los grupos, y
 * `schedule-groups` la vuelve a calcular al programar, porque el bloque del
 * grupo no se guarda en ninguna columna (ver §8 de la especificación). Dos
 * implementaciones de esta regla se desincronizarían el día que alguien toque
 * una y no la otra, y el sintoma seria un torneo con horarios que no cuadran.
 */
export function bloqueDeGrupo(elecciones: (string | null)[]): string | null {
  const cuenta: Record<string, number> = {};
  for (const e of elecciones) {
    const clave = e ?? SIN_BLOQUE;
    cuenta[clave] = (cuenta[clave] ?? 0) + 1;
  }
  const orden = Object.keys(cuenta).sort((a, b) => {
    const d = cuenta[b] - cuenta[a];
    if (d !== 0) return d;
    if (a === SIN_BLOQUE) return 1;
    if (b === SIN_BLOQUE) return -1;
    return a.localeCompare(b);
  });
  const ganador = orden[0];
  return ganador === undefined || ganador === SIN_BLOQUE ? null : ganador;
}
