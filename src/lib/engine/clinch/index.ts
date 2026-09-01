// src/lib/engine/clinch/index.ts
// Motor de clasificación anticipada (Doc B §3). Determinista.
//
// POR QUÉ ESTE MOTOR MIRA LA CATEGORÍA ENTERA Y NO UN GRUPO
//
//   Razonaba grupo por grupo, aislado: si no entrabas en el top
//   `advancePerGroup` de TU grupo, estabas 'eliminated'. Punto.
//
//   Eso es falso en cuanto hay repesca, que es el caso NORMAL: los planes con
//   tamaños mixtos (10 = [4,3,3], 16 = [4,3,3,3,3], 20 = [4,4,3,3,3,3]) pasan
//   1 por grupo y rellenan el cuadro con los MEJORES SEGUNDOS de toda la
//   categoría. Un segundo de grupo con 2 puntos y tres grupos todavía sin
//   jugar no está eliminado ni de lejos — está esperando a que se resuelva la
//   carrera de repesca.
//
//   En el torneo bb8e137e (6ª Varonil, 5 grupos, 1 por grupo + 3 repescados)
//   el grupo B terminó en ciclo perfecto y el motor mandó a casa a dos parejas
//   con los grupos C, D y E en cero partidos y tres plazas de repesca abiertas.
//
//   Por eso la entrada es la CATEGORÍA COMPLETA y `bestExtraQualifiers` es
//   obligatorio. Sin ese dato no se puede responder la pregunta, así que no se
//   asume: se lanza. Un default silencioso a 0 reproduce exactamente el bug.

import type { ClinchStatus, MatchResultInput } from '../types';
import {
  computeStandings,
  DEFAULT_STANDINGS_CONFIG,
  type StandingsConfig,
} from '../standings';

export interface ClinchResult {
  groupId: string;
  pairId: string;
  status: ClinchStatus;
  /** Partidos restantes de los que depende su clasificación (para el mensaje "alive"). */
  dependsOnMatchIds: string[];
}

/** Un grupo de la categoría, con sus parejas y sus partidos (jugados o no). */
export interface ClinchGroup {
  groupId: string;
  pairIds: string[];
  matches: MatchResultInput[];
}

export interface ClinchInput {
  /** TODOS los grupos de la categoría. Con uno solo no hay carrera de repesca. */
  groups: ClinchGroup[];
  /** categories.advance_per_group. Obligatorio. */
  advancePerGroup: number;
  /** categories.best_extra_qualifiers. Obligatorio, aunque sea 0. */
  bestExtraQualifiers: number;
  config?: StandingsConfig;
}

/** Límite de partidos restantes para fuerza bruta (2^k escenarios) POR GRUPO. */
const MAX_BRUTE_FORCE_MATCHES = 16;

/**
 * El dato tiene que llegar. No hay default.
 *
 * ESTO YA COSTÓ TRES VUELTAS CON `tercer_lugar`: un `?? 0` escondido convierte
 * un dato que falta en un torneo mal calculado que nadie ve hasta la final.
 * Si la categoría está incompleta, que reviente aquí con el nombre del campo.
 */
function exigirEntero(valor: unknown, campo: string, minimo: number): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo) {
    throw new Error(
      `computeClinch: ${campo} es obligatorio y debe ser un entero >= ${minimo}; ` +
        `llegó ${JSON.stringify(valor)}. NO hay valor por defecto: sin este dato ` +
        `no se puede decidir quién está eliminado.`,
    );
  }
  return valor;
}

interface Stats {
  /** Posiciones que la pareja PUEDE ocupar en este escenario. */
  minPos: number;
  maxPos: number;
}

/**
 * Posiciones posibles de cada pareja en un escenario.
 *
 * No es `position` a secas. Cuando dos o más parejas empatan en TODA la cadena
 * de desempate (`empateSinResolver`), el orden que devuelve `computeStandings`
 * es el de entrada: da igual quién salga primera, porque hace falta un sorteo.
 * Tratar ese orden como firme es lo que dejó a Sergio "clasificado" y a las
 * otras dos "eliminadas" en un ciclo perfecto donde las tres eran idénticas.
 * Así que una pareja empatada puede ocupar CUALQUIER posición de su bloque.
 */
function posicionesPosibles(
  pairIds: string[],
  matches: MatchResultInput[],
  cfg: StandingsConfig,
): Map<string, Stats> {
  const tabla = computeStandings(pairIds, matches, cfg);
  const out = new Map<string, Stats>();

  let i = 0;
  while (i < tabla.length) {
    let j = i;
    // Un bloque = filas consecutivas marcadas como empate sin resolver.
    while (j < tabla.length - 1 && tabla[j].empateSinResolver && tabla[j + 1].empateSinResolver) j++;
    const minPos = tabla[i].position;
    const maxPos = tabla[j].position;
    for (let k = i; k <= j; k++) out.set(tabla[k].pairId, { minPos, maxPos });
    i = j + 1;
  }
  return out;
}

