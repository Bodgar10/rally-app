/**
 * Bloques horarios de fase de grupos.
 *
 * Un grupo de 3 parejas se juega como un BLOQUE de partidos consecutivos en una
 * sola cancha (round robin de 3 = 3 partidos). Con 60 min por partido eso es un
 * bloque de 3 horas. Asi se jugo el Sexto Torneo Cimepa: 52 de 55 grupos
 * siguieron esa regla exacta.
 *
 * Decision de producto: la pareja ELIGE su bloque al inscribirse, de los que
 * tengan cupo. No se pregunta disponibilidad para repartir despues; se reserva,
 * como un asiento. Los bloques agotados se ocultan.
 *
 * Logica pura y determinista: misma entrada -> misma salida. Sin dependencias.
 */

/** Parejas que forman un grupo. Un grupo ocupa un carril entero del bloque. */
export const PAREJAS_POR_GRUPO = 3;

/** Partidos de un round robin de 3 parejas. */
export const PARTIDOS_POR_GRUPO = 3;

/**
 * Ventana de juego de un dia.
 *
 * OJO CON `hasta`: es la hora a la que TERMINA el ultimo partido, no a la que
 * empieza. Una ventana 14:00-23:00 con partidos de 60 min admite un partido
 * que arranca a las 22:00 y cierra a las 23:00. Un bloque cabe si
 * `desde + duracion <= hasta`.
 */
export interface VentanaDia {
  /** 'YYYY-MM-DD' */
  dia: string;
  /** Hora a la que empieza el primer partido. 'HH:MM' */
  desde: string;
  /** Hora a la que TERMINA el ultimo partido, no a la que empieza. 'HH:MM' */
  hasta: string;
}

export interface EntradaBloques {
  ventanas: VentanaDia[];
  canchas: number;
  minutosPorPartido: number;
  /** Default 3: grupo de 3 parejas, round robin. */
  partidosPorGrupo?: number;
}

export interface Bloque {
  /** `${dia}-${desde}`, estable y determinista. */
  id: string;
  dia: string;
  desde: string;
  hasta: string;
  /** Carriles simultaneos = canchas del club. Cada carril aloja un grupo. */
  carriles: number;
}

export interface DiaGenerado {
  dia: string;
  bloques: number;
  /** Minutos de la ventana que no alcanzaron para un bloque entero. */
  minutosSobrantes: number;
  /** true cuando el dia se reservo para eliminatorias y no genero bloques. */
  eliminatorias: boolean;
}

export interface ReticulaBloques {
  bloques: Bloque[];
  /** Duracion de cada bloque en minutos. */
  minutosPorBloque: number;
  /** Suma de carriles de todos los bloques. */
  capacidadCarriles: number;
  /** Parejas que caben en total = carriles x 3. El llamador compara contra su inscripcion. */
  capacidadParejas: number;
  /** Un renglon por dia de la entrada, en orden. */
  dias: DiaGenerado[];
  /** Dia excluido por ser de eliminatorias. Null si no se excluyo ninguno. */
  diaEliminatorias: string | null;
  avisos: string[];
}

/** Parejas ya inscritas en un bloque, por categoria. */
export type OcupacionBloque = Record<string, number>;

/** Ocupacion de todos los bloques, indexada por id de bloque. */
export type Ocupacion = Record<string, OcupacionBloque>;

export interface BloqueDisponible extends Bloque {
  /** Parejas mas que caben en este bloque para la categoria consultada. */
  cupo: number;
}

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------

