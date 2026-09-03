// El vocabulario de las dos fases, compartido por tres pantallas.
//
// Se prueba poco a propósito: lo que importa no es la lógica —es trivial— sino
// que exista UN sitio donde se decide cómo se llaman las fases. La misma idea
// escrita tres veces se desincroniza a la primera.

import {
  faseDeStage, pestanasDeFase, faseInicial, ETIQUETA_FASE,
} from '@/lib/fase-torneo';

describe('a qué fase pertenece un partido', () => {
  it('group es la fase de grupos; cualquier ronda del cuadro, eliminatorias', () => {
    expect(faseDeStage('group')).toBe('grupos');
    for (const s of ['round_of_32', 'round_of_16', 'quarter', 'semi', 'final', 'third_place']) {
      expect(faseDeStage(s)).toBe('eliminatorias');
    }
  });
});

describe('las pestañas', () => {
  it('con las dos fases, dos pestañas y en orden de torneo', () => {
    expect(pestanasDeFase(true, true).map((p) => p.id)).toEqual(['grupos', 'eliminatorias']);
  });

  // Una sola pestaña no es una pestaña: sería un control que no controla nada.
  it('con una sola fase no hay selector', () => {
    expect(pestanasDeFase(true, false)).toEqual([]);   // round robin
    expect(pestanasDeFase(false, true)).toEqual([]);   // solo cuadro
  });

  it('abre en grupos cuando los hay, porque es el orden en que se juega', () => {
    expect(faseInicial(true)).toBe('grupos');
    expect(faseInicial(false)).toBe('eliminatorias');
  });
});

describe('el vocabulario', () => {
  // El riesgo real: que una pantalla diga "Cuadro" y otra "Eliminatorias" y el
  // jugador crea que son cosas distintas.
  it('hay un solo nombre por fase', () => {
    expect(ETIQUETA_FASE.grupos).toBe('Fase de grupos');
    expect(ETIQUETA_FASE.eliminatorias).toBe('Eliminatorias');
  });
});
