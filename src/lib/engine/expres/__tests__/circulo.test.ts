// src/lib/engine/expres/__tests__/circulo.test.ts
import { rondasDelCirculo, verificarReparto, type ParIndices } from '../circulo';

const PARES = Array.from({ length: 19 }, (_, i) => 4 + i * 2); // 4, 6, … 40

describe('rondasDelCirculo — la combinatoria', () => {
  it('cumple las cuatro restricciones en TODO el rango usable', () => {
    let combinaciones = 0;
    for (const n of PARES) {
      for (let k = 1; k <= n - 1; k++) {
        expect(() => verificarReparto(n, k, rondasDelCirculo(n, k))).not.toThrow();
        combinaciones++;
      }
    }
    // Si este número baja, alguien recortó el rango sin decirlo.
    expect(combinaciones).toBe(399);
  });

  it('K rondas de N/2 partidos: el mínimo posible, no una aproximación', () => {
    const rondas = rondasDelCirculo(8, 5);
    expect(rondas).toHaveLength(5);
    for (const r of rondas) expect(r).toHaveLength(4);
    expect(rondas.flat()).toHaveLength(20); // 8 × 5 / 2
  });

  it('todas las parejas juegan exactamente K partidos', () => {
    const grados = new Array(8).fill(0);
    for (const [a, b] of rondasDelCirculo(8, 5).flat()) {
      grados[a]++;
      grados[b]++;
    }
    expect(grados).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
  });

  it('ES PREFIJO: las K rondas están contenidas en las de K+1', () => {
    // Es la propiedad que permite subir o bajar K sin recalcular el torneo.
    for (const n of [8, 12, 16]) {
      for (let k = 1; k < n - 1; k++) {
        expect(rondasDelCirculo(n, k)).toEqual(rondasDelCirculo(n, k + 1).slice(0, k));
      }
    }
  });

  it('es determinista: misma entrada, misma salida', () => {
    expect(rondasDelCirculo(16, 5)).toEqual(rondasDelCirculo(16, 5));
  });

  it('K = N−1 es el round robin completo: todos contra todos', () => {
    const partidos = rondasDelCirculo(6, 5).flat();
    expect(partidos).toHaveLength(15); // C(6,2)
    expect(new Set(partidos.map(([a, b]) => `${a}-${b}`)).size).toBe(15);
  });

  it('cada partido viene con el índice menor primero', () => {
    for (const [a, b] of rondasDelCirculo(10, 4).flat()) expect(a).toBeLessThan(b);
  });

  describe('lo que rechaza', () => {
    it('N impar, diciendo por qué', () => {
      expect(() => rondasDelCirculo(7, 4)).toThrow(/PAR y llegó 7/);
      expect(() => rondasDelCirculo(7, 4)).toThrow(/comparable/);
    });

    it('K por encima del número de rivales', () => {
      expect(() => rondasDelCirculo(6, 6)).toThrow(/solo tiene 5 rivales distintos/);
    });

    it('N o K que no son enteros positivos', () => {
      expect(() => rondasDelCirculo(0, 1)).toThrow(/entero >= 2/);
      expect(() => rondasDelCirculo(8, 0)).toThrow(/entero >= 1/);
      expect(() => rondasDelCirculo(8, 1.5)).toThrow(/entero >= 1/);
    });
  });
});

describe('verificarReparto — el guardia que se ejecuta siempre', () => {
  it('pasa un reparto correcto', () => {
    expect(() => verificarReparto(8, 3, rondasDelCirculo(8, 3))).not.toThrow();
  });

  it('caza un rival repetido', () => {
    const malo = rondasDelCirculo(8, 3);
    malo[1][0] = malo[0][0]; // repetir el primer partido de la ronda 1
    expect(() => verificarReparto(8, 3, malo)).toThrow(/rival repetido/);
  });

  it('caza a quien juega dos veces en la misma ronda', () => {
    const malo: ParIndices[][] = [[[0, 1] as const, [0, 2] as const]];
    expect(() => verificarReparto(4, 1, malo)).toThrow(/dos veces en la ronda 1/);
  });

  it('caza un número de partidos desigual', () => {
    const malo = rondasDelCirculo(8, 3);
    malo[2] = malo[2].slice(0, 1); // a la última ronda le faltan partidos
    expect(() => verificarReparto(8, 3, malo)).toThrow(/juega \d+ partidos y no 3/);
  });

  it('caza un número de rondas distinto del pedido', () => {
    expect(() => verificarReparto(8, 3, rondasDelCirculo(8, 2))).toThrow(/2 rondas en vez de 3/);
  });

  it('dice que el fallo es del motor, no de los datos', () => {
    expect(() => verificarReparto(8, 3, [])).toThrow(/fallo del motor, no de los datos/);
  });
});
