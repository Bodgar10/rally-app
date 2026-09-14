/**
 * RALLY · La escala que comparten las dos tarjetas del jugador
 *
 * POR QUÉ SE PRUEBA AQUÍ Y NO EN CADA COMPONENTE
 *   `YaEstasEnLaSiguiente` y `MyNextMatch` nunca se ven a la vez, pero el
 *   jugador las ve UNA DETRÁS DE OTRA: la primera aparece en cuanto gana y se
 *   apaga en cuanto nace el partido de verdad, que es cuando toma el relevo la
 *   segunda. Si escalaran distinto, su final sería algo grande durante diez
 *   minutos y un partido cualquiera el resto del día.
 *
 *   Así que la escala es una sola, y lo que se fija aquí es su forma.
 */

import { nivelDeRonda, tratoDeNivel, tratoDeRonda } from '../escala-de-ronda';
import { color, fontSize, gradient } from '../design-tokens';

describe('el nivel de cada ronda', () => {
  it('sube con la ronda y la final es el techo', () => {
    expect(nivelDeRonda('round_of_32')).toBe(1);
    expect(nivelDeRonda('round_of_16')).toBe(1);
    expect(nivelDeRonda('quarter')).toBe(2);
    expect(nivelDeRonda('semi')).toBe(3);
    expect(nivelDeRonda('final')).toBe(4);
  });

  it('la fase de grupos NO escala', () => {
    // Es el principio del torneo, no un logro. Y son la mayoría de los
    // partidos que se juegan: si escalaran, la escala no diría nada.
    expect(nivelDeRonda('group')).toBe(1);
  });

  it('el 3.er lugar pesa como cuartos: no es la final de nadie', () => {
    expect(nivelDeRonda('third_place')).toBe(2);
  });

  it('un stage que no conocemos cae al trato base, no rompe la tarjeta', () => {
    expect(nivelDeRonda('round_of_64')).toBe(1);
    expect(nivelDeRonda('')).toBe(1);
  });
});

describe('el trato de cada nivel', () => {
  const NIVELES = [1, 2, 3, 4] as const;

  it('el titular crece y nunca encoge', () => {
    const tamanos = NIVELES.map((n) => tratoDeNivel(n).tamanoTitular);
    expect(tamanos).toEqual([...tamanos].sort((a, b) => a - b));
    expect(tamanos[0]).toBe(fontSize.metric);
    expect(tamanos[3]).toBe(fontSize.displayL);
  });

  it('el acento crece y nunca encoge', () => {
    const altos = NIVELES.map((n) => tratoDeNivel(n).acento.alto);
    expect(altos).toEqual([...altos].sort((a, b) => a - b));
  });

  it('el oro aparece en cuartos: el nivel 1 se queda con el verde de victoria', () => {
    expect(tratoDeNivel(1).acento.colors).toBeNull();
    expect(tratoDeNivel(1).acento.plano).toBe(color.live);
    for (const n of [2, 3, 4] as const) {
      expect(tratoDeNivel(n).acento.colors).not.toBeNull();
    }
  });

  it('el fondo deja de ser plano en semifinales', () => {
    expect(tratoDeNivel(1).fondo).toBeNull();
    expect(tratoDeNivel(2).fondo).toBeNull();
    expect(tratoDeNivel(3).fondo).toBe(gradient.hero);
    expect(tratoDeNivel(4).fondo).toBe(gradient.wine);
  });

  it('el titular se parte solo a partir de semifinales', () => {
    // "Estás en semifinales" a 42px ocupa tres renglones y empuja la hora
    // fuera de la pantalla. La palabra sola, no.
    expect(NIVELES.map((n) => tratoDeNivel(n).titularPartido))
      .toEqual([false, false, true, true]);
  });

  it('el sello es EXCLUSIVO de la final', () => {
    expect(NIVELES.filter((n) => tratoDeNivel(n).sello !== null)).toEqual([4]);
  });

  it('sobre granate el texto cambia, porque si no no se lee', () => {
    const final = tratoDeNivel(4);
    expect(final.colorTexto).toBe(color.onWine);
    expect(final.ficha.texto).toBe(color.onWine);
    // Y el verde de victoria del eyebrow cede al oro.
    expect(final.colorEyebrow).toBe(color.goldBright);
    expect(tratoDeNivel(1).colorEyebrow).toBe(color.live);
  });

  it('TODO sale de design-tokens: ni un color ni un tamaño inventado', () => {
    const tokens = new Set<string>(Object.values(color));
    const tamanos = new Set<number>(Object.values(fontSize));
    for (const n of NIVELES) {
      const t = tratoDeNivel(n);
      for (const c of [t.fondoPlano, t.borde, t.colorTitular, t.colorEyebrow,
                       t.colorTexto, t.colorTenue, t.ficha.fondo, t.ficha.texto,
                       t.acento.plano]) {
        expect(tokens.has(c)).toBe(true);
      }
      expect(tamanos.has(t.tamanoTitular)).toBe(true);
    }
  });

  it('`tratoDeRonda` es `tratoDeNivel` del nivel de esa ronda', () => {
    expect(tratoDeRonda('final')).toBe(tratoDeNivel(4));
    expect(tratoDeRonda('group')).toBe(tratoDeNivel(1));
    expect(tratoDeRonda('semi').nivel).toBe(3);
  });
});
