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

// ───────────────────────────────────────────
// Los formatos que juega Padel Hype
// ───────────────────────────────────────────
//
// Sus palabras: "Hago grupos de 4 round robin y avanzan los mejores 2 de cada
// grupo. Si tengo 10 hago dos grupos de 5 y avanzo a los 1eros de cada grupo, y
// al 2 y 3 los hago jugar cuartos. Si tengo 12 paso a los dos primeros de cada
// grupo y a los 2 mejores 3eros. Y si tengo 16 hago cuartos directo."

describe('lo que juega Padel Hype está entre las opciones', () => {
  const alternativas = (n: number) => computeFormat(n).alternatives ?? [];

  it('10: dos grupos de 5, pasan tres de cada uno, los campeones con bye', () => {
    const suyo = alternativas(10).find(
      (a) => a.groupSizes.join() === '5,5' && a.advancePerGroup === 3,
    );
    expect(suyo).toBeDefined();
    // Seis clasificados en un cuadro de ocho: los dos primeros esperan en
    // semifinales mientras el 2.º y el 3.º se cruzan.
    expect(suyo!.groupSizes.length * suyo!.advancePerGroup + suyo!.bestExtraQualifiers).toBe(6);
    expect(suyo!.knockoutStart).toBe('quarter');
  });

  it('12: tres grupos de 4, los dos primeros y los dos mejores terceros', () => {
    const suyo = alternativas(12).find((a) => a.groupSizes.join() === '4,4,4');
    expect(suyo).toBeDefined();
    expect(suyo!.advancePerGroup).toBe(2);
    expect(suyo!.bestExtraQualifiers).toBe(2);
    // Tres partidos asegurados, que es lo que anuncia su cartel.
    expect(Math.min(...suyo!.groupSizes) - 1).toBe(3);
  });

  it('16: cuatro grupos de 4 y cuartos directo', () => {
    const suyo = alternativas(16).find((a) => a.groupSizes.join() === '4,4,4,4');
    expect(suyo).toBeDefined();
    expect(suyo!.advancePerGroup).toBe(2);
    expect(suyo!.bestExtraQualifiers).toBe(0);
    expect(suyo!.knockoutStart).toBe('quarter');
  });

  // El default no cambia: sigue prefiriendo grupos de 3, que es lo que cabe
  // cuando la capacidad aprieta. Lo de arriba son opciones, no reemplazos.
  it('y el formato por defecto sigue siendo el de siempre', () => {
    expect(computeFormat(12).groupSizes).toEqual([3, 3, 3, 3]);
    expect(computeFormat(16).groupSizes).toEqual([4, 3, 3, 3, 3]);
  });
});

// ───────────────────────────────────────────
// El suelo de partidos asegurados
// ───────────────────────────────────────────
//
// Padel Hype anuncia "3 partidos asegurados" en su cartel. Con 10 parejas el
// motor proponía un grupo de 4 y dos de 3: seis de cada diez parejas juegan
// DOS. Eso es publicidad engañosa y se descubre el sábado con la gente
// delante.

describe('cuando el torneo promete N partidos asegurados', () => {
  const asegurados = (p: { groupSizes: number[] }) =>
    p.groupSizes.length === 0 ? 0 : Math.min(...p.groupSizes) - 1;

  it.each([8, 9, 10, 12, 13, 14, 16, 20, 24])(
    'con %i parejas ningún grupo baja de 4', (n) => {
      const p = computeFormat(n, { minimoAsegurados: 3 });
      expect(asegurados(p)).toBeGreaterThanOrEqual(3);
      expect(p.noCumpleAsegurados).toBeUndefined();
    });

  // EL CASO DE PADEL HYPE: sin suelo propone grupos de 3; con suelo, de 5.
  it('10 parejas pasan de "un grupo de 4 y dos de 3" a "dos de 5"', () => {
    expect(computeFormat(10).groupSizes).toEqual([4, 3, 3]);
    expect(computeFormat(10, { minimoAsegurados: 3 }).groupSizes).toEqual([5, 5]);
  });

  // Las opciones que rompen el cartel dejan de ofrecerse: enseñarlas es
  // invitar a romperlo.
  it('las alternativas que no cumplen no se ofrecen', () => {
    const p = computeFormat(16, { minimoAsegurados: 3 });
    for (const alt of p.alternatives ?? []) {
      expect(asegurados(alt)).toBeGreaterThanOrEqual(3);
    }
  });

  // 7 parejas no admiten partición en [3,5] sin un grupo de 3.
  it('cuando es imposible lo dice en vez de callarlo', () => {
    const p = computeFormat(7, { minimoAsegurados: 3 });
    expect(p.noCumpleAsegurados).toBe(3);
    // Y devuelve el mejor plan que SÍ existe, no un cuadro directo sin grupos.
    expect(p.groupSizes.length).toBeGreaterThan(0);
    expect(asegurados(p)).toBe(2);
  });

  // Un cuadro directo es jugar uno y, si lo pierdes, a casa. `Math.min()` de
  // una lista vacía da Infinity, que leído como "asegurados" decía que un
  // knockout puro cumple cualquier promesa.
  it('un cuadro sin grupos no asegura nada', () => {
    const p = computeFormat(11, { minimoAsegurados: 3 });
    expect(p.groupSizes.length).toBeGreaterThan(0);
  });

  // Sin promesa, el motor sigue prefiriendo grupos de 3: es lo que cabe cuando
  // la capacidad aprieta, y lo que hizo Cimepa con 165 parejas.
  it('sin suelo nada cambia', () => {
    expect(computeFormat(12).groupSizes).toEqual([3, 3, 3, 3]);
    expect(computeFormat(16).groupSizes).toEqual([4, 3, 3, 3, 3]);
    expect(computeFormat(12, { minimoAsegurados: 0 }).groupSizes).toEqual([3, 3, 3, 3]);
  });
});
