// src/lib/__tests__/fechas.test.ts
//
// Fija el contrato de @/lib/fechas.
//
// ZONA HORARIA: jest.globalSetup.js fija TZ=America/Mexico_City (UTC-6). Es
// imprescindible — el bug que motiva este módulo SOLO aparece en offsets
// negativos, así que en un CI en UTC estos tests pasarían sin probar nada.
// El primer test verifica que la TZ es la esperada, para que si alguien quita
// el globalSetup salte aquí y no en forma de bug silencioso.

import {
  parseFechaISO,
  aFechaISO,
  hoy,
  compararPorDia,
  mismoDia,
  dentroDeRango,
  formatearLargo,
  formatearCorto,
  formatearConDia,
  formatearRango,
  formatearMesAnio,
  indiceLunes,
  rejillaMes,
  sumarMeses,
  INICIALES_SEMANA,
  diasHasta,
  cuentaAtras,
  horaDeTorneo,
  fechaHoraDeTorneo,
  ZONA_TORNEO,
  diaDeTorneo,
  minutosDeTorneo,
} from '../fechas';

describe('entorno de los tests', () => {
  it('corre en America/Mexico_City (offset negativo)', () => {
    expect(process.env.TZ).toBe('America/Mexico_City');
    // Julio en CDMX es UTC-5 (horario de verano); enero, UTC-6. Ambos negativos:
    // getTimezoneOffset devuelve minutos POSITIVOS al oeste de Greenwich.
    expect(new Date(2026, 6, 12).getTimezoneOffset()).toBeGreaterThan(0);
  });
});

describe('parseFechaISO — el bug de desplazamiento UTC', () => {
  it('REGRESIÓN: "2026-07-12" es el 12 de julio, no el 11', () => {
    // El caso exacto que se encontró en producción. `new Date('2026-07-12')`
    // devolvía el 11 en México porque parsea como medianoche UTC.
    const d = parseFechaISO('2026-07-12')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(12);
  });

  it('REGRESIÓN: el parseo nativo SÍ se desplaza — la razón de este módulo', () => {
    // Si este test empieza a fallar es que la TZ dejó de ser negativa y el
    // resto de la suite ya no está probando lo que cree probar.
    expect(new Date('2026-07-12').getDate()).toBe(11);
    expect(parseFechaISO('2026-07-12')!.getDate()).toBe(12);
  });

  it('devuelve medianoche local, no una hora arbitraria', () => {
    const d = parseFechaISO('2026-07-12')!;
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    const d = parseFechaISO('2028-02-29')!;
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });

  it('rechaza el 29 de febrero de un año NO bisiesto', () => {
    // Formato válido pero día inexistente: sin la comprobación, Date lo
    // desbordaría al 1 de marzo en silencio.
    expect(parseFechaISO('2026-02-29')).toBeNull();
  });

  it('rechaza días que no existen', () => {
    expect(parseFechaISO('2026-02-30')).toBeNull();
    expect(parseFechaISO('2026-04-31')).toBeNull();
    expect(parseFechaISO('2026-13-01')).toBeNull();
    expect(parseFechaISO('2026-00-10')).toBeNull();
  });

  it('rechaza formatos que no son YYYY-MM-DD', () => {
    expect(parseFechaISO('12/07/2026')).toBeNull();
    expect(parseFechaISO('2026-7-12')).toBeNull();
    expect(parseFechaISO('hola')).toBeNull();
    expect(parseFechaISO('')).toBeNull();
    expect(parseFechaISO(null)).toBeNull();
    expect(parseFechaISO(undefined)).toBeNull();
  });

  it('tolera espacios alrededor', () => {
    expect(parseFechaISO('  2026-07-12  ')!.getDate()).toBe(12);
  });
});

