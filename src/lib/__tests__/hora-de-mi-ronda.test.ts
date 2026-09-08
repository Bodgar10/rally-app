import { certezaDeRonda, cuandoJuegas, contraQuien } from '@/lib/hora-de-mi-ronda';
import { rondaSiguiente, STAGE_DE_RONDA, RONDA_QUE_JUEGAS, cuadroDe } from '@/lib/cuadro-tamano';

/** Escritura fija, para no probar el formateador de fechas aquí. */
const escribir = (iso: string) => ({
  '2026-09-13T16:00:00-06:00': 'dom 13, 16:00',
  '2026-09-13T18:00:00-06:00': 'dom 13, 18:00',
}[iso] ?? iso);

const H = '2026-09-13T16:00:00-06:00';
const H2 = '2026-09-13T18:00:00-06:00';

// EL CASO REAL: 3ª Mixto, bye a semifinales, y en match_schedule las dos
// semis a las 16:00 del domingo en canchas 1 y 2. Su hora SÍ se sabía.
describe('los tres niveles de lo que se puede afirmar', () => {
  // 1 · UN SOLO HUECO → hora y cancha.
  it('un hueco: hora y cancha', () => {
    const c = certezaDeRonda([{ scheduledAt: H, courtLabel: 'Cancha 1' }]);
    expect(c).toEqual({ nivel: 'hora-y-cancha', cuando: H, cancha: 'Cancha 1' });
    expect(cuandoJuegas(c, 'las semifinales', escribir))
      .toBe('Juegas las semifinales el dom 13, 16:00 en la Cancha 1.');
  });

  // 2 · EL CASO DE EDUARDO: dos huecos a la MISMA hora.
  it('varios a la misma hora: la hora es cierta, la cancha no', () => {
    const c = certezaDeRonda([
      { scheduledAt: H, courtLabel: 'Cancha 1' },
      { scheduledAt: H, courtLabel: 'Cancha 2' },
    ]);
    expect(c).toEqual({ nivel: 'solo-hora', cuando: H });
    expect(cuandoJuegas(c, 'las semifinales', escribir))
      .toBe('Juegas las semifinales el dom 13, 16:00. La cancha se sabrá al armarse el cruce.');
  });

  it('y ya no dice "todavía sin hora"', () => {
    const c = certezaDeRonda([
      { scheduledAt: H, courtLabel: 'Cancha 1' },
      { scheduledAt: H, courtLabel: 'Cancha 2' },
    ]);
    expect(cuandoJuegas(c, 'las semifinales', escribir)).toMatch(/16:00/);
    expect(cuandoJuegas(c, 'las semifinales', escribir)).not.toMatch(/sin hora/i);
  });

  // 3 · A HORAS DISTINTAS → solo el rango.
  it('a horas distintas: el rango', () => {
    const c = certezaDeRonda([
      { scheduledAt: H2, courtLabel: 'Cancha 2' },
      { scheduledAt: H, courtLabel: 'Cancha 1' },
    ]);
    expect(c).toEqual({ nivel: 'rango', desde: H, hasta: H2 });
    expect(cuandoJuegas(c, 'los cuartos de final', escribir))
      .toBe('Los cuartos de final: entre dom 13, 16:00 y dom 13, 18:00. Tu hora exacta se sabrá al armarse el cruce.');
  });

  // Sin plan no se afirma nada: es donde el mensaje viejo sí era correcto.
  it('sin plan para esa ronda, nada', () => {
    expect(certezaDeRonda([])).toEqual({ nivel: 'nada' });
    expect(cuandoJuegas({ nivel: 'nada' }, 'las semifinales', escribir)).toBeNull();
  });

  // Una fila del plan sin hora no sostiene nada, y sobre todo no debe degradar
  // una respuesta que ya era cierta.
  it('los huecos sin hora se descartan, no cuentan', () => {
    const c = certezaDeRonda([
      { scheduledAt: H, courtLabel: 'Cancha 1' },
      { scheduledAt: null, courtLabel: 'Cancha 2' },
    ]);
    expect(c).toEqual({ nivel: 'hora-y-cancha', cuando: H, cancha: 'Cancha 1' });
  });

  it('un hueco sin cancha cae a solo hora', () => {
    expect(certezaDeRonda([{ scheduledAt: H, courtLabel: null }]))
      .toEqual({ nivel: 'solo-hora', cuando: H });
  });
});

describe('contra quién es otra pregunta', () => {
  it('se dice aparte, y no contamina la hora', () => {
    expect(contraQuien(1)).toBe('Contra quién todavía no: falta 1 grupo por terminar.');
    expect(contraQuien(3)).toBe('Contra quién todavía no: faltan 3 grupos por terminar.');
    expect(contraQuien(0)).toBe('Contra quién se sabrá al armarse el cuadro.');
  });

  it('nunca menciona la hora', () => {
    for (const n of [0, 1, 5]) expect(contraQuien(n)).not.toMatch(/\d{1,2}:\d{2}/);
  });
});

// SIN GARANTÍA NO SE SABE EN QUÉ RONDA ENTRA, y cualquier hora sería inventada.
describe('la ronda a la que entra quien tiene bye', () => {
  it('es la siguiente a la que arranca el cuadro', () => {
    // 3ª Mixto: 3 grupos, pasa 1, 1 repescado → 4 clasificados, cuadro de 4,
    // arranca en semis… con 0 byes. Con 3 clasificados sí hay bye.
    const c = cuadroDe(3, 1, 0);
    expect(c.bracketSize).toBe(4);
    expect(c.ronda).toBe('semi');
    expect(c.byes).toBe(1);
    expect(rondaSiguiente('quarter')).toBe('semi');
    expect(rondaSiguiente('r16')).toBe('quarter');
  });

  it('la final no tiene siguiente', () => {
    expect(rondaSiguiente('final')).toBeNull();
  });

  // Dos vocabularios: el motor dice 'r16', la base 'round_of_16'.
  it('el stage de la base sale de un solo sitio', () => {
    expect(STAGE_DE_RONDA.r16).toBe('round_of_16');
    expect(STAGE_DE_RONDA.semi).toBe('semi');
    expect(STAGE_DE_RONDA.quarter).toBe('quarter');
  });
});

// "Final directa" nombra la FORMA del cuadro, no la ronda que se juega: en una
// frase de jugador salía "Juegas final directa el domingo".
describe('la ronda se nombra como se juega', () => {
  it('con su artículo, y sin el nombre del formato', () => {
    expect(RONDA_QUE_JUEGAS.final).toBe('la final');
    expect(RONDA_QUE_JUEGAS.semi).toBe('las semifinales');
    expect(RONDA_QUE_JUEGAS.final).not.toMatch(/directa/);
  });

  it('la frase del rango no obliga a concordar el verbo', () => {
    const c = { nivel: 'rango' as const, desde: H, hasta: H2 };
    for (const r of [RONDA_QUE_JUEGAS.final, RONDA_QUE_JUEGAS.semi]) {
      expect(cuandoJuegas(c, r, escribir)).not.toMatch(/se juegan?\b/);
    }
  });
});
