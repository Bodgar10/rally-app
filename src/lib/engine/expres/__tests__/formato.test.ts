// Cómo se juega cada partido de un exprés, en reglas de marcador.
//
// EL BUG: la captura del cuadro pedía DOS SETS y ofrecía un tercero. Un cuarto
// de exprés es UN SET — el juez tecleaba el 6-4 que lo cerraba y el botón de
// guardar seguía apagado pidiendo un segundo set que nadie iba a jugar.

import { scoreConfigDeFormato, esFormatoDeCuadro, setsDeEntrada } from '../formato';
import { validateScore, DEFAULT_SCORE_CONFIG } from '../../score';
import type { SetScore } from '../../types';

/** El torneo exprés nace con súper muerte a 10 escrita. */
const BASE = { ...DEFAULT_SCORE_CONFIG, deciderFormat: 'super' as const, superTiebreakTarget: 10 };

const set = (a: number, b: number): SetScore => ({ gamesA: a, gamesB: b });

describe('qué formatos se capturan con sets', () => {
  it('el cuadro sí; el suma 6 no', () => {
    expect(esFormatoDeCuadro('set_oro')).toBe(true);
    expect(esFormatoDeCuadro('set_star_point')).toBe(true);
    expect(esFormatoDeCuadro('dos_sets_oro')).toBe(true);
    expect(esFormatoDeCuadro('suma_6')).toBe(false);
  });

  // Un suma 6 no tiene ganador: validarlo con esto lo leería como un partido
  // normal, que es justo el error que este módulo evita.
  it('un suma 6 no tiene configuración de sets: revienta', () => {
    expect(() => scoreConfigDeFormato('suma_6', BASE)).toThrow(/suma 6/i);
  });
});

describe('cuartos y semis: un set y ya', () => {
  const cfg = scoreConfigDeFormato('set_oro', BASE);

  it('un solo set, y ese set se juega a 6 games', () => {
    expect(cfg.bestOf).toBe(1);
    expect(cfg.deciderFormat).toBe('full');
  });

  // EL CASO DEL BUG, tal cual.
  it('un 6-4 cierra el partido', () => {
    const r = validateScore([set(6, 4)], cfg);
    expect(r.valid).toBe(true);
    expect(r.completo).toBe(true);
    expect(r.winnerSide).toBe('A');
  });

  it('un 7-6 también, que es como acaba un set apretado', () => {
    const r = validateScore([set(6, 7)], cfg);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('B');
  });

  it('un 3-1 no cierra nada: el set sigue', () => {
    expect(validateScore([set(3, 1)], cfg).completo).toBe(false);
  });

  it('un segundo set sobra', () => {
    const r = validateScore([set(6, 4), set(6, 3)], cfg);
    expect(r.valid).toBe(false);
  });

  // El star point cambia cómo se resuelve el deuce, no el marcador.
  it('el star point se puntúa igual que el punto de oro', () => {
    expect(scoreConfigDeFormato('set_star_point', BASE))
      .toEqual(scoreConfigDeFormato('set_oro', BASE));
  });
});

describe('la final a dos sets', () => {
  const cfg = scoreConfigDeFormato('dos_sets_oro', BASE);

  it('mejor de tres', () => {
    expect(cfg.bestOf).toBe(3);
  });

  it('un set no la cierra', () => {
    expect(validateScore([set(6, 4)], cfg).completo).toBe(false);
  });

  it('dos sets sí', () => {
    const r = validateScore([set(6, 4), set(6, 3)], cfg);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('A');
  });

  // A cuántos puntos va la súper muerte lo dice el torneo, no este módulo.
  it('el decisivo se juega como diga el torneo', () => {
    expect(cfg.deciderFormat).toBe('super');
    expect(cfg.superTiebreakTarget).toBe(10);
    const r = validateScore([set(6, 4), set(3, 6), set(10, 8)], cfg);
    expect(r.valid).toBe(true);
    expect(r.winnerSide).toBe('A');
  });
});

describe('cuántas casillas pinta la captura', () => {
  it('una sola para un set de oro', () => {
    expect(setsDeEntrada(scoreConfigDeFormato('set_oro', BASE))).toBe(1);
  });

  it('dos para una serie al mejor de tres', () => {
    expect(setsDeEntrada(scoreConfigDeFormato('dos_sets_oro', BASE))).toBe(2);
  });
});
