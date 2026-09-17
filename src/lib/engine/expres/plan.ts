// src/lib/engine/expres/plan.ts
// El horario de la tarde. Determinista, sin reloj: todo sale de la ventana que
// da el organizador, nunca de `new Date()`.
//
// QUÉ RESPONDE
//
//   "Si abro a las 12:00, cierro a las 19:00, tengo 4 canchas y meto 16
//   parejas, ¿cabe?" Y si no cabe, con cuántos partidos por pareja sí.
//
// EL RELOJ DEL TORNEO Y EL DEL JUGADOR NO SON EL MISMO
//
//   Una pareja juega 5 partidos de 30 minutos: 2 h 30 de pádel. Pero mientras
//   su grupo juega, el otro descansa, así que está en el club el DOBLE de
//   tiempo — juega 150 minutos y espera otros 150. Los dos números son
//   verdad y los dos hay que enseñarlos: el primero es lo que se anuncia, el
//   segundo es a qué hora puede irse.
//
// EL TIEMPO NO DEPENDE DEL CUPO, DEPENDE DE K Y DE LAS CANCHAS
//
//   Un torneo de 12 parejas y uno de 24 duran EXACTAMENTE lo mismo si hay
//   canchas para meter una ronda entera en una franja. Lo que el cupo
//   determina es cuántas canchas hacen falta: la mitad del grupo más grande.
//   Con menos, la ronda se parte en tandas y la tarde se multiplica.
//
// POR QUÉ NO SE IMPORTA NADA DE ../schedule NI DE ../planner
//
//   Aquellos motores reparten ocho categorías en dos o tres días con bloques,
//   carriles y empalmes de jugadores compartidos. Un exprés es una categoría,
//   dos grupos y una tarde: el problema difícil que resuelven ahí —quién no
//   puede jugar a la vez que quién— no existe aquí. Importarlos ataría el modo
//   nuevo a 1360 tests que no hablan de esto. Las dos funciones de hora que
//   hacen falta son diez líneas y están abajo.

import { CLASIFICAN_POR_GRUPO, PARTIDOS_POR_PAREJA, type GrupoId } from './reglas';
import { tamanosDeGrupo } from './sorteo';

/**
 * Un partido planificado a 30 minutos dura 37 y medio de media.
 *
 * Es el mismo 1.25 que usa el planificador de torneos largos, y por el mismo
 * motivo: la cuenta limpia dice cuándo TERMINARÍA el torneo si nada se
 * retrasara, y eso no ha pasado nunca. El organizador necesita las dos horas
 * —la del plan y la realista— porque con la primera reserva las canchas y con
 * la segunda decide si le cabe la final.
 */
export const FACTOR_RETRASO = 1.25;

/**
 * Minutos que tienen que sobrar sobre la hora de cierre.
 *
 * Menos que los 60 del torneo largo, y a propósito: allí el margen protege la
 * convergencia de ocho categorías en las semifinales del último día. Aquí hay
 * una sola final y un solo cuadro, así que media hora de colchón es
 * suficiente. Sigue sin ser cero — un exprés que termina clavado a la hora de
 * cierre termina después.
 */
export const MARGEN_CIERRE_EXPRES = 30;

/** Los mismos umbrales que el planificador largo. Un "ajustado" significa lo mismo aquí. */
export const ZONA_COMODO = 0.7;
export const UMBRAL_LIMITE = 0.85;

export type ZonaExpres = 'comodo' | 'ajustado' | 'limite' | 'no_cabe';

export type EtapaExpres = 'group' | 'quarter' | 'semi' | 'final';

export interface VentanaExpres {
  /** 'HH:MM'. */
  desde: string;
  hasta: string;
}

/** Minutos a los que se PLANIFICA cada etapa. Gemelo de `expres_etapa.minutos`. */
export interface MinutosPorEtapa {
  group: number;
  quarter: number;
  semi: number;
  final: number;
}

