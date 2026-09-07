import {
  GUIAS,
  guiaDePregunta,
  situacionDeGuia,
  marcarHecho,
  textoDeSituacion,
  type Guia,
} from '../guia-organizador';
import { PREGUNTAS } from '../ayuda-organizador';

const fechas = GUIAS.find((g) => g.id === 'cambiar-fechas')!;
const nada = new Set<string>();

describe('qué guía lanza cada pregunta', () => {
  it('la de fechas', () => {
    expect(guiaDePregunta('fechas')?.id).toBe('cambiar-fechas');
  });

  // No toda pregunta tiene guía; las que no, navegan y ya.
  it('una pregunta sin guía no inventa ninguna', () => {
    expect(guiaDePregunta('jueces')).toBeNull();
  });

  // Una guía colgada de una pregunta que no existe no se lanzaría nunca.
  it('todas las guías cuelgan de una pregunta real', () => {
    const ids = new Set(PREGUNTAS.map((p) => p.id));
    for (const g of GUIAS) expect(ids.has(g.desdePregunta)).toBe(true);
  });
});

describe('qué toca ahora', () => {
  it('el primer paso, al empezar', () => {
    const s = situacionDeGuia(fechas, nada, 'fechas');
    expect(s).toMatchObject({ tipo: 'paso', numero: 1, total: 2 });
  });

  it('el segundo, cuando el primero está hecho', () => {
    const s = situacionDeGuia(fechas, new Set(['elegir-rango']), 'fechas');
    expect(s).toMatchObject({ tipo: 'paso', numero: 2, total: 2 });
    expect(s.tipo === 'paso' && s.paso.id).toBe('guardar');
  });

  it('terminada, cuando están todos', () => {
    expect(situacionDeGuia(fechas, new Set(['elegir-rango', 'guardar']), 'fechas'))
      .toEqual({ tipo: 'terminada' });
  });

  // El contador cuenta sobre el total real, no sobre los que quedan.
  it('el contador no miente al avanzar', () => {
    const a = situacionDeGuia(fechas, nada, 'fechas');
    const b = situacionDeGuia(fechas, new Set(['elegir-rango']), 'fechas');
    expect([a, b].every((s) => s.tipo === 'paso' && s.total === 2)).toBe(true);
  });
});

describe('salirse a media guía', () => {
  // La ruta ES el estado: no hay que avisar a nadie al navegar.
  it('en otra pantalla, la guía se da por abandonada', () => {
    expect(situacionDeGuia(fechas, nada, 'horarios')).toEqual({ tipo: 'fuera' });
    expect(situacionDeGuia(fechas, nada, 'otra')).toEqual({ tipo: 'fuera' });
  });

  it('también a medias', () => {
    expect(situacionDeGuia(fechas, new Set(['elegir-rango']), 'otra'))
      .toEqual({ tipo: 'fuera' });
  });

  // EL PUNTO ENTERO DEL DISEÑO: no existe el estado "guía activa en una
  // pantalla que no la conoce". Para cualquier pantalla y cualquier avance, la
  // respuesta es siempre una de las tres, y nunca se queda sin salida.
  it('no hay estado colgado, sea cual sea la pantalla', () => {
    const pantallas = ['fechas', 'horarios', 'grupos', 'otra', ''];
    const avances = [
      nada, new Set(['elegir-rango']), new Set(['guardar']),
      new Set(['elegir-rango', 'guardar']),
    ];
    for (const p of pantallas) {
      for (const h of avances) {
        const s = situacionDeGuia(fechas, h, p);
        expect(['paso', 'transito', 'terminada', 'fuera']).toContain(s.tipo);
      }
    }
  });

  // Cumplir el segundo sin el primero no salta el primero: sigue pendiente.
  it('los pasos no se saltan por marcar uno de más', () => {
    const s = situacionDeGuia(fechas, new Set(['guardar']), 'fechas');
    expect(s.tipo === 'paso' && s.paso.id).toBe('elegir-rango');
  });
});

describe('marcar un paso', () => {
  it('devuelve un conjunto nuevo', () => {
    const despues = marcarHecho(nada, 'elegir-rango');
    expect(despues).not.toBe(nada);
    expect(despues.has('elegir-rango')).toBe(true);
    expect(nada.size).toBe(0);
  });

  // Las pantallas avisan en cada render: repetir tiene que ser inocuo Y no
  // producir una referencia nueva, o el store re-renderizaría en bucle.
  it('marcar dos veces devuelve el MISMO conjunto', () => {
    const uno = marcarHecho(nada, 'elegir-rango');
    expect(marcarHecho(uno, 'elegir-rango')).toBe(uno);
  });
});

describe('cómo están escritas las guías', () => {
  it('los pasos tienen ids únicos dentro de su guía', () => {
    for (const g of GUIAS) {
      expect(new Set(g.pasos.map((p) => p.id)).size).toBe(g.pasos.length);
    }
  });

  // Una línea que cabe en la barra sin partirse en tres.
  it('los textos son de una línea', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        expect(p.texto.length).toBeLessThanOrEqual(70);
        expect(p.texto).not.toContain('\n');
      }
    }
  });

  // Una guía sin pasos dejaría la barra en 'terminada' desde el primer render.
  it('ninguna guía está vacía', () => {
    for (const g of GUIAS as Guia[]) expect(g.pasos.length).toBeGreaterThan(0);
  });
});

