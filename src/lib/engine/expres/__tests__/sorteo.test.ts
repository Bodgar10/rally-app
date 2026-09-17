// src/lib/engine/expres/__tests__/sorteo.test.ts
import {
  barajar,
  generadorDeSemilla,
  repartirGrupos,
  tamanosDeGrupo,
} from '../sorteo';

const parejas = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('tamanosDeGrupo — los dos grupos siempre pares', () => {
  it.each([
    [12, 6, 6],
    [14, 8, 6],
    [16, 8, 8],
    [18, 10, 8],
    [20, 10, 10],
    [22, 12, 10],
    [24, 12, 12],
  ])('cupo %i → A=%i, B=%i', (cupo, a, b) => {
    expect(tamanosDeGrupo(cupo)).toEqual({ A: a, B: b });
  });

  it('ambos grupos son pares para cualquier cupo par: 5 partidos es impar', () => {
    for (let cupo = 12; cupo <= 60; cupo += 2) {
      const { A, B } = tamanosDeGrupo(cupo);
      expect(A % 2).toBe(0);
      expect(B % 2).toBe(0);
      expect(A + B).toBe(cupo);
      expect(A).toBeGreaterThanOrEqual(B); // A es el grande cuando son desiguales
    }
  });
});

describe('generadorDeSemilla — aleatorio para el organizador, determinista aquí', () => {
  it('la misma semilla da la misma secuencia', () => {
    const a = generadorDeSemilla('torneo-2026-09-20');
    const b = generadorDeSemilla('torneo-2026-09-20');
    const seq = (r: () => number) => Array.from({ length: 10 }, r);
    expect(seq(a)).toEqual(seq(b));
  });

  it('semillas distintas dan secuencias distintas', () => {
    const seq = (s: string) => Array.from({ length: 5 }, generadorDeSemilla(s));
    expect(seq('a')).not.toEqual(seq('b'));
  });

  it('devuelve valores en [0, 1)', () => {
    const r = generadorDeSemilla('x');
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('barajar', () => {
  it('no muta la entrada y conserva todos los elementos', () => {
    const original = parejas(16);
    const copia = [...original];
    const out = barajar(original, generadorDeSemilla('s'));
    expect(original).toEqual(copia);
    expect([...out].sort()).toEqual([...original].sort());
  });

  it('con la misma semilla baraja igual', () => {
    const l = parejas(16);
    expect(barajar(l, generadorDeSemilla('s'))).toEqual(barajar(l, generadorDeSemilla('s')));
  });

  it('realmente mueve las cosas', () => {
    const l = parejas(16);
    expect(barajar(l, generadorDeSemilla('s'))).not.toEqual(l);
  });

  it('no está sesgado: cada pareja aparece en todas las posiciones', () => {
    // Fisher-Yates hacia delante estaría sesgado y no se nota mirando un
    // sorteo suelto; se nota agregando muchos.
    const l = parejas(6);
    const posiciones = new Map<string, Set<number>>(l.map((p) => [p, new Set<number>()]));
    for (let i = 0; i < 400; i++) {
      barajar(l, generadorDeSemilla(`semilla-${i}`)).forEach((p, idx) =>
        posiciones.get(p)!.add(idx),
      );
    }
    for (const p of l) expect(posiciones.get(p)!.size).toBe(6);
  });
});

describe('repartirGrupos', () => {
  it('reparte todas las parejas sin perder ni duplicar ninguna', () => {
    const l = parejas(16);
    const { A, B } = repartirGrupos(l, 'semilla');
    expect(A).toHaveLength(8);
    expect(B).toHaveLength(8);
    expect([...A, ...B].sort()).toEqual([...l].sort());
  });

  it('con grupos desiguales, A es el grande', () => {
    const { A, B } = repartirGrupos(parejas(14), 'semilla');
    expect(A).toHaveLength(8);
    expect(B).toHaveLength(6);
  });

  it('es reproducible: la semilla guardada rehace el sorteo entero', () => {
    const l = parejas(16);
    expect(repartirGrupos(l, 'x')).toEqual(repartirGrupos(l, 'x'));
  });

  it('otra semilla, otro sorteo', () => {
    const l = parejas(16);
    expect(repartirGrupos(l, 'x')).not.toEqual(repartirGrupos(l, 'y'));
  });

  it('el orden de llegada de las inscripciones NO cambia el sorteo', () => {
    // La semilla guardada tiene que reproducir el sorteo por sí sola. Si el
    // resultado dependiera además del orden en que la consulta devolvió las
    // filas, auditarlo exigiría conservar también ese orden.
    const l = parejas(16);
    const barajada = [l[7], l[0], l[15], ...l.filter((_, i) => ![0, 7, 15].includes(i))];
    expect(repartirGrupos(barajada, 'x')).toEqual(repartirGrupos([...l].reverse(), 'x'));
    expect(repartirGrupos(l, 'x')).toEqual(repartirGrupos(barajada, 'x'));
  });

  it('rechaza un cupo que dejaría un grupo por debajo del mínimo', () => {
    expect(() => repartirGrupos(parejas(10), 'x')).toThrow(/el mínimo es 6 por grupo/);
  });
});
