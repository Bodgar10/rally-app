// src/lib/engine/rating/__tests__/category-bands.test.ts
import {
  DEFAULT_BANDS,
  divisionForRating,
  isEligibleToRegister,
  shouldPromote,
} from '../category-bands';
import { DIVISIONES } from '@/lib/divisiones';

describe('divisionForRating', () => {
  it('mapea ratings a divisiones', () => {
    expect(divisionForRating(1300)).toBe('sexta');
    expect(divisionForRating(1450)).toBe('quinta');
    expect(divisionForRating(1600)).toBe('cuarta');
    expect(divisionForRating(2100)).toBe('primera');
  });

  // LA SÉPTIMA (migración 084). Antes la sexta se quedaba con todo lo que
  // hubiera por debajo de 1400; ahora es una banda normal de 150 y el suelo
  // lo abre la séptima.
  describe('la séptima es el nuevo suelo', () => {
    it('por debajo de 1250 es séptima, no sexta', () => {
      expect(divisionForRating(1200)).toBe('septima');
      expect(divisionForRating(800)).toBe('septima');
      expect(divisionForRating(-9999)).toBe('septima');
    });

    it('la frontera cae entre 1249 y 1250', () => {
      expect(divisionForRating(1249)).toBe('septima');
      expect(divisionForRating(1250)).toBe('sexta');
    });

    it('la sexta sigue llegando hasta 1399 y no más', () => {
      expect(divisionForRating(1399)).toBe('sexta');
      expect(divisionForRating(1400)).toBe('quinta');
    });

    it('la sexta mide 150 puntos, igual que las de encima', () => {
      const sexta = DEFAULT_BANDS.find((b) => b.division === 'sexta')!;
      expect(sexta.max - sexta.min).toBe(149);
    });
  });
});

describe('la escalera de divisiones', () => {
  // Si alguien añade una división al enum y se olvida de las bandas, un
  // jugador de esa división no tendría banda y la tarjeta de nivel se
  // quedaría sin saber dónde ponerlo.
  it('hay una banda por cada división del enum, sin sobrar ninguna', () => {
    expect([...DEFAULT_BANDS].map((b) => b.division)).toEqual([...DIVISIONES]);
  });

  it('las bandas no dejan huecos: el techo de una es el suelo de la siguiente', () => {
    for (let i = 0; i < DEFAULT_BANDS.length - 1; i++) {
      expect(DEFAULT_BANDS[i + 1].min).toBe(DEFAULT_BANDS[i].max + 1);
    }
  });

  it('solo los dos extremos son infinitos', () => {
    expect(DEFAULT_BANDS[0].min).toBe(-Infinity);
    expect(DEFAULT_BANDS[DEFAULT_BANDS.length - 1].max).toBe(Infinity);
    const enMedio = DEFAULT_BANDS.slice(1, -1);
    expect(enMedio.every((b) => Number.isFinite(b.min) && Number.isFinite(b.max))).toBe(true);
  });
});

describe('bloqueo de bajada con la séptima', () => {
  it('un jugador de sexta medido no puede bajarse a séptima', () => {
    const r = isEligibleToRegister(1300, 80, 'septima');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('above_band_blocked');
  });

  it('pero uno de séptima sí puede subir a sexta', () => {
    expect(isEligibleToRegister(1200, 80, 'sexta').allowed).toBe(true);
  });

  // El caso real del fin de semana: gente nueva apuntándose a séptima. RD
  // alta = todavía no medido, así que se le deja declarar su división.
  it('un jugador nuevo (RD alta) puede declararse de séptima', () => {
    const r = isEligibleToRegister(1500, 350, 'septima');
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('cold_start_declared');
  });
});

describe('isEligibleToRegister — bloqueo de bajada (§7.3)', () => {
  it('jugador de cuarta NO puede bajar a quinta (RD baja)', () => {
    const r = isEligibleToRegister(1600, 80, 'quinta');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('above_band_blocked');
    expect(r.requiresOrganizerApproval).toBe(true);
  });

  it('jugador de cuarta SÍ puede inscribirse en cuarta o subir a tercera', () => {
    expect(isEligibleToRegister(1600, 80, 'cuarta').allowed).toBe(true);
    expect(isEligibleToRegister(1600, 80, 'tercera').allowed).toBe(true);
  });

  it('cold-start (RD alta) permite declarar categoría', () => {
    const r = isEligibleToRegister(1600, 300, 'quinta');
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('cold_start_declared');
  });
});

describe('shouldPromote — anti-sandbagger (§7.2)', () => {
  it('promueve si supera el techo de forma sostenida con RD baja', () => {
    const r = shouldPromote(1720, 60, 'cuarta', 3);
    expect(r.promote).toBe(true);
    expect(r.toDivision).toBe('tercera');
  });

  it('no promueve con RD alta', () => {
    expect(shouldPromote(1720, 200, 'cuarta', 5).promote).toBe(false);
  });

  it('no promueve dentro de la banda', () => {
    expect(shouldPromote(1600, 60, 'cuarta', 5).promote).toBe(false);
  });
});