// ── LAS DOS PREGUNTAS QUE ABRÍA EL PILOTO ───────────────────────────────────

const formato = GUIAS.find((g) => g.id === 'tercer-lugar')!;
const capacidad = GUIAS.find((g) => g.id === 'cabe-el-torneo')!;

describe('una guía que cruza dos pantallas', () => {
  it('empieza en la primera', () => {
    const s = situacionDeGuia(capacidad, nada, 'canchas');
    expect(s).toMatchObject({ tipo: 'paso', numero: 1, total: 2 });
  });

  // LA REGLA: pasar por el panel camino del siguiente paso NO es abandonar.
  it('el panel es de camino, no una salida', () => {
    const s = situacionDeGuia(capacidad, new Set(['canchas']), 'panel');
    expect(s).toMatchObject({ tipo: 'transito', numero: 2, total: 2 });
  });

  it('y desde el panel se dice CÓMO LLEGAR, no qué hacer', () => {
    const enPanel = situacionDeGuia(capacidad, new Set(['canchas']), 'panel');
    const enSitio = situacionDeGuia(capacidad, new Set(['canchas']), 'horarios');
    expect(textoDeSituacion(enPanel)).toMatch(/abre "Horarios"/i);
    expect(textoDeSituacion(enSitio)).toMatch(/ventana de juego/i);
    expect(textoDeSituacion(enPanel)).not.toBe(textoDeSituacion(enSitio));
  });

  it('llegar a la segunda pantalla vuelve a dar instrucciones', () => {
    const s = situacionDeGuia(capacidad, new Set(['canchas']), 'horarios');
    expect(s).toMatchObject({ tipo: 'paso', numero: 2 });
  });

  // Irse a algo que NO está en el camino sí es abandonar.
  it('cualquier otro apartado sí es irse', () => {
    for (const p of ['fechas', 'jueces', 'grupos', 'otra']) {
      expect(situacionDeGuia(capacidad, new Set(['canchas']), p))
        .toEqual({ tipo: 'fuera' });
    }
  });

  it('terminada manda sobre el tránsito', () => {
    expect(situacionDeGuia(capacidad, new Set(['canchas', 'horarios']), 'panel'))
      .toEqual({ tipo: 'terminada' });
  });
});

describe('una guía de una sola pantalla en el panel', () => {
  // Sin `comoLlegar` se dice lo mismo que en su sitio: es mejor que callarse.
  it('sin comoLlegar, cae al texto del paso', () => {
    const s = situacionDeGuia(fechas, nada, 'panel');
    expect(s.tipo).toBe('transito');
    expect(textoDeSituacion(s)).toBe(fechas.pasos[0].texto);
  });

  it('con comoLlegar, lo usa', () => {
    const s = situacionDeGuia(formato, nada, 'panel');
    expect(textoDeSituacion(s)).toMatch(/abre "Formato"/i);
  });
});

describe('sigue sin haber estado colgado, con dos pantallas', () => {
  it('toda combinación cae en uno de los cuatro', () => {
    const pantallas = ['canchas', 'horarios', 'panel', 'fechas', 'otra', ''];
    const avances = [nada, new Set(['canchas']), new Set(['horarios']),
                     new Set(['canchas', 'horarios'])];
    for (const p of pantallas) {
      for (const h of avances) {
        const s = situacionDeGuia(capacidad, h, p);
        expect(['paso', 'transito', 'terminada', 'fuera']).toContain(s.tipo);
        // Y si hay algo que decir, hay texto que decir.
        if (s.tipo === 'paso' || s.tipo === 'transito') {
          expect(textoDeSituacion(s)).toBeTruthy();
        } else {
          expect(textoDeSituacion(s)).toBeNull();
        }
      }
    }
  });
});

describe('las tres guías, juntas', () => {
  it('cada una cuelga de una pregunta distinta', () => {
    const desde = GUIAS.map((g) => g.desdePregunta);
    expect(new Set(desde).size).toBe(GUIAS.length);
  });

  it('los ids de guía no se repiten', () => {
    expect(new Set(GUIAS.map((g) => g.id)).size).toBe(GUIAS.length);
  });

  // Un paso en una pantalla que la ayuda no conoce nunca se pintaría: la ruta
  // caería en 'otra' y la guía se daría por abandonada al llegar.
  it('toda pantalla de un paso es una pantalla conocida', () => {
    const conocidas = new Set(PREGUNTAS.map((p) => p.pantalla));
    for (const g of GUIAS) {
      for (const p of g.pasos) expect(conocidas.has(p.pantalla)).toBe(true);
    }
  });

  it('los comoLlegar también son de una línea', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        if (p.comoLlegar) expect(p.comoLlegar.length).toBeLessThanOrEqual(70);
      }
    }
  });
});
