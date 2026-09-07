// Lo que el jugador LEE del análisis del motor.
//
// `analizarFuturo` contesta con precisión y en su propio vocabulario: estados,
// carreras, peorPuestoPosible, plazas. Lo que se prueba aquí es la traducción —
// que es lo que alguien lee a las doce de la noche en el club.

import { futuroEnPalabras } from '@/lib/futuro-en-palabras';
import type { AnalisisFuturo, Carrera } from '@/lib/engine/futuro';

const carrera = (over: Partial<Carrera> = {}): Carrera => ({
  estado: 'dentro',
  puestoActual: { mejor: 1, peor: 1 },
  porDelanteSeguros: 0,
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
    // El titular es la noticia y no lleva condiciones.
    expect(f.titular).toMatch(/ya clasificaste/i);
    // El número va detrás, como prueba.
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
    expect(f.titular).toMatch(/ya clasificaste/i);
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

  // Pocos rivales: los nombres son accionables — sabe quiénes son y puede
  // mirar sus partidos.
  it('hasta tres rivales se nombran', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({ estado: 'depende', dependeDeGamesContra: ['A / B', 'C / D', 'E / F'] }),
    }));
    expect(f.games).toContain('A / B, C / D y E / F');
  });

  // MUCHOS rivales: la lista es un volcado. Decirle a alguien que compite
  // contra dieciséis parejas es decirle que compite contra todo el mundo.
  it('a partir de cuatro se dice el número, no la lista', () => {
    const dieciseis = Array.from({ length: 16 }, (_, i) => `Pareja ${i + 1} / Otra ${i + 1}`);
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({ estado: 'depende', plazas: 6, peorPuestoPosible: 9, dependeDeGamesContra: dieciseis }),
    }));
    expect(f.games).toContain('16 parejas empatadas');
    // Ni un solo nombre.
    expect(f.games).not.toContain('Pareja 1');
    expect(f.games).not.toContain('Pareja 16');
    // Y sí lo que sustituye a la lista: cuántas plazas se reparten.
    expect(f.games).toMatch(/6 puestos de mejor segundo/i);
  });

  it('el corte está en cuatro', () => {
    const con = (n: number) => futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({ estado: 'depende', dependeDeGamesContra: Array.from({ length: n }, (_, i) => `P${i}`) }),
    })).games!;
    expect(con(3)).toContain('P0');
    expect(con(4)).not.toContain('P0');
    expect(con(4)).toContain('4 parejas empatadas');
  });

  // La carrera del pase directo reparte otra cosa, y se llama por su nombre.
  it('la carrera del pase directo no habla de mejores segundos', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: undefined,
      bye: {
        ...carrera({ estado: 'depende', plazas: 4, peorPuestoPosible: 7, dependeDeGamesContra: ['A / B', 'C / D', 'E / F', 'G / H'] }),
        aplica: true, byesEnElCuadro: 4,
      },
    }));
    expect(f.games).toMatch(/4 pases directos/i);
    expect(f.games).not.toMatch(/mejor segundo/i);
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
    // Dentro, con el pase directo todavía sin resolver: el estado nuevo.
    analisis({
      estado: 'dentro', faltan: 27, respondoCuandoQueden: 13, repesca: undefined,
      bye: { ...carrera({ estado: 'demasiado_pronto', peorPuestoPosible: null }), aplica: true, byesEnElCuadro: 4 },
    }),
    // Y con el pase directo ya ganado.
    analisis({
      estado: 'dentro', repesca: undefined,
      bye: { ...carrera({ estado: 'dentro', peorPuestoPosible: 2, plazas: 4 }), aplica: true, byesEnElCuadro: 4 },
    }),
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

// ───────────────────────────────────────────
// Clasificado, pero el pase directo aún en el aire
// ───────────────────────────────────────────
//
// EL CASO DE ALDO: ganó sus dos partidos y va primero. Con advance_per_group 1
// el primero pasa siempre, así que ya clasificó — pero faltan 27 partidos para
// saber si además se salta octavos. Son dos preguntas con dos respuestas, y la
// pantalla decía "todavía es pronto para saberlo" a alguien que ya estaba dentro.

