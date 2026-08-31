import {
  agruparPorHora, agruparEnBloques, resumirCanchas,
  fraseOcupacion, esHuecoNotable, type FilaCalendario,
} from '../calendario-franjas';

const f = (
  id: string, hora: string, cancha: string,
  categoria = '5A Fuerza', stage = 'group', categoriaId = 'c5',
): FilaCalendario => ({
  id, categoriaId, categoria, stage, etapa: 'Grupos',
  cancha, hora, horaMin: Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3)),
  iso: `2026-09-11T${hora}:00Z`,
  parejaAId: 'a', parejaBId: 'b', parejaA: 'A / B', parejaB: 'C / D',
  estado: 'scheduled', jugadores: [],
});

describe('agruparPorHora', () => {
  it('las franjas vacías NO se omiten: el hueco es el dato', () => {
    // El viernes de Cimepa: partidos a las 14:00 y nada hasta las 17:00.
    const r = agruparPorHora([f('1', '14:00', 'Cancha 1'), f('2', '17:00', 'Cancha 1')]);
    expect(r.map((x) => x.hora)).toEqual(['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00']);
    expect(r.filter((x) => x.filas.length === 0)).toHaveLength(5);
  });

  it('cuenta canchas distintas, no partidos', () => {
    const r = agruparPorHora([
      f('1', '14:00', 'Cancha 1'), f('2', '14:00', 'Cancha 2'), f('3', '14:00', 'Cancha 3'),
    ]);
    expect(r[0].ocupadas).toBe(3);
  });

  it('empieza y acaba donde hay partidos, no a medianoche', () => {
    const r = agruparPorHora([f('1', '09:00', 'Cancha 1')]);
    expect(r).toHaveLength(1);
    expect(r[0].hora).toBe('09:00');
  });

  it('sin partidos no inventa franjas', () => {
    expect(agruparPorHora([])).toEqual([]);
  });

  it('ordena dentro de la franja por categoría y luego por cancha, natural', () => {
    const r = agruparPorHora([
      f('1', '10:00', 'Cancha 10', '5A Fuerza'),
      f('2', '10:00', 'Cancha 2', '5A Fuerza'),
      f('3', '10:00', 'Cancha 1', '2A Fuerza', 'group', 'c2'),
    ]);
    expect(r[0].filas.map((x) => x.cancha)).toEqual(['Cancha 1', 'Cancha 2', 'Cancha 10']);
  });
});

describe('agruparEnBloques', () => {
  it('junta la misma categoría y ronda en un bloque', () => {
    const r = agruparEnBloques([
      f('1', '10:00', 'Cancha 1'), f('2', '10:00', 'Cancha 2'), f('3', '10:00', 'Cancha 3'),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].filas).toHaveLength(3);
    expect(r[0].canchas).toBe('Canchas 1-3');
  });

  it('separa categorías distintas', () => {
    const r = agruparEnBloques([
      f('1', '10:00', 'Cancha 1', '5A Fuerza', 'group', 'c5'),
      f('2', '10:00', 'Cancha 2', '2A Fuerza', 'group', 'c2'),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].categoria).toBe('2A Fuerza');   // alfabético
  });

  it('separa rondas distintas de la misma categoría', () => {
    const r = agruparEnBloques([
      f('1', '10:00', 'Cancha 1', '5A', 'semi'),
      f('2', '10:00', 'Cancha 2', '5A', 'final'),
    ]);
    expect(r).toHaveLength(2);
  });

  it('es determinista con dos rondas de la misma categoría', () => {
    const filas = [
      f('1', '10:00', 'Cancha 1', '5A', 'semi'),
      f('2', '10:00', 'Cancha 2', '5A', 'final'),
    ];
    expect(agruparEnBloques(filas)).toEqual(agruparEnBloques([...filas].reverse()));
  });
});

describe('resumirCanchas', () => {
  it('colapsa solo si son consecutivas', () => {
    expect(resumirCanchas(['Cancha 1', 'Cancha 2', 'Cancha 3'])).toBe('Canchas 1-3');
    // 'Canchas 1-8' tiene que significar las ocho, no "de la 1 a la 8, algunas".
    expect(resumirCanchas(['Cancha 1', 'Cancha 3', 'Cancha 8'])).toBe('Cancha 1, Cancha 3, Cancha 8');
  });

  it('una sola se dice tal cual', () => {
    expect(resumirCanchas(['Cancha 7'])).toBe('Cancha 7');
    expect(resumirCanchas([])).toBe('');
  });

  it('etiquetas sin número no se colapsan', () => {
    expect(resumirCanchas(['Central', 'Cristal'])).toBe('Central, Cristal');
  });
});

describe('fraseOcupacion y esHuecoNotable', () => {
  it('el cociente es el dato, no el número suelto', () => {
    expect(fraseOcupacion(3, 8)).toBe('3 de 8 canchas');
    expect(fraseOcupacion(1, 1)).toBe('1 de 1 cancha');
  });

  it('sin total no se inventa', () => {
    expect(fraseOcupacion(3, null)).toBe('3 canchas');
    expect(fraseOcupacion(0, 8)).toBe('Sin partidos');
  });

  it('el viernes de Cimepa: 3 de 8 es un hueco que hay que señalar', () => {
    expect(esHuecoNotable(3, 8)).toBe(true);
    expect(esHuecoNotable(4, 8)).toBe(true);
    expect(esHuecoNotable(5, 8)).toBe(false);
  });

  it('una franja vacía no es "hueco notable": es otra cosa y se dice aparte', () => {
    expect(esHuecoNotable(0, 8)).toBe(false);
    expect(esHuecoNotable(3, null)).toBe(false);
  });
});
