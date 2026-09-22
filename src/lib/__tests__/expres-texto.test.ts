// src/lib/__tests__/expres-texto.test.ts
import { computeTablaExpres, MARCADORES_SUMA6, type ResultadoSuma6 } from '@/lib/engine/expres';
import {
  LEYENDA_TABLA_EXPRES,
  MARCADORES_ETIQUETA,
  avisoDeEmpateExpres,
  avisoDeTablaProvisional,
  etiquetaDeEmpate,
  explicacionDeCriterio,
  textoDeBalance,
  textoDeClinch,
  textoDeMarcador,
  textoDePartido,
  textoDeDuracion,
  textoDeRecorrido,
} from '@/lib/expres-texto';

let n = 0;
const R = (a: string, b: string, ga: number | null): ResultadoSuma6 => ({
  matchId: `m${++n}`,
  pairAId: a,
  pairBId: b,
  gamesA: ga,
  gamesB: ga === null ? null : 6 - ga,
});
beforeEach(() => {
  n = 0;
});
const CUATRO = ['a', 'b', 'c', 'd'];

describe('textoDeBalance', () => {
  it.each([
    [6, '+6'],
    [2, '+2'],
    [0, '0'],
    [-4, '−4'],
    [-30, '−30'],
  ])('%i → "%s"', (v, esperado) => expect(textoDeBalance(v)).toBe(esperado));

  it('usa el menos de verdad, no el guion del teclado', () => {
    expect(textoDeBalance(-6)).toBe('−' + '6');
    expect(textoDeBalance(-6)).not.toContain('-');
  });

  it('el cero no lleva signo: "+0" se lee como si hubiera ganado algo', () => {
    expect(textoDeBalance(0)).toBe('0');
  });
});

describe('textoDePartido', () => {
  it('cuenta el marcador y lo que le hace a tu tabla', () => {
    expect(textoDePartido(4, 2)).toBe('4-2, +2');
    expect(textoDePartido(0, 6)).toBe('0-6, −6');
  });

  it('el 3-3 no se cuenta como empate, se cuenta como que no mueve nada', () => {
    expect(textoDePartido(3, 3)).toBe('3-3, no suma ni resta');
    expect(textoDePartido(3, 3)).not.toMatch(/empat/i);
  });
});

describe('la leyenda de la tabla', () => {
  it('dice que no se ganan los partidos', () => {
    expect(LEYENDA_TABLA_EXPRES).toMatch(/no se ganan/);
  });

  it('explica por qué los saldos son comparables', () => {
    expect(LEYENDA_TABLA_EXPRES).toMatch(/mismos 5 partidos/);
    expect(LEYENDA_TABLA_EXPRES).toMatch(/30 games/);
  });

  it('no menciona puntos, victorias ni sets: aquí no existen', () => {
    expect(LEYENDA_TABLA_EXPRES).not.toMatch(/\bpuntos\b|\bvictoria|\bsets\b/i);
  });
});

describe('los siete botones del juez', () => {
  it('son exactamente los marcadores que el motor acepta, en el mismo orden', () => {
    expect(MARCADORES_ETIQUETA).toEqual(MARCADORES_SUMA6.map((m) => textoDeMarcador(m.gamesA, m.gamesB)));
  });
});

describe('explicacionDeCriterio', () => {
  it('cubre los cuatro criterios sin dejar ninguno en blanco', () => {
    for (const c of ['balance', 'directo', 'manual', 'sin_resolver'] as const) {
      expect(explicacionDeCriterio(c).length).toBeGreaterThan(0);
    }
  });

  it('no dice "reglamento" cuando lo decidió una persona', () => {
    expect(explicacionDeCriterio('manual')).toBe('lo decidió el organizador');
  });
});

describe('textoDeClinch y textoDeRecorrido', () => {
  it('habla de cuartos, que es lo que el jugador quiere saber', () => {
    expect(textoDeClinch('clinched')).toBe('Ya estás en cuartos');
    expect(textoDeClinch('alive')).toBe('Todavía puedes entrar');
    expect(textoDeClinch('eliminated')).toBe('Fuera de cuartos');
  });

  it('con el grupo terminado el recorrido es un solo número', () => {
    expect(textoDeRecorrido(8, 8)).toBe('Tu saldo final es +8');
  });

  it('con partidos por jugar enseña el rango, para que pueda calcular', () => {
    expect(textoDeRecorrido(-4, 8)).toBe('Vas a acabar entre −4 y +8');
  });
});

