// src/lib/__tests__/precios-suscripcion.test.ts
import {
  AHORRO_ANUAL,
  ANUAL_SI_PAGA_MENSUAL,
  EQUIVALENTE_MENSUAL,
  MESES_GRATIS,
  PRECIOS,
  TOPE_DESCUENTO,
  pesos,
} from '@/lib/precios-suscripcion';

describe('los precios de la suscripción', () => {
  it('EL ANUAL TIENE QUE SALIR MÁS BARATO QUE PAGAR MES A MES', () => {
    // Esto es lo que estaba mal: $149×12 = $1,788 contra un anual de $1,900.
    // Pagar por adelantado salía $112 más caro, y ningún beneficio arregla eso.
    expect(PRECIOS.annual.precio).toBeLessThan(ANUAL_SI_PAGA_MENSUAL);
    expect(AHORRO_ANUAL).toBeGreaterThan(0);
  });

  it('el ahorro es de al menos dos meses, que es lo que se anuncia', () => {
    expect(MESES_GRATIS).toBeGreaterThanOrEqual(2);
  });

  it('los números que se pintan cuadran entre sí', () => {
    expect(ANUAL_SI_PAGA_MENSUAL).toBe(1548);
    expect(AHORRO_ANUAL).toBe(558);
    expect(MESES_GRATIS).toBe(4);
    expect(EQUIVALENTE_MENSUAL).toBe(83);
  });

  it('la etiqueta y el precio no pueden discrepar', () => {
    for (const p of Object.values(PRECIOS)) {
      expect(p.etiqueta).toBe(pesos(p.precio));
    }
  });

  it('el tope de descuento es el precio del anual: "Campeón se paga solo"', () => {
    expect(TOPE_DESCUENTO).toBe(PRECIOS.annual.precio);
  });

  it('el anual se queda debajo de los mil', () => {
    // No es superstición: en México cruzar $1,000 es otra decisión de compra.
    expect(PRECIOS.annual.precio).toBeLessThan(1000);
  });

  it('el anual cuesta como UNA inscripción, que es el argumento de venta', () => {
    const inscripcionPorJugador = 950; // $1,900 la pareja, a la mitad
    expect(PRECIOS.annual.precio / inscripcionPorJugador).toBeLessThan(1.1);
  });
});

describe('pesos', () => {
  it.each([
    [990, '$990'],
    [1548, '$1,548'],
    [47.5, '$48'],
    [0, '$0'],
  ])('%s → "%s"', (n, esperado) => expect(pesos(n)).toBe(esperado));
});
