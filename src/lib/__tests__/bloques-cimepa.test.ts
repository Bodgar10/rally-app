/**
 * La retícula del Sexto Torneo Cimepa, contra las ventanas reales.
 *
 * POR QUÉ ESTE TEST Y NO SOLO LOS DE `bloques.test.ts`
 *   Aquellos prueban el motor con entradas de laboratorio. Este fija la
 *   configuración que de verdad se corrió —tres días, 8 canchas, 60 min— porque
 *   es la que respondió las preguntas de producto: cuántos bloques hay que
 *   ofrecer, cuánta gente cabe y si las 165 parejas de Cimepa entraban.
 *
 *   Si alguien cambia el reparto de días o la regla del último día, aquí se ve
 *   traducido a la única cifra que le importa al organizador: los lugares.
 *
 * OJO CON EL VIERNES
 *   Empieza a las 14:00, no a las 8:00, y no es un recorte del scheduler: a esa
 *   hora la gente trabaja. Son 3 bloques, no 5, y esa asimetría es intencional.
 */

import { generarBloques, cupoDeBloque, bloquesDisponibles } from '@/lib/engine/schedule/bloques';
import { capacidadDelTorneo, carrilesDeCategoria, tamanosDeGrupo } from '@/lib/bloques-formato';
import { computeFormat } from '@/lib/engine/format';

/** Copia literal de CAPACIDAD en `scripts/seed-cimepa.mjs`. */
const CIMEPA = {
  canchas: 8,
  minutosPorPartido: 60,
  ventanas: [
    { dia: '2026-09-11', desde: '14:00', hasta: '23:00' },   // viernes ·  9 h
    { dia: '2026-09-12', desde: '08:00', hasta: '23:00' },   // sábado  · 15 h
    { dia: '2026-09-13', desde: '08:00', hasta: '20:00' },   // domingo · eliminatorias
  ],
};

/**
 * Las OCHO CATEGORÍAS REALES, copiadas de CATEGORIAS en `scripts/seed-cimepa.mjs`.
 *
 * Antes aquí había ocho categorías inventadas de 20 y 21 parejas que sumaban
 * 165 y nada más. Un test etiquetado "Cimepa" con datos que no son de Cimepa
 * es peor que no tenerlo: quien verifique contra él verifica contra una
 * fantasía. Y la fantasía daba 59 carriles porque los 20 obligan a grupos de 4;
 * el torneo real, con todas las categorías en múltiplos de 3, son 55.
 */
const PAREJAS_POR_CATEGORIA = {
  '2A':  21,   // 2ª Fuerza
  '3A':  30,   // 3ª Fuerza
  '4A':  30,   // 4ª Fuerza
  '5A':  30,   // 5ª Fuerza
  '6A':  15,   // 6ª Fuerza
  '5F':  12,   // 5ª Femenil
  'MxD': 18,   // Mixtos D
  'MxC':  9,   // Mixtos C
};

