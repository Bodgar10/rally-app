// src/lib/engine/expres/__tests__/fixture.test.ts
import {
  CLASIFICADOS,
  CUPO_MINIMO,
  PARTIDOS_POR_PAREJA,
  generarFixtureExpres,
  type FixtureExpres,
  type PartidoExpres,
} from '../index';

const parejas = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
const fixture = (n: number, semilla = 'domingo-2026-09-20') =>
  generarFixtureExpres({ pairIds: parejas(n), semilla });

/** Partidos jugados por cada pareja, en todo el fixture. */
function partidosPorPareja(f: FixtureExpres): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const p of f.partidos) {
    cuenta.set(p.pairAId, (cuenta.get(p.pairAId) ?? 0) + 1);
    cuenta.set(p.pairBId, (cuenta.get(p.pairBId) ?? 0) + 1);
  }
  return cuenta;
}

const clave = (p: PartidoExpres) => [p.pairAId, p.pairBId].sort().join('|');

describe('generarFixtureExpres — la forma del torneo', () => {
  it('cupo 16 → dos grupos de 8, 5 rondas, 40 partidos, 4 canchas', () => {
    const f = fixture(16);
    expect(f.cupo).toBe(16);
    expect(f.grupos.map((g) => g.grupo)).toEqual(['A', 'B']);
    expect(f.grupos.map((g) => g.pairIds.length)).toEqual([8, 8]);
    expect(f.grupos.map((g) => g.rondas.length)).toEqual([5, 5]);
    expect(f.partidosPorPareja).toBe(5);
    expect(f.totalPartidos).toBe(40); // (8×5/2) × 2
    expect(f.canchasNecesarias).toBe(4);
    expect(f.clasificanPorGrupo * 2).toBe(CLASIFICADOS);
  });

  it('cupo 14 → grupos desiguales 8+6, pero los DOS juegan 5 rondas', () => {
    // Es lo que hace que la alternancia salga perfecta aunque los grupos no
    // tengan el mismo tamaño: el número de rondas depende de K, no del cupo.
    const f = fixture(14);
    expect(f.grupos.map((g) => g.pairIds.length)).toEqual([8, 6]);
    expect(f.grupos.map((g) => g.rondas.length)).toEqual([5, 5]);
    expect(f.totalPartidos).toBe(35); // 20 + 15
    expect(f.canchasNecesarias).toBe(4);
  });

  it('cupo 12 → el grupo de 6 juega contra todos: round robin', () => {
    const f = fixture(12);
    const grupoA = f.grupos[0];
    const rivales = new Set(f.partidos.filter((p) => p.grupo === 'A').map(clave));
    expect(grupoA.pairIds).toHaveLength(6);
    expect(rivales.size).toBe(15); // C(6,2): no sobra ningún emparejamiento
  });
});

