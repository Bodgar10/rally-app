// Qué bloques del dashboard tienen respuesta.
//
// EL BUG: un jugador de 5.ª Varonil que YA había jugado sus dos partidos de
// grupo veía "Ya estás inscrito · Empieza mañana · Tu horario se publica cuando
// el organizador cierra las inscripciones", con sus resultados más abajo en la
// misma pantalla. La tarjeta salía solo por estar inscrito en un torneo vivo.

import { bloquesDelDashboard } from '@/lib/dashboard-jugador';

describe('el dashboard del jugador', () => {
  // Sin inscripción la sección se queda: es donde vive el "Inscríbete a un
  // torneo". Lo que no hay es cancha que vigilar ni torneo por empezar.
  it('sin inscripción solo queda la sección, con su llamada a la acción', () => {
    const b = bloquesDelDashboard(false, { conHorario: 0, pendientes: 0 });
    expect(b).toEqual({ torneoPorEmpezar: false, proximoPartido: true, enMiCancha: false });
  });

  // 1 · Sin calendario, "Empieza mañana" es la respuesta correcta.
  it('inscrito y sin ninguna hora publicada ve TorneoPorEmpezar', () => {
    const b = bloquesDelDashboard(true, { conHorario: 0, pendientes: 0 });
    expect(b.torneoPorEmpezar).toBe(true);
    // Y la sección existe para alojarla.
    expect(b.proximoPartido).toBe(true);
  });

  // Los partidos de grupo se crean al cerrar la categoría, ANTES de programar:
  // en ese hueco todavía no hay calendario y la tarjeta sigue siendo cierta.
  it('con partidos creados pero sin hora, sigue siendo "por empezar"', () => {
    const b = bloquesDelDashboard(true, { conHorario: 0, pendientes: 3 });
    expect(b.torneoPorEmpezar).toBe(true);
  });

  // 2 · En cuanto hay calendario, sobra — haya jugado o no.
  it('con calendario y partidos por jugar NO ve TorneoPorEmpezar', () => {
    const b = bloquesDelDashboard(true, { conHorario: 3, pendientes: 2 });
    expect(b.torneoPorEmpezar).toBe(false);
    expect(b.proximoPartido).toBe(true);
    expect(b.enMiCancha).toBe(true);
  });

  // 3 · EL CASO DEL BUG: ya jugó todo y espera el desenlace.
  it('quien ya jugó todo se queda SOLO con su situación', () => {
    const b = bloquesDelDashboard(true, { conHorario: 2, pendientes: 0 });
    // Nada por encima que contradiga a la tarjeta de situación.
    expect(b.torneoPorEmpezar).toBe(false);
    expect(b.proximoPartido).toBe(false);   // la sección entera, etiqueta incluida
    expect(b.enMiCancha).toBe(false);       // sin próximo partido no hay cancha
  });

  it('sin próximo partido nunca se vigila una cancha', () => {
    for (const conHorario of [0, 1, 5]) {
      expect(bloquesDelDashboard(true, { conHorario, pendientes: 0 }).enMiCancha).toBe(false);
    }
  });
});
