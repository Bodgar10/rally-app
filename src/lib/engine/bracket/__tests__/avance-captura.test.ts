import { planAvance, etiquetaDeRonda, type PartidoCuadro } from '../avance-captura';

// ── Constructores de cuadro ─────────────────────────────────────────────────

const p = (
  id: string,
  stage: string,
  roundLabel: string,
  pairAId: string | null,
  pairBId: string | null,
  extra: Partial<PartidoCuadro> = {},
): PartidoCuadro => ({
  id,
  stage,
  roundLabel,
  pairAId,
  pairBId,
  winnerPairId: null,
  status: 'scheduled',
  sourceMatchIds: null,
  ...extra,
});

/** Semifinales de un cuadro de 4: s1 (A vs B) y s2 (C vs D). */
const semis = (): PartidoCuadro[] => [
  p('s1', 'semi', 'semi-01', 'A', 'B'),
  p('s2', 'semi', 'semi-02', 'C', 'D'),
];

/** Cuartos de un cuadro de 8. */
const cuartos = (): PartidoCuadro[] => [
  p('q1', 'quarter', 'quarter-01', 'A', 'B'),
  p('q2', 'quarter', 'quarter-02', 'C', 'D'),
  p('q3', 'quarter', 'quarter-03', 'E', 'F'),
  p('q4', 'quarter', 'quarter-04', 'G', 'H'),
];

const ganado = (m: PartidoCuadro, w: string): PartidoCuadro =>
  ({ ...m, winnerPairId: w, status: 'finished' });

// ── Rechazos ────────────────────────────────────────────────────────────────

describe('planAvance · rechazos', () => {
  it('un partido que no está en el cuadro', () => {
    const r = planAvance(semis(), 'nope', 'A');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('match_not_found');
  });

  it('un partido de grupos', () => {
    const r = planAvance([p('g1', 'group', 'g-1', 'A', 'B')], 'g1', 'A');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('not_a_bracket_match');
  });

  it('un bye no se captura ni se pisa', () => {
    // Un bye llega sembrado y ya finished (migración 045). Capturarlo
    // sobreescribiría un ganador que ya era correcto.
    const cuadro = [
      p('r1', 'quarter', 'quarter-01', 'A', null, { winnerPairId: 'A', status: 'finished' }),
      p('r2', 'quarter', 'quarter-02', 'C', 'D'),
      p('r3', 'quarter', 'quarter-03', 'E', 'F'),
      p('r4', 'quarter', 'quarter-04', 'G', 'H'),
    ];
    const r = planAvance(cuadro, 'r1', 'A');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('is_a_bye');
  });

  it('un ganador que no juega ese partido', () => {
    const r = planAvance(semis(), 's1', 'Z');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('winner_not_in_match');
  });
});

// ── Avance normal ───────────────────────────────────────────────────────────

