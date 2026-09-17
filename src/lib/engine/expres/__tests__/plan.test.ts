// src/lib/engine/expres/__tests__/plan.test.ts
import {
  FACTOR_RETRASO,
  MARGEN_CIERRE_EXPRES,
  MINUTOS_ESTANDAR,
  formatHora,
  parseHora,
  planificarExpres,
} from '../index';

const tarde = { desde: '12:00', hasta: '19:00' };

describe('el exprés estándar: 16 parejas, 4 canchas, 12:00 a 19:00', () => {
  const p = planificarExpres({ cupo: 16, canchas: 4, ventana: tarde });

  it('dos grupos de 8 y cuatro canchas justas', () => {
    expect(p.tamanoGrupos).toEqual({ A: 8, B: 8 });
    expect(p.canchasNecesarias).toBe(4);
    expect(p.franjas.filter((f) => f.etapa === 'group').every((f) => f.tandas === 1)).toBe(true);
  });

  it('diez franjas de grupo alternando A y B, más cuartos, semis y final', () => {
    const grupos = p.franjas.filter((f) => f.etapa === 'group');
    expect(grupos).toHaveLength(10);
    expect(grupos.map((f) => `${f.grupo}${f.ronda}`)).toEqual([
      'A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4', 'B4', 'A5', 'B5',
    ]);
    expect(p.franjas.slice(-3).map((f) => f.etapa)).toEqual(['quarter', 'semi', 'final']);
  });

  it('las horas cuadran con el reloj de pared', () => {
    expect(p.inicio).toBe('12:00');
    expect(p.franjas[0]).toMatchObject({ desde: '12:00', hasta: '12:30' });
    expect(p.finDeGrupos).toBe('17:00');
    expect(p.fin).toBe('18:45');
    expect(p.minutosTotales).toBe(405); // 10×30 de grupos + 30 + 30 + 45
  });

  it('el reloj del jugador y el del torneo no son el mismo', () => {
    // Juega 2 h 30 y está en el club casi el doble, porque alterna con el otro grupo.
    expect(p.minutosJugando).toBe(150);
    expect(p.minutosJugandoFinalista).toBe(255);
    expect(p.minutosTotales).toBeGreaterThan(p.minutosJugando * 2);
  });

  it('cabe, pero al límite: solo sobran 15 minutos y el colchón pedido son 30', () => {
    expect(p.holguraMinutos).toBe(15);
    expect(p.zona).toBe('limite');
    expect(p.avisos.join(' ')).toMatch(/Solo sobran 15 minutos/);
  });

  it('avisa de que al ritmo real se pasa de la hora de cierre', () => {
    expect(p.finRealista).toBe(formatHora(12 * 60 + Math.round(405 * FACTOR_RETRASO)));
    expect(p.avisos.join(' ')).toMatch(/al ritmo real/);
  });

  it('y dice cuántos partidos por pareja SÍ caben con margen', () => {
    expect(p.partidosMaximosQueCaben).toBe(4);
  });
});

describe('abriendo una hora antes sí entran los 5 partidos', () => {
  const p = planificarExpres({ cupo: 16, canchas: 4, ventana: { desde: '11:00', hasta: '19:00' } });

  it('cabe con colchón', () => {
    expect(p.holguraMinutos).toBe(75);
    expect(p.partidosMaximosQueCaben).toBe(5);
    expect(p.zona).not.toBe('no_cabe');
  });
});

describe('el tiempo depende de K y de las canchas, NO del cupo', () => {
  it('12 y 24 parejas duran exactamente lo mismo si hay canchas', () => {
    const doce = planificarExpres({ cupo: 12, canchas: 6, ventana: tarde });
    const veinticuatro = planificarExpres({ cupo: 24, canchas: 6, ventana: tarde });
    expect(doce.minutosTotales).toBe(veinticuatro.minutosTotales);
    expect(doce.fin).toBe(veinticuatro.fin);
  });

  it('lo que cambia con el cupo es cuántas canchas hacen falta', () => {
    expect(planificarExpres({ cupo: 12, canchas: 6, ventana: tarde }).canchasNecesarias).toBe(3);
    expect(planificarExpres({ cupo: 24, canchas: 6, ventana: tarde }).canchasNecesarias).toBe(6);
  });

  it('con menos canchas la ronda se parte en tandas y la tarde se multiplica', () => {
    const conPocas = planificarExpres({ cupo: 24, canchas: 4, ventana: tarde });
    expect(conPocas.franjas.filter((f) => f.etapa === 'group').every((f) => f.tandas === 2)).toBe(true);
    expect(conPocas.zona).toBe('no_cabe');
    expect(conPocas.avisos.join(' ')).toMatch(/se parte en 2 tandas/);
    expect(conPocas.avisos.join(' ')).toMatch(/Harían falta 6/);
  });
});