describe('aFechaISO — el bug al revés', () => {
  it('serializa usando componentes locales', () => {
    expect(aFechaISO(new Date(2026, 6, 12))).toBe('2026-07-12');
  });

  it('REGRESIÓN: no usa toISOString, que devolvería el día siguiente', () => {
    // Medianoche local en México es 05:00/06:00 UTC del MISMO día, pero
    // cualquier hora local >= 18:00 cruza a UTC del día siguiente.
    const tarde = new Date(2026, 6, 12, 23, 30);
    expect(aFechaISO(tarde)).toBe('2026-07-12');
    expect(tarde.toISOString().slice(0, 10)).toBe('2026-07-13'); // lo que NO hacemos
  });

  it('rellena con ceros', () => {
    expect(aFechaISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('ida y vuelta', () => {
    for (const iso of ['2026-01-01', '2026-07-12', '2028-02-29', '2026-12-31']) {
      expect(aFechaISO(parseFechaISO(iso)!)).toBe(iso);
    }
  });
});

describe('comparación por día', () => {
  it('ignora la hora', () => {
    const manana = new Date(2026, 6, 12, 8, 0);
    const noche  = new Date(2026, 6, 12, 23, 59);
    expect(mismoDia(manana, noche)).toBe(true);
    expect(compararPorDia(manana, noche)).toBe(0);
  });

  it('ordena correctamente a través de meses y años', () => {
    expect(compararPorDia(new Date(2026, 6, 12), new Date(2026, 6, 13))).toBeLessThan(0);
    expect(compararPorDia(new Date(2026, 11, 31), new Date(2027, 0, 1))).toBeLessThan(0);
    expect(compararPorDia(new Date(2027, 0, 1), new Date(2026, 11, 31))).toBeGreaterThan(0);
  });

  it('dentroDeRango incluye ambos extremos', () => {
    const i = new Date(2026, 6, 12);
    const f = new Date(2026, 6, 15);
    expect(dentroDeRango(i, i, f)).toBe(true);
    expect(dentroDeRango(f, i, f)).toBe(true);
    expect(dentroDeRango(new Date(2026, 6, 13), i, f)).toBe(true);
    expect(dentroDeRango(new Date(2026, 6, 11), i, f)).toBe(false);
    expect(dentroDeRango(new Date(2026, 6, 16), i, f)).toBe(false);
  });

  it('un torneo de un solo día es un rango válido', () => {
    const d = new Date(2026, 6, 12);
    expect(dentroDeRango(d, d, d)).toBe(true);
  });

  it('hoy() está a medianoche', () => {
    const h = hoy();
    expect([h.getHours(), h.getMinutes(), h.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe('formateo en español', () => {
  it('formatearLargo', () => {
    expect(formatearLargo('2026-07-12')).toBe('12 de julio de 2026');
    expect(formatearLargo('2026-01-05')).toBe('5 de enero de 2026');
  });

  it('formatearCorto', () => {
    expect(formatearCorto('2026-07-12')).toBe('12 jul');
  });

  it('formatearConDia usa el día de la semana correcto', () => {
    // 12 de julio de 2026 es domingo. Con el parseo nativo saldría "Sáb 11 jul".
    expect(formatearConDia('2026-07-12')).toBe('Dom 12 jul');
    expect(formatearConDia('2026-07-13')).toBe('Lun 13 jul');
  });

  it('devuelve cadena vacía con entrada inválida, no "Invalid Date"', () => {
    expect(formatearLargo(null)).toBe('');
    expect(formatearCorto('nada')).toBe('');
    expect(formatearConDia(undefined)).toBe('');
    expect(formatearRango('2026-07-12', null)).toBe('');
  });

  it('formatearMesAnio', () => {
    expect(formatearMesAnio(2026, 6)).toBe('julio 2026');
  });
});

describe('formatearRango colapsa lo repetido', () => {
  it('mismo mes', () => {
    expect(formatearRango('2026-07-12', '2026-07-13')).toBe('12 – 13 de julio de 2026');
  });

  it('meses distintos, mismo año', () => {
    expect(formatearRango('2026-06-30', '2026-07-02')).toBe('30 de junio – 2 de julio de 2026');
  });

  it('años distintos', () => {
    expect(formatearRango('2026-12-30', '2027-01-02'))
      .toBe('30 de diciembre de 2026 – 2 de enero de 2027');
  });

  it('un solo día no se escribe como "12 – 12"', () => {
    expect(formatearRango('2026-07-12', '2026-07-12')).toBe('12 de julio de 2026');
  });
});

describe('rejilla del mes (lunes primero)', () => {
  it('la cabecera es L M M J V S D', () => {
    expect(INICIALES_SEMANA).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  });

  it('indiceLunes pone el lunes en 0 y el domingo en 6', () => {
    expect(indiceLunes(new Date(2026, 6, 13))).toBe(0); // lunes
    expect(indiceLunes(new Date(2026, 6, 12))).toBe(6); // domingo
  });

  it('siempre devuelve 42 celdas, para que el alto no cambie al navegar', () => {
    for (const [a, m] of [[2026, 0], [2026, 1], [2026, 6], [2028, 1]] as const) {
      expect(rejillaMes(a, m)).toHaveLength(42);
    }
  });

  it('empieza en lunes', () => {
    for (const [a, m] of [[2026, 0], [2026, 6], [2027, 4]] as const) {
      expect(indiceLunes(rejillaMes(a, m)[0].fecha)).toBe(0);
    }
  });

  it('julio 2026 arranca el lunes 29 de junio', () => {
    // El 1 de julio de 2026 es miércoles, así que la rejilla rellena con 2 días.
    const g = rejillaMes(2026, 6);
    expect(aFechaISO(g[0].fecha)).toBe('2026-06-29');
    expect(g[0].delMes).toBe(false);
    expect(g[1].delMes).toBe(false);
    expect(aFechaISO(g[2].fecha)).toBe('2026-07-01');
    expect(g[2].delMes).toBe(true);
  });

  it('marca delMes solo en los días del mes pedido', () => {
    const g = rejillaMes(2026, 6);
    expect(g.filter((c) => c.delMes)).toHaveLength(31); // julio tiene 31
  });

  it('febrero de un año bisiesto tiene 29 días del mes', () => {
    expect(rejillaMes(2028, 1).filter((c) => c.delMes)).toHaveLength(29);
  });

  it('febrero de un año NO bisiesto tiene 28', () => {
    expect(rejillaMes(2026, 1).filter((c) => c.delMes)).toHaveLength(28);
  });

  it('las celdas son días consecutivos, sin saltos ni repetidos', () => {
    const g = rejillaMes(2026, 6);
    for (let i = 1; i < g.length; i++) {
      const anterior = g[i - 1].fecha;
      const esperado = new Date(anterior.getFullYear(), anterior.getMonth(), anterior.getDate() + 1);
      expect(aFechaISO(g[i].fecha)).toBe(aFechaISO(esperado));
    }
  });

  it('todas las celdas están a medianoche (sin arrastre de horario de verano)', () => {
    // En México el cambio de horario podría meter una hora si se sumaran ms.
    for (const c of rejillaMes(2026, 3)) {
      expect(c.fecha.getHours()).toBe(0);
    }
  });
});

describe('sumarMeses', () => {
  it('avanza y retrocede', () => {
    expect(sumarMeses(2026, 6, 1)).toEqual({ anio: 2026, mes: 7 });
    expect(sumarMeses(2026, 6, -1)).toEqual({ anio: 2026, mes: 5 });
  });

  it('cruza el año en ambos sentidos', () => {
    expect(sumarMeses(2026, 11, 1)).toEqual({ anio: 2027, mes: 0 });
    expect(sumarMeses(2026, 0, -1)).toEqual({ anio: 2025, mes: 11 });
  });
});

// ── diasHasta / cuentaAtras ─────────────────────────────────────────────────

describe('diasHasta', () => {
  function isoRelativo(dias: number): string {
    const h = hoy();
    return aFechaISO(new Date(h.getFullYear(), h.getMonth(), h.getDate() + dias));
  }

  it('devuelve 0 para hoy', () => {
    expect(diasHasta(isoRelativo(0))).toBe(0);
  });

  it('cuenta días futuros', () => {
    expect(diasHasta(isoRelativo(1))).toBe(1);
    expect(diasHasta(isoRelativo(4))).toBe(4);
    expect(diasHasta(isoRelativo(30))).toBe(30);
  });

  it('devuelve negativo si ya pasó', () => {
    expect(diasHasta(isoRelativo(-3))).toBe(-3);
  });

  it('devuelve null con fecha inválida', () => {
    expect(diasHasta(null)).toBeNull();
    expect(diasHasta('no-es-fecha')).toBeNull();
  });
});

describe('cuentaAtras', () => {
  function isoRelativo(dias: number): string {
    const h = hoy();
    return aFechaISO(new Date(h.getFullYear(), h.getMonth(), h.getDate() + dias));
  }

  it('distingue hoy, mañana y plural', () => {
    expect(cuentaAtras(isoRelativo(0))).toBe('Empieza hoy');
    expect(cuentaAtras(isoRelativo(1))).toBe('Empieza mañana');
    expect(cuentaAtras(isoRelativo(4))).toBe('Empieza en 4 días');
  });

  it('avisa si ya empezó', () => {
    expect(cuentaAtras(isoRelativo(-1))).toBe('Ya empezó');
  });

  it('cadena vacía sin fecha', () => {
    expect(cuentaAtras(undefined)).toBe('');
  });
});

describe('horas de torneo (timestamptz)', () => {
  it('el caso del bug: PostgREST devuelve UTC y hay que leer la del club', () => {
    // El scheduler escribió 08:00-06:00; la lectura llega como 14:00+00:00.
    // Es el MISMO instante, y el club juega a las 8 de la mañana.
    expect(horaDeTorneo('2026-09-13T14:00:00+00:00')).toBe('08:00');
    expect(horaDeTorneo('2026-09-13T08:00:00-06:00')).toBe('08:00');
    // Sin zona explícita en el ISO se interpreta como UTC, igual que arriba.
    expect(horaDeTorneo('2026-09-13T14:00:00Z')).toBe('08:00');
  });

  it('da la misma hora venga el offset que venga', () => {
    // Un usuario en Madrid, uno en Tokio y uno en el club leen 16:30.
    const instante = '2026-09-13T22:30:00+00:00';
    expect(horaDeTorneo(instante)).toBe('16:30');
    expect(horaDeTorneo('2026-09-14T07:30:00+09:00')).toBe('16:30');
    expect(horaDeTorneo('2026-09-14T00:30:00+02:00')).toBe('16:30');
  });

  it('cruza la medianoche sin perder el día', () => {
    // 20:00 en el club es el día SIGUIENTE en UTC.
    expect(horaDeTorneo('2026-09-14T02:00:00+00:00')).toBe('20:00');
  });

  it('vacío cuando no hay hora, para que decida quien llama', () => {
    expect(horaDeTorneo(null)).toBe('');
    expect(horaDeTorneo(undefined)).toBe('');
    expect(horaDeTorneo('')).toBe('');
    expect(horaDeTorneo('no es una fecha')).toBe('');
  });

  it('fechaHoraDeTorneo trae el día y la hora del club', () => {
    const t = fechaHoraDeTorneo('2026-09-13T14:00:00+00:00');
    expect(t).toContain('08:00');
    expect(t).toContain('13');
    expect(fechaHoraDeTorneo(null)).toBe('');
  });

  it('la zona vive en un solo sitio', () => {
    expect(ZONA_TORNEO).toBe('America/Mexico_City');
  });
});

describe('diaDeTorneo y minutosDeTorneo', () => {
  it('un partido de sábado noche NO se va al domingo', () => {
    // 2026-09-13T02:00:00Z son las 20:00 del sábado 12 en Ciudad de México.
    // `iso.slice(0,10)` habría dicho domingo y con él la última franja del día.
    expect(diaDeTorneo('2026-09-13T02:00:00Z')).toBe('2026-09-12');
    expect(horaDeTorneo('2026-09-13T02:00:00Z')).toBe('20:00');
  });

  it('el mediodía cae donde se espera', () => {
    expect(diaDeTorneo('2026-09-12T18:00:00Z')).toBe('2026-09-12');
    expect(minutosDeTorneo('2026-09-12T18:00:00Z')).toBe(12 * 60);
  });

  it('minutosDeTorneo cuadra con horaDeTorneo, siempre', () => {
    for (const iso of ['2026-09-11T20:00:00Z', '2026-09-13T02:30:00Z', '2026-03-01T14:15:00Z']) {
      const h = horaDeTorneo(iso);
      expect(minutosDeTorneo(iso)).toBe(Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)));
    }
  });

  it('aguanta basura sin reventar', () => {
    expect(diaDeTorneo(null)).toBe('');
    expect(diaDeTorneo('no es una fecha')).toBe('');
    expect(minutosDeTorneo(undefined)).toBeNull();
  });
});
