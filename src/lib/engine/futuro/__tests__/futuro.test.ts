import { analizarFuturo, type GrupoDeCategoria } from '../index';
import type { MatchResultInput, SetScore } from '../../types';

const s = (a: number, b: number): SetScore => ({ gamesA: a, gamesB: b, isSuperTiebreak: false });

const jugado = (id: string, A: string, B: string, w: string): MatchResultInput =>
  ({ matchId: id, pairAId: A, pairBId: B, winnerPairId: w, played: true, sets: [s(6, 2), s(6, 2)] });

const pendiente = (id: string, A: string, B: string): MatchResultInput =>
  ({ matchId: id, pairAId: A, pairBId: B, winnerPairId: null, played: false, sets: [] });

/** Grupo de 3 con sus tres partidos, ganados por quien se diga. */
const grupo = (
  nombre: string,
  [x, y, z]: string[],
  ganadores: (string | null)[],
): GrupoDeCategoria => ({
  groupId: `g${nombre}`,
  nombre,
  pairIds: [x, y, z],
  matches: [
    ganadores[0] ? jugado(`${nombre}1`, x, y, ganadores[0]) : pendiente(`${nombre}1`, x, y),
    ganadores[1] ? jugado(`${nombre}2`, x, z, ganadores[1]) : pendiente(`${nombre}2`, x, z),
    ganadores[2] ? jugado(`${nombre}3`, y, z, ganadores[2]) : pendiente(`${nombre}3`, y, z),
  ],
});

const nombresDe = (ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, `Pareja ${id}`]));

const TODOS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'];

describe('la previa: qué puesto puede acabar teniendo en su grupo', () => {
  it('con su grupo sin jugar, puede acabar en cualquiera de los tres', () => {
    const r = analizarFuturo({
      grupos: [
        grupo('A', ['A1', 'A2', 'A3'], [null, null, null]),
        grupo('B', ['B1', 'B2', 'B3'], ['B1', 'B1', 'B2']),
      ],
      advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A1', nombres: nombresDe(TODOS),
    });
    expect(r.posicionesPosiblesEnGrupo).toEqual([1, 2, 3]);
  });

  it('con su grupo terminado, una sola posición', () => {
    const r = analizarFuturo({
      grupos: [
        grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2']),
        grupo('B', ['B1', 'B2', 'B3'], [null, null, null]),
      ],
      advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A1', nombres: nombresDe(TODOS),
    });
    expect(r.posicionesPosiblesEnGrupo).toEqual([1]);
  });
});

describe('el corte de coste sale del presupuesto, no de un número escrito a mano', () => {
  it('con demasiados pendientes no enumera, y dice cuándo podrá', () => {
    const grupos = ['A', 'B', 'C', 'D'].map((n) =>
      grupo(n, [`${n}1`, `${n}2`, `${n}3`], [null, null, null]));
    const r = analizarFuturo({
      grupos, advancePerGroup: 1, bestExtraQualifiers: 0,
      pairId: 'A1', nombres: nombresDe(TODOS),
      presupuesto: 1,
    });
    expect(r.estado).toBe('demasiado_pronto');
    expect(r.faltan).toBe(12);
    expect(r.respondoCuandoQueden).toBeGreaterThanOrEqual(0);
    expect(r.respondoCuandoQueden!).toBeLessThan(r.faltan);
  });

  it('una categoría chica sí se enumera entera', () => {
    const r = analizarFuturo({
      grupos: [
        grupo('A', ['A1', 'A2', 'A3'], [null, null, null]),
        grupo('B', ['B1', 'B2', 'B3'], ['B1', 'B1', 'B2']),
      ],
      advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A1', nombres: nombresDe(TODOS),
    });
    expect(r.estado).not.toBe('demasiado_pronto');
  });
});

describe('lo que importa es el corte, no el puesto', () => {
  // Dos grupos terminados, dos plazas de repesca y dos segundos. Entran los
  // dos: da igual quién sea "el mejor".
  const grupos = [
    grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2']),
    grupo('B', ['B1', 'B2', 'B3'], ['B1', 'B1', 'B2']),
  ];

  it('el segundo pasa aunque sea el peor de los segundos', () => {
    const r = analizarFuturo({
      grupos, advancePerGroup: 1, bestExtraQualifiers: 2,
      pairId: 'A2', nombres: nombresDe(TODOS),
    });
    expect(r.estado).toBe('dentro');
    expect(r.repesca!.estado).toBe('dentro');
    // Y la frase se construye sobre esto: "lo peor que te puede tocar es
    // entrar de segundo", con dos plazas.
    expect(r.repesca!.peorPuestoPosible).toBe(2);
    expect(r.repesca!.plazas).toBe(2);
  });

  it('con una sola plaza, el mismo tablero ya no es seguro', () => {
    const r = analizarFuturo({
      grupos, advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A2', nombres: nombresDe(TODOS),
    });
    expect(r.repesca!.peorPuestoPosible).toBe(2);
    expect(r.repesca!.estado).not.toBe('dentro');
  });
});