describe('planAvance · captura que no completa la ronda', () => {
  it('no crea nada mientras falte un resultado', () => {
    const r = planAvance(semis(), 's1', 'A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rondaCompleta).toBe(false);
    expect(r.crear).toEqual([]);
    expect(r.reapuntar).toEqual([]);
    expect(r.siguienteEtapa).toBeNull();
  });
});

describe('planAvance · la captura que cierra la ronda avanza el cuadro', () => {
  it('cerrar la segunda semi crea la final Y el tercer lugar', () => {
    const cuadro = [ganado(semis()[0], 'A'), semis()[1]];
    const r = planAvance(cuadro, 's2', 'C');
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.rondaCompleta).toBe(true);
    expect(r.siguienteEtapa).toBe('final');
    expect(r.crear).toHaveLength(2);

    const final = r.crear.find((c) => c.stage === 'final')!;
    expect(final.roundLabel).toBe('final-01');
    expect([final.pairAId, final.pairBId]).toEqual(['A', 'C']);
    expect(final.sourceMatchIds).toEqual(['s1', 's2']);

    // Los perdedores, en el mismo paso.
    const tercero = r.crear.find((c) => c.stage === 'third_place')!;
    expect(tercero.roundLabel).toBe('third_place-1');
    expect([tercero.pairAId, tercero.pairBId]).toEqual(['B', 'D']);
    expect(tercero.sourceMatchIds).toEqual(['s1', 's2']);
  });

  it('cerrar cuartos crea las dos semis y NINGÚN tercer lugar', () => {
    const q = cuartos();
    const cuadro = [ganado(q[0], 'A'), ganado(q[1], 'C'), ganado(q[2], 'E'), q[3]];
    const r = planAvance(cuadro, 'q4', 'G');
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.siguienteEtapa).toBe('semi');
    expect(r.crear.map((c) => c.roundLabel)).toEqual(['semi-01', 'semi-02']);
    expect(r.crear.every((c) => c.stage === 'semi')).toBe(true);
    expect([r.crear[0].pairAId, r.crear[0].pairBId]).toEqual(['A', 'C']);
    expect([r.crear[1].pairAId, r.crear[1].pairBId]).toEqual(['E', 'G']);
  });

  it('un bye de la ronda cuenta como resultado y no se toca', () => {
    const cuadro = [
      p('q1', 'quarter', 'quarter-01', 'A', null, { winnerPairId: 'A', status: 'finished' }),
      ganado(p('q2', 'quarter', 'quarter-02', 'C', 'D'), 'C'),
      ganado(p('q3', 'quarter', 'quarter-03', 'E', 'F'), 'E'),
      p('q4', 'quarter', 'quarter-04', 'G', 'H'),
    ];
    const r = planAvance(cuadro, 'q4', 'G');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crear).toHaveLength(2);
    expect([r.crear[0].pairAId, r.crear[0].pairBId]).toEqual(['A', 'C']);
    // El bye no aparece ni en crear ni en reapuntar.
    expect(r.reapuntar).toEqual([]);
  });

  it('la final no alimenta nada', () => {
    const cuadro = [p('f1', 'final', 'final-01', 'A', 'C')];
    const r = planAvance(cuadro, 'f1', 'A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crear).toEqual([]);
    expect(r.siguienteEtapa).toBeNull();
  });

  it('el tercer lugar tampoco', () => {
    const cuadro = [p('t1', 'third_place', 'third_place-1', 'B', 'D')];
    const r = planAvance(cuadro, 't1', 'B');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crear).toEqual([]);
  });
});

describe('planAvance · el 3.er lugar es configurable', () => {
  const cuadro = [ganado(semis()[0], 'A'), semis()[1]];

  it('por defecto se crea: es lo que se venía haciendo', () => {
    const r = planAvance(cuadro, 's2', 'C');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crear.some((c) => c.stage === 'third_place')).toBe(true);
  });

  it('apagado, se crea la final y NADA más', () => {
    const r = planAvance(cuadro, 's2', 'C', false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crear).toHaveLength(1);
    expect(r.crear[0].stage).toBe('final');
  });

  it('apagarlo no toca el resto del avance', () => {
    const con = planAvance(cuadro, 's2', 'C', true);
    const sin = planAvance(cuadro, 's2', 'C', false);
    expect(con.ok && sin.ok).toBe(true);
    if (!con.ok || !sin.ok) return;
    const final = (x: typeof con) => x.crear.find((c) => c.stage === 'final');
    expect(final(sin)).toEqual(final(con));
    expect(sin.reapuntar).toEqual(con.reapuntar);
  });
});

// ── Idempotencia ────────────────────────────────────────────────────────────