export const MINUTOS_ESTANDAR: MinutosPorEtapa = {
  group: 30,
  quarter: 30,
  semi: 30,
  final: 45,
};

export interface FranjaPlanificada {
  orden: number;
  etapa: EtapaExpres;
  /** Solo en la fase de grupos. */
  grupo?: GrupoId;
  ronda?: number;
  partidos: number;
  /** Tandas en que se parte la franja por falta de canchas. 1 = cabe entera. */
  tandas: number;
  desde: string;
  hasta: string;
  minutos: number;
}

export interface PlanExpres {
  cupo: number;
  tamanoGrupos: { A: number; B: number };
  partidosPorPareja: number;
  canchas: number;
  /** Canchas para meter una ronda entera en una franja: la mitad del grupo mayor. */
  canchasNecesarias: number;

  franjas: FranjaPlanificada[];
  inicio: string;
  /** Hora de fin según el plan. */
  fin: string;
  /** Hora de fin si todo se retrasa lo que se retrasa siempre. */
  finRealista: string;
  /** A qué hora acaba la fase de grupos: quien no clasifica se va a esa hora. */
  finDeGrupos: string;

  minutosTotales: number;
  minutosDisponibles: number;
  holguraMinutos: number;
  ocupacion: number;
  zona: ZonaExpres;

  /** Lo que juega una pareja que no clasifica. La promesa del cartel. */
  minutosJugando: number;
  /** Lo que juega una que llega a la final. */
  minutosJugandoFinalista: number;

  /** El K más alto que cabe en esta ventana con estas canchas. null si no cabe ni 1. */
  partidosMaximosQueCaben: number | null;
  avisos: string[];
}

export interface EntradaPlanExpres {
  cupo: number;
  /** Por defecto PARTIDOS_POR_PAREJA (5). */
  partidosPorPareja?: number;
  canchas: number;
  ventana: VentanaExpres;
  /** Por defecto MINUTOS_ESTANDAR. */
  minutos?: Partial<MinutosPorEtapa>;
  /** Por defecto MARGEN_CIERRE_EXPRES. */
  margenCierreMin?: number;
}

/**
 * Arma el horario completo de un exprés y dice si cabe.
 *
 * Las franjas de grupo se alternan A, B, A, B… porque mientras un grupo juega
 * el otro descansa. Como los dos tienen el MISMO número de rondas —siempre K,
 * sin importar cuántas parejas tenga cada uno— la alternancia sale sin huecos.
 */