describe('los games son incertidumbre: no se promete lo que no se sabe', () => {
  it('un empate a puntos con otro segundo se dice por su nombre', () => {
    const grupos = [
      grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2']),
      grupo('B', ['B1', 'B2', 'B3'], ['B1', 'B1', 'B2']),
    ];
    const r = analizarFuturo({
      grupos, advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A2', nombres: nombresDe(TODOS),
    });
    expect(r.repesca!.dependeDeGamesContra).toEqual(['Pareja B2']);
  });

  it('nadie se declara dentro por ganar un desempate de games', () => {
    const grupos = [
      grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2']),
      grupo('B', ['B1', 'B2', 'B3'], ['B1', 'B1', 'B2']),
    ];
    const r = analizarFuturo({
      grupos, advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A2', nombres: nombresDe(TODOS),
    });
    // Empatan a puntos y solo los games los separan: el motor no elige.
    expect(r.estado).toBe('depende');
  });
});

describe('el pivote: solo los partidos que cambian la respuesta', () => {
  it('un grupo ajeno que no afecta a la repesca no se lista', () => {
    const grupos = [
      grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2']),   // terminado
      grupo('B', ['B1', 'B2', 'B3'], [null, null, null]),   // en juego
    ];
    const r = analizarFuturo({
      grupos, advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A2', nombres: nombresDe(TODOS),
    });
    if (r.repesca?.estado === 'depende') {
      // Todos los que se listan son del grupo B: los de A ya se jugaron.
      for (const p of r.repesca.partidosQueImportan) expect(p.grupo).toBe('B');
      expect(r.repesca.partidosQueImportan.length).toBeLessThanOrEqual(3);
    }
  });

  it('los partidos que se listan traen nombres, no ids', () => {
    const grupos = [
      grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2']),
      grupo('B', ['B1', 'B2', 'B3'], [null, null, null]),
    ];
    const r = analizarFuturo({
      grupos, advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A2', nombres: nombresDe(TODOS),
    });
    for (const p of r.repesca?.partidosQueImportan ?? []) {
      expect(p.parejaA).toMatch(/^Pareja /);
      expect(p.parejaB).toMatch(/^Pareja /);
      expect(p.grupo).not.toMatch(/^g/);
    }
  });
});

