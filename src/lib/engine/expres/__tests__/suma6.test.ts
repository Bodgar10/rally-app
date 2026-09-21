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

// ── LA CAPTURA SE ESCRIBE, NO SE ELIGE ──────────────────────────────────────
// La pantalla pasó de siete botones a dos casillas. Lo que antes era imposible
// de teclear ahora hay que rechazarlo, así que la validación es lo único que
// separa un 4-3 de la base.
describe('esMarcadorSuma6 como red de la captura escrita', () => {
  it('acepta los siete marcadores posibles', () => {
    for (let a = 0; a <= 6; a++) {
      expect(esMarcadorSuma6(a, 6 - a)).toBe(true);
    }
  });

  it('rechaza lo que no suma seis', () => {
    expect(esMarcadorSuma6(4, 3)).toBe(false); // el dedazo típico
    expect(esMarcadorSuma6(5, 5)).toBe(false);
    expect(esMarcadorSuma6(0, 0)).toBe(false);
    expect(esMarcadorSuma6(7, -1)).toBe(false);
  });

  it('rechaza negativos aunque sumen seis', () => {
    expect(esMarcadorSuma6(-1, 7)).toBe(false);
    expect(esMarcadorSuma6(8, -2)).toBe(false);
  });

  it('rechaza lo que no es un entero', () => {
    expect(esMarcadorSuma6(3.5, 2.5)).toBe(false);
    expect(esMarcadorSuma6(Number.NaN, 6)).toBe(false);
  });

  // El autocompletado de la pantalla: escribir un lado rellena el otro. Esto
  // fija que la cuenta que hace es la correcta para los siete casos.
  it('el complemento hasta seis siempre da un marcador válido', () => {
    for (let a = 0; a <= 6; a++) {
      expect(esMarcadorSuma6(a, GAMES_POR_PARTIDO - a)).toBe(true);
    }
  });
});
