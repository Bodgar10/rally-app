// src/lib/engine/expres/__tests__/captura.test.ts
import {
  balanceDelMarcador,
  generarFixtureExpres,
  partidosPendientes,
  prepararCapturaExpres,
  type ResultadoSuma6,
} from '../index';

const parejas = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);

/** Un grupo de 8 real, con su calendario, todo por jugar. */
function grupoNuevo() {
  const f = generarFixtureExpres({ pairIds: parejas(16), semilla: 'domingo-2026-09-20' });
  const g = f.grupos[0];
  const resultados: ResultadoSuma6[] = f.partidos
    .filter((m) => m.grupo === 'A')
    .map((m) => ({ matchId: m.ref, pairAId: m.pairAId, pairBId: m.pairBId, gamesA: null, gamesB: null }));
  return { pairIds: g.pairIds, resultados };
}

describe('prepararCapturaExpres — qué se escribe', () => {
  it('el partido queda terminado y SIN ganador, que no es lo mismo que sin capturar', () => {
    const { pairIds, resultados } = grupoNuevo();
    const c = prepararCapturaExpres({ pairIds, resultados, matchId: resultados[0].matchId, gamesA: 4, gamesB: 2 });
    expect(c.partido).toEqual({
      matchId: resultados[0].matchId,
      status: 'finished',
      winnerPairId: null,
      formato: 'suma_6',
    });
  });

  it('el marcador es una sola fila, nunca súper muerte', () => {
    const { pairIds, resultados } = grupoNuevo();
    const c = prepararCapturaExpres({ pairIds, resultados, matchId: resultados[0].matchId, gamesA: 6, gamesB: 0 });
    expect(c.marcador).toEqual({
      matchId: resultados[0].matchId,
      setNumber: 1,
      gamesA: 6,
      gamesB: 0,
      isSuperTiebreak: false,
    });
  });

  it('escribe las 8 filas del grupo, no solo las dos que jugaron', () => {
    // El balance de una pareja mueve el puesto de las demás, y con él su clinch.
    const { pairIds, resultados } = grupoNuevo();
    const c = prepararCapturaExpres({ pairIds, resultados, matchId: resultados[0].matchId, gamesA: 5, gamesB: 1 });
    expect(c.standings).toHaveLength(8);
    expect(new Set(c.standings.map((s) => s.pairId))).toEqual(new Set(pairIds));
    expect(c.standings.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('las columnas del torneo largo van a cero, explícitas', () => {
    const { pairIds, resultados } = grupoNuevo();
    const c = prepararCapturaExpres({ pairIds, resultados, matchId: resultados[0].matchId, gamesA: 6, gamesB: 0 });
    for (const s of c.standings) {
      expect([s.won, s.lost, s.setsWon, s.setsLost, s.points]).toEqual([0, 0, 0, 0, 0]);
    }
  });

  it('el balance cuadra con los games, fila a fila', () => {
    const { pairIds, resultados } = grupoNuevo();
    const c = prepararCapturaExpres({ pairIds, resultados, matchId: resultados[0].matchId, gamesA: 4, gamesB: 2 });
    for (const s of c.standings) expect(s.balance).toBe(s.gamesWon - s.gamesLost);
    // Y lo que gana una lo pierde la otra: el grupo suma cero.
    expect(c.standings.reduce((t, s) => t + s.balance, 0)).toBe(0);
  });

  it('un 3-3 mueve games pero no balance', () => {
    const { pairIds, resultados } = grupoNuevo();
    const c = prepararCapturaExpres({ pairIds, resultados, matchId: resultados[0].matchId, gamesA: 3, gamesB: 3 });
    const jugaron = c.standings.filter((s) => s.played === 1);
    expect(jugaron).toHaveLength(2);
    for (const s of jugaron) expect([s.gamesWon, s.gamesLost, s.balance]).toEqual([3, 3, 0]);
  });
});

describe('corregir y borrar', () => {
  const { pairIds, resultados } = grupoNuevo();
  const primero = resultados[0].matchId;

  it('corregir un marcador deja la tabla como si el primero nunca hubiera existido', () => {
    const conMalo = prepararCapturaExpres({ pairIds, resultados, matchId: primero, gamesA: 6, gamesB: 0 });
    const aplicado: ResultadoSuma6[] = resultados.map((r) =>
      r.matchId === primero ? { ...r, gamesA: 6, gamesB: 0 } : r,
    );
    const corregido = prepararCapturaExpres({ pairIds, resultados: aplicado, matchId: primero, gamesA: 2, gamesB: 4 });
    const directo = prepararCapturaExpres({ pairIds, resultados, matchId: primero, gamesA: 2, gamesB: 4 });

    expect(corregido.standings).toEqual(directo.standings);
    expect(conMalo.standings).not.toEqual(directo.standings);
  });

  it('borrar el marcador devuelve el partido a la agenda', () => {
    const aplicado: ResultadoSuma6[] = resultados.map((r) =>
      r.matchId === primero ? { ...r, gamesA: 6, gamesB: 0 } : r,
    );
    const c = prepararCapturaExpres({ pairIds, resultados: aplicado, matchId: primero, gamesA: null, gamesB: null });
    expect(c.partido.status).toBe('scheduled');
    expect(c.marcador).toBeNull();
    expect(c.standings.every((s) => s.played === 0)).toBe(true);
  });
});

describe('el grupo entero', () => {
  it('capturados los 20 partidos, la tabla está terminada y el clinch decidido', () => {
    const { pairIds, resultados } = grupoNuevo();
    let estado = resultados;
    let ultima = null as ReturnType<typeof prepararCapturaExpres> | null;

    estado.forEach((r, i) => {
      ultima = prepararCapturaExpres({ pairIds, resultados: estado, matchId: r.matchId, gamesA: [6, 4, 3, 2, 5, 1, 0][i % 7], gamesB: 6 - [6, 4, 3, 2, 5, 1, 0][i % 7] });
      estado = estado.map((x) =>
        x.matchId === r.matchId ? { ...x, gamesA: ultima!.marcador!.gamesA, gamesB: ultima!.marcador!.gamesB } : x,
      );
    });

    expect(partidosPendientes(estado)).toBe(0);
    expect(ultima!.tabla.grupoTerminado).toBe(true);
    expect(ultima!.tabla.comparable).toBe(true);
    expect(ultima!.standings.every((s) => s.played === 5)).toBe(true);
    expect(ultima!.clinch.every((c) => c.estado !== 'alive')).toBe(true);
    // Cuatro dentro y cuatro fuera, ni uno más.
    expect(ultima!.clinch.filter((c) => c.estado === 'clinched')).toHaveLength(4);
  });

  it('partidosPendientes cuenta lo que falta', () => {
    const { resultados } = grupoNuevo();
    expect(partidosPendientes(resultados)).toBe(20);
    expect(partidosPendientes(resultados.map((r, i) => (i < 4 ? { ...r, gamesA: 3, gamesB: 3 } : r)))).toBe(16);
  });
});

describe('balanceDelMarcador', () => {
  it.each([
    [6, 0, 6, -6],
    [5, 1, 4, -4],
    [4, 2, 2, -2],
    [3, 3, 0, 0],
  ])('%i-%i → A %i, B %i', (ga, gb, a, b) => {
    expect(balanceDelMarcador(ga, gb)).toEqual({ a, b });
  });

  it('rechaza lo que no es un suma 6', () => {
    expect(() => balanceDelMarcador(6, 4)).toThrow(/son 6 games exactos/);
  });
});

describe('lo que rechaza', () => {
  const { pairIds, resultados } = grupoNuevo();

  it('un marcador que no suma 6', () => {
    expect(() =>
      prepararCapturaExpres({ pairIds, resultados, matchId: resultados[0].matchId, gamesA: 6, gamesB: 4 }),
    ).toThrow(/son 6 games exactos/);
  });

  it('medio marcador: o los dos números o ninguno', () => {
    expect(() =>
      prepararCapturaExpres({ pairIds, resultados, matchId: resultados[0].matchId, gamesA: 4, gamesB: null }),
    ).toThrow(/entero/);
  });

  it('un partido que no es de este grupo', () => {
    expect(() =>
      prepararCapturaExpres({ pairIds, resultados, matchId: 'B-R1-P1', gamesA: 3, gamesB: 3 }),
    ).toThrow(/no está entre los 20 del grupo/);
  });

  it('sin matchId', () => {
    expect(() =>
      prepararCapturaExpres({ pairIds, resultados, matchId: '', gamesA: 3, gamesB: 3 }),
    ).toThrow(/matchId es obligatorio/);
  });
});
