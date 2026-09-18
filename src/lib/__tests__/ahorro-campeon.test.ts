// src/lib/__tests__/ahorro-campeon.test.ts
import {
  COMISION_PCT,
  SIN_CAMPEON,
  descuentoDe,
  progresoDelTope,
  textoDeLoQueFalta,
  textoDeLoQueSePierde,
  textoDelContador,
  textoEnElPago,
  topeAlcanzado,
  torneosParaQueSePague,
  type AhorroCampeon,
} from '@/lib/ahorro-campeon';

const campeon = (ahorrado: number, tope = 990): AhorroCampeon => ({
  es_campeon: true,
  ahorrado,
  tope,
  restante: Math.max(tope - ahorrado, 0),
  periodo_fin: '2027-09-18T00:00:00Z',
});

describe('el descuento', () => {
  it('es el 5% de la comisión, redondeado a pesos', () => {
    expect(COMISION_PCT).toBe(5);
    expect(descuentoDe(950)).toBe(48);
    expect(descuentoDe(1900)).toBe(95);
  });
});

describe('el contador del perfil', () => {
  it('calla si no es Campeón: no hay nada que contarle', () => {
    expect(textoDelContador(SIN_CAMPEON)).toBeNull();
  });

  it('recién suscrito, anuncia el tope en vez de un cero', () => {
    expect(textoDelContador(campeon(0))).toBe(
      'Tus inscripciones no pagan comisión. Recuperas hasta $990 este año.',
    );
  });

  it('en camino, enseña los dos números', () => {
    expect(textoDelContador(campeon(570))).toBe('Llevas $570 ahorrados de $990.');
  });

  it('al alcanzar el tope lo celebra, que es el momento que renueva', () => {
    expect(textoDelContador(campeon(990))).toMatch(/Campeón te salió gratis/);
    expect(topeAlcanzado(campeon(990))).toBe(true);
  });

  it('el progreso va de 0 a 1 y no se pasa', () => {
    expect(progresoDelTope(campeon(0))).toBe(0);
    expect(progresoDelTope(campeon(495))).toBeCloseTo(0.5);
    expect(progresoDelTope(campeon(1200))).toBe(1);
    expect(progresoDelTope(SIN_CAMPEON)).toBe(0);
  });
});

describe('cuánto le falta para que salga gratis', () => {
  it('lo cuenta en torneos, que es como el jugador piensa', () => {
    expect(textoDeLoQueFalta(campeon(0))).toBe('Con 21 torneos más, tu suscripción se paga sola.');
    expect(textoDeLoQueFalta(campeon(942))).toBe('Con un torneo más, tu suscripción se paga sola.');
  });

  it('calla cuando ya se pagó sola', () => {
    expect(textoDeLoQueFalta(campeon(990))).toBeNull();
  });

  it('21 torneos es la promesa: cuadra con el precio y la cuota real', () => {
    expect(torneosParaQueSePague(950)).toBe(21);
  });
});

describe('el momento de pagar, siendo Campeón', () => {
  it('con descuento completo lo dice claro', () => {
    expect(textoEnElPago(950, 48)).toBe('Ahorras $48: tu comisión la cubre RALLY.');
  });

  it('con el tope a medias NO lo disimula', () => {
    // Aquí es donde se rompería la confianza: está mirando el importe.
    expect(textoEnElPago(950, 20)).toMatch(/lo que te quedaba de tu suscripción/);
    expect(textoEnElPago(950, 20)).toMatch(/\$20/);
  });

  it('con el tope agotado explica por qué ya no hay descuento', () => {
    expect(textoEnElPago(950, 0)).toMatch(/Ya recuperaste tu suscripción/);
  });
});

describe('el momento de pagar, SIN ser Campeón', () => {
  it('enseña los dos importes, que es lo único que convence', () => {
    expect(textoDeLoQueSePierde(950)).toBe('Con Campeón pagarías $902 en vez de $950.');
  });

  it('con la inscripción completa el número es el doble', () => {
    expect(textoDeLoQueSePierde(1900)).toBe('Con Campeón pagarías $1,805 en vez de $1,900.');
  });
});