describe('dentro, con el pase directo todavía sin resolver', () => {
  const aldo = () => analisis({
    estado: 'dentro',
    posicionesPosiblesEnGrupo: [1],
    faltan: 27,
    respondoCuandoQueden: 13,
    // Primero de su grupo: NO está en la carrera de mejores segundos.
    repesca: undefined,
    bye: {
      ...carrera({ estado: 'demasiado_pronto', peorPuestoPosible: null, plazas: 4 }),
      aplica: true,
      byesEnElCuadro: 4,
    },
  });

  it('dice PRIMERO que ya clasificó', () => {
    const f = futuroEnPalabras(aldo(), 'octavos');
    expect(f.titular).toMatch(/ya clasificaste/i);
    // Sin condiciones ni peros en el titular.
    expect(f.titular).not.toMatch(/pronto|todavía|depende|si /i);
    expect(f.tono).toBe('tranquilo');
  });

  it('y DESPUÉS el matiz del pase directo, con sus dos números', () => {
    const f = futuroEnPalabras(aldo(), 'octavos');
    expect(f.detalle).toMatch(/todavía no se sabe si te saltas octavos/i);
    expect(f.detalle).toContain('27');
    expect(f.detalle).toContain('13');
  });

  it('la certeza va antes que lo pendiente', () => {
    const f = futuroEnPalabras(aldo(), 'octavos')!;
    const certeza = f.detalle!.search(/dejarte fuera|descansar/i);
    const pendiente = f.detalle!.search(/todavía no se sabe/i);
    expect(certeza).toBeGreaterThanOrEqual(0);
    expect(pendiente).toBeGreaterThan(certeza);
  });

  // Ya no es una carrera suya: no se menciona ni se pintan sus partidos.
  it('sin repesca no se habla de mejores segundos ni se pinta lista', () => {
    const f = futuroEnPalabras(aldo(), 'octavos');
    expect(f.detalle).not.toMatch(/mejor segundo/i);
    expect(f.partidos).toEqual([]);
    expect(f.games).toBeNull();
  });

  it('con el pase directo YA ganado, dice que se salta la ronda', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'dentro',
      repesca: undefined,
      bye: { ...carrera({ estado: 'dentro', peorPuestoPosible: 2, plazas: 4 }), aplica: true, byesEnElCuadro: 4 },
    }), 'octavos');
    expect(f.titular).toMatch(/ya clasificaste/i);
    expect(f.detalle).toMatch(/te saltas octavos/i);
    expect(f.detalle).not.toMatch(/todavía no se sabe/i);
  });

  it('un pase directo que no le aplica no se menciona', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'dentro',
      bye: { ...carrera({ estado: 'demasiado_pronto', peorPuestoPosible: null }), aplica: false, byesEnElCuadro: 0 },
    }), 'octavos');
    expect(f.detalle).not.toMatch(/saltas|pase directo/i);
  });
});

// ───────────────────────────────────────────
// Se lee en México
// ───────────────────────────────────────────
//
// "os separa la diferencia de games" es español de España. El barrido va sobre
// TODOS los estados y sobre todo el texto que sale a pantalla, igual que el de
// vocabulario de motor: una forma peninsular se cuela en la frase que alguien
// añade dentro de seis meses, no en la que se revisa hoy.

describe('el texto está en español de México', () => {
  const conListas: AnalisisFuturo[] = [
    analisis({ estado: 'dentro', repesca: carrera() }),
    analisis({ estado: 'fuera' }),
    analisis({
      estado: 'depende',
      repesca: carrera({
        estado: 'depende', plazas: 6, peorPuestoPosible: 9,
        partidosQueImportan: [{ matchId: 'm', grupo: 'A', parejaA: 'A / B', parejaB: 'C / D', meConviene: 'A / B' }],
        dependeDeGamesContra: ['E / F'],
      }),
    }),
    // Con muchos empatados, que es donde vivía el "os separa".
    analisis({
      estado: 'depende',
      repesca: carrera({
        estado: 'depende', plazas: 6, peorPuestoPosible: 9,
        dependeDeGamesContra: Array.from({ length: 16 }, (_, i) => `P${i} / Q${i}`),
      }),
    }),
    analisis({ estado: 'empate_sin_resolver' }),
    analisis({ estado: 'demasiado_pronto', faltan: 20, respondoCuandoQueden: 10 }),
    analisis({
      estado: 'dentro', faltan: 27, respondoCuandoQueden: 13, repesca: undefined,
      bye: { ...carrera({ estado: 'demasiado_pronto', peorPuestoPosible: null }), aplica: true, byesEnElCuadro: 4 },
    }),
    analisis({
      estado: 'dentro', repesca: undefined,
      bye: { ...carrera({ estado: 'dentro', peorPuestoPosible: 2, plazas: 4 }), aplica: true, byesEnElCuadro: 4 },
    }),
  ];

  it('sin voseo peninsular en ningún estado', () => {
    for (const a of conListas) {
      const f = futuroEnPalabras(a, 'octavos');
      const texto = [
        f.titular, f.detalle ?? '', f.games ?? '',
        ...f.partidos.flatMap((p) => [p.partido, p.grupo, p.meConviene ?? '']),
      ].join(' ');

      // "os separa", "os toca", "os queda"…
      expect(texto).not.toMatch(/\bos\s+[a-záéíóúñ]+/i);
      expect(texto).not.toMatch(/\bvosotros\b|\bvuestr[oa]s?\b/i);
      // Segunda persona del plural: tenéis, podéis, jugáis, seréis, sois.
      expect(texto).not.toMatch(/[a-záéíóúñ]+(áis|éis|ís)\b/i);
      expect(texto).not.toMatch(/\bsois\b|\bhabéis\b/i);
    }
  });
});
// ───────────────────────────────────────────
// Dónde va en la pelea
// ───────────────────────────────────────────
//
// La tarjeta listaba dieciséis nombres. Lo que el jugador necesita es su
// posición: dónde va, por cuántas plazas se pelea, quién ya no está a su
// alcance y con quién se juega la diferencia de games.

