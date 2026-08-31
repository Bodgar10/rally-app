import { ordenarPartidos, type PartidoOrdenable } from '../orden-partidos';

const p = (
  id: string,
  categoryName: string,
  groupName: string | null = null,
  roundLabel: string | null = null,
  scheduledAt: string | null = null,
): PartidoOrdenable => ({ id, categoryName, groupName, roundLabel, scheduledAt });

describe('ordenarPartidos', () => {
  it('los que tienen hora van primero y en orden cronológico', () => {
    const r = ordenarPartidos([
      p('a', '5A Fuerza'),
      p('b', '2A Fuerza', null, null, '2026-09-12T18:00:00Z'),
      p('c', '2A Fuerza', null, null, '2026-09-12T08:00:00Z'),
    ]);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('sin hora, ordena categoria -> grupo -> ronda', () => {
    const r = ordenarPartidos([
      p('4', '5A Fuerza', 'B', 'g-2'),
      p('1', '2A Fuerza', 'A', 'g-1'),
      p('3', '5A Fuerza', 'A', 'g-1'),
      p('2', '2A Fuerza', 'A', 'g-2'),
    ]);
    expect(r.map((x) => x.id)).toEqual(['1', '2', '3', '4']);
  });

  it('los grupos se ordenan como una persona: 10 detras de 9', () => {
    const r = ordenarPartidos([
      p('x', '5A', '10'),
      p('y', '5A', '9'),
      p('z', '5A', '2'),
    ]);
    expect(r.map((x) => x.groupName)).toEqual(['2', '9', '10']);
  });

  it('las eliminatorias (sin grupo) van tras los grupos de su categoria', () => {
    const r = ordenarPartidos([
      p('ko', '2A Fuerza', null, 'semi-01-02'),
      p('g', '2A Fuerza', 'A', 'g-1'),
    ]);
    expect(r.map((x) => x.id)).toEqual(['g', 'ko']);
  });

  it('es total y determinista: el id desempata', () => {
    const iguales = [p('c', 'X'), p('a', 'X'), p('b', 'X')];
    expect(ordenarPartidos(iguales).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    // Misma entrada en otro orden -> misma salida.
    const revuelto = [p('b', 'X'), p('c', 'X'), p('a', 'X')];
    expect(ordenarPartidos(revuelto)).toEqual(ordenarPartidos(iguales));
  });

  it('no muta la entrada', () => {
    const entrada = [p('b', 'B'), p('a', 'A')];
    const copia = JSON.parse(JSON.stringify(entrada));
    ordenarPartidos(entrada);
    expect(entrada).toEqual(copia);
  });

  it('165 partidos sin hora salen siempre en el mismo orden', () => {
    const cats = ['2A', '3A', '4A', '5A', '6A', '5Fem', 'MxC', 'MxD'];
    const lote: PartidoOrdenable[] = [];
    for (let i = 0; i < 165; i++) {
      lote.push(p(`m${String(i).padStart(3, '0')}`, cats[i % 8], String((i % 11) + 1), `g-${(i % 3) + 1}`));
    }
    const a = ordenarPartidos(lote);
    const b = ordenarPartidos([...lote].reverse());
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
});