describe('el dato que falta truena, no se asume', () => {
  const grupos = [grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2'])];
  it('sin bestExtraQualifiers lanza y nombra el campo', () => {
    expect(() => analizarFuturo({
      grupos, advancePerGroup: 1, pairId: 'A1', nombres: nombresDe(TODOS),
    } as never)).toThrow(/bestExtraQualifiers/);
  });
  it('sin advancePerGroup también', () => {
    expect(() => analizarFuturo({
      grupos, bestExtraQualifiers: 0, pairId: 'A1', nombres: nombresDe(TODOS),
    } as never)).toThrow(/advancePerGroup/);
  });
});

/**
 * MONOTONÍA. Es la misma promesa que en clinch: decir "ya pasaste" y
 * retirarlo media hora después destruye la confianza en lo único que el
 * jugador viene a consultar.
 */
describe('el estado no retrocede nunca', () => {
  const orden = ['B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

  /** Va cerrando los pendientes de B y C uno a uno, siempre gana el primero. */
  function pasos() {
    const out: GrupoDeCategoria[][] = [];
    for (let n = 0; n <= 3; n++) {
      const gan = (i: number) => (i < n ? ['B1', 'B1', 'B2'][i] : null);
      out.push([
        grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2']),
        grupo('B', ['B1', 'B2', 'B3'], [gan(0), gan(1), gan(2)]),
        grupo('C', ['C1', 'C2', 'C3'], ['C1', 'C1', 'C2']),
      ]);
    }
    return out;
  }

  it('nadie pasa de dentro a depende ni a fuera', () => {
    for (const quien of ['A1', 'A2', 'A3', ...orden]) {
      let yaDentro = false;
      for (const grupos of pasos()) {
        const r = analizarFuturo({
          grupos, advancePerGroup: 1, bestExtraQualifiers: 2,
          pairId: quien, nombres: nombresDe(TODOS),
        });
        if (r.estado === 'demasiado_pronto') continue;
        if (yaDentro) {
          expect(`${quien}: ${r.estado}`).toBe(`${quien}: dentro`);
        }
        if (r.estado === 'dentro') yaDentro = true;
      }
    }
  });

  it('y alguien llega a dentro por el camino, o el test no prueba nada', () => {
    const ultimo = pasos()[3];
    const r = analizarFuturo({
      grupos: ultimo, advancePerGroup: 1, bestExtraQualifiers: 2,
      pairId: 'A1', nombres: nombresDe(TODOS),
    });
    expect(r.estado).toBe('dentro');
  });
});

/**
 * LA CARRERA DEL BYE. Con 6 clasificados en un cuadro de 8 hay 2 byes: los dos
 * mejores primeros se saltan la primera ronda. Lo que importa no es ser EL
 * mejor primero, es caer dentro de esos dos.
 */
describe('la carrera del bye', () => {
  const terminados = [
    grupo('A', ['A1', 'A2', 'A3'], ['A1', 'A1', 'A2']),
    grupo('B', ['B1', 'B2', 'B3'], ['B1', 'B1', 'B2']),
    grupo('C', ['C1', 'C2', 'C3'], ['C1', 'C1', 'C2']),
  ];

  it('cuenta los byes del cuadro con la misma aritmética que la siembra', () => {
    // 3 grupos × 1 + 3 repescados = 6 clasificados → cuadro de 8 → 2 byes.
    const r = analizarFuturo({
      grupos: terminados, advancePerGroup: 1, bestExtraQualifiers: 3,
      pairId: 'A1', nombres: nombresDe(TODOS),
    });
    expect(r.bye!.aplica).toBe(true);
    expect(r.bye!.byesEnElCuadro).toBe(2);
    expect(r.bye!.plazas).toBe(2);
  });

  it('sin huecos en el cuadro, la carrera del bye no aplica', () => {
    // 4 grupos × 1 + 4 = 8 clasificados en cuadro de 8: cero byes.
    const cuatro = [...terminados, grupo('D', ['D1', 'D2', 'D3'], ['D1', 'D1', 'D2'])];
    const r = analizarFuturo({
      grupos: cuatro, advancePerGroup: 1, bestExtraQualifiers: 4,
      pairId: 'A1', nombres: nombresDe(TODOS),
    });
    expect(r.bye!.aplica).toBe(false);
    expect(r.bye!.byesEnElCuadro).toBe(0);
  });

  it('un segundo no compite por el bye: su peor puesto queda fuera de las plazas', () => {
    const r = analizarFuturo({
      grupos: terminados, advancePerGroup: 1, bestExtraQualifiers: 3,
      pairId: 'A2', nombres: nombresDe(TODOS),
    });
    // Los tres primeros se siembran por delante de cualquier segundo.
    expect(r.bye!.peorPuestoPosible!).toBeGreaterThan(r.bye!.plazas);
    expect(r.bye!.estado).toBe('fuera');
  });
});

describe('el empate perfecto no se responde: hace falta sorteo', () => {
  it('un ciclo perfecto de tres devuelve empate_sin_resolver', () => {
    // Los tres 6-4 6-4 en círculo: idénticas en puntos, sets y games.
    const ciclo = (a: number, b: number): SetScore[] => [s(a, b), s(a, b)];
    const g: GrupoDeCategoria = {
      groupId: 'gA', nombre: 'A', pairIds: ['A1', 'A2', 'A3'],
      matches: [
        { matchId: 'x1', pairAId: 'A1', pairBId: 'A2', winnerPairId: 'A1', played: true, sets: ciclo(6, 4) },
        { matchId: 'x2', pairAId: 'A2', pairBId: 'A3', winnerPairId: 'A2', played: true, sets: ciclo(6, 4) },
        { matchId: 'x3', pairAId: 'A3', pairBId: 'A1', winnerPairId: 'A3', played: true, sets: ciclo(6, 4) },
      ],
    };
    const r = analizarFuturo({
      grupos: [g, grupo('B', ['B1', 'B2', 'B3'], ['B1', 'B1', 'B2'])],
      advancePerGroup: 1, bestExtraQualifiers: 1,
      pairId: 'A1', nombres: nombresDe(TODOS),
    });
    expect(r.estado).toBe('empate_sin_resolver');
  });
});
