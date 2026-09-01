// src/lib/__tests__/juez-ventana.test.ts
//
// Qué torneos ve el juez en su menú. Los umbrales son una decisión de producto
// (5 días después / 30 días antes) y estos tests los fijan: cambiarlos tiene
// que costar cambiar un test, no pasar de largo en un refactor.

import {
  dentroDeLaVentana,
  ordenarPorCercania,
  UMBRAL_FUTURO_DIAS,
  UMBRAL_PASADO_DIAS,
} from '@/lib/juez/ventana';

/** Un día concreto como ancla, para no depender del reloj de quien corra esto. */
const HOY = new Date(2026, 8, 15); // 15 de septiembre de 2026

/** 'YYYY-MM-DD' a `dias` de HOY. */
const desdeHoy = (dias: number): string => {
  const d = new Date(HOY);
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

describe('dentroDeLaVentana — torneos terminados', () => {
  it('el que terminó ayer sigue apareciendo', () => {
    expect(dentroDeLaVentana(desdeHoy(-3), desdeHoy(-1), HOY)).toBe(true);
  });

  it('el último día de la ventana todavía aparece', () => {
    expect(dentroDeLaVentana(desdeHoy(-8), desdeHoy(-UMBRAL_PASADO_DIAS), HOY)).toBe(true);
  });

  it('un día más tarde ya no', () => {
    expect(dentroDeLaVentana(desdeHoy(-9), desdeHoy(-UMBRAL_PASADO_DIAS - 1), HOY)).toBe(false);
  });

  it('el que termina HOY aparece: se captura hasta el último partido', () => {
    expect(dentroDeLaVentana(desdeHoy(-2), desdeHoy(0), HOY)).toBe(true);
  });
});

describe('dentroDeLaVentana — torneos futuros', () => {
  it('el de este fin de semana aparece', () => {
    expect(dentroDeLaVentana(desdeHoy(3), desdeHoy(5), HOY)).toBe(true);
  });

  it('el que empieza justo en el umbral aparece', () => {
    expect(dentroDeLaVentana(desdeHoy(UMBRAL_FUTURO_DIAS), desdeHoy(UMBRAL_FUTURO_DIAS + 2), HOY)).toBe(true);
  });

  it('el de dentro de dos meses no', () => {
    expect(dentroDeLaVentana(desdeHoy(UMBRAL_FUTURO_DIAS + 1), desdeHoy(UMBRAL_FUTURO_DIAS + 3), HOY)).toBe(false);
  });
});

describe('dentroDeLaVentana — datos incompletos', () => {
  it('sin fechas se deja pasar: es un torneo mal capturado, no uno viejo', () => {
    expect(dentroDeLaVentana(null, null, HOY)).toBe(true);
  });

  it('con solo fecha de inicio manda el inicio', () => {
    expect(dentroDeLaVentana(desdeHoy(2), null, HOY)).toBe(true);
    expect(dentroDeLaVentana(desdeHoy(90), null, HOY)).toBe(false);
  });

  it('con solo fecha de fin manda el fin', () => {
    expect(dentroDeLaVentana(null, desdeHoy(-1), HOY)).toBe(true);
    expect(dentroDeLaVentana(null, desdeHoy(-30), HOY)).toBe(false);
  });
});

describe('ordenarPorCercania', () => {
  it('el más cercano primero', () => {
    const lista = [
      { nombre: 'Octubre', inicio: '2026-10-10' },
      { nombre: 'Este finde', inicio: '2026-09-18' },
      { nombre: 'Fin de mes', inicio: '2026-09-28' },
    ];
    expect([...lista].sort(ordenarPorCercania).map((t) => t.nombre))
      .toEqual(['Este finde', 'Fin de mes', 'Octubre']);
  });

  it('los que no tienen fecha van al final', () => {
    const lista = [
      { nombre: 'Sin fecha', inicio: null },
      { nombre: 'Con fecha', inicio: '2026-09-18' },
    ];
    expect([...lista].sort(ordenarPorCercania).map((t) => t.nombre))
      .toEqual(['Con fecha', 'Sin fecha']);
  });

  it('a igualdad de fecha decide el nombre: el orden es total', () => {
    const lista = [
      { nombre: 'Bravo', inicio: '2026-09-18' },
      { nombre: 'Alfa',  inicio: '2026-09-18' },
    ];
    expect([...lista].sort(ordenarPorCercania).map((t) => t.nombre)).toEqual(['Alfa', 'Bravo']);
  });
});
