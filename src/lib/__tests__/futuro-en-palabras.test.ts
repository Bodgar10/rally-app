// Lo que el jugador LEE del análisis del motor.
//
// `analizarFuturo` contesta con precisión y en su propio vocabulario: estados,
// carreras, peorPuestoPosible, plazas. Lo que se prueba aquí es la traducción —
// que es lo que alguien lee a las doce de la noche en el club.

import { futuroEnPalabras } from '@/lib/futuro-en-palabras';
import type { AnalisisFuturo, Carrera } from '@/lib/engine/futuro';

const carrera = (over: Partial<Carrera> = {}): Carrera => ({
  estado: 'dentro',
  peorPuestoPosible: 6,
  plazas: 6,
  partidosQueImportan: [],
  dependeDeGamesContra: [],
  ...over,
});

const analisis = (over: Partial<AnalisisFuturo> = {}): AnalisisFuturo => ({
  estado: 'dentro',
  posicionesPosiblesEnGrupo: [2],
  faltan: 4,
  ...over,
});

describe('la frase que resuelve la noche del sábado', () => {
  // peorPuestoPosible <= plazas: ya no hay nada que pueda dejarle fuera.
  it('cuando ya no puede quedar fuera, lo dice y le manda a descansar', () => {
    const f = futuroEnPalabras(analisis({ estado: 'dentro', repesca: carrera() }));
    expect(f.titular).toMatch(/pase lo que pase/i);
    expect(f.detalle).toMatch(/sexto mejor segundo/i);
    expect(f.detalle).toMatch(/descansar/i);
    expect(f.tono).toBe('tranquilo');
    // Nada que vigilar: no se listan partidos.
    expect(f.partidos).toEqual([]);
  });

  it('si además se salta una ronda, lo dice con su nombre', () => {
    const f = futuroEnPalabras(
      analisis({
        estado: 'dentro',
        repesca: carrera(),
        bye: { ...carrera({ peorPuestoPosible: 2, plazas: 4 }), aplica: true, byesEnElCuadro: 4 },
      }),
      'octavos',
    );
    expect(f.detalle).toMatch(/te saltas octavos/i);
  });

  it('un bye que NO está ganado no se anuncia', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'dentro',
      repesca: carrera(),
      bye: { ...carrera({ estado: 'depende', peorPuestoPosible: 9, plazas: 4 }), aplica: true, byesEnElCuadro: 4 },
    }), 'octavos');
    expect(f.detalle).not.toMatch(/te saltas/i);
  });

  // Sin peor puesto conocido el motor no pudo enumerar: no se afirma de más.
  it('sin peor puesto no se inventa la prueba', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'dentro', repesca: carrera({ peorPuestoPosible: null }),
    }));
    expect(f.titular).toMatch(/pase lo que pase/i);
    expect(f.detalle).not.toMatch(/mejor segundo/i);
  });
});

