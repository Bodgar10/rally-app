// La forma del cuadro antes de que se siembre.
//
// EL SÍNTOMA: 3.ª Mixto enseñaba UN SOLO cruce de cuartos. El diagrama salía de
// `match_schedule`, y el plan solo reserva cancha para los cruces que SE JUEGAN
// — un bye no ocupa pista. Con 5 clasificados en un cuadro de 8 hay 3 byes y un
// único partido, así que el plan tenía una fila y el diagrama la copiaba.

import { formaDelCuadro } from '@/lib/cuadro-forma';

describe('la forma sale de los clasificados, no del plan', () => {
  // EL CASO REAL: 3 grupos, 1 por grupo + 2 repescados.
  it('3.ª Mixto: 5 clasificados → cuadro de 8, 4 cruces, 3 byes', () => {
    const f = formaDelCuadro(3, 1, 2)!;
    expect(f.clasificados).toBe(5);
    expect(f.bracketSize).toBe(8);
    expect(f.byes).toBe(3);
    // CUATRO cruces, no uno: los tres byes también son cruces del cuadro.
    expect(f.cruces).toHaveLength(4);
    expect(f.cruces.filter((c) => c.esBye)).toHaveLength(3);
    expect(f.cruces.filter((c) => !c.esBye)).toHaveLength(1);
  });

  // Comprobado contra la siembra real: s1/— · s4/s5 · s2/— · s3/—
  it('los byes van a los MEJORES clasificados', () => {
    const f = formaDelCuadro(3, 1, 2)!;
    const puestos = f.cruces.filter((c) => c.esBye).map((c) => c.puesto).sort((a, b) => a! - b!);
    expect(puestos).toEqual([1, 2, 3]);
  });

  it('un cuadro lleno no tiene byes', () => {
    const f = formaDelCuadro(4, 1, 0)!;   // 4 clasificados, cuadro de 4
    expect(f.byes).toBe(0);
    expect(f.cruces).toHaveLength(2);
    expect(f.cruces.every((c) => !c.esBye)).toBe(true);
    expect(f.fraseDeByes).toBeNull();
  });

  it('el caso grande: 20 clasificados → cuadro de 32 con 12 byes', () => {
    const f = formaDelCuadro(10, 2, 0)!;
    expect(f.bracketSize).toBe(32);
    expect(f.byes).toBe(12);
    expect(f.cruces).toHaveLength(16);
    expect(f.cruces.filter((c) => c.esBye)).toHaveLength(12);
    // Los 12 mejores, no doce cualesquiera.
    const puestos = f.cruces.filter((c) => c.esBye).map((c) => c.puesto!).sort((a, b) => a - b);
    expect(puestos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('siempre hay tantos cruces como media llave', () => {
    for (const [g, p, r] of [[3, 1, 2], [4, 1, 0], [6, 1, 2], [10, 2, 0], [8, 2, 0]] as const) {
      const f = formaDelCuadro(g, p, r)!;
      expect(f.cruces).toHaveLength(f.bracketSize / 2);
      // Y byes + partidos reales = todos los cruces.
      expect(f.cruces.filter((c) => c.esBye).length).toBe(f.byes);
    }
  });
});

describe('la frase de los byes', () => {
  // Sin nombres: hasta que terminen los grupos no se sabe quiénes son. Lo que
  // sí es cierto desde el principio es la REGLA.
  it('dice cuántos y a qué ronda llegan, sin nombrar a nadie', () => {
    const f = formaDelCuadro(3, 1, 2)!;
    expect(f.fraseDeByes).toContain('3 mejores clasificados');
    expect(f.fraseDeByes).toMatch(/semifinales/i);
    // Ni un nombre propio ni un puesto concreto atribuido.
    expect(f.fraseDeByes).not.toMatch(/\bs\d|seed|pareja \w+/i);
  });

  it('con un solo bye va en singular', () => {
    // 5 grupos × 1 + 2 = 7 clasificados en cuadro de 8: un bye.
    const f = formaDelCuadro(5, 1, 2)!;
    expect(f.byes).toBe(1);
    expect(f.fraseDeByes).toMatch(/el mejor clasificado pasa directo/i);
  });
});

describe('cuando no hay cuadro que dibujar', () => {
  it('sin grupos o sin clasificados, null', () => {
    expect(formaDelCuadro(0, 2, 0)).toBeNull();
    expect(formaDelCuadro(4, 0, 0)).toBeNull();
  });

  it('con un solo clasificado no hay eliminatorias', () => {
    expect(formaDelCuadro(1, 1, 0)).toBeNull();
  });
});
