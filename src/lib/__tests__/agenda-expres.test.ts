import {
  agendaExpres, estaCapturado, coincide, normalizar, type PartidoAgenda,
} from '@/lib/agenda-expres';

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

describe('buscar una pareja por nombre', () => {
  const A = 'Luis Martínez / Manuel Torres';
  const B = 'Carlos Gómez / Daniel Morales';

  it('sin escribir nada no filtra nada', () => {
    expect(coincide('', A, B)).toBe(true);
    expect(coincide('   ', A, B)).toBe(true);
  });

  // El caso que hace o rompe el buscador en español: media plantilla se
  // llama Martínez y nadie teclea la tilde con el teléfono en una mano.
  it('encuentra sin acentos', () => {
    expect(coincide('martinez', A, B)).toBe(true);
    expect(coincide('gomez', A, B)).toBe(true);
    expect(coincide('MARTINEZ', A, B)).toBe(true);
  });

  it('también con acentos, por si los escribe', () => {
    expect(coincide('martínez', A, B)).toBe(true);
  });

  it('encuentra por el apellido del segundo jugador', () => {
    expect(coincide('torres', A, B)).toBe(true);
  });

  it('busca en las DOS parejas del partido', () => {
    expect(coincide('morales', A, B)).toBe(true);
  });

  // Así es como se nombra a una pareja en la cancha: dos apellidos sueltos.
  it('varias palabras se exigen todas, en cualquier orden', () => {
    expect(coincide('luis torres', A, B)).toBe(true);
    expect(coincide('torres luis', A, B)).toBe(true);
    expect(coincide('luis morales', A, B)).toBe(true); // uno de cada pareja
    expect(coincide('luis inexistente', A, B)).toBe(false);
  });

  it('lo que no está, no aparece', () => {
    expect(coincide('ramirez', A, B)).toBe(false);
  });

  it('encuentra por trozo de palabra', () => {
    expect(coincide('mart', A, B)).toBe(true);
  });
});

describe('normalizar', () => {
  it('quita tildes y baja a minúsculas', () => {
    expect(normalizar('Martínez Óscar')).toBe('martinez oscar');
  });

  // La ñ TAMBIÉN se pliega a n, y para buscar es lo que se quiere: quien no
  // la tenga a mano en el teclado escribe "bolanos" y encuentra igual. Como
  // los dos lados pasan por aquí, "Bolaños" también encuentra a "Bolaños".
  it('la ñ se pliega a n para que el buscador perdone el teclado', () => {
    expect(normalizar('Bolaños')).toBe('bolanos');
    expect(coincide('bolanos', 'Aldo Bolaños / Bodgar Espinosa')).toBe(true);
    expect(coincide('bolaños', 'Aldo Bolaños / Bodgar Espinosa')).toBe(true);
  });

  it('recorta los espacios de los extremos', () => {
    expect(normalizar('  Ruiz  ')).toBe('ruiz');
  });
});

describe('cabeceras del cuadro', () => {
  // En el cuadro no hay grupo. "Grupo · Cuartos de final" inventaría uno.
  it('sin grupo, la cabecera es la ronda sola', () => {
    const a = agendaExpres([p('x', '', 'Cuartos de final', '17:00')]);
    expect(a.porJugar[0].cabecera).toBe('Cuartos de final');
  });

  it('con grupo sigue diciendo los dos', () => {
    const a = agendaExpres([p('x', 'A', 'Ronda 1', '12:00')]);
    expect(a.porJugar[0].cabecera).toBe('Grupo A · Ronda 1');
  });

  it('cuartos y semis son dos secciones', () => {
    const a = agendaExpres([
      p('q1', '', 'Cuartos de final', '17:00'),
      p('q2', '', 'Cuartos de final', '17:00'),
      p('s1', '', 'Semifinales', '17:30'),
    ]);
    expect(a.porJugar.map((x) => x.cabecera)).toEqual(['Cuartos de final', 'Semifinales']);
  });
});
