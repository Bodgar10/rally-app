/**
 * Scheduler de fase de grupos.
 * Asigna cancha y hora a los partidos de cada grupo, DENTRO del bloque que el
 * grupo ya tiene asignado. Logica pura y determinista: misma entrada -> misma
 * salida. Sin dependencias mas alla del grafo de hermandad de `knockout.ts`.
 *
 * Especificacion: `docs/scheduler-fase-de-grupos.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE MOTOR NO DECIDE
 *   En que bloque juega cada grupo. Eso lo eligio la pareja al inscribirse
 *   (`pair_block_choices`) y lo materializo `repartirPorBloque` al cerrar. Aqui
 *   entra hecho y no se toca. Es la unica promesa que se le hizo al jugador.
 *
 * LA HUELLA DE UN GRUPO SALE DE SUS RONDAS, NO DE UN NUMERO QUE LE PASEN
 *   `generateRoundRobin` ya agrupa los partidos en RONDAS donde ninguna pareja
 *   se repite. Eso da las dos medidas que hacen falta:
 *
 *     rondas  = cuantos turnos consecutivos ocupa el grupo
 *     anchura = partidos de la ronda mas cargada = canchas simultaneas
 *
 *     3 parejas -> 3 rondas x 1 cancha  = 1 carril   (3 h)
 *     4 parejas -> 3 rondas x 2 canchas = 2 carriles (3 h en DOS canchas)
 *     5 parejas -> 5 rondas x 2 canchas = 4 carriles (2 bloques)
 *     2 parejas -> 1 ronda  x 1 cancha  = 1 carril   (sobran 2 h)
 *
 *   Coincide con `carrilesDeGrupo` de `bloques.ts` en los cuatro casos, y es
 *   preferible a recibir `carriles` como dato: un numero que el llamador puede
 *   equivocarse al calcular es un numero que acabara desincronizado.
 *
 *   El grupo de 4 sale asi en DOS canchas del mismo bloque —3 horas, no 6—,
 *   que es la forma que pide la especificacion (§6.4 A) y la que respeta el
 *   trato de Cimepa: la gente esta 3 horas en el club.
 *
 * EL CARRIL ES LA UNIDAD DE RESERVA, Y NO SE PARTE
 *   Un grupo de 2 ocupa una cancha las 3 horas aunque solo juegue una. Rellenar
 *   ese hueco con otro grupo rompe la continuidad de categoria (§2.1) y le
 *   complica la vida al juez por una hora de cancha.
 *
 * LA OCUPACION ES UN DATO, NO UN OBJETIVO
 *   Sale de dividir los partidos colocados entre la capacidad de la reticula
 *   ENTERA. Cimepa: 165 partidos sobre 192 canchas-hora = 85,9 %. Ese numero no
 *   se puede subir programando mejor —los partidos son los que son—, solo
 *   usando menos bloques, que es exactamente lo que no hay que hacer: las horas
 *   ociosas del viernes por la tarde son las horas a las que la gente trabaja.
 */

import { grafoDeHermandad } from './knockout';
import { parseHoraBloque, formatHoraBloque, type Bloque } from './bloques';

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

/** Un partido tal como lo emitio `generateRoundRobin`, ya creado en `matches`. */
export interface PartidoDeEntrada {
  matchId: string;
  pairAId: string;
  pairBId: string;
  /** 1-based. Dentro de una ronda ninguna pareja se repite. */
  ronda: number;
}

export interface GrupoAProgramar {
  /** groups.id */
  id: string;
  categoryId: string;
  /** 'A', 'B', … Solo para desempatar de forma estable y para los avisos. */
  nombre: string;
  partidos: PartidoDeEntrada[];
  /**
   * Bloque en el que juega, ya resuelto por `repartirPorBloque`. Null solo si
   * ninguna de sus parejas eligio horario: entonces sale sin programar y no
   * estorba al resto.
   */
  bloqueId: string | null;
}

