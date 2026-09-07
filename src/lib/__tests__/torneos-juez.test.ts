import {
  canchaComun,
  queCapturar,
  algoQueCapturar,
  ordenarArbitrados,
  type TorneoArbitrado,
} from '../torneos-juez';

const t = (over: Partial<TorneoArbitrado> = {}): TorneoArbitrado => ({
  id: 't1',
  nombre: 'Copa Rally',
  inicio: '2026-09-05',
  fin: '2026-09-07',
  organizador: 'Club Rally',
  porCapturar: [],
  ...over,
});

const en = (...canchas: Array<string | null>) =>
  canchas.map((cancha, i) => ({ id: `m${i}`, cancha }));

describe('a qué cancha mandarlo', () => {
  it('con todos en la misma, esa', () => {
    expect(canchaComun(en('Cancha 3', 'Cancha 3'))).toBe('Cancha 3');
  });

  // Nombrar una lo mandaría al sitio equivocado la mitad de las veces.
  it('con los pendientes repartidos, ninguna', () => {
    expect(canchaComun(en('Cancha 3', 'Cancha 5'))).toBeNull();
  });

  // No todo torneo asigna canchas, y eso se ve igual desde fuera.
  it('sin cancha en los datos, ninguna', () => {
    expect(canchaComun(en(null, null))).toBeNull();
    expect(canchaComun(en(null, 'Cancha 3'))).toBeNull();
    expect(canchaComun([])).toBeNull();
  });
});

describe('qué se le dice al juez', () => {
  it('la cancha primero: es hacia dónde caminar', () => {
    expect(queCapturar(t({ porCapturar: en('Cancha 3', 'Cancha 3') })))
      .toEqual({ texto: 'Cancha 3 · 2 partidos por capturar', urge: true });
  });

  it('uno solo va en singular', () => {
    expect(queCapturar(t({ porCapturar: en('Cancha 1') }))?.texto)
      .toBe('Cancha 1 · 1 partido por capturar');
  });

  it('sin una cancha común, solo el número', () => {
    expect(queCapturar(t({ porCapturar: en('Cancha 3', 'Cancha 5') }))?.texto)
      .toBe('2 partidos por capturar');
  });

  // Un marcador sin subir tiene a dos parejas esperando y una tabla parada.
  // No hay aquí el equivalente al "trabajo normal" del organizador.
  it('siempre urge, cuando hay algo', () => {
    expect(queCapturar(t({ porCapturar: en('Cancha 1') }))?.urge).toBe(true);
    expect(queCapturar(t({ porCapturar: en(null, null, null) }))?.urge).toBe(true);
  });

  // Regla compartida con el organizador: sin pendientes, silencio.
  it('sin pendientes, nada', () => {
    expect(queCapturar(t())).toBeNull();
  });

  it('sin vocabulario de motor ni español de España', () => {
    for (const caso of [en('Cancha 3'), en('Cancha 3', 'Cancha 3'), en(null, 'Cancha 5')]) {
      const txt = queCapturar(t({ porCapturar: caso }))?.texto ?? '';
      expect(txt).not.toMatch(/clinch|repesca|seed|bye|bracket/i);
      expect(txt).not.toMatch(/\bvosotros\b|\bvuestr[oa]s?\b/i);
      expect(txt).not.toMatch(/[a-záéíóúñ]+(áis|éis|ís)\b/i);
    }
  });
});

describe('si hay algo que capturar en alguno', () => {
  it('con uno basta', () => {
    expect(algoQueCapturar([t(), t({ id: 't2', porCapturar: en('Cancha 1') })])).toBe(true);
  });
  it('sin ninguno, no', () => {
    expect(algoQueCapturar([t(), t({ id: 't2' })])).toBe(false);
    expect(algoQueCapturar([])).toBe(false);
  });
});

describe('el orden de sus torneos', () => {
  it('donde hay trabajo, arriba', () => {
    const lista = [
      t({ id: 'tranquilo' }),
      t({ id: 'conTrabajo', porCapturar: en('Cancha 2') }),
    ].sort(ordenarArbitrados);
    expect(lista.map((x) => x.id)).toEqual(['conTrabajo', 'tranquilo']);
  });

  // `sort` es estable: dentro de cada mitad se respeta el orden por cercanía
  // que ya trae useJudgeTournaments.
  it('a igual trabajo, no reordena', () => {
    const lista = [
      t({ id: 'a', porCapturar: en('C1') }),
      t({ id: 'b', porCapturar: en('C2') }),
      t({ id: 'c' }),
      t({ id: 'd' }),
    ].sort(ordenarArbitrados);
    expect(lista.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
