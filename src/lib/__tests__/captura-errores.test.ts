import { mensajeDeCaptura, vaLaPenaReintentar } from '../captura-errores';

describe('mensajeDeCaptura', () => {
  it('traduce la clave y conserva el detalle del engine', () => {
    const m = mensajeDeCaptura({
      error: 'invalid_score',
      detail: 'Set 2 con marcador de games inválido (6-6).',
    });
    expect(m).toContain('El marcador no es válido');
    expect(m).toContain('6-6');
  });

  it('nunca devuelve la clave cruda de un error conocido', () => {
    const claves = [
      'not_authorized', 'winner_mismatch', 'group_busy', 'bracket_busy',
      'is_a_bye', 'winner_not_in_match', 'downstream_already_played',
      'bracket_empty', 'not_a_knockout_match',
    ];
    for (const clave of claves) {
      const m = mensajeDeCaptura({ error: clave });
      expect(m).not.toContain(clave);
      expect(m.length).toBeGreaterThan(10);
    }
  });

  it('los fallos de lectura dicen que no se guardó nada', () => {
    for (const clave of ['group_matches_read_failed', 'group_pairs_read_failed', 'category_read_failed']) {
      expect(mensajeDeCaptura({ error: clave })).toContain('No se guardó nada');
    }
  });

  it('una clave desconocida no se pierde: sale entre paréntesis', () => {
    expect(mensajeDeCaptura({ error: 'algo_nuevo' })).toContain('algo_nuevo');
  });

  it('la corrección bloqueada explica por qué, sin jerga', () => {
    const m = mensajeDeCaptura({ error: 'downstream_already_played', detail: 'f1' });
    expect(m).toMatch(/ya se jugó/);
    expect(m).not.toContain('downstream');
  });

  it('un bye se explica como lo que es', () => {
    expect(mensajeDeCaptura({ error: 'is_a_bye' })).toMatch(/bye/i);
  });

  it('aguanta basura', () => {
    expect(mensajeDeCaptura(null)).toBeTruthy();
    expect(mensajeDeCaptura('texto')).toBeTruthy();
    expect(mensajeDeCaptura({})).toBeTruthy();
    expect(mensajeDeCaptura({ error: 123 })).toBeTruthy();
  });

  it('sin clave pero con detalle, devuelve el detalle', () => {
    expect(mensajeDeCaptura({ detail: 'algo concreto' })).toBe('algo concreto');
  });
});

describe('vaLaPenaReintentar', () => {
  it('los transitorios sí; los de datos no', () => {
    expect(vaLaPenaReintentar({ error: 'group_busy' })).toBe(true);
    expect(vaLaPenaReintentar({ error: 'group_matches_read_failed' })).toBe(true);
    expect(vaLaPenaReintentar({ error: 'invalid_score' })).toBe(false);
    expect(vaLaPenaReintentar({ error: 'winner_mismatch' })).toBe(false);
    expect(vaLaPenaReintentar({ error: 'not_authorized' })).toBe(false);
    expect(vaLaPenaReintentar(null)).toBe(false);
  });
});