export interface EntradaSchedulerGrupos {
  /** La reticula tal cual la emite `generarBloques`. No se recalcula aqui. */
  bloques: Bloque[];
  minutosPorPartido: number;
  grupos: GrupoAProgramar[];
  /** Por categoria, los jugadores que la juegan. Alimenta el grafo de hermandad. */
  jugadoresPorCategoria?: Record<string, string[]>;
  /**
   * Solo 'corrido'. El modo 'espaciado' de la especificacion (§5.4) exigiria
   * sacar partidos del bloque que la pareja eligio, que es justo lo que este
   * motor no hace. Queda documentado como conflicto abierto, no implementado a
   * medias.
   */
  modo?: 'corrido';
}

// ---------------------------------------------------------------------------
// Salidas
// ---------------------------------------------------------------------------

export interface PartidoDeGrupo {
  matchId: string;
  groupId: string;
  categoryId: string;
  bloqueId: string;
  /** 'YYYY-MM-DDTHH:MM', hora local del club. La zona la pone el llamador. */
  inicio: string;
  /** 1..carriles. Se escribe como `Cancha ${n}`, igual que el knockout. */
  cancha: number;
  /** Turno dentro del bloque, 0-based. */
  ordenEnBloque: number;
  /**
   * El partido cayo en un bloque distinto al del grupo. Solo puede pasar en
   * grupos que necesitan mas turnos de los que tiene un bloque (5 parejas).
   */
  desplazado: boolean;
}

export type MotivoSinProgramar =
  | 'sin_bloque'
  | 'bloque_desconocido'
  | 'bloque_sobrevendido'
  | 'no_cabe_en_el_bloque';

export interface GrupoSinProgramar {
  groupId: string;
  categoryId: string;
  motivo: MotivoSinProgramar;
}

export interface Empalme {
  bloqueId: string;
  categoriaA: string;
  categoriaB: string;
}

export interface BloqueSobrevendido {
  bloqueId: string;
  /** Carriles que exigen los grupos asignados a este bloque. */
  carrilesPedidos: number;
  /** Carriles que tiene: una cancha por carril. */
  carriles: number;
  grupos: number;
}

export interface CalendarioGrupos {
  partidos: PartidoDeGrupo[];
  sinProgramar: GrupoSinProgramar[];
  empalmes: Empalme[];
  sobrevendidos: BloqueSobrevendido[];
  /** Dato, nunca objetivo. Ver la cabecera. */
  ocupacion: {
    canchasHoraUsadas: number;
    canchasHoraDisponibles: number;
    /** 0..100, con un decimal. */
    porcentaje: number;
  };
  /** Canchas ocupadas en cada turno de cada bloque. Para pintar el calendario. */
  ocupacionPorBloque: { bloqueId: string; canchasUsadas: number; carriles: number }[];
  avisos: string[];
}

// ---------------------------------------------------------------------------
// La huella de un grupo
// ---------------------------------------------------------------------------

export interface HuellaGrupo {
  /** Turnos consecutivos que ocupa. */
  rondas: number;
  /** Canchas simultaneas: los partidos de la ronda mas cargada. */
  anchura: number;
  /** Los partidos de cada ronda, en orden de ronda y estable dentro de ella. */
  porRonda: PartidoDeEntrada[][];
}

/**
 * Cuantos turnos y cuantas canchas necesita un grupo.
 *
 * Las rondas se toman como vienen de `generateRoundRobin` y se renumeran a
 * 0..n-1 por si llegan con huecos: lo que importa es el ORDEN, no la etiqueta.
 * Dentro de una ronda el orden es el de entrada, que ya es determinista.
 */
export function huellaDeGrupo(partidos: PartidoDeEntrada[]): HuellaGrupo {
  const rondas = [...new Set(partidos.map((p) => p.ronda))].sort((a, b) => a - b);
  const porRonda = rondas.map((r) => partidos.filter((p) => p.ronda === r));
  return {
    rondas: rondas.length,
    anchura: porRonda.reduce((a, r) => Math.max(a, r.length), 0),
    porRonda,
  };
}

