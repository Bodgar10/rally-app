/**
 * La cuenta de capacidad es la que dispara el aviso al organizador, y ese aviso
 * se da mientras se inscriben — cuando todavía hay margen para conseguir una
 * cancha. Si la cuenta miente, miente en el único momento en que servía.
 */

import { generarBloques } from '@/lib/engine/schedule/bloques';
import {
  horaLegible, rangoLegible, textoCupo, partesDeBloqueId, capacidadDelTorneo,
} from '@/lib/bloques-formato';

/** Sábado de 8 a 20 con 4 canchas: 4 bloques de 3 h, 16 carriles, 48 lugares. */
function reticulaDePrueba(canchas = 4) {
  return generarBloques({
    ventanas: [
      { dia: '2026-03-14', desde: '08:00', hasta: '20:00' },
      { dia: '2026-03-15', desde: '09:00', hasta: '18:00' },  // eliminatorias
    ],
    canchas,
    minutosPorPartido: 60,
  });
}

describe('presentación', () => {
  it('quita el cero de la izquierda porque así se dice la hora', () => {
    expect(horaLegible('08:00')).toBe('8:00');
    expect(horaLegible('14:00')).toBe('14:00');
  });

  it('arma el rango', () => {
    expect(rangoLegible('08:00', '11:00')).toBe('8:00 a 11:00');
  });

  it('el cupo se dice en singular, plural y lleno', () => {
    expect(textoCupo(0)).toBe('Lleno');
    expect(textoCupo(-2)).toBe('Lleno');       // sobrevendido tambien es lleno
    expect(textoCupo(1)).toBe('Queda 1 lugar');
    expect(textoCupo(6)).toBe('Quedan 6 lugares');
  });

  it('parte un id de bloque, y devuelve null si no tiene esa forma', () => {
    expect(partesDeBloqueId('2026-03-14-08:00')).toEqual({ dia: '2026-03-14', desde: '08:00' });
    expect(partesDeBloqueId('2026-03-14')).toBeNull();
    expect(partesDeBloqueId('')).toBeNull();
  });
});

describe('capacidadDelTorneo', () => {
  it('el sábado de 8 a 20 con 4 canchas da 16 carriles y 48 lugares', () => {
    const r = reticulaDePrueba();
    expect(r.bloques.length).toBe(4);
    expect(r.capacidadCarriles).toBe(16);
    expect(r.capacidadParejas).toBe(48);
  });

  it('cuenta en CARRILES, no en lugares: 4 parejas de una categoría gastan 2', () => {
    const cap = capacidadDelTorneo({
      reticula: reticulaDePrueba(),
      canchas: 4,
      parejasPorCategoria: { a: 4, b: 4, c: 4 },
    });
    expect(cap.inscritas).toBe(12);
    // 12 parejas en 48 lugares "cabrian" de sobra, pero cada categoria de 4
    // necesita 2 carriles: 6 de 16.
    expect(cap.carrilesNecesarios).toBe(6);
    expect(cap.faltanCarriles).toBe(-10);
    expect(cap.palancas).toEqual([]);
  });

  it('no avisa mientras quepa', () => {
    const cap = capacidadDelTorneo({
      reticula: reticulaDePrueba(),
      canchas: 4,
      parejasPorCategoria: { a: 48 },
    });
    expect(cap.carrilesNecesarios).toBe(16);
    expect(cap.faltanCarriles).toBe(0);
    expect(cap.palancas).toEqual([]);
  });

  it('cuando no cabe, las tres palancas traen números concretos', () => {
    // 17 categorias de 3 parejas = 17 carriles contra 16 disponibles.
    const parejasPorCategoria: Record<string, number> = {};
    for (let i = 0; i < 17; i++) parejasPorCategoria[`cat${i}`] = 3;

    const cap = capacidadDelTorneo({
      reticula: reticulaDePrueba(), canchas: 4, parejasPorCategoria,
    });

    expect(cap.carrilesNecesarios).toBe(17);
    expect(cap.faltanCarriles).toBe(1);
    expect(cap.palancas).toHaveLength(3);
    // 1 carril de deficit / 4 bloques = 1 cancha mas, que aporta 4 grupos.
    expect(cap.palancas[0]).toContain('1 cancha');
    expect(cap.palancas[0]).toContain('4 grupos');
    // 1 carril / 4 canchas = 1 bloque mas = 3 h.
    expect(cap.palancas[1]).toContain('3 h en total');
    expect(cap.palancas[2]).toContain('un día más de 3 h');
  });

  it('un déficit grande escala las tres palancas a la vez', () => {
    const parejasPorCategoria: Record<string, number> = {};
    for (let i = 0; i < 24; i++) parejasPorCategoria[`cat${i}`] = 3;   // 24 carriles

    const cap = capacidadDelTorneo({
      reticula: reticulaDePrueba(), canchas: 4, parejasPorCategoria,
    });

    expect(cap.faltanCarriles).toBe(8);
    expect(cap.palancas[0]).toContain('2 canchas');   // 8/4 bloques
    expect(cap.palancas[1]).toContain('6 h en total'); // 8/4 canchas = 2 bloques
  });

  it('sin bloques no inventa palancas de horario que no se puedan medir', () => {
    // Ventana de 2 h: no cabe un bloque de 3 h.
    const reticula = generarBloques({
      ventanas: [{ dia: '2026-03-14', desde: '08:00', hasta: '10:00' }],
      canchas: 4,
      minutosPorPartido: 60,
    });
    const cap = capacidadDelTorneo({
      reticula, canchas: 4, parejasPorCategoria: { a: 6 },
    });
    expect(cap.capacidadCarriles).toBe(0);
    expect(cap.faltanCarriles).toBe(2);
    // La palanca de "conseguir N canchas más" no se ofrece: sin bloques donde
    // usarlas, una cancha extra no suma ni un grupo. Quedan las dos de horario.
    expect(cap.palancas.some((p) => p.startsWith('Conseguir'))).toBe(false);
    expect(cap.palancas).toHaveLength(2);
  });

  it('ignora categorías vacías', () => {
    const cap = capacidadDelTorneo({
      reticula: reticulaDePrueba(), canchas: 4,
      parejasPorCategoria: { a: 3, b: 0, c: 0 },
    });
    expect(cap.inscritas).toBe(3);
    expect(cap.carrilesNecesarios).toBe(1);
  });
});
