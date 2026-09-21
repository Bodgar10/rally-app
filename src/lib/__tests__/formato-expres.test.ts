import {
  etapasDelExpres, comoSeJuega, RESUMEN_EXPRES, POR_QUE_NO_SE_ELIGE,
} from '@/lib/formato-expres';

describe('comoSeJuega', () => {
  it('la suma 6 NO promete ganador: es lo que la distingue', () => {
    const texto = comoSeJuega('suma_6');
    expect(texto).toContain('sin ganador');
    expect(texto).toContain('6 games');
  });

  it('el set de oro sí lo promete', () => {
    expect(comoSeJuega('set_oro')).toContain('Gana');
  });
});

describe('etapasDelExpres', () => {
  const filas = [
    { stage: 'group',   formato: 'suma_6',   minutos: 30 },
    { stage: 'quarter', formato: 'set_oro',  minutos: 40 },
    { stage: 'semi',    formato: 'set_oro',  minutos: 40 },
    { stage: 'final',   formato: 'dos_sets', minutos: 60 },
  ];

  it('devuelve las cuatro etapas en el orden en que se juegan', () => {
    expect(etapasDelExpres(filas).map((e) => e.etapa))
      .toEqual(['group', 'quarter', 'semi', 'final']);
  });

  it('lleva los minutos de cada etapa', () => {
    expect(etapasDelExpres(filas).map((e) => e.minutos)).toEqual([30, 40, 40, 60]);
  });

  it('la final con dos sets se cuenta distinto que con set de oro', () => {
    const final = etapasDelExpres(filas).find((e) => e.etapa === 'final')!;
    expect(final.comoSeJuega).toContain('Dos sets');
  });

  // Que falte una fila es justo lo que hay que ver: la etapa no se esconde.
  it('una etapa sin fila aparece igual, con su formato por defecto y sin minutos', () => {
    const etapas = etapasDelExpres([{ stage: 'group', formato: 'suma_6', minutos: 30 }]);
    expect(etapas).toHaveLength(4);
    const cuartos = etapas.find((e) => e.etapa === 'quarter')!;
    expect(cuartos.minutos).toBeNull();
    expect(cuartos.comoSeJuega).toBe(comoSeJuega('set_oro'));
  });

  it('sin ninguna fila siguen saliendo las cuatro', () => {
    expect(etapasDelExpres([])).toHaveLength(4);
  });

  // Un formato desconocido —una migración futura, un dato sucio— no puede
  // dejar la línea vacía: se cae al de la etapa.
  it('un formato que no existe cae al de la etapa en vez de quedarse en blanco', () => {
    const [grupo] = etapasDelExpres([{ stage: 'group', formato: 'lo_que_sea', minutos: 30 }]);
    expect(grupo.comoSeJuega).toBe(comoSeJuega('suma_6'));
  });
});

describe('los textos fijos', () => {
  it('el resumen dice los tres números que el organizador repite', () => {
    expect(RESUMEN_EXPRES).toContain('5 partidos');
    expect(RESUMEN_EXPRES).toContain('6 games');
    expect(RESUMEN_EXPRES).toContain('4 de cada grupo');
  });

  it('se explica por qué no hay nada que elegir', () => {
    expect(POR_QUE_NO_SE_ELIGE).toContain('3.er lugar');
  });
});
