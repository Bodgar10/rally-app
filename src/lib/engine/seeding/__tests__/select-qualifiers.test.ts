import { selectQualifiers, type QualifierStanding } from '../select-qualifiers';

const s = (
  pairId: string, groupId: string, position: number, points: number,
  setsWon = 0, setsLost = 0, gamesWon = 0, gamesLost = 0,
): QualifierStanding => ({ pairId, groupId, position, points, setsWon, setsLost, gamesWon, gamesLost });

describe('selectQualifiers', () => {
  it('QA-06: 2 grupos, top 2, sin extra → 4 clasificados; 1ºs mejor seed que 2ºs', () => {
    const standings = [
      s('A1','A',1,4), s('A2','A',2,2), s('A3','A',3,0),
      s('B1','B',1,4), s('B2','B',2,2), s('B3','B',3,0),
    ];
    const q = selectQualifiers(standings, 2, 0);
    expect(q.map((x) => x.pairId).sort()).toEqual(['A1','A2','B1','B2'].sort());
    const r = Object.fromEntries(q.map((x) => [x.pairId, x.rating]));
    expect(r['A1']).toBeGreaterThan(r['A2']); // 1º de grupo siembra por encima del 2º
    expect(r['B1']).toBeGreaterThan(r['B2']);
  });

  it('9 parejas: 3 grupos de 3, top 1 + 1 mejor 2º → 4 clasificados', () => {
    const standings = [
      s('A1','A',1,4), s('A2','A',2,2,2,1,8,5), s('A3','A',3,0),
      s('B1','B',1,4), s('B2','B',2,2,2,1,8,7), s('B3','B',3,0),
      s('C1','C',1,4), s('C2','C',2,2,2,1,8,6), s('C3','C',3,0),
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
    const standings = [ s('A1','A',1,4), s('A2','A',2,2), s('B1','B',1,4), s('B2','B',2,2) ];
    const q = selectQualifiers(standings, 2, 0);
    const ratings = q.map((x) => x.rating);
    for (let i = 1; i < ratings.length; i++) expect(ratings[i]).toBeLessThan(ratings[i - 1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GRUPOS DE TAMAÑOS DISTINTOS
//
// Los tres tests de arriba usan grupos uniformes, y ahí el sesgo de tamaño no
// se ve. Pero los planes con repesca son justo los mixtos: 10 = [4,3,3],
// 16 = [4,3,3,3,3], 20 = [4,4,3,3,3,3], 32 = [4,4,3,3,3,3,3,3,3,3].
// ─────────────────────────────────────────────────────────────────────────
describe('selectQualifiers — mejores segundos con grupos de 3 y de 4', () => {
  it('un 1-2 en grupo de 4 NO le gana a un 1-1 en grupo de 3 por puntos: empatan y decide la dif. de sets', () => {
    // Plan de 10 parejas: [4,3,3], pasa 1 por grupo + 1 mejor segundo.
    //
    // A2 jugó 3 partidos y ganó 1. B2 y C2 jugaron 2 y ganaron 1.
    // Con el punto por derrota jugada, A2 sumaba 4 y los otros 3: el que
    // perdió dos de tres entraba al cuadro sin que se miraran los sets.
    const standings = [
      // Grupo A (4 parejas)
      s('A1','A',1,6, 6,1, 38,20),
      s('A2','A',2,2, 3,4, 28,30),   // 1-2  → dif. sets -1
      s('A3','A',3,2, 3,4, 26,32),
      s('A4','A',4,2, 2,5, 22,34),
      // Grupo B (3 parejas)
      s('B1','B',1,4, 4,1, 26,14),
      s('B2','B',2,2, 2,2, 20,18),   // 1-1  → dif. sets 0  ← mejor segundo
      s('B3','B',3,0, 0,4, 10,24),
      // Grupo C (3 parejas)
      s('C1','C',1,4, 4,0, 24,10),
      s('C2','C',2,2, 2,3, 19,22),   // 1-1  → dif. sets -1
      s('C3','C',3,0, 1,4, 14,25),
    ];

    const segundos = standings.filter((x) => x.position === 2);
    expect(segundos.map((x) => x.points)).toEqual([2, 2, 2]); // empatan en puntos

    const q = selectQualifiers(standings, 1, 1);
    expect(q).toHaveLength(4);
    expect(q.map((x) => x.pairId)).toEqual(expect.arrayContaining(['A1','B1','C1']));
    expect(q.map((x) => x.pairId)).toContain('B2');    // dif. sets 0
    expect(q.map((x) => x.pairId)).not.toContain('A2'); // dif. sets -1, jugó más
    expect(q.map((x) => x.pairId)).not.toContain('C2');
  });

  it('a igualdad de puntos y de diferencias, decide el % de games y no el acumulado', () => {
    // P jugó 3 partidos (grupo de 4), Q jugó 2 (grupo de 3).
    // Ambos +2 de games. P acumuló 16 games ganados, Q solo 11 — pero P los
    // ganó sobre 30 jugados (53.3%) y Q sobre 20 (55%). El criterio viejo
    // (`gamesWon` a secas) le daba el lugar a P por haber jugado más.
    const standings = [
      s('P1','P',1,6, 6,0, 36,18),
      s('P2','P',2,2, 3,3, 16,14),   // 16/30 = 53.3%
      s('P3','P',3,2, 2,4, 14,20),
      s('P4','P',4,2, 2,4, 13,21),
      s('Q1','Q',1,4, 4,0, 24,10),
      s('Q2','Q',2,2, 3,3, 11, 9),   // 11/20 = 55%  ← entra
      s('Q3','Q',3,0, 0,4, 10,24),
    ];
    const q = selectQualifiers(standings, 1, 1);
    expect(q.map((x) => x.pairId)).toContain('Q2');
    expect(q.map((x) => x.pairId)).not.toContain('P2');
  });

  it('empate perfecto entre segundos: orden reproducible por pairId, no por el orden de la consulta', () => {
    // generate-bracket lee group_standings sin `order by`. Sin criterio final
    // el cuadro dependía del orden en que Postgres devolviera las filas.
    const base: QualifierStanding[] = [
      s('X1','X',1,4, 4,0, 24,10), s('X2','X',2,2, 2,2, 18,18), s('X3','X',3,0, 0,4, 10,24),
      s('Y1','Y',1,4, 4,0, 24,10), s('Y2','Y',2,2, 2,2, 18,18), s('Y3','Y',3,0, 0,4, 10,24),
    ];
    const alReves = [...base].reverse();
    const a = selectQualifiers(base, 1, 1).map((x) => x.pairId);
    const b = selectQualifiers(alReves, 1, 1).map((x) => x.pairId);
    expect(a).toEqual(b);
    expect(a).toContain('X2'); // X2 < Y2
  });
});