describe('grupos desiguales', () => {
  it('cupo 14 son 8+6 y aun así los dos juegan 5 rondas: la alternancia no se rompe', () => {
    const p = planificarExpres({ cupo: 14, canchas: 4, ventana: tarde });
    expect(p.tamanoGrupos).toEqual({ A: 8, B: 6 });
    const grupos = p.franjas.filter((f) => f.etapa === 'group');
    expect(grupos.filter((f) => f.grupo === 'A')).toHaveLength(5);
    expect(grupos.filter((f) => f.grupo === 'B')).toHaveLength(5);
    expect(grupos.every((f) => f.tandas === 1)).toBe(true);
  });
});

describe('la zona usa los mismos umbrales que el planificador largo', () => {
  it.each([
    ['09:00', 'comodo'],
    ['10:00', 'ajustado'],
    ['12:00', 'limite'],
  ])('abriendo a las %s la tarde queda %s', (desde, esperada) => {
    const p = planificarExpres({ cupo: 16, canchas: 4, ventana: { desde, hasta: '19:00' } });
    expect(p.zona).toBe(esperada);
  });

  it('una tarde corta no cabe, y dice cuántos minutos faltan', () => {
    const p = planificarExpres({ cupo: 16, canchas: 4, ventana: { desde: '15:00', hasta: '19:00' } });
    expect(p.zona).toBe('no_cabe');
    expect(p.avisos.join(' ')).toMatch(/faltan 165 minutos/);
    expect(p.partidosMaximosQueCaben).toBe(1);
  });
});

describe('determinismo y horas', () => {
  it('misma entrada, mismo horario', () => {
    const a = planificarExpres({ cupo: 16, canchas: 4, ventana: tarde });
    const b = planificarExpres({ cupo: 16, canchas: 4, ventana: tarde });
    expect(a).toEqual(b);
  });

  it('no depende del reloj del sistema', () => {
    const spy = jest.spyOn(Date, 'now');
    planificarExpres({ cupo: 16, canchas: 4, ventana: tarde });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('parseHora y formatHora son inversas', () => {
    for (const h of ['00:00', '09:05', '12:00', '19:30', '23:59']) {
      expect(formatHora(parseHora(h))).toBe(h);
    }
  });

  it('formatHora sigue contando pasada la medianoche', () => {
    expect(formatHora(24 * 60 + 15)).toBe('00:15');
  });
});

describe('lo que rechaza', () => {
  it('un cupo impar o pequeño', () => {
    expect(() => planificarExpres({ cupo: 13, canchas: 4, ventana: tarde })).toThrow(/PAR y de 12/);
    expect(() => planificarExpres({ cupo: 10, canchas: 4, ventana: tarde })).toThrow(/PAR y de 12/);
  });

  it('una ventana al revés', () => {
    expect(() =>
      planificarExpres({ cupo: 16, canchas: 4, ventana: { desde: '19:00', hasta: '12:00' } }),
    ).toThrow(/no tiene duración/);
  });

  it('una hora mal escrita, diciendo el formato', () => {
    expect(() =>
      planificarExpres({ cupo: 16, canchas: 4, ventana: { desde: '12.00', hasta: '19:00' } }),
    ).toThrow(/'HH:MM' en 24 horas/);
    expect(() =>
      planificarExpres({ cupo: 16, canchas: 4, ventana: { desde: '25:00', hasta: '26:00' } }),
    ).toThrow(/'HH:MM' en 24 horas/);
  });

  it('cero canchas', () => {
    expect(() => planificarExpres({ cupo: 16, canchas: 0, ventana: tarde })).toThrow(/canchas.*>= 1/);
  });

  it('más partidos por pareja que rivales en el grupo pequeño', () => {
    expect(() =>
      planificarExpres({ cupo: 12, canchas: 4, ventana: tarde, partidosPorPareja: 6 }),
    ).toThrow(/solo hay 5 rivales distintos/);
  });
});

describe('constantes', () => {
  it('el estándar es 30 de grupo y 45 de final', () => {
    expect(MINUTOS_ESTANDAR).toEqual({ group: 30, quarter: 30, semi: 30, final: 45 });
  });

  it('el margen de cierre es menor que el del torneo largo, y no es cero', () => {
    expect(MARGEN_CIERRE_EXPRES).toBe(30);
    expect(MARGEN_CIERRE_EXPRES).toBeLessThan(60);
  });
});