/** Aplica un escenario (bitmask) a los partidos restantes: bit=0 gana A, bit=1 gana B. */
function applyScenario(
  base: MatchResultInput[],
  remaining: MatchResultInput[],
  mask: number,
): MatchResultInput[] {
  const decided = remaining.map((m, i) => {
    const bWins = (mask >> i) & 1;
    return {
      ...m,
      played: true,
      winnerPairId: bWins ? m.pairBId : m.pairAId,
      sets: m.sets.length
        ? m.sets
        : [
            // marcador mínimo coherente para standings (2-0 al ganador)
            { gamesA: bWins ? 0 : 6, gamesB: bWins ? 6 : 0, isSuperTiebreak: false },
            { gamesA: bWins ? 0 : 6, gamesB: bWins ? 6 : 0, isSuperTiebreak: false },
          ],
    };
  });
  const playedBase = base.filter((m) => m.played && m.winnerPairId != null);
  return [...playedBase, ...decided];
}

/** Lo que se sabe de una pareja mirando SOLO su grupo. */
interface EstadoEnGrupo {
  /** Pasa como directa en TODOS los escenarios. */
  directaSegura: boolean;
  /** Puede pasar como directa en ALGÚN escenario. */
  directaPosible: boolean;
  /** Puede quedar en el puesto de repesca (advancePerGroup + 1) en algún escenario. */
  repescablePosible: boolean;
  /** Puntos máximos y mínimos alcanzables. */
  maxPuntos: number;
  minPuntos: number;
  dependsOnMatchIds: string[];
}

function analizarGrupo(
  g: ClinchGroup,
  advancePerGroup: number,
  cfg: StandingsConfig,
): Map<string, EstadoEnGrupo> {
  const remaining = g.matches.filter((m) => !m.played || m.winnerPairId == null);
  const k = remaining.length;
  const puestoRepesca = advancePerGroup + 1;

  const actual = computeStandings(g.pairIds, g.matches, cfg);
  const puntosAhora = new Map(actual.map((r) => [r.pairId, r.points]));
  const pendientesDe = new Map(g.pairIds.map((id) => [id, 0]));
  for (const m of remaining) {
    pendientesDe.set(m.pairAId, (pendientesDe.get(m.pairAId) ?? 0) + 1);
    pendientesDe.set(m.pairBId, (pendientesDe.get(m.pairBId) ?? 0) + 1);
  }
  const cotas = (id: string) => ({
    maxPuntos: (puntosAhora.get(id) ?? 0) + cfg.pointsWin * (pendientesDe.get(id) ?? 0),
    minPuntos: (puntosAhora.get(id) ?? 0) + cfg.pointsPlayedLoss * (pendientesDe.get(id) ?? 0),
  });

  const out = new Map<string, EstadoEnGrupo>();

  // Demasiados escenarios para enumerar: se responde con lo único que se puede
  // afirmar sin enumerar, y siempre del lado que NO elimina de más.
  if (k > MAX_BRUTE_FORCE_MATCHES) {
    for (const id of g.pairIds) {
      const c = cotas(id);
      const segurosPorEncima = g.pairIds.filter((o) => o !== id && cotas(o).minPuntos > c.maxPuntos).length;
      const puedenPorEncima = g.pairIds.filter((o) => o !== id && cotas(o).maxPuntos >= c.minPuntos).length;
      out.set(id, {
        directaSegura: puedenPorEncima < advancePerGroup,
        directaPosible: segurosPorEncima < advancePerGroup,
        repescablePosible: segurosPorEncima < puestoRepesca,
        ...c,
        dependsOnMatchIds: remaining.map((m) => m.matchId),
      });
    }
    return out;
  }

  const escenarios = 1 << k;
  // Por escenario y pareja: ¿pasa seguro?, ¿puede pasar?, ¿puede ser repescable?
  const seguraEn = new Map<string, boolean[]>(g.pairIds.map((id) => [id, []]));
  const posibleEn = new Map<string, boolean[]>(g.pairIds.map((id) => [id, []]));
  const repescableEn = new Map<string, boolean[]>(g.pairIds.map((id) => [id, []]));

  for (let mask = 0; mask < escenarios; mask++) {
    const pos = posicionesPosibles(g.pairIds, applyScenario(g.matches, remaining, mask), cfg);
    for (const id of g.pairIds) {
      const p = pos.get(id)!;
      // Segura: TODO su bloque de empate cabe dentro del corte.
      seguraEn.get(id)!.push(p.maxPos <= advancePerGroup);
      // Posible: su bloque LLEGA al corte (si está sin resolver, el sorteo puede dejarla dentro).
      posibleEn.get(id)!.push(p.minPos <= advancePerGroup);
      // Repescable: su bloque abarca el puesto de repesca.
      repescableEn.get(id)!.push(p.minPos <= puestoRepesca && p.maxPos >= puestoRepesca);
    }
  }

  for (const id of g.pairIds) {
    const seguras = seguraEn.get(id)!;
    out.set(id, {
      directaSegura: seguras.every(Boolean),
      directaPosible: posibleEn.get(id)!.some(Boolean),
      repescablePosible: repescableEn.get(id)!.some(Boolean),
      ...cotas(id),
      dependsOnMatchIds: remaining
        .filter((_, bit) => cambiaConElPartido(posibleEn.get(id)!, bit, k))
        .map((m) => m.matchId),
    });
  }
  return out;
}

