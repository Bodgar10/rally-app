/**
 * EL CASO REAL. Torneo bb8e137e, Luis Flores / Manuel García.
 *
 * Inscritos en 6ª Varonil (grupo D) y en 2ª Varonil (grupo F). En la base:
 *
 *   6ª Varonil  grupos R2   sáb 5, 15:00   Cancha 7   (2026-09-05T21:00:00Z)
 *   2ª Varonil  grupos R2   sáb 5, 15:00   Cancha 5   ← empalme real
 *   6ª Varonil  grupos R3   sáb 5, 16:00   Cancha 7   (2026-09-05T22:00:00Z)
 *   2ª Varonil  grupos R3   sáb 5, 16:00   Cancha 5   ← empalme real
 *   6ª Varonil  cuartos     dom 6, 15:00   Cancha 3   (2026-09-06T21:00:00Z)
 *
 * El detector viejo agrupaba por hora del reloj y sin día: juntaba los cuartos
 * del domingo con los grupos del sábado, avisaba de un empalme inexistente y
 * dejaba los dos verdaderos sin reportar.
 */
import { empalmesReales, partidosSinHora, type PartidoParaEmpalmes } from '@/lib/calendario-empalmes';

const LUIS = 'jugador-luis';
const MANUEL = 'jugador-manuel';
const RIVAL_A = 'rival-a';
const RIVAL_B = 'rival-b';

const nombres = new Map([
  [LUIS, 'Luis Flores'],
  [MANUEL, 'Manuel García'],
  [RIVAL_A, 'Rival Uno'],
  [RIVAL_B, 'Rival Dos'],
]);

const partido = (
  id: string,
  categoria: string,
  etapa: string,
  iso: string | null,
  jugadores: string[],
): PartidoParaEmpalmes => ({
  id, categoriaId: `cat-${categoria}`, categoria, etapa, iso, jugadores,
});

// Los cinco partidos reales de la pareja, tal cual están en la base.
const SEXTA_R2   = partido('m-6a-r2', '6ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', [LUIS, MANUEL, RIVAL_A, RIVAL_B]);
const SEGUNDA_R2 = partido('m-2a-r2', '2ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', [LUIS, MANUEL, RIVAL_A, RIVAL_B]);
const SEXTA_R3   = partido('m-6a-r3', '6ª Varonil', 'grupos', '2026-09-05T22:00:00+00:00', [LUIS, MANUEL, RIVAL_A, RIVAL_B]);
const SEGUNDA_R3 = partido('m-2a-r3', '2ª Varonil', 'grupos', '2026-09-05T22:00:00+00:00', [LUIS, MANUEL, RIVAL_A, RIVAL_B]);
const CUARTOS    = partido('m-6a-q',  '6ª Varonil', 'cuartos', '2026-09-06T21:00:00+00:00', [LUIS, MANUEL, RIVAL_A, RIVAL_B]);

const TODOS = [SEXTA_R2, SEGUNDA_R2, SEXTA_R3, SEGUNDA_R3, CUARTOS];

describe('empalmesReales — el caso real de bb8e137e', () => {
  const r = empalmesReales(TODOS, nombres);

  it('los cuartos del domingo 15:00 NO empalman con los grupos del sábado 15:00', () => {
    // El aviso falso decía exactamente esto. No puede volver a salir.
    expect(r.some((e) => e.detalle.includes('cuartos'))).toBe(false);
    expect(r.some((e) => e.matchId === CUARTOS.id)).toBe(false);
  });

  it('detecta los DOS empalmes reales del sábado, uno por hora', () => {
    const deLuis = r.filter((e) => e.jugadorId === LUIS);
    expect(deLuis.map((e) => e.cuando)).toEqual(['sáb 5, 15:00', 'sáb 5, 16:00']);
  });

  it('nombra las dos fases correctamente: grupos y grupos, no cuartos', () => {
    const quince = r.find((e) => e.jugadorId === LUIS && e.cuando === 'sáb 5, 15:00');
    expect(quince!.detalle).toBe('grupos de 2ª Varonil y grupos de 6ª Varonil');
  });

  it('el aviso incluye el día, no solo la hora', () => {
    for (const e of r) {
      expect(e.cuando).toMatch(/^(lun|mar|mié|jue|vie|sáb|dom) \d{1,2}, \d{2}:\d{2}$/);
    }
  });

  it('avisa por los cuatro jugadores del partido, no solo por la pareja A', () => {
    const alas15 = r.filter((e) => e.cuando === 'sáb 5, 15:00').map((e) => e.jugadorId).sort();
    expect(alas15).toEqual([LUIS, MANUEL, RIVAL_A, RIVAL_B].sort());
  });
});

