// Lo que el jugador LEE del análisis del motor.
//
// `analizarFuturo` contesta con precisión y en su propio vocabulario: estados,
// carreras, peorPuestoPosible, plazas. Lo que se prueba aquí es la traducción —
// que es lo que alguien lee a las doce de la noche en el club.

import { futuroEnPalabras, comoSeClasifica } from '@/lib/futuro-en-palabras';
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

/** Todo lo que sale de la carrera, para las aserciones de texto. */
const textoDeCarrera = (f: { carrera: { cifras: Array<{ valor: string; etiqueta: string }>; notas: string[] } | null }) =>
  f.carrera
    ? [...f.carrera.cifras.map((c) => `${c.valor} ${c.etiqueta}`), ...f.carrera.notas].join(' ')
    : '';

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
    const t = textoDeCarrera(f);
    expect(t).toMatch(/diferencia de games/i);
    expect(t).toContain('Luis / Pedro');
    expect(t).not.toMatch(/%|probab|posibilidad/i);
  });

  // Pocos rivales: los nombres son accionables — sabe quiénes son y puede
  // mirar sus partidos.
  it('hasta tres rivales se nombran', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({ estado: 'depende', dependeDeGamesContra: ['A / B', 'C / D', 'E / F'] }),
    }));
    expect(textoDeCarrera(f)).toContain('A / B, C / D y E / F');
  });

  // MUCHOS rivales: la lista es un volcado. Decirle a alguien que compite
  // contra dieciséis parejas es decirle que compite contra todo el mundo.
  it('a partir de cuatro se dice el número, no la lista', () => {
    const dieciseis = Array.from({ length: 16 }, (_, i) => `Pareja ${i + 1} / Otra ${i + 1}`);
    const f = futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({ estado: 'depende', plazas: 6, peorPuestoPosible: 9, dependeDeGamesContra: dieciseis }),
    }));
    // La cifra va suelta, con su etiqueta — no dentro de una frase.
    expect(f.carrera!.cifras).toEqual(expect.arrayContaining([
      { valor: '16', etiqueta: 'empatadas' },
      { valor: '6', etiqueta: 'cupos' },
    ]));
    // Ni un solo nombre en ninguna parte.
    const t = textoDeCarrera(f);
    expect(t).not.toContain('Pareja 1');
    expect(t).not.toContain('Pareja 16');
  });

  it('el corte está en cuatro', () => {
    const con = (n: number) => textoDeCarrera(futuroEnPalabras(analisis({
      estado: 'depende',
      repesca: carrera({ estado: 'depende', dependeDeGamesContra: Array.from({ length: n }, (_, i) => `P${i}`) }),
    })));
    expect(con(3)).toContain('P0');
    expect(con(4)).not.toContain('P0');
    expect(con(4)).toContain('4 empatadas');
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
    const t = textoDeCarrera(f);
    expect(t).toMatch(/4 pases directos/i);
    expect(t).not.toMatch(/mejor segundo/i);
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
        f.titular, f.detalle ?? '', f.aviso ?? '', textoDeCarrera(f),
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
    expect(f.carrera).toBeNull();
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
        f.titular, f.detalle ?? '', f.aviso ?? '', textoDeCarrera(f),
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
  })).carrera!;

  // Sin empates a puntos hay un puesto limpio y se dice a secas.
  it('mejor === peor da un puesto', () => {
    const c = conCarrera({ puestoActual: { mejor: 3, peor: 3 }, plazas: 6 });
    expect(c.cifras).toContainEqual({ valor: '3.º', etiqueta: 'tu posición' });
    expect(c.cifras).toContainEqual({ valor: '6', etiqueta: 'cupos' });
  });

  // Con empates no existe un puesto limpio: el rango es exactamente lo que se
  // sabe, y redondearlo a un extremo sería prometer o asustar de más.
  it('mejor ≠ peor da un rango', () => {
    const c = conCarrera({ puestoActual: { mejor: 1, peor: 6 }, plazas: 6 });
    expect(c.cifras).toContainEqual({ valor: '1.º–6.º', etiqueta: 'tu posición' });
  });

  it('el caso de Sergio, entero', () => {
    const c = conCarrera({
      puestoActual: { mejor: 1, peor: 6 },
      porDelanteSeguros: 3,
      plazas: 6,
      dependeDeGamesContra: Array.from({ length: 10 }, (_, i) => `P${i} / Q${i}`),
    });
    // Las TRES cifras, sueltas y en orden: cupos, posición, empatados.
    expect(c.cifras).toEqual([
      { valor: '6', etiqueta: 'cupos' },
      { valor: '1.º–6.º', etiqueta: 'tu posición' },
      { valor: '10', etiqueta: 'empatadas' },
    ]);
    // Y en prosa solo lo que no es número.
    expect(c.notas.join(' ')).toContain('Hay 3 parejas por delante que ya no puedes alcanzar.');
    expect(c.notas.join(' ')).toMatch(/diferencia de games/i);
    // Ni un nombre: son diez.
    expect(c.notas.join(' ')).not.toContain('P0');
  });

  // `null` = no se enumeró la categoría. El puesto sí se sabe; lo inalcanzable
  // no, así que esa parte se calla en vez de inventarse un cero.
  it('porDelanteSeguros null se calla esa parte', () => {
    const c = conCarrera({ puestoActual: { mejor: 2, peor: 4 }, porDelanteSeguros: null });
    expect(c.cifras).toContainEqual({ valor: '2.º–4.º', etiqueta: 'tu posición' });
    expect(c.notas.join(' ')).not.toMatch(/alcanzar|alcance/i);
  });

  // Cero es la única buena noticia de la tarjeta: no se desperdicia omitiéndola.
  it('porDelanteSeguros 0 se dice en positivo', () => {
    const c = conCarrera({ puestoActual: { mejor: 1, peor: 5 }, porDelanteSeguros: 0 });
    expect(c.notas.join(' ')).toMatch(/nadie está fuera de tu alcance/i);
    expect(c.notas.join(' ')).not.toMatch(/0 parejas|ya no puedes alcanzar/i);
  });

  it('una sola pareja por delante va en singular', () => {
    expect(conCarrera({ porDelanteSeguros: 1 }).notas.join(' ')).toContain('Hay 1 pareja por delante');
  });

  // Sin puesto —empate que el reglamento no resuelve— al menos se dice qué se
  // reparte, en vez de callar la frase entera.
  it('sin puesto, todavía se dice qué se reparte', () => {
    // Sin puesto no hay cifra de posición, pero los cupos siguen ahí.
    const c = conCarrera({ puestoActual: null, plazas: 6, porDelanteSeguros: null });
    expect(c.cifras).toContainEqual({ valor: '6', etiqueta: 'cupos' });
    expect(c.cifras.some((x) => x.etiqueta === 'tu posición')).toBe(false);
  });

  // El orden es la prioridad: primero la respuesta, después lo demás.
  it('el puesto va antes que todo lo demás', () => {
    const c = conCarrera({
      puestoActual: { mejor: 1, peor: 6 }, porDelanteSeguros: 3,
      dependeDeGamesContra: ['A / B', 'C / D', 'E / F', 'G / H'],
    });
    // Cupos primero —la referencia—, después dónde va, después los empatados.
    expect(c.cifras.map((x) => x.etiqueta)).toEqual([
      'cupos', 'tu posición', 'empatadas',
    ]);
  });
});

