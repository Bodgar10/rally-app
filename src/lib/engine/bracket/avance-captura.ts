// src/lib/engine/bracket/avance-captura.ts
//
// Qué hay que escribir en el cuadro cuando se captura (o se corrige) el
// resultado de un partido de eliminatorias. Determinista, sin dependencias
// de red ni de base de datos.
//
// POR QUÉ LA CAPTURA AVANZA EL CUADRO
//   El domingo el organizador está en la cancha, no en la app. Un paso manual
//   entre "capturé la semifinal" y "aparece el finalista" es tiempo en el que
//   la pantalla que la gente mira desde el celular está mintiendo. Así que
//   capturar y avanzar son el MISMO acto, y o pasan las dos cosas o ninguna.
//
// LO QUE ESTE MÓDULO DECIDE Y LO QUE NO
//   Aquí se decide QUÉ escribir. La atomicidad, el bloqueo y la comprobación
//   de que nadie escribió en medio son de la RPC (migración 050). La RPC
//   vuelve a comprobar la invariante de abajo por su cuenta: este módulo no es
//   la última línea de defensa, es la que sabe de cuadros.
//
// LA INVARIANTE DE LA CORRECCIÓN
//   Corregir un resultado solo se permite mientras el partido que depende de
//   él NO se haya jugado. Si la semifinal estuvo mal pero la final ya se jugó,
//   se RECHAZA con el partido que estorba por delante; no se deshace nada.
//
//   Deshacer en cascada significaría borrar resultados de partidos que dos
//   parejas jugaron de verdad, para arreglar un error de más arriba. Eso es
//   destruir un registro cierto para tapar uno falso, y además no tiene fondo:
//   corregir la primera ronda de un cuadro de 32 arrastraría cinco rondas y el
//   tercer lugar. Cuando ya se jugó, la decisión (repetir, adjudicar) es del
//   organizador y de nadie más; el software se aparta y dice exactamente qué
//   lo bloquea.
//
//   Matiz que sí importa: se rechaza solo si la corrección CAMBIA quién juega
//   el partido ya jugado. Corregir un 6-4 mal anotado a 6-3, sin cambiar de
//   ganador, se permite siempre.

import { stageForBracketSize, type MatchStage } from '../seeding/stage-map';
import { advanceBracket, thirdPlaceFromSemis, type RoundMatch } from './index';

/** Partido de cuadro tal y como está hoy en la base. */
export interface PartidoCuadro {
  id: string;
  stage: string;
  roundLabel: string | null;
  pairAId: string | null;
  pairBId: string | null;
  winnerPairId: string | null;
  status: string;
  /** Partidos de la ronda previa que lo alimentan. Null en la ronda sembrada. */
  sourceMatchIds: string[] | null;
}

/** Partido de la ronda siguiente que hay que CREAR. */
export interface CrearPartido {
  stage: MatchStage | 'third_place';
  roundLabel: string;
  /**
   * Posición dentro de la ronda, 0-based. Es la clave del plan.
   *
   * `match_schedule` reserva hora y cancha para TODAS las rondas desde que se
   * programa el día, incluidas las que todavía no tienen fila en `matches`, y
   * las identifica por (categoría, etapa, slot_index) — la posición es lo
   * único que existe antes que el partido. Sin este dato el partido nacía sin
   * hora y salía como "POR PROGRAMAR" aunque su hueco ya estuviera decidido.
   */
  slotIndex: number;
  pairAId: string | null;
  pairBId: string | null;
  sourceMatchIds: [string, string];
}

/** Partido que ya existe y al que hay que cambiarle las parejas. */
export interface ReapuntarPartido {
  matchId: string;
  pairAId: string | null;
  pairBId: string | null;
}

export interface PlanOk {
  ok: true;
  /** El partido ya estaba capturado: esto es una corrección. */
  esCorreccion: boolean;
  /** Con este resultado, la ronda queda completa. */
  rondaCompleta: boolean;
  /** Etapa que se crea, si toca. Null si no hay avance. */
  siguienteEtapa: MatchStage | null;
  crear: CrearPartido[];
  reapuntar: ReapuntarPartido[];
}

