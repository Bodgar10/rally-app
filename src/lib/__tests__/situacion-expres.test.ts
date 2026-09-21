import { situacionExpres } from '@/lib/situacion-expres';

const base = {
  estado: 'alive' as const,
  balance: 6, posicion: 1, jugados: 1, pendientes: 4, clasifican: 4,
};

// EL FALLO QUE ORIGINÓ ESTE MÓDULO: el motor del torneo largo decide que no
// has empezado mirando `winnerPairId`, que en un suma 6 es siempre null. El
// jugador leía "Todavía no has jugado" y debajo "con 1 partido jugado".
describe('haber jugado se mide por partidos capturados, no por victorias', () => {
  it('con un partido jugado NUNCA dice que no ha empezado', () => {
    const s = situacionExpres(base);
    expect(s.titular).not.toMatch(/no has jugado|no empieza/i);
    expect(s.numeros).toContain('1 partido');
  });

  it('un 6-0 a favor cuenta igual que cualquier otro resultado', () => {
    // Sin ganador en la base: lo único que hay es el saldo.
    expect(situacionExpres({ ...base, balance: 6 }).numeros).toContain('+6');
  });
});

describe('sin haber jugado nada', () => {
  const cero = { ...base, jugados: 0, balance: 0, pendientes: 5 };

  it('no le inventa un puesto: con todo a cero el orden es el del sorteo', () => {
    expect(situacionExpres(cero).numeros).toBeNull();
  });

  it('dice cuántos juega y cuántas pasan', () => {
    const s = situacionExpres(cero);
    expect(s.detalle).toContain('5 partidos');
    expect(s.detalle).toContain('4 primeras');
    expect(s.tono).toBe('espera');
  });

  it('sin calendario todavía, no promete partidos', () => {
    const s = situacionExpres({ ...cero, pendientes: 0 });
    expect(s.detalle).toMatch(/sortee/i);
  });
});

describe('clasificado', () => {
  it('con partidos por delante dice que ya no dependen de él', () => {
    const s = situacionExpres({ ...base, estado: 'clinched', jugados: 3, pendientes: 2 });
    expect(s.titular).toBe('Ya estás en cuartos');
    expect(s.detalle).toContain('2 partidos');
    expect(s.tono).toBe('dentro');
  });

  it('sin partidos por delante no habla de partidos que no existen', () => {
    const s = situacionExpres({ ...base, estado: 'clinched', jugados: 5, pendientes: 0 });
    expect(s.detalle).not.toMatch(/te quedan/i);
  });
});

describe('eliminado', () => {
  // Los partidos que quedan siguen importando para el saldo aunque no para
  // clasificar: en un exprés se juegan los cinco igual.
  it('con partidos por delante explica que ya no cambian la clasificación', () => {
    const s = situacionExpres({ ...base, estado: 'eliminated', balance: -8, jugados: 3, pendientes: 2 });
    expect(s.titular).toBe('Fuera de cuartos');
    expect(s.detalle).toContain('saldo');
    expect(s.tono).toBe('fuera');
  });

  it('no consuela de oficina', () => {
    const s = situacionExpres({ ...base, estado: 'eliminated', jugados: 5, pendientes: 0 });
    expect(s.detalle).not.toMatch(/lo sentimos|mala suerte|ánimo/i);
  });
});

describe('vivo', () => {
  it('con partidos por jugar dice que cada game cuenta', () => {
    const s = situacionExpres({ ...base, estado: 'alive', pendientes: 2 });
    expect(s.titular).toBe('Todavía puedes entrar');
    expect(s.detalle).toContain('game');
    expect(s.tono).toBe('vivo');
  });

  it('terminados los suyos, la pelota está en el tejado de los demás', () => {
    const s = situacionExpres({ ...base, estado: 'alive', jugados: 5, pendientes: 0 });
    expect(s.detalle).toMatch(/las demás/i);
  });

  // La respuesta por cotas solo puede pecar de prudente, y se dice.
  it('avisa cuando el cálculo fue aproximado', () => {
    const s = situacionExpres({ ...base, estado: 'alive', pendientes: 3, aproximado: true });
    expect(s.detalle).toMatch(/prudente/i);
  });
});

describe('singular y plural', () => {
  it('un solo partido pendiente no se dice en plural', () => {
    const s = situacionExpres({ ...base, estado: 'clinched', pendientes: 1 });
    expect(s.detalle).toContain('1 partido,');
  });

  it('un solo partido jugado tampoco', () => {
    expect(situacionExpres({ ...base, jugados: 1 }).numeros).toContain('1 partido.');
  });
});
