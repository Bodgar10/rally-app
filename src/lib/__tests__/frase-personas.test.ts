import { frasePersonas } from '../frase-personas';

describe('frasePersonas', () => {
  it('sin nombres, no promete lo que no tiene', () => {
    // Es el caso de una categoría todavía abierta: bracket_pairs_public la
    // filtra y los nombres no se resuelven. El aviso sigue siendo cierto.
    expect(frasePersonas([])).toBe('comparten jugadores');
  });

  it('uno, dos y tres o más', () => {
    expect(frasePersonas(['Ana Ruiz'])).toBe('comparten a Ana Ruiz');
    expect(frasePersonas(['Ana Ruiz', 'Marta Gil'])).toBe('comparten a Ana Ruiz y Marta Gil');
    expect(frasePersonas(['Ana Ruiz', 'Marta Gil', 'Luis Paz']))
      .toBe('comparten a Ana Ruiz, Marta Gil y 1 jugador más');
  });

  it('la pluralización del resto no se equivoca en el 1', () => {
    expect(frasePersonas(['A', 'B', 'C'])).toMatch(/1 jugador más$/);
    expect(frasePersonas(['A', 'B', 'C', 'D'])).toMatch(/2 jugadores más$/);
    expect(frasePersonas(Array.from({ length: 8 }, (_, i) => `J${i}`))).toMatch(/6 jugadores más$/);
  });

  it('descarta los huecos en vez de escribir "y  "', () => {
    expect(frasePersonas(['Ana Ruiz', '', '  '])).toBe('comparten a Ana Ruiz');
    expect(frasePersonas(['', ''])).toBe('comparten jugadores');
  });

  it('no muta la entrada', () => {
    const e = ['B', 'A', ''];
    const copia = [...e];
    frasePersonas(e);
    expect(e).toEqual(copia);
  });
});
