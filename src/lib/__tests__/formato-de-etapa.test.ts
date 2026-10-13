// Cómo se juega cada etapa de un torneo largo.
//
// Padel Hype juega sus grupos a un set con punto de oro, el cuadro igual y la
// final a dos de tres. Hasta ahora un torneo largo solo sabía jugarse al mejor
// de 3 en todo.

import {
  OPCIONES_DE_ETAPA, textoDeFormatoDeEtapa, resumenDeEtapas,
  minutosSugeridos, avisoDeDuracion,
} from '@/lib/formato-de-etapa';

describe('las opciones que se ofrecen', () => {
  it('la primera es la de siempre: elegir, no dejar en blanco', () => {
    expect(OPCIONES_DE_ETAPA[0].valor).toBeNull();
  });

  // No tiene ganador y su tabla va por saldo de games: es el motor del exprés.
  // La base también lo prohíbe (migración 092).
  it('suma 6 no está entre ellas', () => {
    expect(OPCIONES_DE_ETAPA.some((o) => o.valor === 'suma_6' as never)).toBe(false);
  });

  it('cada una se puede nombrar', () => {
    for (const o of OPCIONES_DE_ETAPA) {
      expect(textoDeFormatoDeEtapa(o.valor)).toBe(o.titulo);
    }
  });

  it('un valor desconocido cae a lo de siempre en vez de romper', () => {
    expect(textoDeFormatoDeEtapa('lo_que_sea' as never)).toBe('Mejor de 3 sets');
  });
});

describe('el resumen de las tres etapas', () => {
  // Tres etiquetas iguales obligan a compararlas para descubrir que son la
  // misma.
  it('se agrupa cuando las tres coinciden', () => {
    expect(resumenDeEtapas(null, null, null)).toBe('Mejor de 3 sets en todo el torneo');
    expect(resumenDeEtapas('set_oro', 'set_oro', 'set_oro'))
      .toBe('Un set en todo el torneo');
  });

  // EL DE PADEL HYPE.
  it('y cuando solo la final cambia, se dice así', () => {
    expect(resumenDeEtapas('set_oro', 'set_oro', 'dos_sets_oro'))
      .toBe('Un set hasta semifinales · final a dos de tres');
  });

  it('con las tres distintas se enumeran', () => {
    const r = resumenDeEtapas('set_oro', 'dos_sets_oro', null);
    expect(r).toContain('Grupos a un set');
    expect(r).toContain('cuadro a dos de tres');
    expect(r).toContain('final a mejor de 3 sets');
  });
});

// ───────────────────────────────────────────
// Los minutos dependen del formato
// ───────────────────────────────────────────
//
// "Normalmente cuando es un solo set son 30 minutos" — el organizador. Son dos
// campos independientes, así que nada impedía elegir un set y dejar 60: el
// planificador reservaría el doble de cancha y diría que no cabe.

describe('cuánto dura un partido según cómo se juegue', () => {
  it('un set, media hora', () => {
    expect(minutosSugeridos('set_oro')).toBe(30);
    expect(minutosSugeridos('set_star_point')).toBe(30);
  });

  it('dos de tres, una hora', () => {
    expect(minutosSugeridos(null)).toBe(60);
    expect(minutosSugeridos('dos_sets_oro')).toBe(60);
  });
});

describe('el aviso de la duración', () => {
  it('callado cuando cuadra', () => {
    expect(avisoDeDuracion('set_oro', 30)).toBeNull();
    expect(avisoDeDuracion(null, 60)).toBeNull();
  });

  // El caso que de verdad duele: reserva el doble de cancha y dice que no cabe
  // un torneo que cabe de sobra.
  it('con la duración de más dice lo que cuesta', () => {
    const a = avisoDeDuracion('set_oro', 60);
    expect(a).toContain('60');
    expect(a).toContain('30');
    expect(a).toMatch(/no cabe/i);
  });

  it('con la de menos avisa del retraso', () => {
    expect(avisoDeDuracion(null, 30)).toMatch(/retrasando/i);
  });

  it('sin duración capturada no se inventa un aviso', () => {
    expect(avisoDeDuracion('set_oro', null)).toBeNull();
  });
});
