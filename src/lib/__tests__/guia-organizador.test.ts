import {
  GUIAS,
  guiaDePregunta,
  situacionDeGuia,
  marcarHecho,
  type Guia,
} from '../guia-organizador';
import { PREGUNTAS } from '../ayuda-organizador';

const fechas = GUIAS.find((g) => g.id === 'cambiar-fechas')!;
const nada = new Set<string>();

describe('qué guía lanza cada pregunta', () => {
  it('la de fechas', () => {
    expect(guiaDePregunta('fechas')?.id).toBe('cambiar-fechas');
  });

  // Piloto: solo Fechas tiene guía. El resto navega y ya.
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
        expect(['paso', 'terminada', 'fuera']).toContain(s.tipo);
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
