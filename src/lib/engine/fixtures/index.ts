// src/lib/engine/fixtures/index.ts
// Generación de partidos round-robin por grupo (Doc A §4.7/§4.9). Determinista.
// Método del círculo: rondas balanceadas, cada pareja juega 1 vez por ronda.

export interface Fixture {
  round: number; // 1-based; sirve para programar el calendario
  pairAId: string;
  pairBId: string;
}

const BYE = '__BYE__';

/**
 * Genera todos los partidos de un grupo (todos contra todos, una vez).
 * @param pairIds parejas del grupo (>= 2).
 * @returns lista de partidos con su nº de ronda.
 */
export function generateRoundRobin(pairIds: string[]): Fixture[] {
  if (pairIds.length < 2) {
    throw new Error('generateRoundRobin: se requieren al menos 2 parejas.');
  }

  // Copia estable; si es impar agregamos un BYE para emparejar.
  const arr = [...pairIds];
  if (arr.length % 2 !== 0) arr.push(BYE);

  const n = arr.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures: Fixture[] = [];

  // arr[0] queda fijo; el resto rota en sentido horario cada ronda.
  let circle = [...arr];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = circle[i];
      const b = circle[n - 1 - i];
      if (a !== BYE && b !== BYE) {
        fixtures.push({ round: r + 1, pairAId: a, pairBId: b });
      }
    }
    // Rotar: fijar el primero, mover el último al índice 1.
    circle = [circle[0], circle[n - 1], ...circle.slice(1, n - 1)];
  }

  return fixtures;
}

/** Nº de partidos esperado en un round-robin de n parejas: n*(n-1)/2. */
export function expectedMatchCount(numPairs: number): number {
  return (numPairs * (numPairs - 1)) / 2;
}
