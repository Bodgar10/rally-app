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

  it('N=16 → 4 grupos de 4, cuartos, limpio', () => {
    const f = computeFormat(16);
    expect(f.groupSizes).toEqual([4, 4, 4, 4]);
    expect(f.knockoutStart).toBe('quarter');
    expect(f.ambiguous).toBe(false);
  });

  it('N=24 → 6 grupos de 4, top 2 + 4 mejores terceros, R16', () => {
    const f = computeFormat(24);
    expect(f.bestExtraQualifiers).toBe(4);
    expect(f.knockoutStart).toBe('r16');
  });

  it('N=14 es ambiguo y trae alternativa', () => {
    const f = computeFormat(14);
    expect(f.ambiguous).toBe(true);
    expect(f.alternatives && f.alternatives.length).toBeGreaterThan(0);
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
