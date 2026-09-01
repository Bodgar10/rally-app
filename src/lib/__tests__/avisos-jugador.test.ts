// Cuándo se avisa al jugador.
//
// Mandar un aviso de más a las once de la noche es un fallo que no se descubre
// en desarrollo, así que las dos reglas que lo evitan —comparar antes/ahora, y
// no avisar en la primera carga— se fijan aquí.

import { avisosPorCambio, type EstadoDelJugador } from '@/lib/avisos-jugador';

const base: EstadoDelJugador = { estado: 'alive', proximaHora: null, jugadosTerminados: 0 };

describe('avisosPorCambio', () => {
  // Abrir la app no es que haya pasado algo. Sin esto, quien abre el domingo
  // por la mañana recibe de golpe todo lo del sábado.
  it('la primera carga no avisa de nada', () => {
    expect(avisosPorCambio(null, { ...base, estado: 'clinched', proximaHora: 'x', jugadosTerminados: 3 }))
      .toEqual([]);
  });

  it('sin cambios no avisa', () => {
    expect(avisosPorCambio(base, { ...base })).toEqual([]);
  });

  it('un partido más terminado es un resultado capturado', () => {
    expect(avisosPorCambio(base, { ...base, jugadosTerminados: 1 }))
      .toContain('resultado_capturado');
  });

  it('pasar a clasificado avisa; seguir clasificado no', () => {
    expect(avisosPorCambio(base, { ...base, estado: 'clinched' })).toContain('pasaste_de_fase');
    expect(avisosPorCambio({ ...base, estado: 'clinched' }, { ...base, estado: 'clinched' }))
      .not.toContain('pasaste_de_fase');
  });

  // El de la noche del sábado.
  it('de no tener hora a tenerla avisa', () => {
    expect(avisosPorCambio(base, { ...base, proximaHora: '2026-09-06T17:00:00Z' }))
      .toContain('ya_hay_horario');
  });

  // Cambiar de una hora a otra es una REPROGRAMACIÓN, que merece otro texto.
  it('cambiar de hora a otra hora no es "ya hay horario"', () => {
    expect(avisosPorCambio(
      { ...base, proximaHora: '2026-09-06T17:00:00Z' },
      { ...base, proximaHora: '2026-09-06T19:00:00Z' },
    )).not.toContain('ya_hay_horario');
  });

  it('varios cambios a la vez dan varios avisos', () => {
    const avisos = avisosPorCambio(base, {
      estado: 'clinched', proximaHora: '2026-09-06T17:00:00Z', jugadosTerminados: 1,
    });
    expect(avisos).toEqual(expect.arrayContaining([
      'resultado_capturado', 'pasaste_de_fase', 'ya_hay_horario',
    ]));
  });
});

describe('la cancha que se libera', () => {
  // El aviso de "ve saliendo": en un torneo real los partidos se corren y la
  // hora publicada deja de valer a media mañana.
  it('avisa al empezar el partido de antes en su cancha', () => {
    expect(avisosPorCambio(base, { ...base, canchaOcupada: 'Cancha 3' }))
      .toContain('cancha_por_liberarse');
  });

  // Repetirlo en cada evento de Realtime sería el altavoz que la app apaga.
  it('mientras siga ocupada no vuelve a avisar', () => {
    expect(avisosPorCambio(
      { ...base, canchaOcupada: 'Cancha 3' },
      { ...base, canchaOcupada: 'Cancha 3' },
    )).not.toContain('cancha_por_liberarse');
  });
});