export function parseHoraBloque(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Hora invalida: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Hora invalida: ${hhmm}`);
  return h * 60 + min;
}

export function formatHoraBloque(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function esDiaValido(dia: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia.trim());
}

// ---------------------------------------------------------------------------
// 1. Reticula de bloques
// ---------------------------------------------------------------------------

/**
 * Construye la reticula de bloques a partir de las ventanas del torneo.
 *
 * Los bloques salen consecutivos desde `desde`. El ultimo que no quepa entero
 * en la ventana se descarta y sus minutos se reportan en `dias[].minutosSobrantes`.
 * `hasta` es la hora de FIN del ultimo partido: un bloque cabe mientras
 * `inicio + minutosPorBloque <= hasta`.
 *
 * El ULTIMO dia del torneo es de eliminatorias y no genera bloques de grupos.
 * Si solo hay una ventana si los genera, y lo dice en `avisos`.
 */
export function generarBloques(entrada: EntradaBloques): ReticulaBloques {
  const partidosPorGrupo = entrada.partidosPorGrupo ?? PARTIDOS_POR_GRUPO;
  const avisos: string[] = [];

  if (!Number.isInteger(entrada.canchas) || entrada.canchas <= 0) {
    throw new Error(`canchas debe ser un entero positivo: ${entrada.canchas}`);
  }
  if (!Number.isFinite(entrada.minutosPorPartido) || entrada.minutosPorPartido <= 0) {
    throw new Error(`minutosPorPartido debe ser positivo: ${entrada.minutosPorPartido}`);
  }
  if (!Number.isInteger(partidosPorGrupo) || partidosPorGrupo <= 0) {
    throw new Error(`partidosPorGrupo debe ser un entero positivo: ${partidosPorGrupo}`);
  }

  const minutosPorBloque = partidosPorGrupo * entrada.minutosPorPartido;

  // Orden canonico: por dia y luego por hora de inicio. La entrada puede venir
  // desordenada; la salida no depende de ese orden.
  const ventanas = [...entrada.ventanas].sort(
    (a, b) => a.dia.localeCompare(b.dia) || parseHoraBloque(a.desde) - parseHoraBloque(b.desde),
  );

  for (const v of ventanas) {
    if (!esDiaValido(v.dia)) throw new Error(`Dia invalido: ${v.dia}`);
  }

  if (ventanas.length === 0) {
    avisos.push('Sin ventanas: no hay bloques que ofrecer.');
    return {
      bloques: [],
      minutosPorBloque,
      capacidadCarriles: 0,
      capacidadParejas: 0,
      dias: [],
      diaEliminatorias: null,
      avisos,
    };
  }

  const diasUnicos: string[] = [];
  for (const v of ventanas) if (!diasUnicos.includes(v.dia)) diasUnicos.push(v.dia);

  // El ultimo dia es de eliminatorias, salvo que el torneo sea de un solo dia.
  const unicaVentana = diasUnicos.length === 1;
  const diaEliminatorias = unicaVentana ? null : diasUnicos[diasUnicos.length - 1];
  if (unicaVentana) {
    avisos.push(
      `Ventana unica (${diasUnicos[0]}): se generan bloques de grupos en el mismo dia de las eliminatorias.`,
    );
  }

  const bloques: Bloque[] = [];
  const dias: DiaGenerado[] = [];
  const vistos = new Set<string>();

  for (const dia of diasUnicos) {
    if (dia === diaEliminatorias) {
      dias.push({ dia, bloques: 0, minutosSobrantes: 0, eliminatorias: true });
      continue;
    }

    let bloquesDelDia = 0;
    let sobrantesDelDia = 0;

    for (const v of ventanas.filter((x) => x.dia === dia)) {
      const inicio = parseHoraBloque(v.desde);
      const fin = parseHoraBloque(v.hasta);
      if (fin <= inicio) {
        avisos.push(`Ventana vacia o invertida en ${dia} (${v.desde}-${v.hasta}): 0 bloques.`);
        continue;
      }

      let t = inicio;
      while (t + minutosPorBloque <= fin) {
        const id = `${dia}-${formatHoraBloque(t)}`;
        if (vistos.has(id)) {
          avisos.push(`Bloque duplicado ${id} descartado: hay ventanas que se traslapan.`);
        } else {
          vistos.add(id);
          bloques.push({
            id,
            dia,
            desde: formatHoraBloque(t),
            hasta: formatHoraBloque(t + minutosPorBloque),
            carriles: entrada.canchas,
          });
          bloquesDelDia += 1;
        }
        t += minutosPorBloque;
      }

      sobrantesDelDia += fin - t;
    }

    if (bloquesDelDia === 0) {
      avisos.push(`El dia ${dia} no alcanza para un bloque de ${minutosPorBloque} min.`);
    }
    if (sobrantesDelDia > 0) {
      avisos.push(`Sobran ${sobrantesDelDia} min en ${dia}: no alcanzan para otro bloque.`);
    }

    dias.push({
      dia,
      bloques: bloquesDelDia,
      minutosSobrantes: sobrantesDelDia,
      eliminatorias: false,
    });
  }

  const capacidadCarriles = bloques.reduce((a, b) => a + b.carriles, 0);

  return {
    bloques,
    minutosPorBloque,
    capacidadCarriles,
    capacidadParejas: capacidadCarriles * PAREJAS_POR_GRUPO,
    dias,
    diaEliminatorias,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// 2. Cupo
// ---------------------------------------------------------------------------

/**
 * Cuantas parejas MAS caben en un bloque para una categoria.
 *
 * No es una division simple. Un grupo son 3 parejas de la MISMA categoria, y
 * cada grupo ocupa un carril entero:
 *
 *   carrilesUsados   = suma de ceil(parejas[cat] / 3) sobre todas las categorias
 *   carrilesLibres   = carriles - carrilesUsados
 *   huecoEnMiCarril  = (3 - (parejas[categoriaId] % 3)) % 3
 *   cupo             = huecoEnMiCarril + carrilesLibres * 3
 *
 * Si 5a Fuerza tiene 7 parejas en el bloque ocupa 3 carriles (9 lugares) y le
 * sobran 2 huecos que SOLO sirven para 5a Fuerza. Una pareja de otra categoria
 * necesita carril nuevo.
 */
export function cupoDeBloque(
  bloque: Bloque,
  ocupacion: OcupacionBloque | undefined,
  categoriaId: string,
  parejasPorGrupo: number = PAREJAS_POR_GRUPO,
): number {
  const ocup = ocupacion ?? {};

  let carrilesUsados = 0;
  for (const cat of Object.keys(ocup)) {
    const parejas = ocup[cat] ?? 0;
    if (parejas <= 0) continue;
    carrilesUsados += Math.ceil(parejas / parejasPorGrupo);
  }

  const carrilesLibres = bloque.carriles - carrilesUsados;
  const mias = ocup[categoriaId] ?? 0;
  const huecoEnMiCarril = mias > 0 ? (parejasPorGrupo - (mias % parejasPorGrupo)) % parejasPorGrupo : 0;

  // Si el bloque quedo sobrevendido, carrilesLibres es negativo: no resta huecos propios.
  const porCarrilesNuevos = Math.max(0, carrilesLibres) * parejasPorGrupo;
  return huecoEnMiCarril + porCarrilesNuevos;
}

// ---------------------------------------------------------------------------
// 3. Bloques ofrecibles
// ---------------------------------------------------------------------------

/**
 * Los bloques con cupo > 0 para la categoria, cada uno con su cupo.
 * Conserva el orden de `bloques`. Los agotados no salen: la UI los oculta.
 */
export function bloquesDisponibles(
  bloques: Bloque[],
  ocupacion: Ocupacion | undefined,
  categoriaId: string,
  parejasPorGrupo: number = PAREJAS_POR_GRUPO,
): BloqueDisponible[] {
  const ocup = ocupacion ?? {};
  const salida: BloqueDisponible[] = [];
  for (const bloque of bloques) {
    const cupo = cupoDeBloque(bloque, ocup[bloque.id], categoriaId, parejasPorGrupo);
    if (cupo > 0) salida.push({ ...bloque, cupo });
  }
  return salida;
}
