// src/lib/engine/rating/__tests__/category-bands.test.ts
import {
  divisionForRating,
  isEligibleToRegister,
  shouldPromote,
} from '../category-bands';

describe('divisionForRating', () => {
  it('mapea ratings a divisiones', () => {
    expect(divisionForRating(1300)).toBe('sexta');
    expect(divisionForRating(1450)).toBe('quinta');
    expect(divisionForRating(1600)).toBe('cuarta');
    expect(divisionForRating(2100)).toBe('primera');
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
