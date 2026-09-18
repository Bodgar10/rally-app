// src/lib/__tests__/scouting.test.ts
import {
  DIFERENCIA_NOTABLE,
  fichaDelRival,
  lineasDeLaFicha,
  textoDeLaPareja,
  textoDelHistorial,
  textoDelMasFuerte,
  textoDelPronostico,
  textoDeProbabilidad,
  type EntradaScouting,
  type NivelJugador,
} from '@/lib/scouting';

const j = (id: string, rating: number, rd = 50): NivelJugador => ({
  id,
  nombre: id.toUpperCase(),
  rating,
  rd,
});

const entrada = (p: Partial<EntradaScouting> = {}): EntradaScouting => ({
  nosotros: [j('ana', 1600), j('beto', 1600)],
  ellos: [j('caro', 1600), j('dani', 1600)],
  historial: [],
  torneosJuntos: 0,
  ...p,
});

describe('la probabilidad', () => {
  it('entre parejas iguales es 50%', () => {
    expect(textoDeProbabilidad(fichaDelRival(entrada()))).toBe('50%');
  });

  it('con rivales más flojos sube', () => {
    const f = fichaDelRival(entrada({ ellos: [j('caro', 1400), j('dani', 1400)] }));
    expect(f.probabilidad).toBeGreaterThan(0.5);
    expect(textoDelPronostico(f)).toMatch(/favorito|ganarlo/);
  });

  it('con rivales más fuertes baja', () => {
    const f = fichaDelRival(entrada({ ellos: [j('caro', 1900), j('dani', 1900)] }));
    expect(f.probabilidad).toBeLessThan(0.5);
    expect(textoDelPronostico(f)).toMatch(/ellos como favoritos|cuesta arriba/);
  });

  it('SI ALGUNO NO ESTÁ MEDIDO, NO SE ENSEÑA PORCENTAJE', () => {
    // Glicko ya empuja hacia el 50%, pero un "51%" se lee como "está parejo"
    // cuando lo que pasa es que no se sabe. Son cosas distintas.
    const f = fichaDelRival(entrada({ ellos: [j('caro', 1600), j('dani', 1600, 350)] }));
    expect(f.fiable).toBe(false);
    expect(textoDeProbabilidad(f)).toBeNull();
    expect(textoDelPronostico(f)).toBe('Todavía no hay con qué medir este partido.');
  });

  it('basta con que uno de los cuatro esté sin medir', () => {
    expect(fichaDelRival(entrada({ nosotros: [j('ana', 1600, 300), j('beto', 1600)] })).fiable).toBe(false);
  });
});

describe('el historial entre los dos duos', () => {
  const h = (ganamos: boolean, dia: string) => ({ fecha: `2026-0${dia}`, ganamos });

  it('calla si nunca se han visto', () => {
    expect(textoDelHistorial(fichaDelRival(entrada()))).toBeNull();
  });

  it('con un solo partido lo dice en singular y en su sentido', () => {
    expect(textoDelHistorial(fichaDelRival(entrada({ historial: [h(true, '3-01')] })))).toBe(
      'Se han visto una vez y ganaste tú.',
    );
    expect(textoDelHistorial(fichaDelRival(entrada({ historial: [h(false, '3-01')] })))).toBe(
      'Se han visto una vez y ganaron ellos.',
    );
  });

  it('con varios da el marcador y a favor de quién', () => {
    const f = fichaDelRival(entrada({ historial: [h(true, '3-01'), h(false, '4-01'), h(false, '5-01')] }));
    expect(f.jugados).toBe(3);
    expect(f.ganados).toBe(1);
    expect(textoDelHistorial(f)).toBe('Se han visto 3 veces: 1-2 a favor de ellos.');
  });

  it('empatados no se lo apunta nadie', () => {
    const f = fichaDelRival(entrada({ historial: [h(true, '3-01'), h(false, '4-01')] }));
    expect(textoDelHistorial(f)).toBe('Se han visto 2 veces: 1-1 a favor de nadie.');
  });
});

describe('quién manda en la pareja rival', () => {
  it('lo dice cuando hay diferencia clara', () => {
    const f = fichaDelRival(entrada({ ellos: [j('caro', 1700), j('dani', 1500)] }));
    expect(f.masFuerte?.id).toBe('caro');
    expect(textoDelMasFuerte(f)).toBe('CARO es el más fuerte de los dos.');
  });

  it('calla si están parejos: señalar a uno sería inventarse una ventaja', () => {
    const f = fichaDelRival(entrada({ ellos: [j('caro', 1620), j('dani', 1600)] }));
    expect(f.masFuerte).toBeNull();
    expect(textoDelMasFuerte(f)).toBeNull();
  });

  it('el umbral es el declarado', () => {
    const justo = fichaDelRival(entrada({ ellos: [j('caro', 1600 + DIFERENCIA_NOTABLE), j('dani', 1600)] }));
    expect(justo.masFuerte).not.toBeNull();
  });

  it('calla si no están medidos, aunque los números se vean lejos', () => {
    const f = fichaDelRival(entrada({ ellos: [j('caro', 1900, 300), j('dani', 1500)] }));
    expect(f.masFuerte).toBeNull();
  });
});

describe('si son pareja fija o de ocasión', () => {
  it.each([
    [0, null],
    [1, 'Es la primera vez que juegan juntos.'],
    [3, 'Llevan 3 torneos juntos.'],
    [12, 'Llevan 12 torneos juntos: son pareja fija.'],
  ])('con %i torneos juntos', (n, esperado) => {
    expect(textoDeLaPareja(fichaDelRival(entrada({ torneosJuntos: n as number })))).toBe(esperado);
  });
});

describe('la ficha completa', () => {
  it('junta solo las líneas que tienen algo que decir', () => {
    const f = fichaDelRival(
      entrada({
        ellos: [j('caro', 1700), j('dani', 1500)],
        historial: [{ fecha: '2026-03-01', ganamos: false }],
        torneosJuntos: 14,
      }),
    );
    expect(lineasDeLaFicha(f)).toEqual([
      'Se han visto una vez y ganaron ellos.',
      'CARO es el más fuerte de los dos.',
      'Llevan 14 torneos juntos: son pareja fija.',
    ]);
  });

  it('sin historia y sin nada que destacar, no dice nada de relleno', () => {
    expect(lineasDeLaFicha(fichaDelRival(entrada()))).toEqual([]);
  });
});
