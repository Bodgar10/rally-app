import { ordenDelDashboard, type FacetasDelUsuario } from '../orden-del-dashboard';

const f = (over: Partial<FacetasDelUsuario> = {}): FacetasDelUsuario => ({
  esJuez: false,
  juezUrge: false,
  esOrganizador: false,
  jugadorOcupado: false,
  ...over,
});

describe('cuando es una cosa sola', () => {
  it('solo juega: no hay nada más que colocar', () => {
    expect(ordenDelDashboard(f({ jugadorOcupado: true })))
      .toEqual({ juezArriba: false, organizadorArriba: false });
  });

  // El caso con el que se reportaron los dos bugs: el hueco de arriba está
  // libre y su trabajo es lo único que hay en la pantalla.
  it('solo organiza: sus torneos suben', () => {
    expect(ordenDelDashboard(f({ esOrganizador: true })).organizadorArriba).toBe(true);
  });

  it('solo arbitra: sus torneos suben aunque no haya nada vencido', () => {
    expect(ordenDelDashboard(f({ esJuez: true })).juezArriba).toBe(true);
  });
});

describe('cuando juega y además trabaja', () => {
  // La regla entera: arbitrar sube POR ENCIMA de su propio partido cuando hay
  // marcadores vencidos, porque ahí la espera es de otros.
  it('con marcadores vencidos, arbitrar gana a su propio partido', () => {
    expect(ordenDelDashboard(f({ esJuez: true, juezUrge: true, jugadorOcupado: true })))
      .toEqual({ juezArriba: true, organizadorArriba: false });
  });

  it('sin nada vencido, su partido va primero', () => {
    expect(ordenDelDashboard(f({ esJuez: true, jugadorOcupado: true })).juezArriba)
      .toBe(false);
  });

  // El organizador NO sube por urgencia: lo que urge de verdad ya está arriba
  // en la tarjeta del juez, y su "3 partidos sin resultado" es ese mismo hecho
  // visto desde más lejos.
  it('organizar nunca adelanta a su partido', () => {
    expect(ordenDelDashboard(f({ esOrganizador: true, jugadorOcupado: true })).organizadorArriba)
      .toBe(false);
  });
});

describe('cuando es las tres cosas a la vez', () => {
  it('con trabajo vencido: arbitrar arriba, organizar abajo', () => {
    expect(ordenDelDashboard(f({
      esJuez: true, juezUrge: true, esOrganizador: true, jugadorOcupado: true,
    }))).toEqual({ juezArriba: true, organizadorArriba: false });
  });

  it('sin partido que jugar, las dos suben', () => {
    expect(ordenDelDashboard(f({
      esJuez: true, esOrganizador: true, jugadorOcupado: false,
    }))).toEqual({ juezArriba: true, organizadorArriba: true });
  });

  // Se deciden por separado: subir a los dos juntos ataría la posición del
  // organizador a un hecho que no es suyo.
  it('la urgencia del juez no mueve al organizador', () => {
    const con = ordenDelDashboard(f({
      esJuez: true, juezUrge: true, esOrganizador: true, jugadorOcupado: true,
    }));
    const sin = ordenDelDashboard(f({
      esJuez: true, juezUrge: false, esOrganizador: true, jugadorOcupado: true,
    }));
    expect(con.organizadorArriba).toBe(sin.organizadorArriba);
  });
});

describe('lo que no se es, no se coloca', () => {
  it('sin ser juez, juezArriba nunca es true', () => {
    expect(ordenDelDashboard(f({ juezUrge: true })).juezArriba).toBe(false);
  });
  it('sin organizar, organizadorArriba nunca es true', () => {
    expect(ordenDelDashboard(f()).organizadorArriba).toBe(false);
  });
});
