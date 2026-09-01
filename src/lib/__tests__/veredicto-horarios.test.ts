// Qué ve el organizador después de cerrar su torneo.
//
// EL CASO QUE MOTIVÓ ESTE ARCHIVO: `schedule-groups` respondía 200 mientras
// ningún UPDATE de Postgres fallara, aunque el motor hubiera saltado grupos
// enteros — un grupo que no cabe sale en `sinProgramar` y no genera ni un
// UPDATE. La pantalla miraba solo `res.ok` y pintaba "Horarios generados" sobre
// un torneo sin programar.
//
// Lo que se fija aquí es que un éxito EXIJA que todo tenga hora, y que
// "no programó" e "hizo la mitad" no se confundan: se arreglan distinto.

import { leerVeredicto } from '@/lib/veredicto-horarios';

/** La forma que tiene la respuesta de close-registration. */
const respuesta = (grupos: unknown, eliminatorias: unknown) => ({
  intentado: true,
  grupos: { ok: true, detalle: grupos },
  eliminatorias: { ok: true, detalle: eliminatorias },
});

const TODO_BIEN = { ok: true, partidosSinHora: 0, gruposAfectados: [] };
const KO_BIEN = { ok: true, categoriasSaltadas: [] };

describe('el veredicto de los horarios', () => {
  it('sin intentar (quedan categorías abiertas) no dice nada', () => {
    expect(leerVeredicto({ intentado: false }).t).toBe('no_intentado');
    expect(leerVeredicto(null).t).toBe('no_intentado');
    expect(leerVeredicto(undefined).t).toBe('no_intentado');
  });

  it('solo es ok cuando LAS DOS dicen que todo tiene hora', () => {
    expect(leerVeredicto(respuesta(TODO_BIEN, KO_BIEN)).t).toBe('ok');
  });

  // El corazón del bug: 200 en el status, grupos saltados en el cuerpo.
  it('NO es ok si quedaron grupos sin hora, aunque el status fuera 200', () => {
    const v = leerVeredicto(respuesta(
      {
        ok: false,
        partidosSinHora: 3,
        gruposAfectados: [
          { categoria: '6a Varonil', grupo: 'A', queHacer: 'Abre otra cancha en ese horario.' },
        ],
      },
      KO_BIEN,
    ));
    expect(v.t).toBe('incompleto');
    if (v.t !== 'incompleto') throw new Error('inalcanzable');
    expect(v.partidosSinHora).toBe(3);
    expect(v.grupos).toEqual([
      { categoria: '6a Varonil', grupo: 'A', queHacer: 'Abre otra cancha en ese horario.' },
    ]);
  });

  it('una categoría de eliminatorias saltada tampoco es éxito', () => {
    const v = leerVeredicto(respuesta(
      TODO_BIEN,
      { ok: false, categoriasSaltadas: [{ categoria: 'Mixta B' }] },
    ));
    expect(v.t).toBe('incompleto');
    if (v.t !== 'incompleto') throw new Error('inalcanzable');
    expect(v.categoriasSaltadas).toEqual(['Mixta B']);
  });

  // "No programó" y "programó a medias" se arreglan distinto: la primera
  // reintentando, la segunda cambiando algo del torneo. Confundirlas llevaba a
  // pulsar "Reintentar" contra un bloque sobrevendido hasta rendirse.
  it('sin veredicto en el cuerpo es FALLO, no incompleto', () => {
    const v = leerVeredicto({
      intentado: true,
      grupos: { ok: false, detalle: { error: 'capacidad_incompleta' } },
      eliminatorias: { ok: false, detalle: null },
    });
    expect(v.t).toBe('fallo');
  });

  it('una función vieja (sin `ok` en el cuerpo) se trata como fallo, no como éxito', () => {
    // Si alguien despliega solo una de las dos, el silencio no puede leerse
    // como que todo salió bien: eso es exactamente el bug de partida.
    const v = leerVeredicto(respuesta({ matchesActualizados: 165 }, KO_BIEN));
    expect(v.t).toBe('fallo');
  });

  it('los grupos afectados llegan con su categoría y qué hacer', () => {
    const v = leerVeredicto(respuesta(
      {
        ok: false,
        partidosSinHora: 6,
        gruposAfectados: [
          { categoria: '3a Varonil', grupo: 'B', queHacer: 'Asígnales un bloque.' },
          { categoria: null, grupo: 'C', queHacer: null },
        ],
      },
      KO_BIEN,
    ));
    if (v.t !== 'incompleto') throw new Error('esperaba incompleto');
    expect(v.grupos).toHaveLength(2);
    expect(v.grupos[0].categoria).toBe('3a Varonil');
    expect(v.grupos[1].categoria).toBeNull();
  });
});
