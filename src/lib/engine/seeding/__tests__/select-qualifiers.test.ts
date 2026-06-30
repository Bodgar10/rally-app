import { selectQualifiers, type QualifierStanding } from '../select-qualifiers';

const s = (
  pairId: string, groupId: string, position: number, points: number,
  setsWon = 0, setsLost = 0, gamesWon = 0, gamesLost = 0,
): QualifierStanding => ({ pairId, groupId, position, points, setsWon, setsLost, gamesWon, gamesLost });

describe('selectQualifiers', () => {
  it('QA-06: 2 grupos, top 2, sin extra → 4 clasificados; 1ºs mejor seed que 2ºs', () => {
    const standings = [
      s('A1','A',1,4), s('A2','A',2,3), s('A3','A',3,2),
      s('B1','B',1,4), s('B2','B',2,3), s('B3','B',3,2),
    ];
    const q = selectQualifiers(standings, 2, 0);
    expect(q.map((x) => x.pairId).sort()).toEqual(['A1','A2','B1','B2'].sort());
    const r = Object.fromEntries(q.map((x) => [x.pairId, x.rating]));
    expect(r['A1']).toBeGreaterThan(r['A2']); // 1º de grupo siembra por encima del 2º
    expect(r['B1']).toBeGreaterThan(r['B2']);
  });

  it('9 parejas: 3 grupos de 3, top 1 + 1 mejor 2º → 4 clasificados', () => {
    const standings = [
      s('A1','A',1,4), s('A2','A',2,3,2,1,8,5), s('A3','A',3,2),
      s('B1','B',1,4), s('B2','B',2,3,2,1,8,7), s('B3','B',3,2),
      s('C1','C',1,4), s('C2','C',2,3,2,1,8,6), s('C3','C',3,2),
    ];
    const q = selectQualifiers(standings, 1, 1);
    expect(q).toHaveLength(4);
    expect(q.map((x) => x.pairId)).toEqual(expect.arrayContaining(['A1','B1','C1']));
    // el mejor 2º es A2 (mejor dif. de games entre los segundos)
    expect(q.map((x) => x.pairId)).toContain('A2');
    expect(q.map((x) => x.pairId)).not.toContain('B2');
  });

  it('24 parejas: 6 grupos de 4, top 2 + 4 mejores 3º → 16 clasificados', () => {
    const standings: QualifierStanding[] = [];
    const groups = ['A','B','C','D','E','F'];
    groups.forEach((g, gi) => {
      standings.push(s(`${g}1`,g,1,6));
      standings.push(s(`${g}2`,g,2,4));
      standings.push(s(`${g}3`,g,3,2, 0,0, gi, 0)); // dif. games crece con el índice de grupo
      standings.push(s(`${g}4`,g,4,0));
    });
    const q = selectQualifiers(standings, 2, 4);
    expect(q).toHaveLength(16); // 12 directos + 4 mejores terceros
    const thirds = q.map((x) => x.pairId).filter((id) => id.endsWith('3'));
    expect(thirds.sort()).toEqual(['C3','D3','E3','F3'].sort()); // los 4 con mayor dif. de games
  });

  it('rating sintético es estrictamente decreciente en el orden de siembra', () => {
    const standings = [ s('A1','A',1,4), s('A2','A',2,3), s('B1','B',1,4), s('B2','B',2,3) ];
    const q = selectQualifiers(standings, 2, 0);
    const ratings = q.map((x) => x.rating);
    for (let i = 1; i < ratings.length; i++) expect(ratings[i]).toBeLessThan(ratings[i - 1]);
  });
});