describe('cuando depende', () => {
  it('lista los partidos con quién juega, en qué grupo y qué le conviene', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({
        estado: 'depende', peorPuestoPosible: 8, plazas: 6,
        partidosQueImportan: [
          { matchId: 'm1', grupo: 'C', parejaA: 'Luis / Pedro', parejaB: 'Sofía / Regina', meConviene: 'Luis / Pedro' },
          { matchId: 'm2', grupo: 'D', parejaA: 'Ana / María', parejaB: 'Eva / Sara', meConviene: null },
        ],
      }),
    }));

    expect(f.titular).toMatch(/depende de 2 partidos/i);
    expect(f.partidos).toHaveLength(2);
    expect(f.partidos[0].partido).toBe('Luis / Pedro vs Sofía / Regina');
    expect(f.partidos[0].grupo).toBe('Grupo C');
    expect(f.partidos[0].meConviene).toMatch(/gane Luis \/ Pedro/);
    // `meConviene: null` no se calla: un partido listado sin nada al lado
    // parece un dato a medias.
    expect(f.partidos[1].meConviene).toBeTruthy();
  });

  it('con uno solo, la frase va en singular', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({
        estado: 'depende',
        partidosQueImportan: [
          { matchId: 'm1', grupo: 'A', parejaA: 'A / B', parejaB: 'C / D', meConviene: 'A / B' },
        ],
      }),
    }));
    expect(f.titular).toMatch(/depende de un partido/i);
  });

  // El motor no calcula probabilidades: aquí no se inventan.
  it('la diferencia de games se dice, sin porcentajes', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({ estado: 'depende', dependeDeGamesContra: ['Luis / Pedro'] }),
    }));
    expect(f.games).toMatch(/diferencia de games/i);
    expect(f.games).toContain('Luis / Pedro');
    expect(f.games).not.toMatch(/%|probab|posibilidad/i);
  });

  it('con varios rivales de games, se enumeran de forma legible', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({ estado: 'depende', dependeDeGamesContra: ['A / B', 'C / D', 'E / F'] }),
    }));
    expect(f.games).toContain('A / B, C / D y E / F');
  });
});

describe('los estados que no son ni dentro ni fuera', () => {
  it('demasiado pronto dice cuándo volver', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'demasiado_pronto', faltan: 23, respondoCuandoQueden: 13,
    }));
    expect(f.detalle).toContain('23');
    expect(f.detalle).toContain('13');
    expect(f.tono).toBe('espera');
  });

  it('un empate sin resolver no promete una posición', () => {
    const f = futuroEnPalabras(analisis({ estado: 'empate_sin_resolver' }));
    expect(f.detalle).toMatch(/sorteo del organizador/i);
    expect(`${f.titular} ${f.detalle}`).not.toMatch(/entras|clasificas|quedas \d/i);
  });

  it('fuera, con respeto y sin culpa', () => {
    const f = futuroEnPalabras(analisis({ estado: 'fuera' }));
    expect(f.tono).toBe('fuera');
    expect(`${f.titular} ${f.detalle}`).toMatch(/gracias/i);
    expect(`${f.titular} ${f.detalle}`).not.toMatch(/perdiste|fracas|lo sentimos/i);
  });
});

// El jugador no tiene por qué aprender cómo está hecho esto por dentro.
describe('nada de vocabulario de motor', () => {
  const todos: AnalisisFuturo[] = [
    analisis({ estado: 'dentro', repesca: carrera() }),
    analisis({ estado: 'fuera' }),
    analisis({
      estado: 'depende',
      repesca: carrera({
        estado: 'depende',
        partidosQueImportan: [{ matchId: 'm', grupo: 'A', parejaA: 'A / B', parejaB: 'C / D', meConviene: 'A / B' }],
        dependeDeGamesContra: ['E / F'],
      }),
    }),
    analisis({ estado: 'empate_sin_resolver' }),
    analisis({ estado: 'demasiado_pronto', faltan: 20, respondoCuandoQueden: 10 }),
  ];

  it('ni estados, ni carreras, ni clinch, ni repesca', () => {
    for (const a of todos) {
      const f = futuroEnPalabras(a, 'octavos');
      const texto = [
        f.titular, f.detalle ?? '', f.games ?? '',
        ...f.partidos.flatMap((p) => [p.partido, p.grupo, p.meConviene ?? '']),
      ].join(' ');

      expect(texto).not.toMatch(/clinch|repesca|repechage|carrera|bye\b/i);
      expect(texto).not.toMatch(/demasiado_pronto|empate_sin_resolver|peorPuestoPosible|plazas\b/i);
      expect(texto).not.toMatch(/analizarFuturo|advancePerGroup|bestExtra/i);
    }
  });

  it('siempre hay un titular legible', () => {
    for (const a of todos) {
      const f = futuroEnPalabras(a);
      expect(f.titular.length).toBeGreaterThan(10);
    }
  });
});