export interface PlanRechazo {
  ok: false;
  motivo:
    | 'match_not_found'
    | 'not_a_bracket_match'
    | 'is_a_bye'
    | 'winner_not_in_match'
    | 'downstream_already_played';
  detalle: string;
  /** Ids de los partidos ya jugados que bloquean la corrección. */
  bloqueadoPor?: string[];
}

export type PlanAvance = PlanOk | PlanRechazo;

const ETIQUETA_TERCERO = 'third_place-1';

/** `${stage}-01`. Con cero delante: así el orden lexicográfico es el numérico. */
export const etiquetaDeRonda = (stage: string, indice: number): string =>
  `${stage}-${String(indice + 1).padStart(2, '0')}`;

/** Ganador efectivo: el marcado, o la pareja presente si el rival no existe (bye). */
function ganadorDe(m: { pairAId: string | null; pairBId: string | null; winnerPairId: string | null }): string | null {
  if (m.winnerPairId) return m.winnerPairId;
  if (m.pairAId && !m.pairBId) return m.pairAId;
  if (m.pairBId && !m.pairAId) return m.pairBId;
  return null;
}

/** Dos conjuntos de orígenes iguales, sin importar el orden. */
function mismosOrigenes(a: string[] | null | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

/**
 * Localiza el partido que ya existe para un cruce de la ronda siguiente.
 *
 * Se busca primero por `sourceMatchIds`, que es el enlace explícito del árbol.
 * Se cae a la etiqueta de ronda porque los cuadros sembrados ANTES de la
 * migración 049 no tienen orígenes guardados: sin ese respaldo, corregir un
 * resultado de esos cuadros crearía un partido duplicado en vez de reapuntar
 * el que ya está.
 */
function buscarExistente(
  partidos: PartidoCuadro[],
  stage: string,
  roundLabel: string,
  origenes: readonly string[],
): PartidoCuadro | undefined {
  return (
    partidos.find((p) => p.stage === stage && mismosOrigenes(p.sourceMatchIds, origenes)) ??
    partidos.find((p) => p.stage === stage && p.roundLabel === roundLabel)
  );
}

/**
 * Qué escribir en el cuadro al capturar `matchId` con `winnerPairId`.
 *
 * `partidos` son TODOS los partidos de eliminatorias de la categoría, tal como
 * están hoy. No se muta nada.
 */
export function planAvance(
  partidos: PartidoCuadro[],
  matchId: string,
  winnerPairId: string,
  /**
   * ¿El torneo juega el 3.er lugar? Decisión de torneo (migración 052).
   * Default true: es lo que se venía haciendo antes de que fuera configurable.
   */
  tercerLugar = true,
): PlanAvance {
  const partido = partidos.find((p) => p.id === matchId);
  if (!partido) {
    return { ok: false, motivo: 'match_not_found', detalle: `El partido ${matchId} no está en el cuadro.` };
  }
  if (partido.stage === 'group') {
    return { ok: false, motivo: 'not_a_bracket_match', detalle: 'Es un partido de fase de grupos.' };
  }
  if (!partido.pairAId || !partido.pairBId) {
    // Un bye es un resultado conocido desde que se siembra (migración 045).
    // No se captura, y capturarlo pisaría un ganador que ya es correcto.
    return { ok: false, motivo: 'is_a_bye', detalle: 'Ese cruce es un bye: no se juega ni se captura.' };
  }
  if (winnerPairId !== partido.pairAId && winnerPairId !== partido.pairBId) {
    return { ok: false, motivo: 'winner_not_in_match', detalle: 'El ganador no es ninguna de las dos parejas del partido.' };
  }

  const esCorreccion = partido.status === 'finished';

  // El tercer lugar y la final no alimentan nada.
  if (partido.stage === 'third_place' || partido.stage === 'final') {
    return {
      ok: true, esCorreccion, rondaCompleta: true,
      siguienteEtapa: null, crear: [], reapuntar: [],
    };
  }

  // ── La ronda, en orden de cuadro ────────────────────────────────────────
  // advanceBracket empareja los partidos i e i+1, así que el orden es
  // semántico. La etiqueta lleva ceros a la izquierda justo para que el orden
  // lexicográfico sea el del cuadro.
  const ronda = partidos
    .filter((p) => p.stage === partido.stage && p.stage !== 'third_place')
    .sort((a, b) => (a.roundLabel ?? '').localeCompare(b.roundLabel ?? '') || (a.id < b.id ? -1 : 1));

  // El resultado nuevo, aplicado sobre una copia.
  const rondaConResultado: RoundMatch[] = ronda.map((p) => ({
    matchId: p.id,
    pairAId: p.pairAId,
    pairBId: p.pairBId,
    winnerPairId: p.id === matchId ? winnerPairId : p.winnerPairId,
  }));

  const rondaCompleta = rondaConResultado.every((m) => ganadorDe(m) !== null);

  if (!rondaCompleta || rondaConResultado.length < 2 || rondaConResultado.length % 2 !== 0) {
    // Todavía faltan resultados: solo se guarda este. Nada que avanzar.
    return {
      ok: true, esCorreccion, rondaCompleta: false,
      siguienteEtapa: null, crear: [], reapuntar: [],
    };
  }

  const { next } = advanceBracket(rondaConResultado);
  const siguienteEtapa = stageForBracketSize(next.length * 2);

  const crear: CrearPartido[] = [];
  const reapuntar: ReapuntarPartido[] = [];
  const bloqueadoPor: string[] = [];

  const encajar = (
    stage: MatchStage | 'third_place',
    roundLabel: string,
    slotIndex: number,
    pairAId: string | null,
    pairBId: string | null,
    origenes: [string, string],
  ) => {
    const existente = buscarExistente(partidos, stage, roundLabel, origenes);
    if (!existente) {
      crear.push({ stage, roundLabel, slotIndex, pairAId, pairBId, sourceMatchIds: origenes });
      return;
    }
    const igual = existente.pairAId === pairAId && existente.pairBId === pairBId;
    if (igual) return;                                  // ya apunta a quien debe
    if (existente.status === 'finished') {              // ya se jugó con otras parejas
      bloqueadoPor.push(existente.id);
      return;
    }
    reapuntar.push({ matchId: existente.id, pairAId, pairBId });
  };

  next.forEach((cruce, i) => {
    encajar(siguienteEtapa, etiquetaDeRonda(siguienteEtapa, i), i, cruce.pairAId, cruce.pairBId, cruce.sourceMatchIds);
  });

  // 3.er lugar: sale de los perdedores de las dos semifinales, igual que en
  // `generate-bracket`. Se crea al avanzar semis, no antes — y solo si el
  // torneo lo juega.
  if (tercerLugar && partido.stage === 'semi' && rondaConResultado.length === 2) {
    const tercero = thirdPlaceFromSemis([rondaConResultado[0], rondaConResultado[1]]);
    if (tercero) {
      // El 3.er lugar es único en su etapa: su hueco en el plan es el 0.
      encajar('third_place', ETIQUETA_TERCERO, 0, tercero.pairAId, tercero.pairBId, tercero.sourceMatchIds);
    }
  }

  if (bloqueadoPor.length > 0) {
    return {
      ok: false,
      motivo: 'downstream_already_played',
      detalle:
        `La corrección cambiaría quién juega ${bloqueadoPor.length === 1 ? 'un partido' : `${bloqueadoPor.length} partidos`} ` +
        `que ya se jugó. Anúlalo primero o resuélvelo como organizador.`,
      bloqueadoPor,
    };
  }

  return { ok: true, esCorreccion, rondaCompleta: true, siguienteEtapa, crear, reapuntar };
}
