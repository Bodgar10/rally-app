/**
 * RALLY · Lo que el juez LEE cuando el servidor rechaza un marcador
 *
 * POR QUÉ ESTE TEST EXISTE
 *   El mensaje que acaba en la pantalla del juez lo escriben DOS módulos que no
 *   se conocen: `validateScore` (el motor) produce el texto, y
 *   `mensajeDeCaptura` decide cómo se presenta la respuesta de la Edge
 *   Function. `score.test.ts` cubre el primero y `captura-errores.test.ts` el
 *   segundo; ninguno de los dos mira la frase COMPLETA, que es la única que un
 *   humano ve.
 *
 *   La costura ya se rompió una vez: `invalid_score` anteponía "El marcador no
 *   es válido." a un detalle que ya nombraba el set y el marcador, y la frase
 *   genérica era la primera que se leía.
 *
 * QUÉ FIJA — PROPIEDADES, NO TEXTOS
 *   A propósito no compara cadenas exactas: el motor puede afinar sus mensajes
 *   —lo acaba de hacer— sin que este archivo estorbe. Lo que fija es lo que no
 *   puede dejar de cumplirse: que el juez sepa QUÉ set está mal y QUÉ marcador
 *   sí valdría, y que nunca reciba una frase genérica en su lugar.
 */

import { validateScore } from '../engine/score';
import { mensajeDeCaptura } from '../captura-errores';

/** Lo que la Edge Function responde ante un marcador inválido (match-result). */
function respuestaDelServidor(sets: Array<[number, number]>) {
  const v = validateScore(
    sets.map(([a, b]) => ({ gamesA: a, gamesB: b, isSuperTiebreak: false })),
  );
  expect(v.valid).toBe(false); // si esto falla, el caso dejó de ser inválido
  return { error: 'invalid_score', detail: v.errors.join(' · '), errors: v.errors };
}

const leeElJuez = (sets: Array<[number, number]>) =>
  mensajeDeCaptura(respuestaDelServidor(sets));

describe('el mensaje que lee el juez', () => {
  it('nunca es la frase genérica cuando el motor sabe qué está mal', () => {
    const casos: Array<[number, number]>[] = [
      [[6, 5], [6, 3]],          // set sin terminar
      [[7, 3], [6, 2]],          // 7 no se alcanza con 3 enfrente
      [[6, 4], [3, 6], [8, 6]],  // ni set normal ni súper muerte
      [[10, 8], [6, 3]],         // súper muerte fuera del set decisivo
    ];
    for (const sets of casos) {
      const m = leeElJuez(sets);
      expect(m).not.toBe('El marcador no es válido.');
      expect(m.startsWith('El marcador no es válido.')).toBe(false);
      expect(m).not.toContain('invalid_score');
    }
  });

  it('nombra el set que está mal y el marcador que se capturó', () => {
    expect(leeElJuez([[6, 5], [6, 3]])).toMatch(/Set 1\b.*6-5/);
    // 12-3 y no 8-6: desde la 063, un 8-6 en el tercero es una súper muerte
    // EN CURSO, no un marcador imposible.
    expect(leeElJuez([[6, 4], [3, 6], [12, 3]])).toMatch(/Set 3\b.*12-3/);
  });

  it('dice qué marcador SÍ valdría, con ejemplos', () => {
    // Un set cualquiera: solo cabe el set normal.
    const primero = leeElJuez([[6, 5], [6, 3]]);
    expect(primero).toMatch(/6-4|7-5|7-6/);

    // El decisivo ofrece EL formato del torneo, no los dos: cuál se juega ya
    // no se adivina, lo dice `tercer_set_formato`.
    const decisivo = leeElJuez([[6, 4], [3, 6], [12, 3]]);
    expect(decisivo).toMatch(/súper muerte a 10/i);
    expect(decisivo).not.toMatch(/set normal/);
  });

  it('cuando lo que falta es un set, lo dice por su nombre', () => {
    // No "partido incompleto": el juez necesita saber qué teclear.
    expect(leeElJuez([[6, 4]])).toMatch(/segundo set/i);
    // 1-1: falta EL DESEMPATE, que es el único que puede ser súper muerte.
    expect(leeElJuez([[6, 4], [3, 6]])).toMatch(/tercer set/i);
  });
});
