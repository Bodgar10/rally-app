// src/lib/engine/seeding/index.ts
// Motor de siembra (Doc B §4). Determinista.
// Siembra serpiente + evitar rematch de grupo en 1.ª ronda + fallback honesto.

export interface SeedInput {
  pairId: string;
  groupId: string;
  /** Rating de la pareja (mayor = mejor). Define el orden de siembra. */
  rating: number;
}

export interface BracketMatch {
  slotA: number;
  slotB: number;
  /**
   * null = bye.
   *
   * NO ES UN CASO REAL DEL PRODUCTO, y conviene saberlo antes de invertir en
   * él: `computeFormat` está diseñado para que el número de clasificados sea
   * SIEMPRE potencia de 2 — para eso existe `bestExtraQualifiers`, que rellena
   * hasta la potencia con los mejores terceros. Verificado con los siete
   * tamaños que producen planes distintos (5, 8, 16, 24, 32, 4, 9): ninguno
   * deja un hueco.
   *
   * Los byes solo aparecerían si alguien alimenta computeSeeding saltándose
   * computeFormat. El soporte de aquí es defensivo, no un camino que la app
   * recorra.
   */
  pairAId: string | null;
  pairBId: string | null;
  isRematch: boolean; // true si quedó un rematch de grupo inevitable
}

export interface SeedingResult {
  bracketSize: number;
  matches: BracketMatch[];
  /** Descripción de los rematches que no se pudieron evitar. */
  rematchesAllowed: string[];
}

function pow2AtLeast(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}

/** Orden estándar de siembra (serpiente) para un cuadro de tamaño potencia de 2. */
function seedOrder(bracketSize: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < bracketSize) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

function groupOf(occupants: (SeedInput | null)[], slot: number): string | null {
  return occupants[slot]?.groupId ?? null;
}

function pairingsFrom(occupants: (SeedInput | null)[]): BracketMatch[] {
  const matches: BracketMatch[] = [];
  for (let i = 0; i < occupants.length; i += 2) {
    const a = occupants[i];
    const b = occupants[i + 1];
    matches.push({
      slotA: i,
      slotB: i + 1,
      pairAId: a?.pairId ?? null,
      pairBId: b?.pairId ?? null,
      isRematch: !!a && !!b && a.groupId === b.groupId,
    });
  }
  return matches;
}

/**
 * Calcula la siembra del cuadro eliminatorio.
 * @param qualifiers parejas clasificadas (cualquier orden); se siembran por rating desc.
 * @param bracketSize tamaño del cuadro (potencia de 2). Default = el menor que las contiene.
 */
export function computeSeeding(
  qualifiers: SeedInput[],
  bracketSize?: number,
): SeedingResult {
  if (qualifiers.length < 2) {
    throw new Error('computeSeeding: se requieren al menos 2 parejas clasificadas.');
  }
  const size = bracketSize ?? pow2AtLeast(qualifiers.length);

  // Orden de siembra: rating desc; desempate estable por pairId para determinismo.
  const seeded = [...qualifiers].sort(
    (a, b) => b.rating - a.rating || (a.pairId < b.pairId ? -1 : 1),
  );

  // Colocar cada seed en su slot serpiente (seed s → slot donde seedOrder == s).
  const order = seedOrder(size);
  const occupants: (SeedInput | null)[] = new Array(size).fill(null);
  order.forEach((seedNum, slot) => {
    const q = seeded[seedNum - 1]; // seedNum es 1-based
    occupants[slot] = q ?? null;
  });

  // Intentar eliminar rematches de 1.ª ronda con swaps mínimos (greedy, determinista).
  for (let pass = 0; pass < size; pass++) {
    let swapped = false;
    for (let i = 0; i < size; i += 2) {
      const a = occupants[i];
      const b = occupants[i + 1];
      if (!a || !b || a.groupId !== b.groupId) continue;
      // Buscar un slot j (de otra llave) con el que intercambiar b sin crear rematch.
      for (let j = 0; j < size; j++) {
        if (j === i || j === i + 1) continue;
        const partnerSlot = j % 2 === 0 ? j + 1 : j - 1;
        if (partnerSlot === i || partnerSlot === i + 1) continue;
        const cand = occupants[j];
        const candPartner = occupants[partnerSlot];
        // tras swap: en i+1 va cand; en j va b
        const okHere = !cand || a.groupId !== cand.groupId;
        const okThere = !candPartner || b.groupId !== groupOf([candPartner], 0);
        if (okHere && okThere) {
          occupants[i + 1] = cand;
          occupants[j] = b;
          swapped = true;
          break;
        }
      }
    }
    if (!swapped) break;
  }

  const matches = pairingsFrom(occupants);
  const rematchesAllowed = matches
    .filter((m) => m.isRematch)
    .map((m) => `${m.pairAId} vs ${m.pairBId} (mismo grupo, rematch inevitable)`);

  return { bracketSize: size, matches, rematchesAllowed };
}

export { selectQualifiers } from './select-qualifiers';
export type { QualifierStanding } from './select-qualifiers';
export { stageForBracketSize } from './stage-map';
export type { MatchStage } from './stage-map';
