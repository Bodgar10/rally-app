import { yaEstaEnElCuadro } from '@/lib/situacion-jugador';

// EL SÍNTOMA: un jugador que estaba jugando octavos leía "Ya clasificaste".
// Cierto, y de hace dos días. Su pregunta es contra quién juega.
describe('la tarjeta de situación se calla en el cuadro', () => {
  it('con un partido del cuadro, se calla', () => {
    expect(yaEstaEnElCuadro([{ groupId: 'g1' }, { groupId: null }])).toBe(true);
  });

  it('solo con partidos de grupo, sigue hablando', () => {
    expect(yaEstaEnElCuadro([{ groupId: 'g1' }, { groupId: 'g1' }])).toBe(false);
  });

  // Quien no tiene partidos todavía está en la carrera: la tarjeta es para él.
  it('sin partidos, sigue hablando', () => {
    expect(yaEstaEnElCuadro([])).toBe(false);
  });

  // Un bye nace ya resuelto y sin grupo. Quien lo tiene también está dentro
  // del cuadro, así que también se calla.
  it('un bye cuenta como estar en el cuadro', () => {
    expect(yaEstaEnElCuadro([{ groupId: null }])).toBe(true);
  });
});
