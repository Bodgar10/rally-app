/**
 * La regla que decide si el jugador PUEDE confirmar su inscripción.
 *
 * EL BUG QUE FIJA: con la categoría llena en todos los horarios, el selector
 * decía "ya no quedan horarios" y el botón de confirmar se quedaba
 * deshabilitado para siempre. La categoría seguía abierta, así que la app
 * invitaba a entrar y luego no daba puerta.
 *
 * La condición de la pantalla es `debeElegirHorario = opciones.length > 0`, y
 * `opciones` sale de `bloquesDisponibles`. Aquí se prueba esa cadena, que es
 * donde estaba el fallo — no el render.
 */

import { generarBloques, bloquesDisponibles, type Ocupacion } from '@/lib/engine/schedule/bloques';

/** Un día con dos horarios de 3 h y 2 canchas: 4 grupos, 12 parejas. */
const RETICULA = generarBloques({
  ventanas: [{ dia: '2026-03-14', desde: '08:00', hasta: '14:00' }],
  canchas: 2,
  minutosPorPartido: 60,
});

/** Lo que calcula la pantalla para decidir si exige elegir. */
function loQueVeLaPantalla(ocupacion: Ocupacion, categoriaId: string) {
  const opciones = bloquesDisponibles(RETICULA.bloques, ocupacion, categoriaId);
  return {
    opciones: opciones.length,
    debeElegirHorario: opciones.length > 0,
    categoriaSinHorarios: RETICULA.bloques.length > 0 && opciones.length === 0,
  };
}

describe('cuándo se le exige al jugador elegir horario', () => {
  it('con el torneo vacío hay horarios y se exige elegir', () => {
    const v = loQueVeLaPantalla({}, 'A');
    expect(v.opciones).toBe(2);
    expect(v.debeElegirHorario).toBe(true);
    expect(v.categoriaSinHorarios).toBe(false);
  });

  it('con algunos horarios llenos, se exige elegir entre los que quedan', () => {
    // El primer horario lo llenan dos categorías con 3 parejas cada una.
    const v = loQueVeLaPantalla({ '2026-03-14-08:00': { A: 3, B: 3 } }, 'A');
    expect(v.opciones).toBe(1);
    expect(v.debeElegirHorario).toBe(true);
  });

  it('CON TODOS LLENOS no se exige nada: se inscribe sin hora', () => {
    // Las dos canchas de los dos horarios, ocupadas. Antes esto dejaba el
    // botón muerto; ahora `debeElegirHorario` es false y la inscripción sigue.
    const lleno: Ocupacion = {
      '2026-03-14-08:00': { A: 3, B: 3 },
      '2026-03-14-11:00': { A: 3, B: 3 },
    };
    const v = loQueVeLaPantalla(lleno, 'A');
    expect(v.opciones).toBe(0);
    expect(v.debeElegirHorario).toBe(false);
    expect(v.categoriaSinHorarios).toBe(true);
  });

  it('lleno para una categoría no es lleno para otra', () => {
    // A tiene 4 parejas: un grupo cerrado y otro a medias con 2 huecos, que
    // son SUYOS. C no puede usarlos y se queda sin horarios.
    const ocup: Ocupacion = {
      '2026-03-14-08:00': { A: 4 },
      '2026-03-14-11:00': { A: 4 },
    };
    expect(loQueVeLaPantalla(ocup, 'A').debeElegirHorario).toBe(true);
    expect(loQueVeLaPantalla(ocup, 'C').categoriaSinHorarios).toBe(true);
  });

  it('sin horarios capturados tampoco se exige, y ese caso ya funcionaba', () => {
    const sinNada = generarBloques({
      ventanas: [{ dia: '2026-03-14', desde: '08:00', hasta: '09:00' }],
      canchas: 2, minutosPorPartido: 60,
    });
    expect(sinNada.bloques.length).toBe(0);
    const opciones = bloquesDisponibles(sinNada.bloques, {}, 'A');
    expect(opciones.length).toBe(0);
    // `categoriaSinHorarios` exige que el torneo SÍ tenga horarios: aquí no los
    // hay, así que el paso desaparece en vez de explicar que están llenos.
    expect(sinNada.bloques.length > 0 && opciones.length === 0).toBe(false);
  });
});