describe('el aviso del empate que bloquea', () => {
  /** Ciclo perfecto entre a, b y c; pasan 2, así que el empate parte el corte. */
  const ciclo = () =>
    computeTablaExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [
        R('a', 'b', 4), R('b', 'c', 4), R('c', 'a', 4),
        R('a', 'd', 6), R('b', 'd', 6), R('c', 'd', 6),
      ],
    });

  it('sale solo cuando de verdad decide quién pasa', () => {
    const aviso = avisoDeEmpateExpres(ciclo())!;
    expect(aviso).toMatch(/tres parejas/);
    expect(aviso).toMatch(/decide quién pasa a cuartos/);
  });

  it('dice que Padel Crown no lo resuelve y sugiere el tiebreak', () => {
    const aviso = avisoDeEmpateExpres(ciclo())!;
    expect(aviso).toMatch(/El reglamento no da para más/);
    expect(aviso).toMatch(/tiebreak en la cancha/);
    expect(aviso).toMatch(/el organizador marca aquí quién avanza/);
  });

  it('distingue el empate de quienes no se enfrentaron', () => {
    const tabla = computeTablaExpres({
      pairIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      clasifican: 2,
      resultados: [
        R('a', 'f', 6), R('b', 'e', 6), R('c', 'd', 0),
        R('b', 'f', 6), R('a', 'c', 4), R('d', 'e', 4),
      ],
    });
    expect(avisoDeEmpateExpres(tabla)).toMatch(/no se enfrentaron entre ellas/);
  });

  it('calla cuando las empatadas pasan todas', () => {
    const tabla = computeTablaExpres({
      pairIds: CUATRO,
      clasifican: 3,
      resultados: [
        R('a', 'b', 4), R('b', 'c', 4), R('c', 'a', 4),
        R('a', 'd', 6), R('b', 'd', 6), R('c', 'd', 6),
      ],
    });
    expect(avisoDeEmpateExpres(tabla)).toBeNull();
  });

  it('calla mientras el grupo no haya terminado: el empate puede deshacerse', () => {
    const tabla = computeTablaExpres({
      pairIds: CUATRO,
      clasifican: 2,
      resultados: [
        R('a', 'b', 4), R('b', 'c', 4), R('c', 'a', 4),
        R('a', 'd', 6), R('b', 'd', 6), R('c', 'd', null),
      ],
    });
    expect(avisoDeEmpateExpres(tabla)).toBeNull();
  });

  it('la etiqueta corta marca cuál es el que importa', () => {
    const t = ciclo();
    expect(etiquetaDeEmpate(t.empatesSinResolver[0])).toBe(
      'Empate a +6 entre tres: decide quién pasa',
    );
  });
});

describe('el aviso de tabla provisional', () => {
  it('sale cuando unas han jugado más que otras', () => {
    const tabla = computeTablaExpres({
      pairIds: CUATRO,
      resultados: [R('a', 'b', 4), R('c', 'd', 3), R('a', 'c', 6), R('b', 'd', null)],
    });
    expect(avisoDeTablaProvisional(tabla)).toMatch(/no se pueden comparar/);
  });

  it('calla cuando todas llevan los mismos partidos', () => {
    const tabla = computeTablaExpres({
      pairIds: CUATRO,
      resultados: [R('a', 'b', 4), R('c', 'd', 3)],
    });
    expect(avisoDeTablaProvisional(tabla)).toBeNull();
  });
});

describe('textoDeDuracion', () => {
  it('los 150 minutos que se anuncian son 2 h 30, no 3 h', () => {
    // Con Math.round(150/60) salía "3 h 30 min": media hora de pádel regalada
    // en el cartel del club.
    expect(textoDeDuracion(150)).toBe('2 h 30 min');
  });

  it.each([
    [30, '30 min'],
    [45, '45 min'],
    [60, '1 h'],
    [120, '2 h'],
    [255, '4 h 15 min'],
    [405, '6 h 45 min'],
  ])('%i → "%s"', (min, esperado) => expect(textoDeDuracion(min)).toBe(esperado));

  it('no deja nunca un "0 min" colgando', () => {
    expect(textoDeDuracion(180)).toBe('3 h');
    expect(textoDeDuracion(180)).not.toMatch(/0 min/);
  });
});
