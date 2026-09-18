// src/lib/__tests__/suscripcion.test.ts
import { SIN_SUSCRIPCION, esActiva, estadoDeSuscripcion } from '@/lib/suscripcion';

describe('qué cuenta como suscripción activa', () => {
  it.each(['active', 'trialing'])('%s da acceso', (s) => expect(esActiva(s)).toBe(true));

  it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'])(
    '%s no',
    (s) => expect(esActiva(s)).toBe(false),
  );

  it('past_due tampoco: el cobro falló', () => {
    expect(esActiva('past_due')).toBe(false);
  });

  it('null o vacío no dan acceso', () => {
    expect(esActiva(null)).toBe(false);
    expect(esActiva(undefined)).toBe(false);
    expect(esActiva('')).toBe(false);
  });
});

describe('estadoDeSuscripcion', () => {
  it('sin fila, no hay suscripción', () => {
    expect(estadoDeSuscripcion(null)).toEqual(SIN_SUSCRIPCION);
    expect(estadoDeSuscripcion(undefined)).toEqual(SIN_SUSCRIPCION);
  });

  it('anual activa es Campeón: la única que perdona la comisión', () => {
    expect(estadoDeSuscripcion({ status: 'active', billing_cycle: 'annual' })).toEqual({
      activa: true,
      ciclo: 'annual',
      esCampeon: true,
    });
  });

  it('mensual activa da acceso pero NO es Campeón', () => {
    const e = estadoDeSuscripcion({ status: 'active', billing_cycle: 'monthly' });
    expect(e.activa).toBe(true);
    expect(e.esCampeon).toBe(false);
  });

  it('una anual cancelada no es Campeón ni da acceso', () => {
    expect(estadoDeSuscripcion({ status: 'canceled', billing_cycle: 'annual' })).toEqual(
      SIN_SUSCRIPCION,
    );
  });

  it('un ciclo desconocido no se inventa: activa sin ciclo', () => {
    const e = estadoDeSuscripcion({ status: 'active', billing_cycle: 'weekly' });
    expect(e.activa).toBe(true);
    expect(e.ciclo).toBeNull();
    expect(e.esCampeon).toBe(false);
  });
});
