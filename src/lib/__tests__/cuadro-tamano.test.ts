// De qué depende el tamaño del cuadro.
//
// El caso que motivó el módulo es la 3.ª Varonil: 30 parejas en 10 grupos con 2
// que pasan por grupo. Sale ronda de 32 con 12 byes, y la pantalla no lo
// explicaba. Aquí se fija la aritmética y, sobre todo, EL PISO: con 10 grupos
// el cuadro no baja de octavos por más que se muevan las perillas visibles.

import {
  cuadroDe, pisoDeCuadro, estaEnElPiso, explicarCuadro,
  pow2AlMenos, rondaDeCuadro,
} from '@/lib/cuadro-tamano';

describe('la cuenta del cuadro', () => {
  it('el caso real: 10 grupos × 2 → ronda de 32 con 12 byes', () => {
    const c = cuadroDe(10, 2, 0);
    expect(c.clasificados).toBe(20);
    expect(c.bracketSize).toBe(32);
    expect(c.ronda).toBe('r32');
    expect(c.byes).toBe(12);
    // 20 clasificados, 12 pasan directo: juegan 8 → 4 partidos... no: los que
    // NO tienen bye son 8, que juegan 4 partidos entre ellos.
    expect(c.primeraRonda).toBe(4);
  });

  it('un cuadro lleno no tiene byes', () => {
    const c = cuadroDe(8, 2, 0);
    expect(c.clasificados).toBe(16);
    expect(c.bracketSize).toBe(16);
    expect(c.byes).toBe(0);
    expect(c.primeraRonda).toBe(8);
  });

  it('los repescados suman a los clasificados', () => {
    expect(cuadroDe(6, 1, 2).clasificados).toBe(8);
    expect(cuadroDe(6, 1, 2).bracketSize).toBe(8);
  });

  it.each([
    [1, 2], [2, 2], [3, 4], [4, 4], [5, 8], [8, 8], [9, 16], [16, 16], [17, 32],
  ])('pow2AlMenos(%i) = %i', (n, esperado) => {
    expect(pow2AlMenos(n)).toBe(esperado);
  });

  it('la ronda usa los mismos cortes que el motor de formato', () => {
    expect(rondaDeCuadro(2)).toBe('final');
    expect(rondaDeCuadro(4)).toBe('semi');
    expect(rondaDeCuadro(8)).toBe('quarter');
    expect(rondaDeCuadro(16)).toBe('r16');
    expect(rondaDeCuadro(32)).toBe('r32');
  });
});

describe('el piso: lo que las perillas NO pueden bajar', () => {
  it('con 10 grupos el cuadro no baja de octavos', () => {
    // Es el punto que confunde: quitar todos los repescados no lo arregla,
    // porque siguen pasando los 10 primeros y 10 no caben en 8.
    expect(pisoDeCuadro(10).bracketSize).toBe(16);
    expect(pisoDeCuadro(10).nombreRonda).toBe('octavos');
    expect(cuadroDe(10, 1, 0).bracketSize).toBe(16);
  });

  it('10 grupos × 2 NO está en el piso; 10 × 1 sí', () => {
    expect(estaEnElPiso(10, 2, 0)).toBe(false);
    expect(estaEnElPiso(10, 1, 0)).toBe(true);
  });

  it('con menos grupos el piso baja', () => {
    expect(pisoDeCuadro(4).bracketSize).toBe(4);
    expect(pisoDeCuadro(8).bracketSize).toBe(8);
  });
});

describe('la explicación', () => {
  it('dice la cuenta, la ronda, los byes y hasta dónde se puede bajar', () => {
    const t = explicarCuadro(10, 2, 0)!;
    expect(t).toContain('10 grupos × 2');
    expect(t).toContain('20 clasificados');
    expect(t).toContain('ronda de 32');
    expect(t).toContain('12 byes');
    expect(t).toContain('octavos');       // el piso, nombrado
    expect(t).toContain('menos grupos');  // la única salida real
  });

  it('en el piso lo dice, en vez de sugerir que se puede bajar más', () => {
    const t = explicarCuadro(10, 1, 0)!;
    expect(t).toContain('más chico posible');
    expect(t).not.toContain('menos grupos');
  });

  it('los repescados aparecen en la cuenta solo si los hay', () => {
    expect(explicarCuadro(6, 1, 2)!).toContain('2 repescados');
    expect(explicarCuadro(6, 1, 0)!).not.toContain('repescad');
  });

  it('sin grupos no hay nada que explicar', () => {
    expect(explicarCuadro(0, 2, 0)).toBeNull();
    expect(explicarCuadro(4, 0, 0)).toBeNull();
  });
});