describe('las cuatro garantías del formato', () => {
  const cupos = [12, 14, 16, 18, 20, 24, 32];

  it.each(cupos)('cupo %i: todas juegan exactamente 5 partidos', (n) => {
    const f = fixture(n);
    const cuenta = partidosPorPareja(f);
    expect(cuenta.size).toBe(n);
    for (const [, v] of cuenta) expect(v).toBe(PARTIDOS_POR_PAREJA);
  });

  it.each(cupos)('cupo %i: nadie repite rival', (n) => {
    const f = fixture(n);
    const claves = f.partidos.map(clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it.each(cupos)('cupo %i: dentro de una franja nadie juega dos veces', (n) => {
    for (const franja of fixture(n).franjas) {
      const jugando: string[] = [];
      for (const p of franja.partidos) jugando.push(p.pairAId, p.pairBId);
      expect(new Set(jugando).size).toBe(jugando.length);
    }
  });

  it.each(cupos)('cupo %i: nadie se enfrenta a alguien del otro grupo', (n) => {
    const f = fixture(n);
    const grupoDe = new Map<string, string>();
    for (const g of f.grupos) for (const id of g.pairIds) grupoDe.set(id, g.grupo);
    for (const p of f.partidos) {
      expect(grupoDe.get(p.pairAId)).toBe(p.grupo);
      expect(grupoDe.get(p.pairBId)).toBe(p.grupo);
    }
  });
});

describe('la alternancia: mientras un grupo juega, el otro descansa', () => {
  it('las franjas van A1, B1, A2, B2, … sin huecos', () => {
    const f = fixture(16);
    expect(f.franjas).toHaveLength(10);
    expect(f.franjas.map((x) => `${x.grupo}${x.ronda}`)).toEqual([
      'A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4', 'B4', 'A5', 'B5',
    ]);
    expect(f.franjas.map((x) => x.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('ninguna pareja juega dos franjas seguidas', () => {
    const f = fixture(16);
    const ultima = new Map<string, number>();
    for (const franja of f.franjas) {
      for (const p of franja.partidos) {
        for (const id of [p.pairAId, p.pairBId]) {
          const previa = ultima.get(id);
          if (previa !== undefined) expect(franja.orden - previa).toBeGreaterThan(1);
          ultima.set(id, franja.orden);
        }
      }
    }
  });

  it('`partidos` viene plano y en orden de juego', () => {
    const f = fixture(16);
    expect(f.partidos).toHaveLength(40);
    const ordenes = f.partidos.map((p) => p.orden);
    expect([...ordenes].sort((a, b) => a - b)).toEqual(ordenes);
    expect(f.partidos.flatMap((p) => p.ref)).toHaveLength(new Set(f.partidos.map((p) => p.ref)).size);
  });

  it('las refs son legibles y estables', () => {
    const f = fixture(16);
    expect(f.grupos[0].rondas[2][1].ref).toBe('A-R3-P2');
    expect(f.franjas[1].partidos[0].ref).toBe('B-R1-P1');
  });
});

describe('determinismo', () => {
  it('misma lista y misma semilla → fixture idéntico', () => {
    expect(fixture(16, 'x')).toEqual(fixture(16, 'x'));
  });

  it('otra semilla → otro torneo', () => {
    expect(fixture(16, 'x')).not.toEqual(fixture(16, 'y'));
  });

  it('no depende del reloj ni de Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    fixture(20, 'x');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('lo que rechaza, y lo dice', () => {
  it('cupo impar: explica por qué y qué hacer', () => {
    const t = () => generarFixtureExpres({ pairIds: parejas(13), semilla: 'x' });
    expect(t).toThrow(/cupo debe ser PAR y llegaron 13/);
    expect(t).toThrow(/cierra en 12 o abre a 14/);
  });

  it('cupo por debajo del mínimo', () => {
    expect(() => generarFixtureExpres({ pairIds: parejas(10), semilla: 'x' })).toThrow(
      new RegExp(`cupo mínimo de un exprés es ${CUPO_MINIMO}`),
    );
  });

  it('parejas duplicadas', () => {
    const l = parejas(16);
    l[5] = l[0];
    expect(() => generarFixtureExpres({ pairIds: l, semilla: 'x' })).toThrow(/parejas repetidas/);
  });

  it('ids vacíos o que no son texto', () => {
    const l: unknown[] = parejas(16);
    l[3] = '';
    expect(() => generarFixtureExpres({ pairIds: l as string[], semilla: 'x' })).toThrow(
      /vacíos o que no son texto/,
    );
  });

  it('sin semilla NO inventa una', () => {
    // Un default aquí sería un sorteo que nadie decidió y que parece legítimo.
    expect(() =>
      generarFixtureExpres({ pairIds: parejas(16) } as unknown as { pairIds: string[]; semilla: string }),
    ).toThrow(/semilla es obligatoria/);
    expect(() => generarFixtureExpres({ pairIds: parejas(16), semilla: '' })).toThrow(
      /no se puede reproducir ni auditar/,
    );
  });

  it('pairIds que no es array', () => {
    expect(() =>
      generarFixtureExpres({ pairIds: 16 as unknown as string[], semilla: 'x' }),
    ).toThrow(/debe ser un array/);
  });

  it('más partidos por pareja que rivales en el grupo pequeño', () => {
    expect(() =>
      generarFixtureExpres({ pairIds: parejas(12), semilla: 'x', partidosPorPareja: 6 }),
    ).toThrow(/solo hay 5 rivales distintos/);
  });

  it('partidosPorPareja inválido', () => {
    expect(() =>
      generarFixtureExpres({ pairIds: parejas(16), semilla: 'x', partidosPorPareja: 0 }),
    ).toThrow(/entero >= 1/);
  });
});

describe('K es un dial, no una constante encadenada', () => {
  it('bajar K recorta el torneo sin reordenar lo anterior', () => {
    // La propiedad prefijo del círculo, vista desde el fixture: si el club
    // abre más tarde y solo caben 4 rondas, las 4 primeras son las mismas.
    const cinco = generarFixtureExpres({ pairIds: parejas(16), semilla: 'x' });
    const cuatro = generarFixtureExpres({ pairIds: parejas(16), semilla: 'x', partidosPorPareja: 4 });
    expect(cuatro.grupos[0].rondas).toEqual(cinco.grupos[0].rondas.slice(0, 4));
    expect(cuatro.totalPartidos).toBe(32);
  });

  it('con K par sigue cumpliendo las garantías', () => {
    const f = generarFixtureExpres({ pairIds: parejas(16), semilla: 'x', partidosPorPareja: 4 });
    for (const [, v] of partidosPorPareja(f)) expect(v).toBe(4);
    expect(new Set(f.partidos.map(clave)).size).toBe(f.partidos.length);
  });
});