describe('el puesto en la pelea', () => {
  const conCarrera = (over: Partial<Carrera>) => futuroEnPalabras(analisis({
    estado: 'depende',
    repesca: carrera({ estado: 'depende', ...over }),
  })).games!;

  // Sin empates a puntos hay un puesto limpio y se dice a secas.
  it('mejor === peor da un puesto', () => {
    const t = conCarrera({ puestoActual: { mejor: 3, peor: 3 }, plazas: 6 });
    expect(t).toContain('Vas 3.º');
    expect(t).not.toMatch(/entre/i);
    expect(t).toContain('6 puestos de mejor segundo');
  });

  // Con empates no existe un puesto limpio: el rango es exactamente lo que se
  // sabe, y redondearlo a un extremo sería prometer o asustar de más.
  it('mejor ≠ peor da un rango', () => {
    const t = conCarrera({ puestoActual: { mejor: 1, peor: 6 }, plazas: 6 });
    expect(t).toContain('Vas entre 1.º y 6.º');
  });

  it('el caso de Sergio, entero', () => {
    const t = conCarrera({
      puestoActual: { mejor: 1, peor: 6 },
      porDelanteSeguros: 3,
      plazas: 6,
      dependeDeGamesContra: Array.from({ length: 10 }, (_, i) => `P${i} / Q${i}`),
    });
    expect(t).toContain('Vas entre 1.º y 6.º en la pelea por 6 puestos de mejor segundo.');
    expect(t).toContain('Hay 3 parejas por delante que ya no puedes alcanzar.');
    expect(t).toContain('Otras 10 están empatadas contigo a puntos');
    // Ni un nombre: son diez.
    expect(t).not.toContain('P0');
  });

  // `null` = no se enumeró la categoría. El puesto sí se sabe; lo inalcanzable
  // no, así que esa parte se calla en vez de inventarse un cero.
  it('porDelanteSeguros null se calla esa parte', () => {
    const t = conCarrera({ puestoActual: { mejor: 2, peor: 4 }, porDelanteSeguros: null });
    expect(t).toContain('Vas entre 2.º y 4.º');
    expect(t).not.toMatch(/alcanzar|alcance/i);
  });

  // Cero es la única buena noticia de la tarjeta: no se desperdicia omitiéndola.
  it('porDelanteSeguros 0 se dice en positivo', () => {
    const t = conCarrera({ puestoActual: { mejor: 1, peor: 5 }, porDelanteSeguros: 0 });
    expect(t).toMatch(/nadie está fuera de tu alcance/i);
    expect(t).not.toMatch(/0 parejas|ya no puedes alcanzar/i);
  });

  it('una sola pareja por delante va en singular', () => {
    expect(conCarrera({ porDelanteSeguros: 1 })).toContain('Hay 1 pareja por delante');
  });

  // Sin puesto —empate que el reglamento no resuelve— al menos se dice qué se
  // reparte, en vez de callar la frase entera.
  it('sin puesto, todavía se dice qué se reparte', () => {
    const t = conCarrera({ puestoActual: null, plazas: 6, porDelanteSeguros: null });
    expect(t).toContain('Se reparten 6 puestos de mejor segundo');
    expect(t).not.toMatch(/vas /i);
  });

  // El orden es la prioridad: primero la respuesta, después lo demás.
  it('el puesto va antes que todo lo demás', () => {
    const t = conCarrera({
      puestoActual: { mejor: 1, peor: 6 }, porDelanteSeguros: 3,
      dependeDeGamesContra: ['A / B', 'C / D', 'E / F', 'G / H'],
    });
    expect(t.indexOf('Vas entre')).toBe(0);
    expect(t.indexOf('ya no puedes alcanzar')).toBeLessThan(t.indexOf('empatadas contigo'));
  });
});
