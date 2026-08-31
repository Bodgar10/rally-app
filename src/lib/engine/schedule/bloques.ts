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
 * Logica pura y determinista: misma entrada -> misma salida. Su unica
 * dependencia es FACTOR_RETRASO, que se importa en vez de copiarse: el retraso
 * de un partido es un hecho del deporte, no de cada motor.
 */

import { FACTOR_RETRASO } from './knockout.ts';

/**
 * Parejas del grupo tipico. NO es una constante del dominio: `computeFormat`
 * produce grupos de 4 y de 5 cuando el numero de parejas no es multiplo de 3.
 * Es el default de quien no dice nada.
 */
export const PAREJAS_POR_GRUPO = 3;

/**
 * Partidos que caben en un carril de un bloque.
 *
 * Es la MISMA cifra que `partidosPorGrupo` de `generarBloques`, y no por
 * casualidad: el bloque se dimensiona como "lo que tarda un grupo tipico", asi
 * que un carril-bloque mide exactamente 3 partidos. Separarlas de nombre
 * importa porque un grupo de 4 son 6 partidos y ya no cabe en un carril.
 */
export const PARTIDOS_POR_CARRIL = 3;

/** @deprecated Alias historico de PARTIDOS_POR_CARRIL. */
export const PARTIDOS_POR_GRUPO = PARTIDOS_POR_CARRIL;

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
  /** Hora a la que TERMINA el bloque si todo corre a tiempo. */
  hasta: string;
  /**
   * Hora a la que termina de VERDAD, con los retrasos habituales.
   *
   * Un partido planificado a 60 minutos dura 75 de media (FACTOR_RETRASO), y
   * los tres de un grupo van encadenados en la misma cancha: el retraso del
   * primero empuja al segundo. Un bloque de 20:00 a 23:00 acaba realmente
   * cerca de las 23:45.
   *
   * OJO CON LO QUE ESTO NO MODELA: es el retraso de ESTE bloque, no la deriva
   * acumulada del dia. Si el bloque anterior de la misma cancha tambien se
   * alargo, el siguiente empieza tarde y esta hora se queda corta. No se
   * acumula a proposito — un club recupera entre bloques, y encadenar cinco
   * retrasos daria una hora que nadie va a ver.
   */
  hastaRealista: string;
  /**
   * El bloque se sale de la ventana del dia con los retrasos habituales.
   *
   * No lo convierte en invalido: Cimepa jugo a las 22:00 de verdad y el bloque
   * de las 20:00 existe porque la gente lo usa. Lo que no puede pasar es que
   * alguien lo elija sin saberlo.
   */
  seSaleDeLaVentana: boolean;
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

  /**
   * Lo que dura un bloque de verdad. Los partidos van encadenados en la misma
   * cancha, asi que el retraso de cada uno empuja al siguiente:
   *
   *   3 partidos x 60 min x 1.25 = 225 min = 3 h 45
   *
   * Se redondea al minuto para no arrastrar decimales a una hora 'HH:MM'.
   */
  const minutosRealistas = Math.round(minutosPorBloque * FACTOR_RETRASO);

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
          // Con una ventana que cierra muy tarde el retraso puede cruzar la
          // medianoche. Se envuelve para no emitir un "24:44" que nadie sabe
          // leer; `seSaleDeLaVentana` sigue comparando el minuto crudo.
          const finRealista = t + minutosRealistas;
          bloques.push({
            id,
            dia,
            desde: formatHoraBloque(t),
            hasta: formatHoraBloque(t + minutosPorBloque),
            hastaRealista: formatHoraBloque(finRealista % 1440),
            seSaleDeLaVentana: finRealista > fin,
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
// 2. Coste de un grupo en carriles
// ---------------------------------------------------------------------------

/**
 * Partidos de un round robin de n parejas: n(n-1)/2.
 *
 *   2 parejas ->  1 partido    3 ->  3    4 ->  6    5 -> 10
 */
export function partidosDeGrupo(parejas: number): number {
  if (!Number.isInteger(parejas) || parejas < 0) {
    throw new Error(`parejas debe ser un entero >= 0: ${parejas}`);
  }
  return (parejas * (parejas - 1)) / 2;
}

/**
 * Carriles-bloque que consume un grupo de n parejas.
 *
 * ESTE ES EL ARREGLO. Antes se contaba en parejas —"3 parejas = 1 carril"— y
 * eso solo es cierto para el grupo tipico. `computeFormat` produce grupos de 4
 * cuando el numero de parejas no es multiplo de 3 (20 parejas -> [4,4,3,3,3,3]),
 * y un grupo de 4 son SEIS partidos: dos bloques de 3 horas, no uno. Contarlo
 * como un carril anunciaba capacidad que no existe.
 *
 * La cuenta correcta es en partidos: un carril-bloque son `partidosPorCarril`
 * partidos, y un grupo cuesta `n(n-1)/2`.
 *
 *   3 parejas ->  3 partidos -> 1 carril
 *   4 parejas ->  6 partidos -> 2 carriles
 *   5 parejas -> 10 partidos -> 4 carriles
 *   2 parejas ->  1 partido  -> 1 carril  (el minimo: el carril es la unidad
 *                                          de reserva, no se parte)
 */
export function carrilesDeGrupo(
  parejas: number,
  partidosPorCarril: number = PARTIDOS_POR_CARRIL,
): number {
  if (!Number.isInteger(partidosPorCarril) || partidosPorCarril <= 0) {
    throw new Error(`partidosPorCarril debe ser un entero positivo: ${partidosPorCarril}`);
  }
  if (parejas <= 0) return 0;
  return Math.max(1, Math.ceil(partidosDeGrupo(parejas) / partidosPorCarril));
}

// ---------------------------------------------------------------------------
// 3. Cupo
// ---------------------------------------------------------------------------

export interface OpcionesCupo {
  /**
   * Parejas por grupo que va a usar cada categoria, por id. Lo decide
   * `computeFormat` a partir de cuantas parejas lleva la categoria; este motor
   * no lo deriva para no depender del motor de formato.
   *
   * Una categoria sin entrada usa PAREJAS_POR_GRUPO. Un valor que no sea un
   * entero >= 2 se ignora y cae al default: esta funcion corre dentro de un
   * render, y reventar ahi tumba la pantalla de inscripcion entera.
   */
  parejasPorGrupo?: Record<string, number>;
  /** Partidos que caben en un carril. Default PARTIDOS_POR_CARRIL. */
  partidosPorCarril?: number;
}

function tamanoDeGrupo(opciones: OpcionesCupo, categoriaId: string): number {
  const g = opciones.parejasPorGrupo?.[categoriaId];
  return Number.isInteger(g) && (g as number) >= 2 ? (g as number) : PAREJAS_POR_GRUPO;
}

/**
 * Cuantas parejas MAS caben en un bloque para una categoria.
 *
 * No es una division simple, por dos razones que se acumulan:
 *
 *   1. Un grupo son parejas de la MISMA categoria y ocupa carriles enteros. Los
 *      huecos de un grupo a medias NO sirven para otra categoria.
 *   2. Cuantos carriles ocupa un grupo depende de su tamano (ver
 *      `carrilesDeGrupo`): 3 parejas = 1 carril, 4 parejas = 2.
 *
 *   carrilesUsados  = suma sobre categorias de
 *                       ceil(parejas[cat] / G[cat]) * carrilesDeGrupo(G[cat])
 *   carrilesLibres  = carriles - carrilesUsados
 *   huecoEnMiGrupo  = (G - (mias % G)) % G
 *   gruposQueCaben  = floor(carrilesLibres / carrilesDeGrupo(G))
 *   cupo            = huecoEnMiGrupo + gruposQueCaben * G
 *
 * Con G = 3 en todo sale exactamente la formula de antes; el cambio no mueve
 * el caso normal.
 *
 * EJEMPLO DEL BUG QUE ARREGLA
 *   Categoria de 8 parejas -> computeFormat da [4,4] -> G = 4. Un bloque vacio
 *   de 8 carriles admite 4 grupos de 4 (16 parejas), no 8 grupos de 3 (24).
 *   Antes decia 24: ocho parejas de mas que no tenian donde jugar.
 *
 * ES UN PRONOSTICO, NO UN CUPO EXACTO. Se calcula mientras la gente todavia se
 * esta inscribiendo, asi que G sale del numero de parejas de ESTE momento y
 * puede cambiar con la siguiente inscripcion. La cuenta fina, sobre la
 * inscripcion cerrada, es `capacidadDelTorneo`.
 */
export function cupoDeBloque(
  bloque: Bloque,
  ocupacion: OcupacionBloque | undefined,
  categoriaId: string,
  opciones: OpcionesCupo = {},
): number {
  const ocup = ocupacion ?? {};
  const ppc  = opciones.partidosPorCarril ?? PARTIDOS_POR_CARRIL;

  let carrilesUsados = 0;
  for (const cat of Object.keys(ocup)) {
    const parejas = ocup[cat] ?? 0;
    if (parejas <= 0) continue;
    const g = tamanoDeGrupo(opciones, cat);
    carrilesUsados += Math.ceil(parejas / g) * carrilesDeGrupo(g, ppc);
  }

  const carrilesLibres = bloque.carriles - carrilesUsados;

  const gMia = tamanoDeGrupo(opciones, categoriaId);
  const mias = ocup[categoriaId] ?? 0;

  // Huecos del grupo a medias que ya tengo abierto: su carril ya esta pagado.
  const huecoEnMiGrupo = mias > 0 ? (gMia - (mias % gMia)) % gMia : 0;

  // Si el bloque quedo sobrevendido, carrilesLibres es negativo: no resta
  // huecos propios, solo deja de ofrecer grupos nuevos.
  const gruposQueCaben = Math.floor(Math.max(0, carrilesLibres) / carrilesDeGrupo(gMia, ppc));

  return huecoEnMiGrupo + gruposQueCaben * gMia;
}

// ---------------------------------------------------------------------------
// 4. Bloques ofrecibles
// ---------------------------------------------------------------------------

/**
 * Los bloques con cupo > 0 para la categoria, cada uno con su cupo.
 * Conserva el orden de `bloques`. Los agotados no salen: la UI los oculta.
 */
export function bloquesDisponibles(
  bloques: Bloque[],
  ocupacion: Ocupacion | undefined,
  categoriaId: string,
  opciones: OpcionesCupo = {},
): BloqueDisponible[] {
  const ocup = ocupacion ?? {};
  const salida: BloqueDisponible[] = [];
  for (const bloque of bloques) {
    const cupo = cupoDeBloque(bloque, ocup[bloque.id], categoriaId, opciones);
    if (cupo > 0) salida.push({ ...bloque, cupo });
  }
  return salida;
}
