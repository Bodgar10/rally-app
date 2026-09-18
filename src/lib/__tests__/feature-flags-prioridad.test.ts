// src/lib/__tests__/feature-flags-prioridad.test.ts
import { isPrioridadInscripcionOn } from '@/lib/feature-flags';

describe('prioridad de inscripción', () => {
  const original = process.env.EXPO_PUBLIC_PRIORIDAD_INSCRIPCION;
  afterEach(() => {
    process.env.EXPO_PUBLIC_PRIORIDAD_INSCRIPCION = original;
  });

  it('VIENE APAGADA, y eso es la decisión, no un olvido', () => {
    // Solo vale algo si hay fila de espera. Hoy los torneos tardan en
    // llenarse: la ventana no le quitaría el sitio a nadie y sí molestaría a
    // quien llega a inscribirse y se encuentra la puerta cerrada.
    delete process.env.EXPO_PUBLIC_PRIORIDAD_INSCRIPCION;
    expect(isPrioridadInscripcionOn()).toBe(false);
  });

  it('solo el literal "true" la enciende', () => {
    process.env.EXPO_PUBLIC_PRIORIDAD_INSCRIPCION = 'true';
    expect(isPrioridadInscripcionOn()).toBe(true);
  });

  it.each(['1', 'sí', 'TRUE', 'yes', ''])('"%s" NO la enciende', (v) => {
    // Un flag que se enciende con cualquier cosa parecida a un sí se enciende
    // solo el día que alguien exporta la variable por otro motivo.
    process.env.EXPO_PUBLIC_PRIORIDAD_INSCRIPCION = v;
    expect(isPrioridadInscripcionOn()).toBe(false);
  });
});
