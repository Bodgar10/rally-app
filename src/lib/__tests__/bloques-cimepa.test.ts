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
import { capacidadDelTorneo } from '@/lib/bloques-formato';

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

/** 165 parejas en 8 categorías, como el seed. */
const PAREJAS_POR_CATEGORIA = {
  MxA: 20, MxB: 21, MxC: 21, MxD: 21, F2: 20, F3: 21, F4: 21, F5: 20,
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

  it('las 165 parejas caben, y no se dispara ninguna palanca', () => {
    const cap = capacidadDelTorneo({
      reticula: r, canchas: 8, parejasPorCategoria: PAREJAS_POR_CATEGORIA,
    });
    expect(cap.inscritas).toBe(165);
    // No son 55 carriles: las categorías de 20 parejas gastan 7 carriles
    // (6 grupos de 3 y uno de 2), no 6.67.
    expect(cap.carrilesNecesarios).toBe(56);
    expect(cap.faltanCarriles).toBe(-8);
    expect(cap.palancas).toEqual([]);
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
    // 21 de MxD ocupan 7 carriles; 3 de F2 ocupan el octavo.
    const ocupacion = { '2026-09-12-08:00': { MxD: 21, F2: 3 } };
    const bloque = r.bloques.find((b) => b.id === '2026-09-12-08:00')!;

    expect(cupoDeBloque(bloque, ocupacion['2026-09-12-08:00'], 'MxD')).toBe(0);
    expect(cupoDeBloque(bloque, ocupacion['2026-09-12-08:00'], 'F3')).toBe(0);

    const libres = bloquesDisponibles(r.bloques, ocupacion, 'MxD');
    expect(libres.length).toBe(7);
    expect(libres.some((b) => b.id === '2026-09-12-08:00')).toBe(false);
  });

  it('los huecos de un grupo a medias solo sirven para su propia categoría', () => {
    // 20 de MxD: 6 grupos llenos y uno con 2. Quedan 7 carriles usados, 1 libre.
    const ocupacion = { '2026-09-11-14:00': { MxD: 20 } };
    const bloque = r.bloques.find((b) => b.id === '2026-09-11-14:00')!;

    // MxD: 1 hueco en su grupo a medias + 3 del carril libre.
    expect(cupoDeBloque(bloque, ocupacion['2026-09-11-14:00'], 'MxD')).toBe(4);
    // F3 no puede meterse en ese grupo: solo le queda el carril libre.
    expect(cupoDeBloque(bloque, ocupacion['2026-09-11-14:00'], 'F3')).toBe(3);
  });
});
