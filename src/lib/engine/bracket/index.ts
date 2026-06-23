// src/lib/engine/bracket/index.ts
// Avance de cuadro eliminatorio (Doc A §4.9). Determinista.

export interface RoundMatch {
  matchId: string;
  pairAId: string | null;
  pairBId: string | null;
  winnerPairId: string | null; // null = aún sin jugar
}

export interface NextMatch {
  pairAId: string | null;
  pairBId: string | null;
  /** Partidos de la ronda previa que alimentan este (para enlazar en BD). */
  sourceMatchIds: [string, string];
}

export interface AdvanceResult {
  next: NextMatch[];
  /** true si ya se conocen TODOS los ganadores de la ronda. */
  complete: boolean;
}

/** Ganador de un partido: el marcado, o la pareja presente si hubo bye. */
function winnerOf(m: RoundMatch): string | null {
  if (m.winnerPairId) return m.winnerPairId;
  if (m.pairAId && !m.pairBId) return m.pairAId; // bye
  if (m.pairBId && !m.pairAId) return m.pairBId; // bye
  return null;
}

/** Perdedor de un partido (requiere ganador conocido y ambas parejas). */
function loserOf(m: RoundMatch): string | null {
  const w = winnerOf(m);
  if (!w || !m.pairAId || !m.pairBId) return null;
  return w === m.pairAId ? m.pairBId : m.pairAId;
}

/**
 * Construye los emparejamientos de la siguiente ronda a partir de la actual.
 * La ronda debe venir EN ORDEN de bracket (como la entrega el motor de siembra).
 */
export function advanceBracket(round: RoundMatch[]): AdvanceResult {
  if (round.length < 2 || round.length % 2 !== 0) {
    throw new Error('advanceBracket: la ronda debe tener un nº par (>=2) de partidos.');
  }
  const next: NextMatch[] = [];
  let complete = true;

  for (let i = 0; i < round.length; i += 2) {
    const wa = winnerOf(round[i]);
    const wb = winnerOf(round[i + 1]);
    if (wa === null || wb === null) complete = false;
    next.push({
      pairAId: wa,
      pairBId: wb,
      sourceMatchIds: [round[i].matchId, round[i + 1].matchId],
    });
  }

  return { next, complete };
}

/**
 * Partido de 3.er lugar a partir de las dos semifinales (perdedores).
 * Devuelve null si no se conocen ambos perdedores todavía.
 */
export function thirdPlaceFromSemis(
  semis: [RoundMatch, RoundMatch],
): { pairAId: string; pairBId: string; sourceMatchIds: [string, string] } | null {
  const la = loserOf(semis[0]);
  const lb = loserOf(semis[1]);
  if (!la || !lb) return null;
  return { pairAId: la, pairBId: lb, sourceMatchIds: [semis[0].matchId, semis[1].matchId] };
}