// ───────────────────────────────────────────
// Cómo se clasifica en esta categoría
// ───────────────────────────────────────────
//
// Faltaba por completo. "Pasan los primeros de cada grupo y 6 mejores segundos"
// y "pasan primeros, segundos y algunos terceros" son torneos distintos, y el
// jugador leía su posición sin saber cuál estaba jugando.

describe('comoSeClasifica', () => {
  it('el caso de 5a Varonil: 10 grupos, uno por grupo y 6 repescados', () => {
    expect(comoSeClasifica({
      categoria: '5a Varonil', grupos: 10, pasanPorGrupo: 1, repescados: 6,
    })).toBe('En 5a Varonil clasifican los 10 primeros de grupo y los 6 mejores segundos.');
  });

  // Con dos por grupo los repescados son los mejores TERCEROS, no segundos.
  it('con dos por grupo, los repescados son terceros', () => {
    const t = comoSeClasifica({
      categoria: 'Mixta B', grupos: 8, pasanPorGrupo: 2, repescados: 4,
    })!;
    expect(t).toContain('los 16 primeros y segundos de grupo');
    expect(t).toContain('los 4 mejores terceros');
  });

  it('sin repescados no se inventa la coletilla', () => {
    const t = comoSeClasifica({
      categoria: '3a Mixto', grupos: 4, pasanPorGrupo: 1, repescados: 0,
    })!;
    expect(t).toBe('En 3a Mixto clasifican los 4 primeros de grupo.');
  });

  it('un solo repescado va en singular', () => {
    expect(comoSeClasifica({
      categoria: 'X', grupos: 5, pasanPorGrupo: 1, repescados: 1,
    })).toContain('el mejor segundo');
  });

  it('sin grupos o sin clasificados, nada', () => {
    expect(comoSeClasifica({ categoria: 'X', grupos: 0, pasanPorGrupo: 1, repescados: 0 })).toBeNull();
    expect(comoSeClasifica({ categoria: 'X', grupos: 4, pasanPorGrupo: 0, repescados: 0 })).toBeNull();
  });
});

// ───────────────────────────────────────────
// El cierre accionable
// ───────────────────────────────────────────
//
// El problema de origen: el jugador que persigue al organizador para saber si
// le toca. Decirle que la app avisa sola es lo que le deja guardar el teléfono.

describe('el aviso de que la app avisa sola', () => {
  it('aparece cuando depende de resultados que no controla', () => {
    for (const estado of ['depende', 'demasiado_pronto', 'empate_sin_resolver'] as const) {
      const f = futuroEnPalabras(analisis({ estado, faltan: 10, respondoCuandoQueden: 5 }));
      expect(f.aviso).toMatch(/no hace falta que preguntes/i);
    }
  });

  it('también cuando ya clasificó pero el pase directo sigue en el aire', () => {
    const f = futuroEnPalabras(analisis({
      estado: 'dentro', repesca: undefined,
      bye: { ...carrera({ estado: 'demasiado_pronto', peorPuestoPosible: null }), aplica: true, byesEnElCuadro: 4 },
    }), 'octavos');
    expect(f.aviso).toBeTruthy();
  });

  // Con todo resuelto no hay nada que esperar, y una promesa de aviso sobraría.
  it('NO aparece cuando ya no queda nada que esperar', () => {
    expect(futuroEnPalabras(analisis({ estado: 'dentro', repesca: carrera() })).aviso).toBeNull();
    expect(futuroEnPalabras(analisis({ estado: 'fuera' })).aviso).toBeNull();
  });
});
