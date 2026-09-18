// src/lib/__tests__/prioridad-inscripcion.test.ts
import { cuandoAbre, estadoDePrioridad, textoDePrioridad } from '@/lib/prioridad-inscripcion';

// Un viernes a mediodía.
const AHORA = new Date(2026, 8, 18, 12, 0, 0);
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3600000);

describe('quién puede inscribirse', () => {
  it('sin ventana, cualquiera', () => {
    const e = estadoDePrioridad(null, false, AHORA);
    expect(e.enVentana).toBe(false);
    expect(e.puedeInscribirse).toBe(true);
  });

  it('con la ventana ya pasada, cualquiera', () => {
    const e = estadoDePrioridad(enHoras(-1).toISOString(), false, AHORA);
    expect(e.enVentana).toBe(false);
    expect(e.puedeInscribirse).toBe(true);
  });

  it('dentro de la ventana, solo el suscriptor', () => {
    const iso = enHoras(24).toISOString();
    expect(estadoDePrioridad(iso, true, AHORA).puedeInscribirse).toBe(true);
    expect(estadoDePrioridad(iso, false, AHORA).puedeInscribirse).toBe(false);
  });

  it('UNA FECHA ILEGIBLE NO CIERRA NADA', () => {
    // Ante la duda, abierto: dejar fuera a alguien por un dato corrupto es
    // peor que dejar entrar a alguien antes de tiempo.
    const e = estadoDePrioridad('no es una fecha', false, AHORA);
    expect(e.puedeInscribirse).toBe(true);
    expect(e.enVentana).toBe(false);
  });
});

describe('cuándo abre, dicho como lo diría una persona', () => {
  it('hoy, mañana, o el día de la semana', () => {
    expect(cuandoAbre(new Date(2026, 8, 18, 18, 0), AHORA)).toBe('hoy a las 18:00');
    expect(cuandoAbre(new Date(2026, 8, 19, 9, 0), AHORA)).toBe('mañana a las 09:00');
    expect(cuandoAbre(new Date(2026, 8, 20, 18, 30), AHORA)).toBe('el domingo a las 18:30');
  });

  it('a más de una semana ya no sirve el día de la semana', () => {
    expect(cuandoAbre(new Date(2026, 9, 2, 10, 0), AHORA)).toBe('el 2/10 a las 10:00');
  });
});

describe('el aviso', () => {
  const dentro = (suscriptor: boolean) =>
    textoDePrioridad(
      estadoDePrioridad(new Date(2026, 8, 20, 18, 0).toISOString(), suscriptor, AHORA),
      suscriptor,
      AHORA,
    );

  it('al suscriptor le confirma lo que compró, mientras le sirve', () => {
    expect(dentro(true)).toBe(
      'Estás entrando antes que el resto: las inscripciones abren para todos el domingo a las 18:00.',
    );
  });

  it('al resto le da la hora exacta a la que podrá entrar', () => {
    expect(dentro(false)).toBe(
      'Ahora mismo solo pueden inscribirse los suscriptores. Abre para todos el domingo a las 18:00.',
    );
  });

  it('NO mete miedo: el cupo puede perfectamente no llenarse', () => {
    expect(dentro(false)).not.toMatch(/quedas fuera|últim|corre|apúrate|no pierdas/i);
  });

  it('calla cuando no hay ventana', () => {
    expect(textoDePrioridad(estadoDePrioridad(null, false, AHORA), false, AHORA)).toBeNull();
  });
});
