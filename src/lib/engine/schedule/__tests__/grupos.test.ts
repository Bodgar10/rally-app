/**
 * El scheduler de fase de grupos, caso a caso.
 *
 * La verificacion contra el torneo entero vive en `grupos-cimepa.test.ts`.
 * Aqui estan los casos que no son el camino feliz, que son los que deciden si
 * el motor sirve un sabado por la manana.
 */

import { generarBloques, type Bloque } from '../bloques';
import { generateRoundRobin } from '../../fixtures';
import { programarGrupos, huellaDeGrupo, type GrupoAProgramar } from '../grupos';

// ── Utilidades ──────────────────────────────────────────────────────────────

/** Reticula de un solo dia: `bloques` bloques de 3 h con `canchas` canchas. */
function reticula(canchas: number, horas: number, dia = '2026-03-14'): Bloque[] {
  const desde = 8 * 60;
  return generarBloques({
    ventanas: [{
      dia,
      desde: '08:00',
      hasta: `${String(Math.floor((desde + horas * 60) / 60)).padStart(2, '0')}:00`,
    }],
    canchas,
    minutosPorPartido: 60,
  }).bloques;
}

/** Un grupo de `n` parejas, con sus partidos ya generados. */
function grupo(
  id: string, categoryId: string, n: number, bloqueId: string | null, nombre = 'A',
): GrupoAProgramar {
  const parejas = Array.from({ length: n }, (_, k) => `${id}-p${k}`);
  return {
    id, categoryId, nombre, bloqueId,
    partidos: generateRoundRobin(parejas).map((f, k) => ({
      matchId: `${id}-m${k}`, pairAId: f.pairAId, pairBId: f.pairBId, ronda: f.round,
    })),
  };
}

const corre = (bloques: Bloque[], grupos: GrupoAProgramar[]) =>
  programarGrupos({ bloques, minutosPorPartido: 60, grupos });

// ── La huella ───────────────────────────────────────────────────────────────

describe('huellaDeGrupo', () => {
  const de = (n: number) => huellaDeGrupo(grupo('g', 'c', n, null).partidos);

  it('un grupo de 3 son 3 turnos en 1 cancha', () => {
    expect(de(3)).toMatchObject({ rondas: 3, anchura: 1 });
  });

  it('un grupo de 4 son 3 turnos en 2 canchas, no 6 turnos en 1', () => {
    // Es la forma A de §6.4: la gente esta 3 horas en el club, no 6. Un round
    // robin de 4 son 3 rondas de 2 partidos, y las dos de cada ronda se juegan
    // en paralelo.
    expect(de(4)).toMatchObject({ rondas: 3, anchura: 2 });
  });

  it('un grupo de 5 son 5 turnos en 2 canchas: no cabe en un bloque', () => {
    expect(de(5)).toMatchObject({ rondas: 5, anchura: 2 });
  });

  it('un grupo de 2 es 1 turno en 1 cancha', () => {
    expect(de(2)).toMatchObject({ rondas: 1, anchura: 1 });
  });
});

// ── El camino feliz ─────────────────────────────────────────────────────────

describe('un grupo de 3 en un bloque', () => {
  const b = reticula(4, 3);
  const r = corre(b, [grupo('g1', 'c1', 3, b[0].id)]);

  it('los 3 partidos van seguidos en la misma cancha', () => {
    expect(r.partidos.map((p) => p.ordenEnBloque)).toEqual([0, 1, 2]);
    expect(new Set(r.partidos.map((p) => p.cancha))).toEqual(new Set([1]));
  });

  it('las horas salen del bloque, en local y sin zona', () => {
    expect(r.partidos.map((p) => p.inicio)).toEqual([
      '2026-03-14T08:00', '2026-03-14T09:00', '2026-03-14T10:00',
    ]);
  });

  it('nada desplazado, nada sin programar', () => {
    expect(r.partidos.every((p) => !p.desplazado)).toBe(true);
    expect(r.sinProgramar).toEqual([]);
  });
});

describe('un grupo de 4 (§6.4)', () => {
  const b = reticula(4, 3);
  const r = corre(b, [grupo('g1', 'c1', 4, b[0].id)]);

  it('sus 6 partidos caben en 3 turnos usando DOS canchas', () => {
    expect(r.partidos.length).toBe(6);
    expect(new Set(r.partidos.map((p) => p.ordenEnBloque))).toEqual(new Set([0, 1, 2]));
    expect(new Set(r.partidos.map((p) => p.cancha))).toEqual(new Set([1, 2]));
    expect(r.partidos.every((p) => !p.desplazado)).toBe(true);
  });

  it('ninguna pareja juega dos partidos en el mismo turno', () => {
    const porTurno = new Map<number, string[]>();
    for (const p of r.partidos) {
      const del = r.partidos.filter((x) => x.ordenEnBloque === p.ordenEnBloque);
      porTurno.set(p.ordenEnBloque, del.map((x) => x.matchId));
    }
    const entrada = grupo('g1', 'c1', 4, b[0].id).partidos;
    for (const [, ids] of porTurno) {
      const parejas = ids.flatMap((id) => {
        const m = entrada.find((e) => e.matchId === id)!;
        return [m.pairAId, m.pairBId];
      });
      expect(new Set(parejas).size).toBe(parejas.length);
    }
  });

  it('gasta dos carriles: al lado solo caben dos grupos de 3 mas', () => {
    const r2 = corre(b, [
      grupo('g1', 'c1', 4, b[0].id, 'A'),
      grupo('g2', 'c2', 3, b[0].id, 'A'),
      grupo('g3', 'c3', 3, b[0].id, 'A'),
    ]);
    expect(r2.sinProgramar).toEqual([]);
    expect(new Set(r2.partidos.map((p) => p.cancha))).toEqual(new Set([1, 2, 3, 4]));
  });
});

