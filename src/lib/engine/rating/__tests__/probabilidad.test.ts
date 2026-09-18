// src/lib/engine/rating/__tests__/probabilidad.test.ts
import { combineOpponentPair, probabilidadDeVictoria } from '../glicko2';

const nivel = (rating: number, rd = 50) => ({ rating, rd });

describe('probabilidadDeVictoria', () => {
  it('entre iguales es 50%', () => {
    expect(probabilidadDeVictoria(nivel(1600), nivel(1600))).toBeCloseTo(0.5, 5);
  });

  it('el favorito pasa de 50% y su rival es su complemento', () => {
    const p = probabilidadDeVictoria(nivel(1700), nivel(1500));
    expect(p).toBeGreaterThan(0.5);
    // Con la misma RD, las dos miradas del mismo partido suman 1.
    expect(p + probabilidadDeVictoria(nivel(1500), nivel(1700))).toBeCloseTo(1, 5);
  });

  it('cuanto mayor la diferencia, más probable', () => {
    const cerca = probabilidadDeVictoria(nivel(1620), nivel(1600));
    const lejos = probabilidadDeVictoria(nivel(1900), nivel(1600));
    expect(lejos).toBeGreaterThan(cerca);
  });

  it('SIEMPRE entre 0 y 1, incluso con diferencias absurdas', () => {
    for (const [a, b] of [[900, 2400], [2400, 900], [1500, 1500]] as const) {
      const p = probabilidadDeVictoria(nivel(a), nivel(b));
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it('CONTRA UN RIVAL POCO MEDIDO SE ACERCA AL 50%', () => {
    // No es prudencia inventada: es Glicko. g(phi) aplana la curva cuando no
    // se sabe cuánto vale el rival, porque de verdad no se sabe.
    const contraConocido = probabilidadDeVictoria(nivel(1800), nivel(1500, 30));
    const contraNuevo = probabilidadDeVictoria(nivel(1800), nivel(1500, 350));
    expect(contraNuevo).toBeLessThan(contraConocido);
    expect(contraNuevo).toBeGreaterThan(0.5);
  });

  it('mi propia incertidumbre no cambia mis opciones de ganar', () => {
    // Solo cambia cuánto se mueve MI rating después, no quién es favorito.
    const seguro = probabilidadDeVictoria(nivel(1700, 30), nivel(1500, 50));
    const inseguro = probabilidadDeVictoria(nivel(1700, 300), nivel(1500, 50));
    expect(seguro).toBeCloseTo(inseguro, 10);
  });
});

describe('una pareja contra otra', () => {
  it('se combinan los dos rivales y sale la probabilidad del partido', () => {
    const nosotros = combineOpponentPair(nivel(1700), nivel(1500));
    const ellos = combineOpponentPair(nivel(1650), nivel(1550));
    expect(nosotros.rating).toBe(1600);
    expect(ellos.rating).toBe(1600);
    expect(probabilidadDeVictoria(nosotros, ellos)).toBeCloseTo(0.5, 5);
  });

  it('una pareja desigual no es lo mismo que dos parejos, por la RD', () => {
    // El promedio es el mismo pero la incertidumbre combinada no: la media
    // cuadrática castiga al que lleva a un rival muy poco medido.
    const pareja = combineOpponentPair(nivel(1600, 40), nivel(1600, 40));
    const dispar = combineOpponentPair(nivel(1600, 40), nivel(1600, 300));
    expect(dispar.rating).toBe(pareja.rating);
    expect(dispar.rd).toBeGreaterThan(pareja.rd);
  });
});
