import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  GUIAS,
  guiaDePregunta,
  situacionDeGuia,
  marcarHecho,
  textoDeSituacion,
  pasoQueSeCumpleAlSalir,
  type Guia,
} from '../guia-organizador';
import { PREGUNTAS } from '../ayuda-organizador';

const fechas = GUIAS.find((g) => g.id === 'cambiar-fechas')!;
const nada = new Set<string>();

describe('qué guía lanza cada pregunta', () => {
  it('la de fechas', () => {
    expect(guiaDePregunta('fechas')?.id).toBe('cambiar-fechas');
  });

  // Una pregunta que no existe no inventa guía.
  it('una pregunta desconocida no inventa ninguna', () => {
    expect(guiaDePregunta('lo-que-sea')).toBeNull();
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
    const s = situacionDeGuia(fechas, new Set(['fechas-elegidas']), 'fechas');
    expect(s).toMatchObject({ tipo: 'paso', numero: 2, total: 2 });
    expect(s.tipo === 'paso' && s.paso.id).toBe('fechas-guardadas');
  });

  it('terminada, cuando están todos', () => {
    expect(situacionDeGuia(fechas, new Set(['fechas-elegidas', 'fechas-guardadas']), 'fechas'))
      .toEqual({ tipo: 'terminada' });
  });

  // El contador cuenta sobre el total real, no sobre los que quedan.
  it('el contador no miente al avanzar', () => {
    const a = situacionDeGuia(fechas, nada, 'fechas');
    const b = situacionDeGuia(fechas, new Set(['fechas-elegidas']), 'fechas');
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
    expect(situacionDeGuia(fechas, new Set(['fechas-elegidas']), 'otra'))
      .toEqual({ tipo: 'fuera' });
  });

  // EL PUNTO ENTERO DEL DISEÑO: no existe el estado "guía activa en una
  // pantalla que no la conoce". Para cualquier pantalla y cualquier avance, la
  // respuesta es siempre una de las tres, y nunca se queda sin salida.
  it('no hay estado colgado, sea cual sea la pantalla', () => {
    const pantallas = ['fechas', 'horarios', 'grupos', 'otra', ''];
    const avances = [
      nada, new Set(['fechas-elegidas']), new Set(['fechas-guardadas']),
      new Set(['fechas-elegidas', 'fechas-guardadas']),
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
    const s = situacionDeGuia(fechas, new Set(['fechas-guardadas']), 'fechas');
    expect(s.tipo === 'paso' && s.paso.id).toBe('fechas-elegidas');
  });
});

describe('marcar un paso', () => {
  it('devuelve un conjunto nuevo', () => {
    const despues = marcarHecho(nada, 'fechas-elegidas');
    expect(despues).not.toBe(nada);
    expect(despues.has('fechas-elegidas')).toBe(true);
    expect(nada.size).toBe(0);
  });

  // Las pantallas avisan en cada render: repetir tiene que ser inocuo Y no
  // producir una referencia nueva, o el store re-renderizaría en bucle.
  it('marcar dos veces devuelve el MISMO conjunto', () => {
    const uno = marcarHecho(nada, 'fechas-elegidas');
    expect(marcarHecho(uno, 'fechas-elegidas')).toBe(uno);
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
    expect(s).toMatchObject({ tipo: 'paso', numero: 1, total: 3 });
  });

  // LA REGLA: pasar por el panel camino del siguiente paso NO es abandonar.
  it('el panel es de camino, no una salida', () => {
    const s = situacionDeGuia(capacidad, new Set(['canchas-guardadas']), 'panel');
    expect(s).toMatchObject({ tipo: 'transito', numero: 2, total: 3 });
  });

  it('y desde el panel se dice CÓMO LLEGAR, no qué hacer', () => {
    const enPanel = situacionDeGuia(capacidad, new Set(['canchas-guardadas']), 'panel');
    const enSitio = situacionDeGuia(capacidad, new Set(['canchas-guardadas']), 'horarios');
    expect(textoDeSituacion(enPanel)).toMatch(/abre "Horarios"/i);
    expect(textoDeSituacion(enSitio)).toMatch(/ventana de juego/i);
    expect(textoDeSituacion(enPanel)).not.toBe(textoDeSituacion(enSitio));
  });

  it('llegar a la segunda pantalla vuelve a dar instrucciones', () => {
    const s = situacionDeGuia(capacidad, new Set(['canchas-guardadas']), 'horarios');
    expect(s).toMatchObject({ tipo: 'paso', numero: 2 });
  });

  // Irse a algo que NO está en el camino sí es abandonar.
  it('cualquier otro apartado sí es irse', () => {
    for (const p of ['fechas', 'jueces', 'grupos', 'otra']) {
      expect(situacionDeGuia(capacidad, new Set(['canchas-guardadas']), p))
        .toEqual({ tipo: 'fuera' });
    }
  });

  it('terminada manda sobre el tránsito', () => {
    expect(situacionDeGuia(capacidad,
      new Set(['canchas-guardadas', 'horarios-guardados', 'mirar-bloques']), 'panel'))
      .toEqual({ tipo: 'terminada' });
  });
});

describe('una guía de una sola pantalla en el panel', () => {
  // Sin `comoLlegar` se dice lo mismo que en su sitio: es mejor que callarse.
  it('sin comoLlegar, cae al texto del paso', () => {
    const pelada: Guia = {
      id: 'x', desdePregunta: 'fechas',
      pasos: [{ id: 'x1', pantalla: 'fechas', texto: 'Haz la cosa.' }],
    };
    const s = situacionDeGuia(pelada, nada, 'panel');
    expect(s.tipo).toBe('transito');
    expect(textoDeSituacion(s)).toBe('Haz la cosa.');
  });

  it('con comoLlegar, lo usa', () => {
    const s = situacionDeGuia(formato, nada, 'panel');
    expect(textoDeSituacion(s)).toMatch(/abre "Formato"/i);
  });
});

describe('sigue sin haber estado colgado, con dos pantallas', () => {
  it('toda combinación cae en uno de los cuatro', () => {
    const pantallas = ['canchas', 'horarios', 'bloques', 'panel', 'fechas', 'otra', ''];
    const avances = [nada, new Set(['canchas-guardadas']), new Set(['horarios-guardados']),
                     new Set(['canchas-guardadas', 'horarios-guardados']),
                     new Set(['canchas-guardadas', 'horarios-guardados', 'mirar-bloques'])];
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


// ── PASOS DE SOLO MIRAR ─────────────────────────────────────────────────────

const capacidad3 = GUIAS.find((g) => g.id === 'cabe-el-torneo')!;
const soloMirar = GUIAS.find((g) => g.id === 'mirar-bloques')!;

describe('un paso que se cumple mirando', () => {
  // Mientras está ahí se ve el texto: si se marcara al ENTRAR, la guía
  // terminaría en el mismo render y nadie leería qué hay que mirar.
  it('mientras está en la pantalla, se le dice qué mirar', () => {
    const s = situacionDeGuia(soloMirar, nada, 'bloques');
    expect(s).toMatchObject({ tipo: 'paso' });
    expect(textoDeSituacion(s)).toMatch(/cada grupo es un bloque/i);
  });

  it('se cumple al SALIR de esa pantalla', () => {
    expect(pasoQueSeCumpleAlSalir(soloMirar, nada, 'bloques')?.id).toBe('mirar-bloques');
  });

  it('y no al salir de otra', () => {
    expect(pasoQueSeCumpleAlSalir(soloMirar, nada, 'canchas')).toBeNull();
    expect(pasoQueSeCumpleAlSalir(soloMirar, nada, 'panel')).toBeNull();
  });

  // Un paso que SÍ pide una acción no se regala por haber pasado por ahí.
  it('un paso de acción no se cumple con la visita', () => {
    expect(pasoQueSeCumpleAlSalir(capacidad3, nada, 'canchas')).toBeNull();
  });

  it('ya cumplido, no hay nada que volver a cumplir', () => {
    expect(pasoQueSeCumpleAlSalir(soloMirar, new Set(['mirar-bloques']), 'bloques'))
      .toBeNull();
  });

  // La guía de capacidad acaba en uno de mirar: tres pasos, y el tercero cierra.
  it('cierra una guía de tres pantallas', () => {
    const hechos = new Set(['canchas-guardadas', 'horarios-guardados']);
    expect(situacionDeGuia(capacidad3, hechos, 'bloques')).toMatchObject({
      tipo: 'paso', numero: 3, total: 3,
    });
    expect(pasoQueSeCumpleAlSalir(capacidad3, hechos, 'bloques')?.id).toBe('mirar-bloques');
    expect(situacionDeGuia(capacidad3, new Set([...hechos, 'mirar-bloques']), 'bloques'))
      .toEqual({ tipo: 'terminada' });
  });
});

// ── LAS DIECIOCHO, COMO CONJUNTO ────────────────────────────────────────────

describe('todas las guías', () => {
  it('hay una por cada pregunta que lleva a una pantalla del panel', () => {
    const conPantalla = PREGUNTAS.filter((p) => p.pantalla !== null);
    const cubiertas = new Set(GUIAS.map((g) => g.desdePregunta));
    const sinGuia = conPantalla.filter((p) => !cubiertas.has(p.id)).map((p) => p.id);
    expect(sinGuia).toEqual([]);
  });

  it('ningún paso de acción está declarado como de mirar, ni al revés', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        // Un paso de mirar no puede pedir nada: su texto describe, no manda.
        if (p.seCumpleAlMirar) expect(p.texto).not.toMatch(/^(Guarda|Pulsa|Marca) /);
      }
    }
  });

  // EL INVARIANTE QUE MÁS FÁCIL SE ROMPE al añadir una guía: un paso de acción
  // cuya pantalla no avisa nunca deja la barra encendida para siempre. Se
  // comprueba contra el código de verdad, no contra una lista paralela.
  it('todo paso de acción lo declara alguna pantalla', () => {
    const raiz = join(__dirname, '..', '..', '..', 'app', '(organizer)');
    const archivos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = join(d, e.name);
        if (e.isDirectory()) recorrer(f);
        else if (e.name.endsWith('.tsx')) archivos.push(f);
      }
    };
    recorrer(raiz);
    const declarados = new Set<string>();
    for (const f of archivos) {
      for (const m of readFileSync(f, 'utf8').matchAll(/cumplirPaso\('([^']+)'\)/g)) {
        declarados.add(m[1]);
      }
    }

    const sinSenal = GUIAS.flatMap((g) => g.pasos)
      .filter((p) => !p.seCumpleAlMirar && !declarados.has(p.id))
      .map((p) => p.id);
    expect(sinSenal).toEqual([]);

    // Y al revés: una pantalla que avisa de un hecho que ninguna guía escucha
    // es una línea muerta esperando a confundir a alguien.
    const usados = new Set(GUIAS.flatMap((g) => g.pasos).map((p) => p.id));
    expect([...declarados].filter((d) => !usados.has(d))).toEqual([]);
  });
});