/** ¿Cambiar el resultado del partido `bit` altera la clasificación de la pareja? */
function cambiaConElPartido(arr: boolean[], bit: number, k: number): boolean {
  const total = 1 << k;
  for (let mask = 0; mask < total; mask++) {
    if ((mask >> bit) & 1) continue; // solo pares (mask, mask|bit)
    const other = mask | (1 << bit);
    if (arr[mask] !== arr[other]) return true;
  }
  return false;
}

/**
 * Estado de clasificación de TODAS las parejas de una categoría.
 *
 * Cuatro estados y una regla: nadie es 'eliminated' mientras le quede una vía
 * matemática, sea ganar su grupo o colarse por repesca.
 *
 *   clinched          — pasa en todos los escenarios posibles.
 *   alive             — todavía puede terminar dentro del corte de SU grupo.
 *   repechage_pending — ya no puede ser directa, pero la carrera de mejores
 *                       segundos de la categoría sigue abierta para ella.
 *   eliminated        — ninguna de las dos cosas. Y solo entonces.
 *
 * LA COTA DE REPESCA ES CONSERVADORA A PROPÓSITO. Enumerar los escenarios de
 * la categoría entera es 2^(partidos que faltan) — con 10 grupos son 2^30. En
 * su lugar se cuenta cuántos grupos AJENOS tienen ya garantizado un segundo
 * que supera en puntos a esta pareja en su mejor caso. Si esos grupos no
 * llenan las plazas de repesca, la carrera sigue abierta. Puede sobrar
 * 'repechage_pending' de más; nunca puede faltar. El error caro es el otro.
 */
export function computeClinch(input: ClinchInput): ClinchResult[] {
  const advancePerGroup = exigirEntero(input?.advancePerGroup, 'advancePerGroup', 1);
  const bestExtraQualifiers = exigirEntero(input?.bestExtraQualifiers, 'bestExtraQualifiers', 0);
  const cfg = input.config ?? DEFAULT_STANDINGS_CONFIG;
  const groups = input.groups ?? [];
  if (groups.length === 0) return [];

  const puestoRepesca = advancePerGroup + 1;
  const porGrupo = new Map(groups.map((g) => [g.groupId, analizarGrupo(g, advancePerGroup, cfg)]));

  /**
   * Suelo de puntos del segundo de un grupo: el (advancePerGroup+1)-ésimo
   * mayor `minPuntos` del grupo. Como cada pareja termina con al menos sus
   * `minPuntos`, el k-ésimo mayor de los finales no puede quedar por debajo
   * del k-ésimo mayor de los mínimos.
   */
  const sueloDelSegundo = new Map<string, number>();
  for (const g of groups) {
    const est = porGrupo.get(g.groupId)!;
    const mins = g.pairIds.map((id) => est.get(id)!.minPuntos).sort((a, b) => b - a);
    sueloDelSegundo.set(
      g.groupId,
      mins.length >= puestoRepesca ? mins[puestoRepesca - 1] : Number.NEGATIVE_INFINITY,
    );
  }

  const out: ClinchResult[] = [];
  for (const g of groups) {
    const est = porGrupo.get(g.groupId)!;
    for (const pairId of g.pairIds) {
      const e = est.get(pairId)!;

      let status: ClinchStatus;
      if (e.directaSegura) {
        status = 'clinched';
      } else if (e.directaPosible) {
        status = 'alive';
      } else {
        // Cuántos grupos ajenos tienen YA un segundo que la supera seguro.
        const rivalesSeguros = groups.filter(
          (o) => o.groupId !== g.groupId && (sueloDelSegundo.get(o.groupId) ?? -Infinity) > e.maxPuntos,
        ).length;
        const repescaAbierta =
          bestExtraQualifiers > 0 && e.repescablePosible && rivalesSeguros < bestExtraQualifiers;
        status = repescaAbierta ? 'repechage_pending' : 'eliminated';
      }

      out.push({
        groupId: g.groupId,
        pairId,
        status,
        dependsOnMatchIds:
          status === 'alive' || status === 'repechage_pending' ? e.dependsOnMatchIds : [],
      });
    }
  }
  return out;
}
