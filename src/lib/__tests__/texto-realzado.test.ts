import { partirRealzado, textoPlano } from '@/lib/texto-realzado';

describe('partirRealzado', () => {
  it('sin marcas, un solo trozo tenue', () => {
    expect(partirRealzado('Pasan cuatro a cuartos.'))
      .toEqual([{ texto: 'Pasan cuatro a cuartos.', fuerte: false }]);
  });

  it('parte en tres: antes, realce y después', () => {
    expect(partirRealzado('Pasan *4 de cada grupo* a cuartos.')).toEqual([
      { texto: 'Pasan ', fuerte: false },
      { texto: '4 de cada grupo', fuerte: true },
      { texto: ' a cuartos.', fuerte: false },
    ]);
  });

  it('admite varios realces en la misma frase', () => {
    const t = partirRealzado('*Uno* y *dos*.');
    expect(t.filter((x) => x.fuerte).map((x) => x.texto)).toEqual(['Uno', 'dos']);
  });

  it('el realce puede abrir la frase', () => {
    expect(partirRealzado('*Todo* cuenta.')[0]).toEqual({ texto: 'Todo', fuerte: true });
  });

  it('y puede cerrarla', () => {
    const t = partirRealzado('Y cuando llegas a *la final*');
    expect(t[t.length - 1]).toEqual({ texto: 'la final', fuerte: true });
  });

  // Una errata de copy no puede tumbar la portada ni dejarla en blanco.
  it('un asterisco sin cerrar deja el resto en claro, sin romper', () => {
    expect(() => partirRealzado('Esto *no cierra')).not.toThrow();
    expect(partirRealzado('Esto *no cierra')).toEqual([
      { texto: 'Esto ', fuerte: false },
      { texto: 'no cierra', fuerte: true },
    ]);
  });

  it('los trozos vacíos se descartan en vez de pintarse', () => {
    // Realces pegados: el trozo de en medio es '' y no aporta nada.
    expect(partirRealzado('*a**b*')).toEqual([
      { texto: 'a', fuerte: true },
      { texto: 'b', fuerte: true },
    ]);
  });

  it('un texto vacío no produce trozos', () => {
    expect(partirRealzado('')).toEqual([]);
  });

  it('solo asteriscos tampoco', () => {
    expect(partirRealzado('***')).toEqual([]);
  });

  it('conserva el texto entero al recomponerlo', () => {
    const original = 'La app calcula si *ya no te pueden sacar*, partido a partido.';
    const recompuesto = partirRealzado(original).map((x) => x.texto).join('');
    expect(recompuesto).toBe(textoPlano(original));
  });
});

describe('textoPlano', () => {
  it('quita las marcas para la etiqueta de accesibilidad', () => {
    expect(textoPlano('Pasan *4 de cada grupo* a cuartos.'))
      .toBe('Pasan 4 de cada grupo a cuartos.');
  });

  it('un texto sin marcas se queda igual', () => {
    expect(textoPlano('Sin marcas')).toBe('Sin marcas');
  });
});