export function planificarExpres(entrada: EntradaPlanExpres): PlanExpres {
  const cupo = exigirCupo(entrada?.cupo);
  const canchas = exigirEntero(entrada?.canchas, 'canchas', 1);
  const k = exigirEntero(entrada?.partidosPorPareja ?? PARTIDOS_POR_PAREJA, 'partidosPorPareja', 1);
  const minutos: MinutosPorEtapa = { ...MINUTOS_ESTANDAR, ...(entrada?.minutos ?? {}) };
  for (const etapa of ['group', 'quarter', 'semi', 'final'] as const) {
    exigirEntero(minutos[etapa], `minutos.${etapa}`, 1);
  }
  const margen = entrada?.margenCierreMin ?? MARGEN_CIERRE_EXPRES;

  const inicioMin = parseHora(entrada?.ventana?.desde, 'ventana.desde');
  const finMin = parseHora(entrada?.ventana?.hasta, 'ventana.hasta');
  if (finMin <= inicioMin) {
    throw new Error(
      `planificarExpres: la ventana ${entrada.ventana.desde}–${entrada.ventana.hasta} no tiene ` +
        `duración. La hora de cierre tiene que ser posterior a la de apertura.`,
    );
  }

  const tamanos = tamanosDeGrupo(cupo);
  if (k > Math.min(tamanos.A, tamanos.B) - 1) {
    throw new Error(
      `planificarExpres: no caben ${k} partidos por pareja en un grupo de ` +
        `${Math.min(tamanos.A, tamanos.B)}: solo hay ${Math.min(tamanos.A, tamanos.B) - 1} rivales distintos.`,
    );
  }

  const franjas = armarFranjas(tamanos, k, canchas, minutos, inicioMin);

  const minutosTotales = franjas.reduce((t, f) => t + f.minutos, 0);
  const minutosDisponibles = finMin - inicioMin;
  const ultimaDeGrupos = [...franjas].reverse().find((f) => f.etapa === 'group')!;

  // La ocupación NO incluye el margen de cierre, igual que en el planificador
  // largo: allí la ocupación mide coste contra presupuesto y el margen se
  // exige aparte. Mezclarlos daría un 'limite' en tardes que van holgadas y el
  // organizador dejaría de fiarse de la etiqueta.
  const ocupacion = minutosTotales / minutosDisponibles;
  const zona: ZonaExpres =
    minutosTotales > minutosDisponibles
      ? 'no_cabe'
      : ocupacion > UMBRAL_LIMITE
        ? 'limite'
        : ocupacion > ZONA_COMODO
          ? 'ajustado'
          : 'comodo';

  const canchasNecesarias = Math.max(tamanos.A, tamanos.B) / 2;
  const avisos = armarAvisos({
    canchas,
    canchasNecesarias,
    minutosTotales,
    minutosDisponibles,
    margen,
    zona,
    franjas,
    inicioMin,
  });

  return {
    cupo,
    tamanoGrupos: tamanos,
    partidosPorPareja: k,
    canchas,
    canchasNecesarias,
    franjas,
    inicio: formatHora(inicioMin),
    fin: formatHora(inicioMin + minutosTotales),
    finRealista: formatHora(inicioMin + Math.round(minutosTotales * FACTOR_RETRASO)),
    finDeGrupos: ultimaDeGrupos.hasta,
    minutosTotales,
    minutosDisponibles,
    holguraMinutos: minutosDisponibles - minutosTotales,
    ocupacion,
    zona,
    minutosJugando: k * minutos.group,
    minutosJugandoFinalista: k * minutos.group + minutos.quarter + minutos.semi + minutos.final,
    partidosMaximosQueCaben: maximoQueCabe(tamanos, canchas, minutos, inicioMin, finMin, margen),
    avisos,
  };
}

// ── Construcción del horario ────────────────────────────────────────────────

function armarFranjas(
  tamanos: { A: number; B: number },
  k: number,
  canchas: number,
  minutos: MinutosPorEtapa,
  inicioMin: number,
): FranjaPlanificada[] {
  const franjas: FranjaPlanificada[] = [];
  let reloj = inicioMin;
  let orden = 0;

  const meter = (
    etapa: EtapaExpres,
    partidos: number,
    minutosEtapa: number,
    extra?: { grupo: GrupoId; ronda: number },
  ) => {
    const tandas = Math.ceil(partidos / canchas);
    const dura = tandas * minutosEtapa;
    franjas.push({
      orden: ++orden,
      etapa,
      ...(extra ?? {}),
      partidos,
      tandas,
      desde: formatHora(reloj),
      hasta: formatHora(reloj + dura),
      minutos: dura,
    });
    reloj += dura;
  };

  // Fase de grupos: A1, B1, A2, B2, … Mientras uno juega, el otro descansa.
  for (let r = 1; r <= k; r++) {
    meter('group', tamanos.A / 2, minutos.group, { grupo: 'A', ronda: r });
    meter('group', tamanos.B / 2, minutos.group, { grupo: 'B', ronda: r });
  }

  // Eliminatoria: siempre cuartos, semis y final.
  meter('quarter', CLASIFICAN_POR_GRUPO * 2 / 2, minutos.quarter);
  meter('semi', 2, minutos.semi);
  meter('final', 1, minutos.final);

  return franjas;
}

