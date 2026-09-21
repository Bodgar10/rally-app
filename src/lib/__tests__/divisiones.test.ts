import {
  DIVISIONES, DIVISIONES_DESC, NOMBRE_DIVISION, ETIQUETA_DIVISION, escalonDe,
  resumenDeDivisiones,
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

describe('resumenDeDivisiones', () => {
  it('una sola', () => {
    expect(resumenDeDivisiones(['quinta'])).toBe('5ª');
  });

  it('dos, con "y"', () => {
    expect(resumenDeDivisiones(['tercera', 'quinta'])).toBe('3ª y 5ª');
  });

  // El caso real: un torneo de 3ª a 7ª.
  it('tres o más consecutivas se dicen como rango, de la alta a la baja', () => {
    expect(resumenDeDivisiones(['tercera', 'cuarta', 'quinta', 'sexta', 'septima']))
      .toBe('3ª a 7ª');
  });

  it('el orden de entrada da igual', () => {
    expect(resumenDeDivisiones(['septima', 'quinta', 'tercera', 'sexta', 'cuarta']))
      .toBe('3ª a 7ª');
  });

  // Decir "3ª a 7ª" con un hueco mandaría al club a alguien de 4ª que no
  // tiene dónde jugar.
  it('con un hueco se enumeran, NO se dice rango', () => {
    expect(resumenDeDivisiones(['tercera', 'quinta', 'septima'])).toBe('3ª, 5ª y 7ª');
  });

  it('las siete completas', () => {
    expect(resumenDeDivisiones([...DIVISIONES])).toBe('1ª a 7ª');
  });

  it('repetidas no duplican', () => {
    expect(resumenDeDivisiones(['quinta', 'quinta', 'cuarta'])).toBe('4ª y 5ª');
  });

  it('sin divisiones devuelve null, no una cadena vacía', () => {
    expect(resumenDeDivisiones([])).toBeNull();
  });

  it('un valor que no es división se ignora en vez de romper', () => {
    expect(resumenDeDivisiones(['quinta', 'octava'])).toBe('5ª');
    expect(resumenDeDivisiones(['octava'])).toBeNull();
  });
});
