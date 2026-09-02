/**
 * EL SET VACÍO QUE LLEGABA COMO 0-0.
 *
 * La hoja arranca con dos filas. Guardar solo el primer set —el caso central
 * de la captura set a set— mandaba la segunda fila vacía, que cruzaba
 * parseInt('')→NaN, JSON→null y Number(null)→0 hasta plantarse en el motor
 * como un 0-0. El juez veía "Set 2: 0-0 no es un marcador válido" y no podía
 * guardar un solo set.
 */
import { aMotor, capturado, payloadDeSets } from '@/lib/captura-sets';
import { validateParcial, validateScore } from '@/lib/engine/score';

const fila = (a: string, b: string) => ({ a, b });
const vacia = () => fila('', '');

describe('capturado — ausencia y cero son cosas distintas', () => {
  it('una fila vacía no está capturada', () => {
    expect(capturado(vacia())).toBe(false);
  });
  it('media fila tampoco: un número suelto no es un set', () => {
    expect(capturado(fila('6', ''))).toBe(false);
    expect(capturado(fila('', '4'))).toBe(false);
  });
  it('un 0-0 TECLEADO sí está capturado: hay dato, y es imposible', () => {
    expect(capturado(fila('0', '0'))).toBe(true);
  });
});

describe('payloadDeSets — la fila vacía no viaja', () => {
  it('con el set 1 lleno y el 2 vacío se manda UN set', () => {
    const p = payloadDeSets([fila('6', '2'), vacia()]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ set_number: 1, games_a: 6, games_b: 2 });
  });

  it('nunca sale un NaN ni un null en los games', () => {
    // Era el salto exacto que fabricaba el 0-0.
    const p = payloadDeSets([fila('6', '2'), vacia(), vacia()]);
    for (const s of p) {
      expect(Number.isFinite(s.games_a)).toBe(true);
      expect(Number.isFinite(s.games_b)).toBe(true);
    }
  });

  it('sets 1 y 2 llenos con el 3 vacío: se mandan dos, numerados 1 y 2', () => {
    const p = payloadDeSets([fila('6', '4'), fila('3', '6'), vacia()]);
    expect(p.map((s) => s.set_number)).toEqual([1, 2]);
  });

  it('la numeración no deja agujeros aunque el hueco esté en medio', () => {
    const p = payloadDeSets([fila('6', '4'), vacia(), fila('6', '3')]);
    expect(p.map((s) => s.set_number)).toEqual([1, 2]);
  });

  it('un 0-0 tecleado SÍ viaja: que lo rechace el motor, no la conversión', () => {
    const p = payloadDeSets([fila('0', '0')]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ games_a: 0, games_b: 0 });
  });

  it('el contrato de la súper muerte no cambió', () => {
    const p = payloadDeSets([fila('6', '4'), fila('3', '6'), fila('10', '7')]);
    expect(p[2]).toMatchObject({
      is_super_tiebreak: true, tiebreak_a: 10, tiebreak_b: 7, games_a: 1, games_b: 0,
    });
  });
});

describe('lo que el motor recibe, contra el caso real', () => {
  it('set 1 en 6-2 y el 2 vacío: válido y sin cerrar', () => {
    const r = validateParcial(aMotor([fila('6', '2'), vacia()]));
    expect(r.valid).toBe(true);
    expect(r.completo).toBe(false);
    expect(r.errors).toEqual([]);
  });

  it('sets 1 y 2 con el 3 vacío tampoco se rechaza', () => {
    const r = validateParcial(aMotor([fila('6', '4'), fila('3', '6'), vacia()]));
    expect(r.valid).toBe(true);
    expect(r.completo).toBe(false);
  });

  it('un 0-0 tecleado sigue siendo inválido', () => {
    const r = validateParcial(aMotor([fila('0', '0')]));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Set 1/);
  });

  it('validateScore no cambió: dos sets llenos cierran el partido', () => {
    const r = validateScore(aMotor([fila('6', '4'), fila('6', '3'), vacia()]));
    expect(r.valid).toBe(true);
    expect(r.completo).toBe(true);
    expect(r.winnerSide).toBe('A');
  });

  it('validateScore sigue rechazando el partido incompleto', () => {
    const r = validateScore(aMotor([fila('6', '2'), vacia()]));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toBe('Falta el segundo set.');
  });
});