describe('un grupo de 5 se estira a dos bloques', () => {
  const b = reticula(4, 6);   // dos bloques contiguos
  const r = corre(b, [grupo('g1', 'c1', 5, b[0].id)]);

  it('los 10 partidos se reparten 6 + 4 entre los dos bloques', () => {
    expect(r.partidos.length).toBe(10);
    expect(r.partidos.filter((p) => p.bloqueId === b[0].id).length).toBe(6);
    expect(r.partidos.filter((p) => p.bloqueId === b[1].id).length).toBe(4);
  });

  it('los del segundo bloque quedan marcados como desplazados', () => {
    expect(r.partidos.filter((p) => p.desplazado).every((p) => p.bloqueId === b[1].id)).toBe(true);
    expect(r.partidos.filter((p) => !p.desplazado).every((p) => p.bloqueId === b[0].id)).toBe(true);
  });

  it('sigue en las mismas dos canchas: el grupo no salta de sitio', () => {
    expect(new Set(r.partidos.map((p) => p.cancha))).toEqual(new Set([1, 2]));
  });

  it('si es el ultimo bloque del dia, no se parte: se reporta', () => {
    // Dormir en medio de un round robin no es partir un bloque, es partir el
    // torneo. Mejor decirlo que inventarlo.
    const uno = reticula(4, 3);
    const solo = corre(uno, [grupo('g1', 'c1', 5, uno[0].id)]);
    expect(solo.partidos).toEqual([]);
    expect(solo.sinProgramar).toEqual([
      { groupId: 'g1', categoryId: 'c1', motivo: 'no_cabe_en_el_bloque' },
    ]);
    expect(solo.avisos.some((a) => a.includes('turnos seguidos'))).toBe(true);
  });
});

describe('un grupo de 2 ocupa el carril entero', () => {
  const b = reticula(2, 3);
  const r = corre(b, [grupo('g1', 'c1', 2, b[0].id, 'A'), grupo('g2', 'c2', 3, b[0].id, 'A')]);

  it('juega un solo partido y no le rellenan las otras dos horas', () => {
    const suyos = r.partidos.filter((p) => p.groupId === 'g1');
    expect(suyos.length).toBe(1);
    expect(suyos[0].ordenEnBloque).toBe(0);
    // El otro grupo va a OTRA cancha, no a los huecos de esta.
    const otros = r.partidos.filter((p) => p.groupId === 'g2');
    expect(otros.every((p) => p.cancha !== suyos[0].cancha)).toBe(true);
  });
});

// ── Los casos que no son el camino feliz (§6) ───────────────────────────────

describe('§6.2 grupos sin bloque', () => {
  const b = reticula(4, 3);
  const r = corre(b, [grupo('g1', 'c1', 3, null), grupo('g2', 'c2', 3, b[0].id)]);

  it('sale reportado y NO se le inventa un horario', () => {
    expect(r.sinProgramar).toEqual([{ groupId: 'g1', categoryId: 'c1', motivo: 'sin_bloque' }]);
    expect(r.partidos.every((p) => p.groupId === 'g2')).toBe(true);
  });

  it('no impide que los demas se programen', () => {
    expect(r.partidos.length).toBe(3);
  });
});

describe('un bloque que ya no existe', () => {
  const b = reticula(4, 3);
  const r = corre(b, [grupo('g1', 'c1', 3, '2020-01-01-08:00')]);

  it('es un dato a revalidar, no un error', () => {
    expect(r.sinProgramar).toEqual([
      { groupId: 'g1', categoryId: 'c1', motivo: 'bloque_desconocido' },
    ]);
    expect(r.avisos.some((a) => a.includes('2020-01-01-08:00'))).toBe(true);
  });
});

describe('§6.1 bloque sobrevendido', () => {
  const b = reticula(2, 3);   // 2 carriles
  const grupos = [1, 2, 3].map((n) => grupo(`g${n}`, `c${n}`, 3, b[0].id, 'A'));
  const r = corre(b, grupos);

  it('coloca los que caben y reporta el bloque con las dos cifras', () => {
    expect(r.partidos.length).toBe(6);          // dos grupos
    expect(r.sobrevendidos).toEqual([
      { bloqueId: b[0].id, carrilesPedidos: 3, carriles: 2, grupos: 3 },
    ]);
  });

  it('el que sobra se nombra, y no se le reubica a otro bloque', () => {
    expect(r.sinProgramar.length).toBe(1);
    expect(r.sinProgramar[0].motivo).toBe('bloque_sobrevendido');
  });

  it('lo dice con las palabras del organizador', () => {
    expect(r.avisos.some((a) => a.includes('hacen falta 3 canchas y hay 2'))).toBe(true);
  });
});

