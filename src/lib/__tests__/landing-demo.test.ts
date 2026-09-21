import {
  tablaEnElPaso, PAREJAS_DEMO, PASOS_DEMO, RIVAL_DEMO,
} from '@/lib/landing-demo';

describe('la demo corre el motor de verdad', () => {
  it('siempre devuelve las ocho parejas, pase lo que pase', () => {
    for (let n = 0; n <= PASOS_DEMO; n++) {
      expect(tablaEnElPaso(n)).toHaveLength(PAREJAS_DEMO.length);
    }
  });

  it('en el paso 0 nadie ha jugado y nadie tiene saldo', () => {
    const t = tablaEnElPaso(0);
    expect(t.every((f) => f.jugados === 0 && f.balance === 0)).toBe(true);
  });

  it('cada paso suma dos parejas con un partido más', () => {
    const jugados = (n: number) => tablaEnElPaso(n).reduce((a, f) => a + f.jugados, 0);
    expect(jugados(1)).toBe(2);
    expect(jugados(4)).toBe(8);
  });

  // Lo que hace creíble la animación: la tabla se REORDENA sola.
  it('el orden cambia conforme entran los marcadores', () => {
    const antes = tablaEnElPaso(0).map((f) => f.pairId);
    const despues = tablaEnElPaso(PASOS_DEMO).map((f) => f.pairId);
    expect(despues).not.toEqual(antes);
  });

  it('el primero acaba con saldo positivo y dentro del corte', () => {
    const [lider] = tablaEnElPaso(PASOS_DEMO);
    expect(lider.balance).toBeGreaterThan(0);
    expect(lider.dentro).toBe(true);
  });

  it('las posiciones son 1..8 sin huecos ni repetidos', () => {
    const pos = tablaEnElPaso(PASOS_DEMO).map((f) => f.posicion);
    expect(pos).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('clasifican las cuatro primeras y solo esas', () => {
    const t = tablaEnElPaso(PASOS_DEMO);
    expect(t.filter((f) => f.dentro).map((f) => f.posicion)).toEqual([1, 2, 3, 4]);
  });

  // El guion está elegido para que esto pase: es el caso que hay que enseñar.
  it('al final hay un empate a saldo resuelto por el partido entre ellas', () => {
    expect(tablaEnElPaso(PASOS_DEMO).some((f) => f.porDirecto)).toBe(true);
  });

  // Alimenta una animación: un temporizador que se pasa no puede tumbar la
  // portada.
  it('un paso fuera de rango se recorta en vez de reventar', () => {
    expect(() => tablaEnElPaso(-5)).not.toThrow();
    expect(tablaEnElPaso(-5)).toEqual(tablaEnElPaso(0));
    expect(tablaEnElPaso(999)).toEqual(tablaEnElPaso(PASOS_DEMO));
    expect(tablaEnElPaso(2.7)).toEqual(tablaEnElPaso(2));
  });

  it('todas las filas traen nombre: ninguna sale como guion', () => {
    expect(tablaEnElPaso(PASOS_DEMO).every((f) => f.nombre !== '—')).toBe(true);
  });
});

describe('la ficha del rival de la demo', () => {
  it('enseña el caso que la ficha existe para avisar: zurdo de revés', () => {
    const zurdo = RIVAL_DEMO.jugadores.find((j) => j.mano === 'Zurdo');
    expect(zurdo?.lado).toBe('Revés');
    expect(RIVAL_DEMO.aviso).toContain('zurdo');
  });
});
