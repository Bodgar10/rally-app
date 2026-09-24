// src/lib/__tests__/proyeccion-ranking.test.ts
import {
  proyectarRanking,
  puntosDeGanarUnTorneo,
  textoDeLoQueDaUnTorneo,
  textoDeQuienPersigue,
  textoDelHito,
  textoDePosicion,
  type FilaRanking,
} from '@/lib/proyeccion-ranking';

/** Una tabla de 12, de 2000 puntos hacia abajo de 150 en 150. */
const tabla: FilaRanking[] = Array.from({ length: 12 }, (_, i) => ({
  player_id: `p${i + 1}`,
  points: 2000 - i * 150,
  position: i + 1,
}));

describe('situar al jugador', () => {
  it('devuelve null si todavía no ha puntuado', () => {
    expect(proyectarRanking(tabla, 'nadie')).toBeNull();
  });

  it('ordena por posición aunque la tabla llegue revuelta', () => {
    const revuelta = [...tabla].reverse();
    expect(proyectarRanking(revuelta, 'p8')!.posicion).toBe(8);
  });

  it('mira hacia arriba Y hacia abajo', () => {
    const p = proyectarRanking(tabla, 'p8')!;
    expect(p.siguiente).toEqual({ posicion: 7, faltan: 151 });
    expect(p.persigue).toEqual({ posicion: 9, a: 150 });
  });

  it('el primero no tiene a quién pasar; el último, a quién le persiga', () => {
    expect(proyectarRanking(tabla, 'p1')!.siguiente).toBeNull();
    expect(proyectarRanking(tabla, 'p12')!.persigue).toBeNull();
  });
});

describe('los hitos son redondos porque así se piensa', () => {
  it('desde el 8º, el siguiente escalón es el top 5', () => {
    // Nadie aspira al puesto 7: se aspira al top 5.
    const p = proyectarRanking(tabla, 'p8')!;
    expect(p.hito?.nombre).toBe('el top 5');
    expect(p.hito?.faltan).toBe(451); // 1400 del 5º menos 950, +1
  });

  it('desde el 4º, el podio', () => {
    expect(proyectarRanking(tabla, 'p4')!.hito?.nombre).toBe('el podio');
  });

  it('desde el 2º, el primer puesto', () => {
    expect(proyectarRanking(tabla, 'p2')!.hito?.nombre).toBe('el primer puesto');
  });

  it('el número uno no tiene hito, y se le dice', () => {
    const p = proyectarRanking(tabla, 'p1')!;
    expect(p.hito).toBeNull();
    expect(textoDelHito(p)).toBe('Eres el número uno de tu división.');
  });

  it('desde muy abajo el escalón sigue siendo el más cercano, no el más épico', () => {
    expect(proyectarRanking(tabla, 'p12')!.hito?.nombre).toBe('el top 10');
  });
});

describe('cuánto da ganar un torneo', () => {
  it('un P2 de 16 parejas da 750 puntos', () => {
    expect(puntosDeGanarUnTorneo('p2', 16)).toBe(750);
  });

  it('EL TAMAÑO NO DA PUNTOS POR SÍ MISMO: los da el TIER', () => {
    // Un P2 vale lo mismo con 8 parejas que con 40. Lo que hace grande a un
    // torneo es el contrato que el organizador declaró, no cuánta gente metió.
    const p2 = [8, 16, 32, 40].map((n) => puntosDeGanarUnTorneo('p2', n));
    expect(new Set(p2).size).toBe(1);
  });

  it('pero un tier alto NECESITA parejas para sostenerse', () => {
    // El piso de `tierMinimos` es lo que impide inflar el ranking declarando
    // "major" un torneo de ocho parejas: se degrada al tier que le toca.
    expect(puntosDeGanarUnTorneo('major', 8)).toBe(750); // cae a P2
    expect(puntosDeGanarUnTorneo('major', 16)).toBe(1250); // cae a P1
    expect(puntosDeGanarUnTorneo('major', 32)).toBe(2500); // ya se sostiene
  });

  it('y por eso un major grande vale más del triple que un P2', () => {
    expect(puntosDeGanarUnTorneo('major', 32)).toBeGreaterThan(
      puntosDeGanarUnTorneo('p2', 32) * 3,
    );
  });
});

describe('cómo se cuenta', () => {
  const p = proyectarRanking(tabla, 'p8')!;

  it('la posición, con sus puntos', () => {
    expect(textoDePosicion(p)).toBe('Vas 8º con 950 puntos.');
  });

  it('la meta, en puntos', () => {
    expect(textoDelHito(p)).toBe('Te faltan 451 puntos para el top 5.');
  });

  it('LE DA ESCALA AL NÚMERO: sin esto, 451 no significa nada', () => {
    // El jugador no sabe si 451 son dos torneos o veinte.
    expect(textoDeLoQueDaUnTorneo(p, 500)).toBe('Con ganar un torneo lo alcanzas.');
    expect(textoDeLoQueDaUnTorneo(p, 200)).toBe('Ganando 3 torneos lo alcanzas.');
    expect(textoDeLoQueDaUnTorneo(p, 50)).toMatch(/te daría unos 50 puntos/);
  });

  it('quién te persigue', () => {
    expect(textoDeQuienPersigue(p)).toBe('El 9º está a 150 puntos de ti.');
  });

  it('un empate se dice como empate y no como "a 0 puntos"', () => {
    const empatados: FilaRanking[] = [
      { player_id: 'a', points: 500, position: 1 },
      { player_id: 'b', points: 500, position: 2 },
    ];
    expect(textoDeQuienPersigue(proyectarRanking(empatados, 'a')!)).toBe(
      'El 2º está empatado contigo.',
    );
  });
});

// ───────────────────────────────────────────
// Empates: un compañero de pareja no es un rival
// ───────────────────────────────────────────
//
// EL BUG: la posición es un `rank()`, así que los dos de la pareja campeona son
// 1.º y 1.º con los MISMOS puntos. Cogiendo la fila de al lado por índice, la
// app le decía a uno "te falta 1 punto para alcanzar al 1.º" — su compañero,
// con quien está empatado, en un puesto que ya es el suyo.

describe('con puestos empatados', () => {
  const fila = (player_id: string, position: number, points: number) =>
    ({ player_id, position, points });

  // Aldo y Bodgar, campeones, 660 los dos.
  const tabla = [
    fila('aldo', 1, 660), fila('bodgar', 1, 660),
    fila('victor', 3, 450), fila('andres', 3, 450),
    fila('bruno', 5, 300),
  ];

  it('no manda a perseguir al que comparte tu puesto', () => {
    const p = proyectarRanking(tabla, 'bodgar');
    expect(p?.posicion).toBe(1);
    // Nadie por delante: es el primer puesto, empatado o no.
    expect(p?.siguiente).toBeNull();
  });

  it('el de delante es el primero que está de verdad delante', () => {
    const p = proyectarRanking(tabla, 'andres');
    expect(p?.posicion).toBe(3);
    expect(p?.siguiente?.posicion).toBe(1);
    expect(p?.siguiente?.faltan).toBe(660 - 450 + 1);
  });

  it('y el que persigue, el primero que está de verdad detrás', () => {
    const p = proyectarRanking(tabla, 'victor');
    expect(p?.persigue?.posicion).toBe(5);
    expect(p?.persigue?.a).toBe(450 - 300);
  });

  it('el último no persigue a nadie aunque esté empatado', () => {
    const p = proyectarRanking(tabla, 'bruno');
    expect(p?.persigue).toBeNull();
  });
});
