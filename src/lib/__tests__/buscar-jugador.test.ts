import { coincideJugador, normalizar } from '@/lib/juez/buscar-jugador';

const partido = { parejaA: 'Aldo Ramos / Luis Pérez', parejaB: 'Ana Ruiz / Sofía León' };

describe('buscar un jugador en la lista del juez', () => {
  it('por apellido', () => {
    expect(coincideJugador(partido, 'ramos')).toBe(true);
  });

  // Quien teclea con alguien delante no pone acentos.
  it('sin tildes', () => {
    expect(coincideJugador(partido, 'perez')).toBe(true);
    expect(coincideJugador(partido, 'sofia')).toBe(true);
  });

  it('sin mayúsculas ni de más ni de menos', () => {
    expect(coincideJugador(partido, 'ALDO')).toBe(true);
    expect(coincideJugador(partido, 'aLdO')).toBe(true);
  });

  // El juez no sabe de qué lado está quien pregunta.
  it('mira las dos parejas', () => {
    expect(coincideJugador(partido, 'ruiz')).toBe(true);
  });

  // "ramos luis" no está así de seguido, y aun así es la pareja que busca.
  it('los trozos pueden ir en cualquier orden', () => {
    expect(coincideJugador(partido, 'ramos luis')).toBe(true);
    expect(coincideJugador(partido, 'luis ramos')).toBe(true);
  });

  it('todos los trozos tienen que aparecer', () => {
    expect(coincideJugador(partido, 'ramos zapata')).toBe(false);
  });

  it('quien no está, no sale', () => {
    expect(coincideJugador(partido, 'gutierrez')).toBe(false);
  });

  // Sin búsqueda no se filtra: la lista completa es el estado normal.
  it('vacío no filtra nada', () => {
    expect(coincideJugador(partido, '')).toBe(true);
    expect(coincideJugador(partido, '   ')).toBe(true);
  });

  it('los espacios de más no rompen la búsqueda', () => {
    expect(coincideJugador(partido, '  ramos   luis  ')).toBe(true);
  });

  it('normalizar quita tildes y colapsa espacios', () => {
    expect(normalizar('  Sofía   LEÓN ')).toBe('sofia leon');
  });
});
