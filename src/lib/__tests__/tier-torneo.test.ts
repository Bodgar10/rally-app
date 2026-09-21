import {
  TIER_OPCIONES, TIER_EXPRES, opcionDeTier,
  puntosDelCampeon, textoPuntosDelCampeon, resumenDeTier,
} from '@/lib/tier-torneo';
import { DEFAULT_RANKING_RULES } from '@/lib/engine/ranking-points';

describe('puntosDelCampeon', () => {
  // Los números que ve el jugador en la portada.
  it('un Major vale el doble que un P1', () => {
    expect(puntosDelCampeon('major')).toBe(2000);
    expect(puntosDelCampeon('p1')).toBe(1000);
    expect(puntosDelCampeon('p2')).toBe(600);
  });

  it('respeta el orden de los tiers', () => {
    expect(puntosDelCampeon('major')).toBeGreaterThan(puntosDelCampeon('p1'));
    expect(puntosDelCampeon('p1')).toBeGreaterThan(puntosDelCampeon('p2'));
  });

  // Si alguien cambia la tabla de puntos del motor, la portada tiene que
  // cambiar con ella en vez de quedarse mintiendo con un número escrito a mano.
  it('sale del motor y no de una constante copiada', () => {
    const { roundPoints, tierMultipliers } = DEFAULT_RANKING_RULES;
    for (const o of TIER_OPCIONES) {
      expect(puntosDelCampeon(o.valor))
        .toBe(Math.round(roundPoints.champion * tierMultipliers[o.valor]));
    }
  });

  it('siempre es un entero: no se pintan medios puntos', () => {
    for (const o of TIER_OPCIONES) {
      expect(Number.isInteger(puntosDelCampeon(o.valor))).toBe(true);
    }
  });
});

describe('textoPuntosDelCampeon', () => {
  it('lleva separador de miles para que 2000 se lea de un golpe', () => {
    expect(textoPuntosDelCampeon('major')).toBe('2,000 pts');
    expect(textoPuntosDelCampeon('p2')).toBe('600 pts');
  });
});

describe('las opciones', () => {
  it('hay tres y el exprés es siempre la de abajo', () => {
    expect(TIER_OPCIONES).toHaveLength(3);
    expect(TIER_EXPRES).toBe('p2');
  });

  it('el destaque baja con el tier: solo el Major es el máximo', () => {
    expect(opcionDeTier('major').destaque).toBe('maximo');
    expect(opcionDeTier('p1').destaque).toBe('medio');
    expect(opcionDeTier('p2').destaque).toBe('base');
  });

  it('opcionDeTier encuentra las tres', () => {
    for (const o of TIER_OPCIONES) {
      expect(opcionDeTier(o.valor)).toBe(o);
    }
  });

  it('resumenDeTier no inventa un tier cuando no hay ninguno', () => {
    expect(resumenDeTier(null)).toBe('Sin elegir');
    expect(resumenDeTier('lo_que_sea')).toBe('Sin elegir');
    expect(resumenDeTier('major')).toBe('Major');
  });
});
