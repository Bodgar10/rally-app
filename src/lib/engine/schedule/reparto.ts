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
 *
 * Y CON DOS SEDES, UN RESTO YA NO ES SOLO UN HORARIO INCÓMODO
 *   Mundo Pádel juega en dos sucursales a la vez. Si los restos se juntan sin
 *   mirar dónde, una pareja que se apuntó en Narvarte acaba citada en Alberca
 *   Olímpica, a diez kilómetros. Eso no se negocia por WhatsApp: no se
 *   presentan.
 *
 *   Así que los restos se agotan DENTRO de su sede antes de cruzar. Solo si una
 *   sede no junta lo suficiente para un grupo entero se mezcla con otra, y ese
 *   grupo sale marcado (`cruzaSede`) para que el organizador lo vea y llame él.
 *
 *   Sin sedes no cambia nada: todo cae en una sede implícita y el reparto es
 *   el de siempre.
 */

/** Clave del cubo de las parejas que no eligieron bloque. No es un id válido. */
const SIN_BLOQUE = '\u0000sin-bloque';

export interface GrupoRepartido<T> {
  items: T[];
  /** Bloque del grupo: el de sus parejas, o el de la mayoría si vienen de varios. */
  bloqueId: string | null;
  /** Parejas que aporta cada bloque. Con más de una entrada, el grupo es mezclado. */
  desde: Record<string, number>;
  /**
   * El grupo junta parejas de SEDES distintas.
   *
   * Siempre false en un torneo de una sola sede. Con varias es el aviso de que
   * alguien va a tener que viajar: no se puede evitar siempre —los tamaños de
   * grupo no son negociables aquí— pero sí se puede decir.
   */
  cruzaSede: boolean;
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
  /**
   * La sede de cada bloque. Sin esto, el torneo es de una sola sede y los
   * restos se juntan como siempre.
   */
  sedeDeBloque?: (bloqueId: string | null) => string | null,
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

  /** La sede de una pareja, por su bloque. `null` sin sedes o sin bloque. */
  const sedeDe = (p: T): string | null =>
    sedeDeBloque ? sedeDeBloque(bloqueDe(p)) : null;

  const construir = (items: T[]): GrupoRepartido<T> => {
    const desde: Record<string, number> = {};
    for (const it of items) {
      const clave = bloqueDe(it) ?? SIN_BLOQUE;
      desde[clave] = (desde[clave] ?? 0) + 1;
    }
    return {
      items,
      bloqueId: bloqueDeGrupo(items.map(bloqueDe)),
      desde,
      cruzaSede: new Set(items.map(sedeDe)).size > 1,
    };
  };

  /** Consume de `cubo` los tamaños que quepan enteros. Devuelve lo que sobró. */
  const llenar = (cubo: T[]): T[] => {
    let i = 0;
    for (;;) {
      const quedan = cubo.length - i;
      const idx = pendientes.findIndex((x) => x <= quedan);
      if (idx === -1) break;
      const size = pendientes.splice(idx, 1)[0];
      grupos.push(construir(cubo.slice(i, i + size)));
      i += size;
    }
    return cubo.slice(i);
  };

  // 3. Grupos limpios: los que salen enteros de un solo bloque.
  for (const clave of claves) {
    // Lo que no llenó un grupo entero se queda para la fase de restos.
    cubos.set(clave, llenar(cubos.get(clave)!));
  }

  // 4. Restos, PRIMERO DENTRO DE CADA SEDE. Una pareja que eligió Narvarte
  //    prefiere otra hora en Narvarte antes que la misma hora en Alberca.
  //    Sin sedes hay un solo cubo y esto es el reparto de siempre.
  const porSede = new Map<string, T[]>();
  for (const clave of claves) {
    for (const p of cubos.get(clave)!) {
      const sede = sedeDe(p) ?? '\u0000sin-sede';
      const ya = porSede.get(sede);
      if (ya) ya.push(p);
      else porSede.set(sede, [p]);
    }
  }

  const sobrantes: T[] = [];
  for (const sede of [...porSede.keys()].sort()) {
    sobrantes.push(...llenar(porSede.get(sede)!));
  }

  // 5. Lo que ninguna sede pudo cerrar sola. Suma exactamente los tamaños que
  //    quedan (por la precondición), así que nadie se queda fuera — y estos
  //    grupos salen marcados con `cruzaSede`.
  let j = 0;
  for (const size of pendientes) {
    grupos.push(construir(sobrantes.slice(j, j + size)));
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
