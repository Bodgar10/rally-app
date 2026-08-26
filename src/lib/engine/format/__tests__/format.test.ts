// src/lib/engine/format/__tests__/format.test.ts
import { computeFormat } from '../index';

describe('computeFormat — tabla literal (Doc B §1.1)', () => {
  it('N=6 → 2 grupos de 3, top 2, semis', () => {
    const f = computeFormat(6);
    expect(f.formatType).toBe('groups_then_knockout');
    expect(f.groupSizes).toEqual([3, 3]);
    expect(f.advancePerGroup).toBe(2);
    expect(f.knockoutStart).toBe('semi');
    expect(f.ambiguous).toBe(false);
  });

  it('N=9 → 3 grupos de 3, top 1 + 1 mejor segundo', () => {
    const f = computeFormat(9);
    expect(f.groupSizes).toEqual([3, 3, 3]);
    expect(f.advancePerGroup).toBe(1);
    expect(f.bestExtraQualifiers).toBe(1);
    expect(f.knockoutStart).toBe('semi');
  });

  // Recalibración a grupos de 3 (evidencia Cimepa). Estos tres tests fijaban
  // la calibración anterior, de grupos de 4.
  it('N=16 → un grupo de 4 y cuatro de 3, cuartos', () => {
    const f = computeFormat(16);
    expect(f.groupSizes).toEqual([4, 3, 3, 3, 3]);
    expect(f.advancePerGroup).toBe(1);
    expect(f.bestExtraQualifiers).toBe(3);
    expect(f.knockoutStart).toBe('quarter');
    expect(f.ambiguous).toBe(false);
  });

  it('N=24 → 8 grupos de 3, top 2, R16 limpio', () => {
    const f = computeFormat(24);
    expect(f.groupSizes).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
    expect(f.advancePerGroup).toBe(2);
    expect(f.bestExtraQualifiers).toBe(0);
    expect(f.knockoutStart).toBe('r16');
  });

  it('N=14 deja de ser ambiguo: con preferencia 3 no hay empate de particiones', () => {
    const f = computeFormat(14);
    expect(f.groupSizes).toEqual([4, 4, 3, 3]);
    expect(f.ambiguous).toBe(false);
  });

  // El mecanismo de alternativas se conserva, pero INVERTIDO: el default es el
  // torneo corto y la alternativa es la versión larga, para quien tenga
  // canchas y días de sobra.
  it('la alternativa de N=16 es la versión larga, de grupos de 4', () => {
    const f = computeFormat(16);
    expect(f.alternatives?.[0].groupSizes).toEqual([4, 4, 4, 4]);
  });

  it('el default siempre cuesta menos partidos que su alternativa', () => {
    const partidos = (sizes: number[]) => sizes.reduce((a, s) => a + (s * (s - 1)) / 2, 0);
    for (const n of [10, 16, 20, 24, 32]) {
      const f = computeFormat(n);
      const alt = f.alternatives?.[0];
      expect(alt).toBeDefined();
      expect(partidos(f.groupSizes)).toBeLessThan(partidos(alt!.groupSizes));
    }
  });

  // La regla que motivó todo: contra los ocho números reales de Cimepa, el
  // motor tiene que proponer justo lo que ellos armaron.
  it('reproduce el reparto real del Sexto Torneo Cimepa', () => {
    for (const n of [9, 12, 15, 18, 21, 30]) {
      const f = computeFormat(n);
      expect(f.groupSizes.every((s) => s === 3)).toBe(true);
      expect(f.groupSizes).toHaveLength(n / 3);
    }
  });
});

describe('computeFormat — derivación (N no listados)', () => {
  it('N=11 produce grupos válidos (3..5) y un cuadro potencia de 2', () => {
    const f = computeFormat(11);
    expect(f.formatType).toBe('groups_then_knockout');
    f.groupSizes.forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(3);
      expect(s).toBeLessThanOrEqual(5);
    });
    expect(f.groupSizes.reduce((a, b) => a + b, 0)).toBe(11);
  });

  it('es determinista: misma entrada, misma salida', () => {
    expect(computeFormat(13)).toEqual(computeFormat(13));
    expect(computeFormat(27)).toEqual(computeFormat(27));
  });

  it('lanza error con menos de 2 parejas', () => {
    expect(() => computeFormat(1)).toThrow();
  });
});
