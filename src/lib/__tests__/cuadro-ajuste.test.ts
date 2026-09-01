import { situacionDeCuadro } from '@/lib/cuadro-ajuste';

describe('situacionDeCuadro — las tres situaciones', () => {
  it('sin cuadro sembrado, cambio libre', () => {
    expect(situacionDeCuadro(0, 0)).toBe('libre');
  });

  it('cuadro sembrado sin resultados: se permite, resembrando', () => {
    expect(situacionDeCuadro(15, 0)).toBe('resembrar');
  });

  it('un solo resultado capturado ya bloquea', () => {
    // Uno basta: ese partido lo jugaron dos parejas de verdad.
    expect(situacionDeCuadro(15, 1)).toBe('bloqueada');
  });

  it('el resultado manda sobre el conteo de partidos', () => {
    expect(situacionDeCuadro(1, 1)).toBe('bloqueada');
  });
});