describe('planAvance · no duplica lo que ya existe', () => {
  it('si la final ya existe y apunta bien, no crea ni reapunta', () => {
    const cuadro = [
      ganado(semis()[0], 'A'),
      ganado(semis()[1], 'C'),
      p('f1', 'final', 'final-01', 'A', 'C', { sourceMatchIds: ['s1', 's2'] }),
      p('t1', 'third_place', 'third_place-1', 'B', 'D', { sourceMatchIds: ['s1', 's2'] }),
    ];
    // Re-enviar el mismo resultado de s2.
    const r = planAvance(cuadro, 's2', 'C');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esCorreccion).toBe(true);
    expect(r.crear).toEqual([]);
    expect(r.reapuntar).toEqual([]);
  });

  it('reconoce el partido existente por etiqueta si no tiene orígenes guardados', () => {
    // Cuadros sembrados antes de la migración 049: sin source_match_ids.
    const cuadro = [
      ganado(semis()[0], 'A'),
      ganado(semis()[1], 'C'),
      p('f1', 'final', 'final-01', 'A', 'C', { sourceMatchIds: null }),
      p('t1', 'third_place', 'third_place-1', 'B', 'D', { sourceMatchIds: null }),
    ];
    const r = planAvance(cuadro, 's2', 'C');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crear).toEqual([]);   // no duplica la final
    expect(r.reapuntar).toEqual([]);
  });
});

// ── Corrección ──────────────────────────────────────────────────────────────

describe('planAvance · corregir un resultado', () => {
  const conFinalSinJugar = (): PartidoCuadro[] => [
    ganado(semis()[0], 'A'),
    ganado(semis()[1], 'C'),
    p('f1', 'final', 'final-01', 'A', 'C', { sourceMatchIds: ['s1', 's2'] }),
    p('t1', 'third_place', 'third_place-1', 'B', 'D', { sourceMatchIds: ['s1', 's2'] }),
  ];

  it('si la ronda siguiente NO se jugó, reapunta final y tercer lugar', () => {
    // Ganó B, no A. La final y el 3.er lugar cambian de protagonistas.
    const r = planAvance(conFinalSinJugar(), 's1', 'B');
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.esCorreccion).toBe(true);
    expect(r.crear).toEqual([]);
    expect(r.reapuntar).toEqual([
      { matchId: 'f1', pairAId: 'B', pairBId: 'C' },
      { matchId: 't1', pairAId: 'A', pairBId: 'D' },
    ]);
  });

  it('si la final YA se jugó, se rechaza y dice qué la bloquea', () => {
    const cuadro = conFinalSinJugar();
    cuadro[2] = { ...cuadro[2], winnerPairId: 'A', status: 'finished' };

    const r = planAvance(cuadro, 's1', 'B');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('downstream_already_played');
    expect(r.bloqueadoPor).toContain('f1');
    expect(r.detalle).toMatch(/ya se jugó/);
  });

  it('corregir solo el marcador, sin cambiar de ganador, se permite aunque la final ya se jugara', () => {
    // La razón: no cambia quién juega nada. Es el caso real de un 6-4 anotado
    // como 6-3 y detectado al día siguiente.
    const cuadro = conFinalSinJugar();
    cuadro[2] = { ...cuadro[2], winnerPairId: 'A', status: 'finished' };

    const r = planAvance(cuadro, 's1', 'A');   // mismo ganador que ya estaba
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.esCorreccion).toBe(true);
    expect(r.crear).toEqual([]);
    expect(r.reapuntar).toEqual([]);
  });

  it('el tercer lugar jugado también bloquea, aunque la final no', () => {
    const cuadro = conFinalSinJugar();
    cuadro[3] = { ...cuadro[3], winnerPairId: 'B', status: 'finished' };

    const r = planAvance(cuadro, 's1', 'B');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.bloqueadoPor).toEqual(['t1']);
  });

  it('corregir cuartos reapunta la semi que le toca y deja la otra en paz', () => {
    const q = cuartos();
    const cuadro: PartidoCuadro[] = [
      ganado(q[0], 'A'), ganado(q[1], 'C'), ganado(q[2], 'E'), ganado(q[3], 'G'),
      p('sm1', 'semi', 'semi-01', 'A', 'C', { sourceMatchIds: ['q1', 'q2'] }),
      p('sm2', 'semi', 'semi-02', 'E', 'G', { sourceMatchIds: ['q3', 'q4'] }),
    ];
    const r = planAvance(cuadro, 'q1', 'B');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reapuntar).toEqual([{ matchId: 'sm1', pairAId: 'B', pairBId: 'C' }]);
  });
});

