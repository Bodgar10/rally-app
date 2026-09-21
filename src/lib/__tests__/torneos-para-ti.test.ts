import { torneosParaTi, porQueSale, type TorneoListable } from '@/lib/torneos-para-ti';

function t(p: Partial<TorneoListable> & { id: string }): TorneoListable {
  return {
    nombre: p.id, inicio: '2026-10-01', fin: '2026-10-01',
    ciudad: 'CDMX', tier: 'p2', modo: 'largo', divisiones: ['quinta'], cuota: 0,
    ...p,
  };
}

const YO = { zona: 'CDMX', divisiones: ['quinta'] };

describe('torneosParaTi · el orden', () => {
  // La prueba que fija la decisión de diseño: la zona pesa MÁS que el tier.
  it('un P2 en su ciudad va antes que un Major en otra', () => {
    const lista = torneosParaTi([
      t({ id: 'major-mty', ciudad: 'Monterrey', tier: 'major' }),
      t({ id: 'p2-cdmx',   ciudad: 'CDMX',      tier: 'p2' }),
    ], YO);
    expect(lista[0].id).toBe('p2-cdmx');
  });

  it('dentro de su ciudad, el Major va primero', () => {
    const lista = torneosParaTi([
      t({ id: 'p2',    tier: 'p2' }),
      t({ id: 'major', tier: 'major' }),
      t({ id: 'p1',    tier: 'p1' }),
    ], YO);
    expect(lista.map((x) => x.id)).toEqual(['major', 'p1', 'p2']);
  });

  it('su división pesa más que el tier', () => {
    const lista = torneosParaTi([
      t({ id: 'major-otra', tier: 'major', divisiones: ['primera'] }),
      t({ id: 'p2-suya',    tier: 'p2',    divisiones: ['quinta'] }),
    ], YO);
    expect(lista[0].id).toBe('p2-suya');
  });

  it('a igualdad de todo, lo que se juega antes', () => {
    const lista = torneosParaTi([
      t({ id: 'tarde',    inicio: '2026-12-01' }),
      t({ id: 'temprano', inicio: '2026-10-05' }),
    ], YO);
    expect(lista[0].id).toBe('temprano');
  });

  // Sin esto el orden dependería de cómo venga la consulta, y dos cargas de
  // la misma pantalla podrían enseñar dos órdenes.
  it('el orden es total: a igualdad absoluta, por nombre', () => {
    const lista = torneosParaTi([
      t({ id: 'b', nombre: 'Beta' }),
      t({ id: 'a', nombre: 'Alfa' }),
    ], YO);
    expect(lista.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('un torneo sin tier no se cuela por delante de los que sí lo tienen', () => {
    const lista = torneosParaTi([
      t({ id: 'sin-tier', tier: null }),
      t({ id: 'con-p2',   tier: 'p2' }),
    ], YO);
    expect(lista[0].id).toBe('con-p2');
  });
});

describe('torneosParaTi · qué entra y qué no', () => {
  it('lo que no es ni de su zona ni de su nivel se queda fuera', () => {
    const lista = torneosParaTi([
      t({ id: 'nada-que-ver', ciudad: 'Mérida', divisiones: ['primera'] }),
      t({ id: 'suyo' }),
    ], YO);
    expect(lista.map((x) => x.id)).toEqual(['suyo']);
  });

  // Su primera vez. Filtrar aquí sería cerrarle la puerta justo al entrar.
  it('un jugador sin zona ni divisiones lo ve TODO, por fecha', () => {
    const lista = torneosParaTi([
      t({ id: 'tarde',    inicio: '2026-12-01', ciudad: 'Mérida', divisiones: ['primera'] }),
      t({ id: 'temprano', inicio: '2026-10-01', ciudad: 'Puebla', divisiones: ['tercera'] }),
    ], { zona: null, divisiones: [] });
    expect(lista.map((x) => x.id)).toEqual(['temprano', 'tarde']);
  });

  it('sabiendo solo la zona tampoco se descarta nada', () => {
    const lista = torneosParaTi([
      t({ id: 'fuera', ciudad: 'Mérida', divisiones: ['primera'] }),
      t({ id: 'casa' }),
    ], { zona: 'CDMX', divisiones: [] });
    expect(lista).toHaveLength(2);
    expect(lista[0].id).toBe('casa');
  });

  it('un torneo sin sede no cuenta como de su zona', () => {
    const [único] = torneosParaTi([t({ id: 'sin-sede', ciudad: null })], YO);
    expect(único.enTuZona).toBe(false);
  });

  it('respeta el límite', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => t({ id: `t${i}` }));
    expect(torneosParaTi(muchos, YO, 3)).toHaveLength(3);
  });

  it('no muta la lista que recibe', () => {
    const entrada = [t({ id: 'b', tier: 'p2' }), t({ id: 'a', tier: 'major' })];
    torneosParaTi(entrada, YO);
    expect(entrada.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('sin torneos devuelve vacío', () => {
    expect(torneosParaTi([], YO)).toEqual([]);
  });
});

describe('porQueSale', () => {
  it('dice las dos razones cuando se cumplen las dos', () => {
    const [x] = torneosParaTi([t({ id: 'x' })], YO);
    expect(porQueSale(x)).toBe('Por tu zona y tu nivel');
  });

  it('solo la zona', () => {
    const [x] = torneosParaTi([t({ id: 'x', divisiones: ['primera'] })], YO);
    expect(porQueSale(x)).toBe('Por tu zona');
  });

  it('solo el nivel', () => {
    const [x] = torneosParaTi([t({ id: 'x', ciudad: 'Puebla' })], YO);
    expect(porQueSale(x)).toBe('De tu nivel');
  });

  // Al jugador nuevo no se le promete una cercanía que nadie ha calculado.
  it('sin motivo no se inventa uno', () => {
    const [x] = torneosParaTi([t({ id: 'x' })], { zona: null, divisiones: [] });
    expect(porQueSale(x)).toBeNull();
  });
});