describe('retícula de Cimepa', () => {
  const r = generarBloques(CIMEPA);

  it('el domingo no genera bloques: es el día de eliminatorias', () => {
    expect(r.diaEliminatorias).toBe('2026-09-13');
    expect(r.dias.find((d) => d.dia === '2026-09-13')).toMatchObject({
      bloques: 0, eliminatorias: true,
    });
  });

  it('8 bloques de 3 h: 3 el viernes y 5 el sábado', () => {
    expect(r.minutosPorBloque).toBe(180);
    expect(r.bloques.length).toBe(8);
    expect(r.bloques.filter((b) => b.dia === '2026-09-11').map((b) => b.desde))
      .toEqual(['14:00', '17:00', '20:00']);
    expect(r.bloques.filter((b) => b.dia === '2026-09-12').map((b) => b.desde))
      .toEqual(['08:00', '11:00', '14:00', '17:00', '20:00']);
  });

  it('64 carriles y 192 lugares, sin minutos desperdiciados ni avisos', () => {
    expect(r.capacidadCarriles).toBe(64);      // 8 bloques x 8 canchas
    expect(r.capacidadParejas).toBe(192);      // 64 carriles x 3 parejas
    expect(r.dias.every((d) => d.minutosSobrantes === 0)).toBe(true);
    expect(r.avisos).toEqual([]);
  });

  it('las 165 parejas caben en 55 carriles de 64', () => {
    const cap = capacidadDelTorneo({
      reticula: r, canchas: 8, parejasPorCategoria: PAREJAS_POR_CATEGORIA,
    });
    expect(cap.inscritas).toBe(165);

    // 55, y salen de que TODAS las categorías reales son múltiplos de 3:
    //   21 -> 7 grupos   30 -> 10   30 -> 10   30 -> 10
    //   15 -> 5          12 ->  4   18 ->  6    9 ->  3
    // Ni un solo grupo de 4, así que el reparto entero cuesta un carril por
    // grupo y 55 = 165/3. Que coincida con la división es una propiedad de
    // ESTAS categorías, no una regla: ver el caso de 20 más abajo.
    expect(cap.carrilesNecesarios).toBe(55);
    expect(cap.faltanCarriles).toBe(-9);
    expect(cap.palancas).toEqual([]);
  });

  it('55 grupos y 165 partidos de fase de grupos', () => {
    // Es la cifra contra la que se verifica el scheduler en
    // `engine/schedule/__tests__/grupos-cimepa.test.ts`.
    const grupos = Object.values(PAREJAS_POR_CATEGORIA)
      .reduce((a, n) => a + computeFormat(n).groupSizes.length, 0);
    const partidos = Object.values(PAREJAS_POR_CATEGORIA)
      .reduce((a, n) => a + computeFormat(n).groupSizes
        .reduce((b, s) => b + (s * (s - 1)) / 2, 0), 0);
    expect(grupos).toBe(55);
    expect(partidos).toBe(165);
  });

  it('el tamaño de grupo de cada categoría de Cimepa es 3', () => {
    expect(tamanosDeGrupo(PAREJAS_POR_CATEGORIA)).toEqual({
      '2A': 3, '3A': 3, '4A': 3, '5A': 3, '6A': 3, '5F': 3, MxD: 3, MxC: 3,
    });
  });

  it('en las categorías chicas el grupo NO es de 3', () => {
    // 8 parejas -> [4,4]. 4 -> [4]. 5 -> [5]. 7 -> [4,3], empate roto hacia
    // el grande porque es el lado que no promete lugares de más.
    expect(tamanosDeGrupo({ a: 8, b: 4, c: 5, d: 7 })).toEqual({ a: 4, b: 4, c: 5, d: 4 });
  });

  it('una categoría con menos de 2 parejas no entra: computeFormat lanza', () => {
    expect(tamanosDeGrupo({ a: 0, b: 1 })).toEqual({});
  });

  it('una categoría de 20 cuesta 8 carriles y una de 21 cuesta 7', () => {
    // NO es Cimepa —ninguna de sus categorías tuvo 20— pero es la propiedad
    // que hace que la cuenta no se pueda hacer dividiendo entre 3: una pareja
    // MENOS puede costar un carril MÁS, porque 20 obliga a dos grupos de 4 y
    // cada uno vale dos carriles.
    expect(carrilesDeCategoria(21)).toBe(7);
    expect(carrilesDeCategoria(20)).toBe(8);
    // Las ocho reales, para contraste: todas al mínimo.
    expect(Object.values(PAREJAS_POR_CATEGORIA).map((n) => carrilesDeCategoria(n)))
      .toEqual([7, 10, 10, 10, 5, 4, 6, 3]);
  });
});

describe('lo que ve el selector sobre esa retícula', () => {
  const r = generarBloques(CIMEPA);

  it('con el torneo vacío se ofrecen los 8 bloques, 24 lugares cada uno', () => {
    const libres = bloquesDisponibles(r.bloques, {}, 'MxD');
    expect(libres.length).toBe(8);
    expect(libres.every((b) => b.cupo === 24)).toBe(true);   // 8 carriles x 3
  });

  it('un bloque con los 8 carriles tomados desaparece para todas las categorías', () => {
    // 18 de MxD ocupan 6 carriles; 6 de 3ª Fuerza ocupan los otros dos.
    const ocupacion = { '2026-09-12-08:00': { MxD: 18, '3A': 6 } };
    const bloque = r.bloques.find((b) => b.id === '2026-09-12-08:00')!;

    expect(cupoDeBloque(bloque, ocupacion['2026-09-12-08:00'], 'MxD')).toBe(0);
    expect(cupoDeBloque(bloque, ocupacion['2026-09-12-08:00'], '4A')).toBe(0);

    const libres = bloquesDisponibles(r.bloques, ocupacion, 'MxD');
    expect(libres.length).toBe(7);
    expect(libres.some((b) => b.id === '2026-09-12-08:00')).toBe(false);
  });

  it('los huecos de un grupo a medias solo sirven para su propia categoría', () => {
    // 20 parejas de una categoría: 6 grupos llenos y uno con 2. Siete carriles
    // usados, uno libre.
    const ocupacion = { '2026-09-11-14:00': { MxD: 20 } };
    const bloque = r.bloques.find((b) => b.id === '2026-09-11-14:00')!;

    // MxD: 1 hueco en su grupo a medias + 3 del carril libre.
    expect(cupoDeBloque(bloque, ocupacion['2026-09-11-14:00'], 'MxD')).toBe(4);
    // 3ª Fuerza no puede meterse en ese grupo: solo le queda el carril libre.
    expect(cupoDeBloque(bloque, ocupacion['2026-09-11-14:00'], '3A')).toBe(3);
  });
});
