import { agendaExpres, estaCapturado, type PartidoAgenda } from '@/lib/agenda-expres';

const p = (
  id: string, grupo: string, ronda: string, hora: string,
  gamesA: number | null = null, gamesB: number | null = null,
): PartidoAgenda => ({ id, grupo, ronda, hora, gamesA, gamesB });

describe('estaCapturado', () => {
  it('hacen falta los DOS games: uno solo es un dato a medias', () => {
    expect(estaCapturado(p('1', 'A', 'Ronda 1', '12:00', 4, 2))).toBe(true);
    expect(estaCapturado(p('2', 'A', 'Ronda 1', '12:00'))).toBe(false);
    expect(estaCapturado(p('3', 'A', 'Ronda 1', '12:00', 4, null))).toBe(false);
    expect(estaCapturado(p('4', 'A', 'Ronda 1', '12:00', null, 2))).toBe(false);
  });

  // Un 0-6 es un marcador legítimo, no un hueco.
  it('un cero es un marcador, no una ausencia', () => {
    expect(estaCapturado(p('5', 'A', 'Ronda 1', '12:00', 0, 6))).toBe(true);
  });
});

describe('agendaExpres · lo pendiente arriba', () => {
  const lista = [
    p('a1', 'A', 'Ronda 1', '12:00', 4, 2),
    p('a2', 'A', 'Ronda 1', '12:00', 3, 3),
    p('b1', 'B', 'Ronda 1', '12:30'),
    p('b2', 'B', 'Ronda 1', '12:30', 6, 0),
    p('a3', 'A', 'Ronda 2', '13:00'),
  ];

  it('separa lo que falta de lo hecho', () => {
    const a = agendaExpres(lista);
    expect(a.porJugar.flatMap((s) => s.partidos).map((x) => x.id)).toEqual(['b1', 'a3']);
    expect(a.capturados.flatMap((s) => s.partidos).map((x) => x.id)).toEqual(['a1', 'a2', 'b2']);
  });

  it('cuenta lo que falta sobre el total', () => {
    const a = agendaExpres(lista);
    expect(a.faltan).toBe(2);
    expect(a.total).toBe(5);
  });

  // Justo lo que pasa en la cancha: media ronda anotada y media no.
  it('una ronda a medias sale partida entre las dos secciones', () => {
    const a = agendaExpres(lista);
    expect(a.porJugar.map((s) => s.cabecera)).toEqual(['Grupo B · Ronda 1', 'Grupo A · Ronda 2']);
    expect(a.capturados.map((s) => s.cabecera)).toEqual(['Grupo A · Ronda 1', 'Grupo B · Ronda 1']);
  });

  it('agrupa por ronda sin romper el orden de entrada', () => {
    const a = agendaExpres(lista);
    expect(a.capturados[0].partidos.map((x) => x.id)).toEqual(['a1', 'a2']);
  });
});

describe('agendaExpres · los extremos', () => {
  it('recién sorteado: todo por jugar y nada capturado', () => {
    const a = agendaExpres([p('x', 'A', 'Ronda 1', '12:00'), p('y', 'A', 'Ronda 1', '12:00')]);
    expect(a.capturados).toEqual([]);
    expect(a.faltan).toBe(2);
    expect(a.porJugar).toHaveLength(1);
  });

  it('todo capturado: la sección de arriba queda vacía', () => {
    const a = agendaExpres([p('x', 'A', 'Ronda 1', '12:00', 4, 2)]);
    expect(a.porJugar).toEqual([]);
    expect(a.faltan).toBe(0);
  });

  it('sin partidos no inventa secciones', () => {
    expect(agendaExpres([])).toEqual({ porJugar: [], capturados: [], faltan: 0, total: 0 });
  });

  // Dos grupos distintos en la misma ronda no se mezclan: son dos tandas.
  it('mismo nombre de ronda en grupos distintos son dos cabeceras', () => {
    const a = agendaExpres([
      p('x', 'A', 'Ronda 1', '12:00'),
      p('y', 'B', 'Ronda 1', '12:30'),
    ]);
    expect(a.porJugar).toHaveLength(2);
  });

  it('no muta la lista que recibe', () => {
    const entrada = [p('a', 'A', 'Ronda 1', '12:00', 4, 2), p('b', 'A', 'Ronda 1', '12:00')];
    agendaExpres(entrada);
    expect(entrada.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