describe('empalmesReales — la hora del reloj no es el instante', () => {
  it('misma hora en días distintos NO es empalme', () => {
    const sabado  = partido('a', '6ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', [LUIS]);
    const domingo = partido('b', '6ª Varonil', 'cuartos', '2026-09-06T21:00:00+00:00', [LUIS]);
    expect(empalmesReales([sabado, domingo], nombres)).toEqual([]);
  });

  it('el mismo instante SÍ es empalme', () => {
    const uno = partido('a', '6ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', [LUIS]);
    const dos = partido('b', '2ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', [LUIS]);
    expect(empalmesReales([uno, dos], nombres)).toHaveLength(1);
  });

  it('el mismo instante escrito en otro huso sigue siendo el mismo instante', () => {
    // El scheduler escribe -06:00 y PostgREST devuelve +00:00. Es la misma hora.
    const utc   = partido('a', '6ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', [LUIS]);
    const local = partido('b', '2ª Varonil', 'grupos', '2026-09-05T15:00:00-06:00', [LUIS]);
    expect(empalmesReales([utc, local], nombres)).toHaveLength(1);
  });

  it('una hora de diferencia no es empalme', () => {
    const uno = partido('a', '6ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', [LUIS]);
    const dos = partido('b', '2ª Varonil', 'grupos', '2026-09-05T22:00:00+00:00', [LUIS]);
    expect(empalmesReales([uno, dos], nombres)).toEqual([]);
  });
});

describe('empalmesReales — los cuatro jugadores', () => {
  it('un empalme que involucra a un jugador de la pareja B se detecta', () => {
    // El jugador compartido está en la pareja B de los dos partidos.
    const uno = partido('a', '6ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', ['otro1', 'otro2', LUIS, MANUEL]);
    const dos = partido('b', '2ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', ['otro3', 'otro4', LUIS, 'otro5']);
    const r = empalmesReales([uno, dos], nombres);
    expect(r).toHaveLength(1);
    expect(r[0].jugador).toBe('Luis Flores');
  });
});

describe('empalmesReales — blindaje contra nulls', () => {
  it('un partido sin hora no genera empalme', () => {
    const conHora = partido('a', '6ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', [LUIS]);
    const sinHora = partido('b', '2ª Varonil', 'grupos', null, [LUIS]);
    expect(empalmesReales([conHora, sinHora], nombres)).toEqual([]);
  });

  it('DOS partidos sin hora tampoco empalman entre sí', () => {
    // El fallo silencioso: sin excluirlos, las dos claves valen lo mismo.
    const a = partido('a', '6ª Varonil', 'grupos', null, [LUIS]);
    const b = partido('b', '2ª Varonil', 'grupos', null, [LUIS]);
    expect(empalmesReales([a, b], nombres)).toEqual([]);
  });

  it('una fecha basura se trata como sin hora, no como instante NaN', () => {
    const a = partido('a', '6ª Varonil', 'grupos', 'mañana por la tarde', [LUIS]);
    const b = partido('b', '2ª Varonil', 'grupos', 'mañana por la tarde', [LUIS]);
    expect(empalmesReales([a, b], nombres)).toEqual([]);
  });

  it('un id de jugador vacío no hermana partidos', () => {
    // pair.player2_id null llegaba como '' y empalmaba a media categoría.
    const a = partido('a', '6ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', ['', 'x']);
    const b = partido('b', '2ª Varonil', 'grupos', '2026-09-05T21:00:00+00:00', ['', 'y']);
    expect(empalmesReales([a, b], nombres)).toEqual([]);
  });
});

describe('partidosSinHora — el dato que falta se dice, no se calla', () => {
  it('un partido sin hora sí genera el aviso de dato faltante', () => {
    const sinHora = partido('b', '6ª Varonil', 'grupos', null, [LUIS]);
    const r = partidosSinHora([SEXTA_R2, sinHora]);
    expect(r).toHaveLength(1);
    expect(r[0].texto).toBe('1 partido de grupos de 6ª Varonil no tiene hora asignada');
  });

  it('cuenta y agrupa por categoría y fase, en plural', () => {
    const sin = [1, 2, 3].map((n) => partido(`s${n}`, '6ª Varonil', 'grupos', null, [LUIS]));
    const r = partidosSinHora(sin);
    expect(r[0].partidos).toBe(3);
    expect(r[0].texto).toBe('3 partidos de grupos de 6ª Varonil no tienen hora asignada');
  });

  it('con todo programado no dice nada', () => {
    expect(partidosSinHora(TODOS)).toEqual([]);
  });

  it('es un aviso APARTE: los sin hora no aparecen entre los empalmes', () => {
    const sinHora = partido('s', '2ª Varonil', 'grupos', null, [LUIS]);
    const todos = [...TODOS, sinHora];
    expect(empalmesReales(todos, nombres).some((e) => e.matchId === 's')).toBe(false);
    expect(partidosSinHora(todos)).toHaveLength(1);
  });
});
