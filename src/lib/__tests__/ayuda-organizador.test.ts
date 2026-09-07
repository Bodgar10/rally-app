import {
  PREGUNTAS,
  pantallaDeRuta,
  preguntasPorContexto,
  rutaDePregunta,
} from '../ayuda-organizador';

const RUTA = '/(organizer)/org/torneos/t1';

describe('de qué pantalla viene una ruta', () => {
  it('reconoce las pantallas del panel', () => {
    expect(pantallaDeRuta(`${RUTA}/fechas`)).toBe('fechas');
    expect(pantallaDeRuta(`${RUTA}/agregar-pareja`)).toBe('agregar-pareja');
  });

  it('ignora la query', () => {
    expect(pantallaDeRuta(`${RUTA}/horarios?foo=1`)).toBe('horarios');
  });

  // El índice del torneo no tiene segmento propio: su último segmento es el id.
  it('el panel no es ninguna pantalla concreta', () => {
    expect(pantallaDeRuta(RUTA)).toBe('otra');
  });

  // Una pantalla sin preguntas no es un contexto: es una pantalla sin ayuda.
  it('una pantalla que nadie documentó cae en "otra"', () => {
    expect(pantallaDeRuta(`${RUTA}/eliminar`)).toBe('otra');
    expect(pantallaDeRuta('/(protected)/dashboard')).toBe('otra');
  });
});

describe('el contexto ordena, no filtra', () => {
  it('las de aquí arriba y el resto debajo, sin perder ninguna', () => {
    const { aqui, resto } = preguntasPorContexto('fechas');
    expect(aqui.map((p) => p.id)).toEqual(['fechas']);
    expect(aqui.length + resto.length).toBe(PREGUNTAS.length);
    expect(resto.some((p) => p.id === 'fechas')).toBe(false);
  });

  // El que no sabe dónde está es justo el que necesita buscar.
  it('fuera del panel salen todas', () => {
    const { aqui, resto } = preguntasPorContexto('otra');
    expect(aqui).toEqual([]);
    expect(resto).toHaveLength(PREGUNTAS.length);
  });

  // Dos preguntas distintas contestan sobre grupos: las dos suben juntas.
  it('una pantalla puede tener varias preguntas', () => {
    const { aqui } = preguntasPorContexto('grupos');
    expect(aqui.length).toBeGreaterThan(1);
    expect(aqui.map((p) => p.id)).toContain('empate');
  });
});

describe('a dónde lleva cada pregunta', () => {
  it('a su pantalla, dentro del torneo', () => {
    const p = PREGUNTAS.find((x) => x.id === 'jueces')!;
    expect(rutaDePregunta(p, 't1')).toBe('/(organizer)/org/torneos/t1/jueces');
  });

  it('sin pantalla, al panel', () => {
    expect(rutaDePregunta({ ...PREGUNTAS[0], pantalla: null }, 't1'))
      .toBe('/(organizer)/org/torneos/t1');
  });
});

describe('cómo están escritas', () => {
  it('los ids no se repiten', () => {
    expect(new Set(PREGUNTAS.map((p) => p.id)).size).toBe(PREGUNTAS.length);
  });

  // Una respuesta que explica pero no lleva obliga a buscar la tarjeta en una
  // rejilla de trece. El enlace no es decorativo: es la mitad de la respuesta.
  it('todas terminan en un enlace con texto', () => {
    for (const p of PREGUNTAS) {
      expect(p.enlace.trim().length).toBeGreaterThan(0);
    }
  });

  it('se leen como las haría una persona, no como un índice', () => {
    for (const p of PREGUNTAS) {
      expect(p.pregunta).toMatch(/^¿.+\?$/);
    }
  });

  // Corta y concreta: si hay que hacer scroll para leer una respuesta, quien
  // abrió la ayuda con alguien esperando no la lee.
  it('las respuestas son cortas', () => {
    for (const p of PREGUNTAS) {
      expect(p.respuesta.length).toBeLessThanOrEqual(260);
    }
  });

  it('sin vocabulario de motor ni español de España', () => {
    for (const p of PREGUNTAS) {
      const txt = `${p.pregunta} ${p.respuesta} ${p.enlace}`;
      expect(txt).not.toMatch(/clinch|seeding|bracket|\bbye\b|repechage/i);
      expect(txt).not.toMatch(/\bvosotros\b|\bvuestr[oa]s?\b/i);
      expect(txt).not.toMatch(/[a-záéíóúñ]+(áis|éis|ís)\b/i);
    }
  });
});
