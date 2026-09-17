// src/lib/engine/expres/__tests__/suma6.test.ts
import {
  GAMES_POR_PARTIDO,
  MARCADORES_SUMA6,
  esMarcadorSuma6,
  gamesEnJuego,
  validarMarcadorSuma6,
} from '../suma6';

describe('los siete marcadores de un suma 6', () => {
  it('son exactamente siete y todos suman 6', () => {
    expect(MARCADORES_SUMA6).toHaveLength(7);
    for (const m of MARCADORES_SUMA6) expect(m.gamesA + m.gamesB).toBe(GAMES_POR_PARTIDO);
  });

  it('están todos los que son: 6-0, 5-1, 4-2, 3-3 y sus espejos', () => {
    expect(MARCADORES_SUMA6.map((m) => `${m.gamesA}-${m.gamesB}`)).toEqual([
      '6-0', '5-1', '4-2', '3-3', '2-4', '1-5', '0-6',
    ]);
  });

  it('el 3-3 es válido: no hay ganador que exigir', () => {
    expect(esMarcadorSuma6(3, 3)).toBe(true);
  });
});

describe('validarMarcadorSuma6', () => {
  it.each([[6, 0], [5, 1], [4, 2], [3, 3], [2, 4], [1, 5], [0, 6]])(
    'acepta %i-%i',
    (a, b) => expect(validarMarcadorSuma6(a, b)).toEqual([]),
  );

  it.each([[6, 1], [5, 0], [4, 3], [2, 2], [0, 0]])(
    'rechaza %i-%i porque no suma 6',
    (a, b) => {
      const e = validarMarcadorSuma6(a, b);
      expect(e).toHaveLength(1);
      expect(e[0]).toMatch(/son 6 games exactos/);
      expect(e[0]).toMatch(/6-0, 5-1, 4-2, 3-3, 2-4, 1-5 y 0-6/);
    },
  );

  it('rechaza un marcador de set normal: 6-4 no es un suma 6', () => {
    expect(esMarcadorSuma6(6, 4)).toBe(false);
  });

  it('rechaza lo que no son enteros, diciendo qué lado', () => {
    expect(validarMarcadorSuma6(3.5, 2.5)[0]).toMatch(/la pareja A.*entero/);
    expect(validarMarcadorSuma6(3, '3')[0]).toMatch(/la pareja B.*entero/);
    expect(validarMarcadorSuma6(3, null)[0]).toMatch(/la pareja B/);
  });

  it('rechaza fuera de rango antes de mirar la suma, que es más preciso', () => {
    // 7-0 suma 7, pero el problema real es que 7 games no existen en un suma 6.
    expect(validarMarcadorSuma6(7, 0)).toEqual(['Los games de la pareja A van de 0 a 6; llegó 7.']);
    expect(validarMarcadorSuma6(-1, 7)).toHaveLength(2);
    expect(validarMarcadorSuma6(-1, 7)[0]).toMatch(/van de 0 a 6/);
  });
});

describe('gamesEnJuego — el número que hace honesta la tabla', () => {
  it('5 partidos son siempre 30 games, para todas', () => {
    expect(gamesEnJuego(5)).toBe(30);
  });

  it('balance = 2·GF − gamesEnJuego, así que GF y balance ordenan igual', () => {
    for (let gf = 0; gf <= 30; gf++) {
      const gc = gamesEnJuego(5) - gf;
      expect(gf - gc).toBe(2 * gf - gamesEnJuego(5));
    }
  });
});
