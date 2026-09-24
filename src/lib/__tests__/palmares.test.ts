// El palmarés: qué has hecho, torneo a torneo.
//
// EL AGUJERO: `EresCampeon` se apaga en cuanto el jugador se inscribe a otro
// torneo, y su propio comentario dice que el trofeo "pasa a vivir donde viven
// los logros". Ese sitio no existía: cada torneo nuevo borraba el anterior.

import {
  palmares, logroDelTorneo, titulos,
  type PartidoDelPalmares, type TorneoDelPalmares,
} from '@/lib/palmares';

const p = (stage: string, gane = false, tournamentId = 't1'): PartidoDelPalmares =>
  ({ tournamentId, stage, gane });

const t = (tournamentId: string, fin: string | null, over: Partial<TorneoDelPalmares> = {}): TorneoDelPalmares =>
  ({ tournamentId, torneo: `Copa ${tournamentId}`, categoria: '5.ª Varonil', fin, puntos: 100, ...over });

describe('qué conseguiste en un torneo', () => {
  it('campeón se dice por la final GANADA', () => {
    expect(logroDelTorneo([p('quarter', true), p('semi', true), p('final', true)]))
      .toEqual({ logro: 'Campeón', esTitulo: true });
  });

  // Mismo `stage`, resultado opuesto. Es el caso que una regla por profundidad
  // no puede distinguir.
  it('la final perdida es finalista, no campeón', () => {
    expect(logroDelTorneo([p('semi', true), p('final', false)]))
      .toEqual({ logro: 'Finalista', esTitulo: false });
  });

  it('llega hasta donde llegó su cuadro', () => {
    expect(logroDelTorneo([p('group'), p('quarter')])?.logro).toBe('Cuartos de final');
    expect(logroDelTorneo([p('group'), p('round_of_16')])?.logro).toBe('Octavos de final');
  });

  // El 3.er lugar se juega por haber PERDIDO una semifinal.
  it('el 3.er lugar cuenta como semifinales', () => {
    expect(logroDelTorneo([p('semi'), p('third_place')])?.logro).toBe('Semifinales');
  });

  it('quien no pasó de grupos llegó a la fase de grupos', () => {
    expect(logroDelTorneo([p('group'), p('group')])?.logro).toBe('Fase de grupos');
  });

  // Un stage que no conocemos es un id nuestro; antes que enseñarlo, lo mínimo
  // cierto: jugó.
  it('un stage desconocido no se enseña crudo', () => {
    expect(logroDelTorneo([p('round_of_64')])?.logro).toBe('Fase de grupos');
  });

  it('sin partidos no hay línea: inscribirse no es un logro', () => {
    expect(logroDelTorneo([])).toBeNull();
  });

  it('solo es título el campeonato', () => {
    expect(logroDelTorneo([p('final', false)])?.esTitulo).toBe(false);
    expect(logroDelTorneo([p('final', true)])?.esTitulo).toBe(true);
  });
});

describe('el palmarés entero', () => {
  it('lo último que pasó va arriba', () => {
    const r = palmares(
      [p('final', true, 'viejo'), p('quarter', false, 'nuevo')],
      [t('viejo', '2026-03-01'), t('nuevo', '2026-09-27')],
    );
    expect(r.map((x) => x.tournamentId)).toEqual(['nuevo', 'viejo']);
  });

  it('un torneo sin fecha de fin cae al final', () => {
    const r = palmares(
      [p('final', true, 'sinfecha'), p('quarter', false, 'con')],
      [t('sinfecha', null), t('con', '2026-01-01')],
    );
    expect(r.map((x) => x.tournamentId)).toEqual(['con', 'sinfecha']);
  });

  it('un torneo en el que no jugó ni un partido no sale', () => {
    const r = palmares([p('group', false, 't1')], [t('t1', '2026-01-01'), t('t2', '2026-02-01')]);
    expect(r.map((x) => x.tournamentId)).toEqual(['t1']);
  });

  // Los puntos llegan aparte porque solo existen tras CERRAR el torneo. Sin
  // ellos la línea se enseña igual: la ronda ya se sabe.
  it('un torneo sin cerrar sale con su ronda y sin puntos', () => {
    const r = palmares([p('final', true)], [t('t1', '2026-09-27', { puntos: null })]);
    expect(r[0].logro).toBe('Campeón');
    expect(r[0].puntos).toBeNull();
  });

  it('un palmarés vacío no revienta', () => {
    expect(palmares([], [])).toEqual([]);
  });
});

describe('cuántos títulos', () => {
  it('cuenta solo los campeonatos', () => {
    const r = palmares(
      [p('final', true, 'a'), p('final', false, 'b'), p('final', true, 'c')],
      [t('a', '2026-01-01'), t('b', '2026-02-01'), t('c', '2026-03-01')],
    );
    expect(titulos(r)).toBe(2);
  });

  it('sin títulos, cero', () => {
    expect(titulos(palmares([p('quarter')], [t('t1', '2026-01-01')]))).toBe(0);
  });
});
