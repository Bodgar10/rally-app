import {
  DIVISIONES, DIVISIONES_DESC, NOMBRE_DIVISION, ETIQUETA_DIVISION, escalonDe,
} from '@/lib/divisiones';

describe('el orden', () => {
  // Gemelo del enum de Postgres, que se ordena por posición de declaración.
  // Si estos dos se separan, un `order by division` en SQL y un sort en la
  // app ordenarían al revés y nadie lo notaría hasta ver una tabla rara.
  it('va de menor a mayor, igual que el enum y que DEFAULT_BANDS', () => {
    expect([...DIVISIONES]).toEqual([
      'septima', 'sexta', 'quinta', 'cuarta', 'tercera', 'segunda', 'primera',
    ]);
  });

  it('la descendente es la inversa exacta', () => {
    expect([...DIVISIONES_DESC]).toEqual([...DIVISIONES].reverse());
  });

  it('la descendente abre en primera, que es como se lee un cartel', () => {
    expect(DIVISIONES_DESC[0]).toBe('primera');
  });

  // `reverse()` muta. Si se hiciera sobre DIVISIONES en vez de sobre una
  // copia, importar este módulo dejaría la lista canónica del revés.
  it('derivar la descendente no voltea la ascendente', () => {
    expect(DIVISIONES[0]).toBe('septima');
  });
});

describe('los nombres', () => {
  it('hay nombre largo y etiqueta corta para las siete', () => {
    for (const d of DIVISIONES) {
      expect(NOMBRE_DIVISION[d]).toBeTruthy();
      expect(ETIQUETA_DIVISION[d]).toBeTruthy();
    }
  });

  it('la séptima lleva acento', () => {
    expect(NOMBRE_DIVISION.septima).toBe('Séptima');
    expect(ETIQUETA_DIVISION.septima).toBe('7ª');
  });

  it('las etiquetas cortas son el ordinal, sin repetirse', () => {
    const etiquetas = DIVISIONES.map((d) => ETIQUETA_DIVISION[d]);
    expect(new Set(etiquetas).size).toBe(DIVISIONES.length);
    expect(etiquetas).toEqual(['7ª', '6ª', '5ª', '4ª', '3ª', '2ª', '1ª']);
  });
});

describe('escalonDe', () => {
  it('la séptima es el suelo y la primera el techo', () => {
    expect(escalonDe('septima')).toBe(0);
    expect(escalonDe('primera')).toBe(DIVISIONES.length - 1);
  });

  it('subir de división sube de escalón', () => {
    expect(escalonDe('sexta')).toBeGreaterThan(escalonDe('septima'));
    expect(escalonDe('tercera')).toBeGreaterThan(escalonDe('cuarta'));
  });

  // Un dato viejo o sucio no puede pasar por "la más baja": eso lo pondría
  // por delante de la séptima en cualquier orden.
  it('algo que no es una división da -1, no 0', () => {
    expect(escalonDe('octava')).toBe(-1);
    expect(escalonDe('')).toBe(-1);
  });
});