/** El K más alto que cabe en la ventana, con margen. null si no cabe ni uno. */
function maximoQueCabe(
  tamanos: { A: number; B: number },
  canchas: number,
  minutos: MinutosPorEtapa,
  inicioMin: number,
  finMin: number,
  margen: number,
): number | null {
  const techo = Math.min(tamanos.A, tamanos.B) - 1;
  const disponibles = finMin - inicioMin - margen;
  for (let k = techo; k >= 1; k--) {
    const total = armarFranjas(tamanos, k, canchas, minutos, inicioMin).reduce(
      (t, f) => t + f.minutos,
      0,
    );
    if (total <= disponibles) return k;
  }
  return null;
}

function armarAvisos(x: {
  canchas: number;
  canchasNecesarias: number;
  minutosTotales: number;
  minutosDisponibles: number;
  margen: number;
  zona: ZonaExpres;
  franjas: FranjaPlanificada[];
  inicioMin: number;
}): string[] {
  const avisos: string[] = [];

  if (x.canchas < x.canchasNecesarias) {
    const tandas = Math.max(...x.franjas.filter((f) => f.etapa === 'group').map((f) => f.tandas));
    avisos.push(
      `Con ${x.canchas} cancha${x.canchas === 1 ? '' : 's'} una ronda no cabe entera: se parte en ` +
        `${tandas} tandas y la fase de grupos dura ${tandas} veces más. Harían falta ` +
        `${x.canchasNecesarias} para que cada ronda ocupe una sola franja.`,
    );
  }

  if (x.zona === 'no_cabe') {
    const faltan = x.minutosTotales - x.minutosDisponibles;
    avisos.push(
      `No cabe: faltan ${faltan} minutos. Abre antes, quita una ronda o consigue más canchas.`,
    );
  } else {
    const holgura = x.minutosDisponibles - x.minutosTotales;
    if (holgura < x.margen) {
      avisos.push(
        `Solo sobran ${holgura} minutos sobre la hora de cierre y conviene dejar ${x.margen}. ` +
          `Un partido de suma 6 se planifica a 30 y puede irse a 45: con este margen, dos o tres ` +
          `que se alarguen se comen la final.`,
      );
    }
  }

  const realista = x.inicioMin + Math.round(x.minutosTotales * FACTOR_RETRASO);
  if (realista > x.inicioMin + x.minutosDisponibles) {
    avisos.push(
      `El plan termina a las ${formatHora(x.inicioMin + x.minutosTotales)}, pero al ritmo real ` +
        `—los partidos se alargan— sería más bien a las ${formatHora(realista)}.`,
    );
  }

  return avisos;
}

// ── Horas. Diez líneas, para no atar el exprés a ../schedule ─────────────────

/** 'HH:MM' → minutos desde medianoche. */
export function parseHora(hhmm: unknown, campo = 'hora'): number {
  if (typeof hhmm !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) {
    throw new Error(
      `planificarExpres: ${campo} tiene que venir como 'HH:MM' en 24 horas; llegó ${JSON.stringify(hhmm)}.`,
    );
  }
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutos desde medianoche → 'HH:MM'. Pasada la medianoche sigue contando. */
export function formatHora(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Validación ──────────────────────────────────────────────────────────────

function exigirCupo(cupo: unknown): number {
  if (typeof cupo !== 'number' || !Number.isInteger(cupo)) {
    throw new Error(`planificarExpres: cupo tiene que ser un entero; llegó ${JSON.stringify(cupo)}.`);
  }
  if (cupo < 12 || cupo % 2 !== 0) {
    throw new Error(
      `planificarExpres: el cupo tiene que ser PAR y de 12 para arriba; llegó ${cupo}.`,
    );
  }
  return cupo;
}

function exigirEntero(v: unknown, campo: string, minimo: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < minimo) {
    throw new Error(
      `planificarExpres: ${campo} tiene que ser un entero >= ${minimo}; llegó ${JSON.stringify(v)}.`,
    );
  }
  return v;
}