// ---------------------------------------------------------------------------
// Utilidades de reticula
// ---------------------------------------------------------------------------

/** Turnos de un bloque: su duracion entre los minutos de un partido. */
function turnosDeBloque(bloque: Bloque, minutosPorPartido: number): number {
  const dur = parseHoraBloque(bloque.hasta) - parseHoraBloque(bloque.desde);
  return Math.floor(dur / minutosPorPartido);
}

/** ¿El bloque `b` empieza justo donde acaba `a`, el mismo dia? */
function sonContiguos(a: Bloque, b: Bloque): boolean {
  return a.dia === b.dia && a.hasta === b.desde;
}

const claveCarril = (bloqueId: string, cancha: number) => `${bloqueId}#${cancha}`;

// ---------------------------------------------------------------------------
// El scheduler
// ---------------------------------------------------------------------------

/**
 * Coloca cada grupo en su bloque: cancha (o canchas) y turno de cada partido.
 *
 * No lanza nunca por datos de torneo: un grupo que no cabe sale en
 * `sinProgramar` y el resto del calendario se hace igual. Un grupo sin horario
 * no puede impedir que los otros 54 tengan el suyo.
 */
export function programarGrupos(entrada: EntradaSchedulerGrupos): CalendarioGrupos {
  const avisos: string[] = [];
  const minutos = entrada.minutosPorPartido;

  if (!Number.isFinite(minutos) || minutos <= 0) {
    throw new Error(`minutosPorPartido debe ser positivo: ${minutos}`);
  }

  // Orden canonico de la reticula. La entrada puede venir desordenada; la
  // salida no depende de ese orden.
  const bloques = [...entrada.bloques].sort(
    (a, b) => a.dia.localeCompare(b.dia) || parseHoraBloque(a.desde) - parseHoraBloque(b.desde),
  );
  const indiceDeBloque = new Map(bloques.map((b, i) => [b.id, i]));

  const partidos: PartidoDeGrupo[] = [];
  const sinProgramar: GrupoSinProgramar[] = [];
  const sobrevendidos: BloqueSobrevendido[] = [];

  if (bloques.length === 0) {
    avisos.push('Sin bloques: falta capturar las canchas o los horarios del torneo.');
    for (const g of ordenarGruposParaReporte(entrada.grupos)) {
      sinProgramar.push({ groupId: g.id, categoryId: g.categoryId, motivo: 'sin_bloque' });
    }
    return {
      partidos, sinProgramar, empalmes: [], sobrevendidos,
      ocupacion: { canchasHoraUsadas: 0, canchasHoraDisponibles: 0, porcentaje: 0 },
      ocupacionPorBloque: [],
      avisos,
    };
  }

  // ── 1. Repartir los grupos por bloque ─────────────────────────────────────
  const porBloque = new Map<string, GrupoAProgramar[]>();
  for (const b of bloques) porBloque.set(b.id, []);

  const bloquesMuertos = new Set<string>();

  for (const g of ordenarGruposParaReporte(entrada.grupos)) {
    if (g.partidos.length === 0) {
      sinProgramar.push({ groupId: g.id, categoryId: g.categoryId, motivo: 'no_cabe_en_el_bloque' });
      avisos.push(`El grupo ${g.nombre} no tiene partidos que programar.`);
      continue;
    }
    if (g.bloqueId === null) {
      sinProgramar.push({ groupId: g.id, categoryId: g.categoryId, motivo: 'sin_bloque' });
      continue;
    }
    if (!porBloque.has(g.bloqueId)) {
      // El organizador cambio las ventanas y ese bloque ya no existe. Es un
      // dato a revalidar, no un error: la gente eligio algo que se movio.
      sinProgramar.push({ groupId: g.id, categoryId: g.categoryId, motivo: 'bloque_desconocido' });
      bloquesMuertos.add(g.bloqueId);
      continue;
    }
    porBloque.get(g.bloqueId)!.push(g);
  }

  for (const id of [...bloquesMuertos].sort()) {
    avisos.push(`El bloque ${id} ya no existe en el horario del torneo: sus grupos hay que reubicarlos.`);
  }

  // ── 2. Hermandad: solo se detecta y se reporta ────────────────────────────
  //
  // NO se puede evitar reordenando ni moviendo. Dos grupos hermanos en el mismo
  // bloque ocupan las MISMAS tres horas, en canchas distintas: la persona que
  // juega en los dos no puede estar en ninguna de las dos. Y en un grupo de 3
  // cada pareja juega 2 de los 3 turnos, asi que dos subconjuntos de 2 sobre 3
  // turnos SIEMPRE se cruzan — no hay orden que lo salve.
  //
  // Moverlo de bloque si lo arreglaria, pero deshace el horario que la pareja
  // eligio, y esa es la unica promesa que se le hizo (§9). Se coloca igual y se
  // deja el empalme con nombre para que el organizador hable con esa persona.
  const hermanas = grafoDeHermandad(
    Object.entries(entrada.jugadoresPorCategoria ?? {}).map(([id, jugadores]) => ({
      id, clasificados: 0, jugadores,
    })),
  );
  const empalmes: Empalme[] = [];
  for (const b of bloques) {
    const cats = [...new Set(porBloque.get(b.id)!.map((g) => g.categoryId))].sort();
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        if (hermanas.get(cats[i])?.has(cats[j])) {
          empalmes.push({ bloqueId: b.id, categoriaA: cats[i], categoriaB: cats[j] });
        }
      }
    }
  }
  if (empalmes.length > 0) {
    avisos.push(
      `${empalmes.length} empalme${empalmes.length === 1 ? '' : 's'} entre categorías que comparten ` +
      'jugadores. No se pueden evitar sin cambiarle el horario a alguien: avísale tú.',
    );
  }

  // ── 3. Colocar ────────────────────────────────────────────────────────────
  /** Carriles ya reservados: `${bloqueId}#${cancha}` -> groupId. */
  const reservado = new Map<string, string>();
  /**
   * Canchas que uso cada categoria en el ULTIMO bloque en que jugo.
   *
   * Se guarda el conjunto entero del bloque, no las del ultimo grupo colocado:
   * una categoria con cinco grupos a la vez ocupa cinco canchas, y al bloque
   * siguiente quiere esas cinco, no la quinta. Guardarlo grupo a grupo hacia
   * que la preferencia persiguiera un blanco movil y la continuidad se perdiera
   * justo en las categorias grandes, que son las que mas la necesitan.
   *
   * Tampoco se exige que el bloque anterior sea el inmediatamente previo: una
   * categoria que se salta un bloque y vuelve prefiere sus canchas de siempre.
   */
  const canchasPrevias = new Map<string, number[]>();

  for (let i = 0; i < bloques.length; i++) {
    const bloque = bloques[i];
    const delBloque = porBloque.get(bloque.id)!;
    if (delBloque.length === 0) continue;

    const turnos = turnosDeBloque(bloque, minutos);
    if (turnos <= 0) {
      for (const g of delBloque) {
        sinProgramar.push({ groupId: g.id, categoryId: g.categoryId, motivo: 'no_cabe_en_el_bloque' });
      }
      avisos.push(`El bloque ${bloque.id} no da ni para un partido de ${minutos} min.`);
      continue;
    }

    // Aviso de sobreventa ANTES de colocar: el organizador lo necesita aunque
    // luego los grupos que caben se coloquen bien.
    const carrilesPedidos = delBloque.reduce((a, g) => {
      const h = huellaDeGrupo(g.partidos);
      return a + h.anchura * Math.ceil(h.rondas / turnos);
    }, 0);
    if (carrilesPedidos > bloque.carriles) {
      sobrevendidos.push({
        bloqueId: bloque.id,
        carrilesPedidos,
        carriles: bloque.carriles,
        grupos: delBloque.length,
      });
      avisos.push(
        `${bloque.dia} ${bloque.desde}: hacen falta ${carrilesPedidos} canchas y hay ${bloque.carriles}. ` +
        'Abre otra cancha en ese horario o habla con las parejas que sobran.',
      );
    }

    /** Lo que va ocupando cada categoria en ESTE bloque. */
    const canchasDelBloque = new Map<string, number[]>();

    for (const g of ordenarDentroDelBloque(delBloque)) {
      const huella = huellaDeGrupo(g.partidos);
      const bloquesNecesarios = Math.ceil(huella.rondas / turnos);

      // Los bloques donde va a vivir: el suyo y los contiguos del mismo dia.
      // Un grupo NUNCA se parte entre dos dias: dormir en medio de un round
      // robin no es partir un bloque, es partir el torneo.
      const tramo: Bloque[] = [bloque];
      while (tramo.length < bloquesNecesarios) {
        const siguiente = bloques[i + tramo.length];
        if (!siguiente || !sonContiguos(tramo[tramo.length - 1], siguiente)) break;
        tramo.push(siguiente);
      }
      if (tramo.length < bloquesNecesarios) {
        sinProgramar.push({ groupId: g.id, categoryId: g.categoryId, motivo: 'no_cabe_en_el_bloque' });
        avisos.push(
          `El grupo ${g.nombre} de ${g.categoryId} necesita ${huella.rondas} turnos seguidos y ` +
          `desde ${bloque.dia} a las ${bloque.desde} solo quedan ${tramo.length * turnos} antes de ` +
          'que se acabe el día.',
        );
        continue;
      }

      const canchas = elegirCanchas(
        huella.anchura, tramo, bloque, g.categoryId, reservado, canchasPrevias,
      );
      if (canchas === null) {
        sinProgramar.push({ groupId: g.id, categoryId: g.categoryId, motivo: 'bloque_sobrevendido' });
        continue;
      }

      for (const b of tramo) {
        for (const c of canchas) reservado.set(claveCarril(b.id, c), g.id);
      }
      canchasDelBloque.set(
        g.categoryId, [...(canchasDelBloque.get(g.categoryId) ?? []), ...canchas],
      );

      // ── Los partidos, ronda a ronda ────────────────────────────────────────
      // El orden es el que emitio `generateRoundRobin` y no se toca: en un
      // grupo de 3 alguien encadena dos partidos sí o sí (§2.3), y reordenar
      // solo cambia a quien le toca.
      for (let r = 0; r < huella.porRonda.length; r++) {
        const idxBloque = Math.floor(r / turnos);
        const b = tramo[idxBloque];
        const turno = r % turnos;
        const inicioMin = parseHoraBloque(b.desde) + turno * minutos;

        huella.porRonda[r].forEach((p, k) => {
          partidos.push({
            matchId: p.matchId,
            groupId: g.id,
            categoryId: g.categoryId,
            bloqueId: b.id,
            inicio: `${b.dia}T${formatHoraBloque(inicioMin)}`,
            cancha: canchas[k] ?? canchas[canchas.length - 1],
            ordenEnBloque: turno,
            desplazado: b.id !== bloque.id,
          });
        });
      }
    }

    // Las categorias que NO jugaron aqui conservan sus canchas de antes: si
    // vuelven dos bloques despues, vuelven a su sitio.
    for (const [cat, canchas] of canchasDelBloque) {
      canchasPrevias.set(cat, [...canchas].sort((x, y) => x - y));
    }
  }

  // ── 4. Ocupacion ──────────────────────────────────────────────────────────
  const horasDisponibles = bloques.reduce(
    (a, b) => a + b.carriles * (parseHoraBloque(b.hasta) - parseHoraBloque(b.desde)) / 60,
    0,
  );
  const horasUsadas = partidos.length * minutos / 60;

  const usadasPorBloque = new Map<string, Set<number>>();
  for (const p of partidos) {
    if (!usadasPorBloque.has(p.bloqueId)) usadasPorBloque.set(p.bloqueId, new Set());
    usadasPorBloque.get(p.bloqueId)!.add(p.cancha);
  }

  // Orden estable de la salida: por bloque, turno y cancha.
  partidos.sort(
    (a, b) =>
      a.bloqueId.localeCompare(b.bloqueId) ||
      a.ordenEnBloque - b.ordenEnBloque ||
      a.cancha - b.cancha ||
      a.matchId.localeCompare(b.matchId),
  );
  sinProgramar.sort((a, b) => a.groupId.localeCompare(b.groupId));

  return {
    partidos,
    sinProgramar,
    empalmes,
    sobrevendidos,
    ocupacion: {
      canchasHoraUsadas: horasUsadas,
      canchasHoraDisponibles: horasDisponibles,
      porcentaje: horasDisponibles > 0
        ? Math.round((horasUsadas / horasDisponibles) * 1000) / 10
        : 0,
    },
    ocupacionPorBloque: bloques.map((b) => ({
      bloqueId: b.id,
      canchasUsadas: usadasPorBloque.get(b.id)?.size ?? 0,
      carriles: b.carriles,
    })),
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Orden
// ---------------------------------------------------------------------------

/** Orden estable de la entrada, para que el reparto no dependa de como llegue. */
function ordenarGruposParaReporte(grupos: GrupoAProgramar[]): GrupoAProgramar[] {
  return [...grupos].sort(
    (a, b) => a.categoryId.localeCompare(b.categoryId) || a.nombre.localeCompare(b.nombre)
      || a.id.localeCompare(b.id),
  );
}

/**
 * Dentro de un bloque, primero la categoria con mas grupos AQUI.
 *
 * Una categoria con tres grupos en el mismo bloque necesita tres canchas
 * seguidas para cumplir §2.1; si se coloca al final ya solo quedan huecos
 * sueltos. A igualdad, por categoria y nombre de grupo: solo desempate estable.
 */
function ordenarDentroDelBloque(grupos: GrupoAProgramar[]): GrupoAProgramar[] {
  const cuantos = new Map<string, number>();
  for (const g of grupos) cuantos.set(g.categoryId, (cuantos.get(g.categoryId) ?? 0) + 1);

  return [...grupos].sort(
    (a, b) =>
      (cuantos.get(b.categoryId) ?? 0) - (cuantos.get(a.categoryId) ?? 0) ||
      a.categoryId.localeCompare(b.categoryId) ||
      a.nombre.localeCompare(b.nombre) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Que canchas ocupa un grupo, con la continuidad de categoria como preferencia.
 *
 * Devuelve `anchura` canchas libres en TODO el tramo, o null si no las hay.
 * Se prefieren las que esa misma categoria uso en el bloque anterior — es lo
 * que produce el "Mixtos D en la Cancha 8 todo el sabado" de Cimepa — y luego
 * las de numero mas bajo. No se exige que sean contiguas: dos canchas separadas
 * a la misma hora sirven igual, y exigir adyacencia dejaria grupos fuera por
 * una cuestion estetica.
 */
function elegirCanchas(
  anchura: number,
  tramo: Bloque[],
  bloqueDelGrupo: Bloque,
  categoryId: string,
  reservado: Map<string, string>,
  /** Canchas de la categoria en el ultimo bloque en que jugo. */
  canchasPrevias: Map<string, number[]>,
): number[] | null {
  const libre = (c: number) => tramo.every((b) => !reservado.has(claveCarril(b.id, c)));

  const todas: number[] = [];
  for (let c = 1; c <= bloqueDelGrupo.carriles; c++) todas.push(c);

  // Es lo que produce el "Mixtos D en la Cancha 8 todo el sabado" de Cimepa.
  const previas = (canchasPrevias.get(categoryId) ?? [])
    .filter((c) => c >= 1 && c <= bloqueDelGrupo.carriles);

  const orden = [...previas, ...todas.filter((c) => !previas.includes(c))];
  const elegidas = orden.filter(libre).slice(0, anchura);

  return elegidas.length === anchura ? elegidas : null;
}

