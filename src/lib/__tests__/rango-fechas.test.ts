// src/lib/__tests__/rango-fechas.test.ts
//
// Fija las tres reglas de comportamiento del calendario de rango.
// TZ fijada en jest.globalSetup.js (America/Mexico_City) — ver fechas.test.ts.

import {
  tocarDia,
  rangoCompleto,
  posicionEnRango,
  RANGO_VACIO,
  type RangoSeleccion,
} from '../rango-fechas';

const r = (inicio: string | null, fin: string | null): RangoSeleccion => ({ inicio, fin });

describe('regla 1 — el primer toque fija inicio y limpia fin', () => {
  it('desde vacío', () => {
    expect(tocarDia(RANGO_VACIO, '2026-07-12')).toEqual(r('2026-07-12', null));
  });

  it('con un rango ya cerrado, empieza uno nuevo', () => {
    // Sin esto haría falta un botón de "limpiar" que nadie busca.
    expect(tocarDia(r('2026-07-12', '2026-07-15'), '2026-07-20'))
      .toEqual(r('2026-07-20', null));
  });

  it('tocar dentro de un rango cerrado también reinicia', () => {
    expect(tocarDia(r('2026-07-12', '2026-07-20'), '2026-07-15'))
      .toEqual(r('2026-07-15', null));
  });
});

describe('regla 2 — el segundo toque cierra el rango', () => {
  it('un día posterior fija el fin', () => {
    expect(tocarDia(r('2026-07-12', null), '2026-07-15'))
      .toEqual(r('2026-07-12', '2026-07-15'));
  });

  it('el MISMO día es válido: torneo de un solo día', () => {
    expect(tocarDia(r('2026-07-12', null), '2026-07-12'))
      .toEqual(r('2026-07-12', '2026-07-12'));
  });

  it('cruza meses', () => {
    expect(tocarDia(r('2026-06-30', null), '2026-07-02'))
      .toEqual(r('2026-06-30', '2026-07-02'));
  });

  it('cruza años', () => {
    expect(tocarDia(r('2026-12-30', null), '2027-01-02'))
      .toEqual(r('2026-12-30', '2027-01-02'));
  });
});

describe('regla 3 — un toque anterior al inicio reinicia, sin error', () => {
  it('el día tocado pasa a ser el inicio y el fin queda vacío', () => {
    expect(tocarDia(r('2026-07-15', null), '2026-07-12'))
      .toEqual(r('2026-07-12', null));
  });

  it('nunca produce un rango invertido', () => {
    // La garantía real: pase lo que pase, fin nunca es anterior a inicio.
    const secuencias = [
      ['2026-07-15', '2026-07-12', '2026-07-20'],
      ['2026-07-01', '2026-06-01', '2026-06-15'],
      ['2026-07-10', '2026-07-10', '2026-07-05', '2026-07-08'],
    ];
    for (const toques of secuencias) {
      let estado = RANGO_VACIO;
      for (const t of toques) {
        estado = tocarDia(estado, t);
        if (estado.inicio && estado.fin) {
          expect(estado.fin >= estado.inicio).toBe(true); // ISO ordena como texto
        }
      }
    }
  });

  it('cruza meses hacia atrás', () => {
    expect(tocarDia(r('2026-07-02', null), '2026-06-30'))
      .toEqual(r('2026-06-30', null));
  });
});

describe('entradas inválidas', () => {
  it('un día inexistente no cambia el rango', () => {
    const estado = r('2026-07-12', null);
    expect(tocarDia(estado, '2026-02-30')).toBe(estado);
    expect(tocarDia(estado, 'hola')).toBe(estado);
  });
});

describe('rangoCompleto', () => {
  it('solo con ambos extremos', () => {
    expect(rangoCompleto(RANGO_VACIO)).toBe(false);
    expect(rangoCompleto(r('2026-07-12', null))).toBe(false);
    expect(rangoCompleto(r('2026-07-12', '2026-07-13'))).toBe(true);
    expect(rangoCompleto(r('2026-07-12', '2026-07-12'))).toBe(true);
  });
});

describe('posicionEnRango — decide cómo se pinta cada día', () => {
  const rango = r('2026-07-12', '2026-07-15');

  it('marca los extremos y el interior', () => {
    expect(posicionEnRango('2026-07-12', rango)).toBe('inicio');
    expect(posicionEnRango('2026-07-13', rango)).toBe('intermedio');
    expect(posicionEnRango('2026-07-14', rango)).toBe('intermedio');
    expect(posicionEnRango('2026-07-15', rango)).toBe('fin');
  });

  it('deja fuera lo que está fuera', () => {
    expect(posicionEnRango('2026-07-11', rango)).toBe('fuera');
    expect(posicionEnRango('2026-07-16', rango)).toBe('fuera');
  });

  it('un torneo de un día es "unico", no "inicio"', () => {
    // Se pinta como círculo suelto, no como el arranque de una barra.
    const unDia = r('2026-07-12', '2026-07-12');
    expect(posicionEnRango('2026-07-12', unDia)).toBe('unico');
  });

  it('con solo el inicio elegido, ese día es "unico" y el resto "fuera"', () => {
    const aMedias = r('2026-07-12', null);
    expect(posicionEnRango('2026-07-12', aMedias)).toBe('unico');
    expect(posicionEnRango('2026-07-13', aMedias)).toBe('fuera');
  });

  it('sin rango, todo queda fuera', () => {
    expect(posicionEnRango('2026-07-12', RANGO_VACIO)).toBe('fuera');
  });

  it('funciona a través de meses', () => {
    const cruzado = r('2026-06-30', '2026-07-02');
    expect(posicionEnRango('2026-06-30', cruzado)).toBe('inicio');
    expect(posicionEnRango('2026-07-01', cruzado)).toBe('intermedio');
    expect(posicionEnRango('2026-07-02', cruzado)).toBe('fin');
  });
});
