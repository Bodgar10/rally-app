// src/lib/__tests__/venue-search.test.ts
//
// Fija el contrato de la búsqueda difusa de sedes.
//
// Lo que más importa aquí es el requisito de producto: la búsqueda SUGIERE,
// nunca decide. Y la ciudad es lo que distingue dos sedes homónimas, así que
// findSimilarVenues devuelve la fila entera (con city), no solo el nombre.

import {
  normalizeVenueName,
  similitud,
  findSimilarVenues,
  UMBRAL_SIMILITUD,
} from '../venue-search';

describe('normalizeVenueName', () => {
  it('baja a minúsculas y quita acentos', () => {
    expect(normalizeVenueName('Esta Pádel Tlalpán')).toBe('esta tlalpan');
  });

  it('quita las palabras genéricas que no distinguen una sede de otra', () => {
    // Sin esto, dos sedes distintas parecerían iguales solo por "club padel".
    expect(normalizeVenueName('Club Padel Coyoacán')).toBe('coyoacan');
    expect(normalizeVenueName('Club Padel Satélite')).toBe('satelite');
  });

  it('quita puntuación y colapsa espacios', () => {
    expect(normalizeVenueName('  Padel-Point,  Sur  ')).toBe('point sur');
  });

  it('devuelve cadena vacía si el nombre era solo genéricos', () => {
    expect(normalizeVenueName('Club de Padel')).toBe('');
  });

  it('es idempotente: normalizar lo ya normalizado no cambia nada', () => {
    // Importa porque el valor almacenado en venues.name_normalized se vuelve
    // a comparar contra la consulta ya normalizada.
    const una = normalizeVenueName('Club Pádel Point Sur');
    expect(normalizeVenueName(una)).toBe(una);
  });
});

describe('similitud (Dice sobre bigramas)', () => {
  it('1 para cadenas idénticas', () => {
    expect(similitud('coyoacan', 'coyoacan')).toBe(1);
  });

  it('0 si alguna está vacía', () => {
    expect(similitud('', 'coyoacan')).toBe(0);
    expect(similitud('coyoacan', '')).toBe(0);
    expect(similitud('', '')).toBe(0);
  });

  it('alta para variantes tipográficas del mismo nombre', () => {
    expect(similitud('coyoacan', 'coyoacn')).toBeGreaterThan(UMBRAL_SIMILITUD);
  });

  it('baja para nombres sin relación', () => {
    expect(similitud('coyoacan', 'satelite')).toBeLessThan(UMBRAL_SIMILITUD);
  });

  it('tolera el reordenamiento de palabras', () => {
    // La razón de elegir Dice sobre Levenshtein.
    expect(similitud('point sur', 'sur point')).toBeGreaterThan(UMBRAL_SIMILITUD);
  });
});

describe('findSimilarVenues', () => {
  const SEDES = [
    { id: '1', name: 'Padel Point',          city: 'CDMX',      name_normalized: 'point' },
    { id: '2', name: 'Padel Point',          city: 'Bogotá',    name_normalized: 'point' },
    { id: '3', name: 'Club Padel Coyoacán',  city: 'CDMX',      name_normalized: 'coyoacan' },
    { id: '4', name: 'Esta Padel Tlalpan',   city: 'CDMX',      name_normalized: 'esta tlalpan' },
  ];

  it('no sugiere nada con menos de 3 caracteres útiles', () => {
    expect(findSimilarVenues('Pa', SEDES)).toEqual([]);
    // 'Club Padel' normaliza a '' — solo genéricos, nada que buscar.
    expect(findSimilarVenues('Club Padel', SEDES)).toEqual([]);
  });

  it('encuentra la coincidencia exacta ignorando mayúsculas y acentos', () => {
    const r = findSimilarVenues('PADEL PÓINT', SEDES);
    expect(r.map((v) => v.id)).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('devuelve AMBAS homónimas para que la ciudad las desempate', () => {
    // El requisito de producto: 'Padel Point' de CDMX y el de Bogotá son
    // sedes legítimas distintas, y el organizador elige mirando la ciudad.
    const r = findSimilarVenues('Padel Point', SEDES);
    const ciudades = r.filter((v) => v.name === 'Padel Point').map((v) => v.city);
    expect(ciudades).toEqual(expect.arrayContaining(['CDMX', 'Bogotá']));
  });

  it('sugiere por contención: "Point" encuentra "Padel Point"', () => {
    expect(findSimilarVenues('Point Sur', SEDES).length).toBeGreaterThan(0);
  });

  it('NO mezcla sedes que solo comparten palabras genéricas', () => {
    // 'Club Padel Satélite' no debe sugerir 'Club Padel Coyoacán'.
    const r = findSimilarVenues('Club Padel Satélite', SEDES);
    expect(r.map((v) => v.id)).not.toContain('3');
  });

  it('respeta el límite', () => {
    expect(findSimilarVenues('Padel Point', SEDES, 1)).toHaveLength(1);
  });

  it('devuelve [] cuando no hay sedes cargadas', () => {
    expect(findSimilarVenues('Padel Point', [])).toEqual([]);
  });

  it('normaliza al vuelo si la fila no trae name_normalized', () => {
    // Sedes sembradas por SQL antes de la migración 032.
    const legacy = [{ id: '9', name: 'Padel Point', city: 'CDMX' }];
    expect(findSimilarVenues('padel point', legacy)).toHaveLength(1);
  });
});