describe('§6.5 sin bloques en absoluto', () => {
  const r = corre([], [grupo('g1', 'c1', 3, '2026-03-14-08:00')]);

  it('no lanza: devuelve el calendario vacio y lo explica', () => {
    expect(r.partidos).toEqual([]);
    expect(r.sinProgramar).toEqual([{ groupId: 'g1', categoryId: 'c1', motivo: 'sin_bloque' }]);
    expect(r.ocupacion).toEqual({
      canchasHoraUsadas: 0, canchasHoraDisponibles: 0, porcentaje: 0,
    });
    expect(r.avisos[0]).toContain('falta capturar');
  });
});

describe('continuidad de categoria (§2.1)', () => {
  const b = reticula(4, 9);   // tres bloques

  it('una categoria vuelve a su cancha bloque tras bloque', () => {
    const r = corre(b, [
      grupo('a1', 'cA', 3, b[0].id, 'A'), grupo('b1', 'cB', 3, b[0].id, 'A'),
      grupo('a2', 'cA', 3, b[1].id, 'B'), grupo('b2', 'cB', 3, b[1].id, 'B'),
      grupo('a3', 'cA', 3, b[2].id, 'C'), grupo('b3', 'cB', 3, b[2].id, 'C'),
    ]);
    const canchaDe = (g: string) => r.partidos.find((p) => p.groupId === g)!.cancha;
    expect(canchaDe('a1')).toBe(canchaDe('a2'));
    expect(canchaDe('a2')).toBe(canchaDe('a3'));
    expect(canchaDe('b1')).toBe(canchaDe('b2'));
  });

  it('una categoria que se salta un bloque recupera su cancha al volver', () => {
    const r = corre(b, [
      grupo('a1', 'cA', 3, b[0].id, 'A'),
      grupo('b1', 'cB', 3, b[1].id, 'A'),
      grupo('a2', 'cA', 3, b[2].id, 'B'),
    ]);
    const canchaDe = (g: string) => r.partidos.find((p) => p.groupId === g)!.cancha;
    expect(canchaDe('a1')).toBe(canchaDe('a2'));
  });

  it('es una preferencia: si la cancha esta ocupada, cede', () => {
    const dos = reticula(1, 6);   // una sola cancha, dos bloques
    const r = corre(dos, [
      grupo('a1', 'cA', 3, dos[0].id, 'A'),
      grupo('b1', 'cB', 3, dos[1].id, 'A'),
    ]);
    expect(r.sinProgramar).toEqual([]);
    expect(r.partidos.length).toBe(6);
  });
});

describe('ocupacion', () => {
  it('es partidos entre capacidad de la reticula ENTERA', () => {
    // Cuatro canchas x tres bloques x 3 h = 36 canchas-hora. Un grupo son 3.
    const b = reticula(4, 9);
    const r = corre(b, [grupo('g1', 'c1', 3, b[0].id)]);
    expect(r.ocupacion.canchasHoraDisponibles).toBe(36);
    expect(r.ocupacion.canchasHoraUsadas).toBe(3);
    expect(r.ocupacion.porcentaje).toBe(8.3);
  });

  it('cuenta los bloques vacios: son horas que existen aunque nadie las use', () => {
    // Si se midiera solo sobre los bloques usados daria 25 % y pareceria mejor.
    // Seria mentira: las otras dos franjas siguen ahi.
    const b = reticula(4, 9);
    const r = corre(b, [grupo('g1', 'c1', 3, b[0].id)]);
    expect(r.ocupacionPorBloque.map((o) => o.canchasUsadas)).toEqual([1, 0, 0]);
  });
});

describe('robustez', () => {
  it('un grupo sin partidos se reporta en vez de colarse vacio', () => {
    const b = reticula(4, 3);
    const r = corre(b, [{
      id: 'g1', categoryId: 'c1', nombre: 'A', bloqueId: b[0].id, partidos: [],
    }]);
    expect(r.partidos).toEqual([]);
    expect(r.sinProgramar[0].motivo).toBe('no_cabe_en_el_bloque');
  });

  it('minutosPorPartido invalido si lanza: es error de programacion, no de torneo', () => {
    const b = reticula(4, 3);
    expect(() => programarGrupos({ bloques: b, minutosPorPartido: 0, grupos: [] })).toThrow();
  });

  it('no muta la entrada', () => {
    const b = reticula(4, 3);
    const grupos = [grupo('g1', 'c1', 3, b[0].id)];
    const antes = JSON.stringify({ b, grupos });
    corre(b, grupos);
    expect(JSON.stringify({ b, grupos })).toBe(antes);
  });
});