// ── Determinismo ────────────────────────────────────────────────────────────

describe('planAvance · determinismo y pureza', () => {
  it('misma entrada, misma salida', () => {
    const cuadro = [ganado(semis()[0], 'A'), semis()[1]];
    expect(planAvance(cuadro, 's2', 'C')).toEqual(planAvance(cuadro, 's2', 'C'));
  });

  it('el orden de entrada del cuadro no cambia el plan', () => {
    const q = cuartos();
    const cuadro = [ganado(q[0], 'A'), ganado(q[1], 'C'), ganado(q[2], 'E'), q[3]];
    const revuelto = [...cuadro].reverse();
    expect(planAvance(revuelto, 'q4', 'G')).toEqual(planAvance(cuadro, 'q4', 'G'));
  });

  it('no muta el cuadro que recibe', () => {
    const cuadro = [ganado(semis()[0], 'A'), semis()[1]];
    const copia = JSON.parse(JSON.stringify(cuadro));
    planAvance(cuadro, 's2', 'C');
    expect(cuadro).toEqual(copia);
  });

  it('etiquetaDeRonda pone el cero para que ordene como el cuadro', () => {
    expect(etiquetaDeRonda('semi', 0)).toBe('semi-01');
    expect(etiquetaDeRonda('round_of_16', 9)).toBe('round_of_16-10');
    const etiquetas = [0, 8, 9, 1].map((i) => etiquetaDeRonda('round_of_16', i)).sort();
    expect(etiquetas).toEqual(['round_of_16-01', 'round_of_16-02', 'round_of_16-09', 'round_of_16-10']);
  });
});

/**
 * EL PARTIDO QUE NACE SIN HORA.
 *
 * `match_schedule` reserva hora y cancha para todas las rondas desde que se
 * programa el día, y las identifica por (categoría, etapa, slot_index). Sin
 * emitir esa posición, la RPC no puede encontrar el hueco y el partido nace
 * con scheduled_at en null: en bb8e137e las semifinales de 6ª Varonil
 * aparecieron como "POR PROGRAMAR" con el calendario del domingo ya hecho.
 */
describe('planAvance — cada partido creado dice su hueco en el plan', () => {
  const cuartos: PartidoCuadro[] = [0, 1, 2, 3].map((i) => ({
    id: `q${i}`,
    stage: 'quarter',
    roundLabel: `quarter-0${i}`,
    pairAId: `a${i}`,
    pairBId: `b${i}`,
    winnerPairId: i === 3 ? null : `a${i}`,
    status: i === 3 ? 'scheduled' : 'finished',
    sourceMatchIds: null,
  }));

  it('las semifinales salen numeradas 0 y 1, en orden', () => {
    const plan = planAvance(cuartos, 'q3', 'a3');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.crear.map((c) => c.slotIndex)).toEqual([0, 1]);
    // Y la posición casa con la etiqueta: si divergieran, la RPC buscaría el
    // hueco de otro partido.
    expect(plan.crear.every((c, i) => c.slotIndex === i)).toBe(true);
  });

  it('el 3.er lugar es único en su etapa: su hueco es el 0', () => {
    const semis: PartidoCuadro[] = [0, 1].map((i) => ({
      id: `s${i}`,
      stage: 'semi',
      roundLabel: `semi-0${i}`,
      pairAId: `a${i}`,
      pairBId: `b${i}`,
      winnerPairId: i === 0 ? 'a0' : null,
      status: i === 0 ? 'finished' : 'scheduled',
      sourceMatchIds: null,
    }));
    const plan = planAvance(semis, 's1', 'a1', true);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const tercero = plan.crear.find((c) => c.stage === 'third_place');
    expect(tercero?.slotIndex).toBe(0);
  });
});
