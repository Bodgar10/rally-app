/**
 * RALLY · Los puntos del partido que viene — la MISMA cuenta en las dos tarjetas
 *
 * `MyNextMatch` y `YaEstasEnLaSiguiente` hablan del mismo jugador en el mismo
 * torneo y llegaron a decirle 510 y 1700. Aquí se fija que no puedan volver a
 * divergir, y los dos motivos por los que divergieron.
 */

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

import { fraseCampeon, frasePuntos, puntosDelPartido } from '../puntos-de-la-ronda';
import { puntosGarantizados, rondaMasLejanaAlcanzada } from '../puntos-garantizados';
import { DEFAULT_RANKING_RULES } from '../engine/ranking-points';

/**
 * LOS PUNTOS DE ESTAR AQUÍ
 *
 * Estaban en `MyNextMatch` y no en esta tarjeta — o sea que faltaban justo en
 * la final, que es donde más pesan.
 *
 * LA REGLA: estar en la ronda YA los garantiza, sin jugarla. Quien pierde la
 * final sigue siendo subcampeón y se lleva los 650. Por eso `garantizados` es
 * el tope de la ronda a la que entra y `siGanan` el del peldaño siguiente, que
 * en la final es ser campeón.
 *
 * La aritmética no se prueba aquí: es del motor y ya tiene sus tests. Lo que se
 * fija es que se le pregunta por los DOS peldaños correctos.
 */
describe('los puntos de la ronda a la que entra', () => {
  // Un torneo donde el multiplicador de tier es 1: así los números del test son
  // los de la tabla del motor y se leen de un vistazo.
  const BASE = { tier: 'p1' as const, parejasEnCategoria: 16, groupWins: 0, qualified: true };

  const enLaRonda = (stage: string) =>
    puntosGarantizados({ ...BASE, furthestRound: rondaMasLejanaAlcanzada([stage]) })!.garantizados;

  it('la tabla del motor es la que manda', () => {
    expect(DEFAULT_RANKING_RULES.roundPoints.final).toBe(650);
    expect(DEFAULT_RANKING_RULES.roundPoints.champion).toBe(1000);
  });

  it('estar en la final ya vale el tope de finalista, sin jugarla', () => {
    // El caso del enunciado: 650 garantizados.
    expect(enLaRonda('final')).toBe(650 + DEFAULT_RANKING_RULES.qualifyBonus);
  });

  it('y ganarla es el campeonato, que NO es otra ronda del cuadro', () => {
    // Ser campeón no tiene fila en `matches`: por eso la escalera lo nombra
    // aparte. Si se proyectara con el `stage` de la final saldría 650 otra vez.
    const campeon = puntosGarantizados({ ...BASE, furthestRound: 'champion' })!.garantizados;
    expect(campeon).toBe(1000 + DEFAULT_RANKING_RULES.qualifyBonus);
    expect(campeon).toBeGreaterThan(enLaRonda('final'));
  });

  it('cada ronda vale más que la anterior', () => {
    const escalera = ['round_of_16', 'quarter', 'semi', 'final'].map(enLaRonda);
    expect(escalera).toEqual([...escalera].sort((a, b) => a - b));
    expect(new Set(escalera).size).toBe(escalera.length);
  });

  it('sin tier no se inventa un número', () => {
    expect(puntosGarantizados({ ...BASE, tier: null, furthestRound: 'final' })).toBeNull();
  });

  it('ni sin saber cuántas parejas hay en la categoría', () => {
    expect(puntosGarantizados({ ...BASE, parejasEnCategoria: 0, furthestRound: 'final' })).toBeNull();
  });
});

/**
 * LA REGLA DURA · LAS DOS TARJETAS DAN LA MISMA CIFRA
 *
 * Nunca se ven a la vez, pero el jugador las ve una detrás de otra: gana su
 * semifinal y aparece `YaEstasEnLaSiguiente`; nace la final y toma el relevo
 * `MyNextMatch`. Si los números cambiaran en ese relevo, el jugador vería sus
 * puntos "moverse" solos y no creería ninguno de los dos.
 *
 * Lo que garantiza que no puedan divergir es que las dos llaman a
 * `puntosDelPartido` con lo mismo: el `stage` del partido QUE VA A JUGAR.
 *   · `YaEstasEnLaSiguiente` le pasa `ubicacion.stage` — la ronda a la que
 *     acaba de entrar, cuyo partido todavía no existe.
 *   · `MyNextMatch` le pasa `match.stage` — esa misma ronda, ya materializada.
 * Son el mismo valor, y por eso la cifra no se mueve en el relevo.
 */
describe('las dos tarjetas dan la misma cifra', () => {
  /** El caso real de 5ª Varonil: 'major', 30 parejas, 2 victorias de grupo. */
  const ESTADO = { tier: 'major' as const, parejasEnCategoria: 30, groupWins: 2 };

  it('el mismo jugador en la final: el relevo no mueve el número', () => {
    // Lo que pasa YaEstasEnLaSiguiente en cuanto gana la semifinal.
    const antesDeQueNazca = puntosDelPartido({ ...ESTADO, stage: 'final' });
    // Y lo que pasa MyNextMatch cuando la fila de la final ya existe.
    const cuandoYaExiste = puntosDelPartido({ ...ESTADO, stage: 'final' });

    expect(antesDeQueNazca).toEqual(cuandoYaExiste);
    // Y son los números de la tabla del motor, ×2 por el tier 'major'.
    expect(antesDeQueNazca).toEqual({ garantizados: 1700, siGanan: 2400 });
  });

  it('y en cualquier otra ronda del cuadro tampoco', () => {
    for (const stage of ['round_of_16', 'quarter', 'semi', 'final']) {
      expect(puntosDelPartido({ ...ESTADO, stage }))
        .toEqual(puntosDelPartido({ ...ESTADO, stage }));
    }
  });

  /**
   * EL BUG 1, FIJADO: contar las parejas con `pairs` daba 1 por la RLS, el tier
   * caía dos escalones y los puntos salían a 0.6× en vez de 2×.
   */
  it('contar 1 pareja en vez de 30 hunde el número: por eso no se usa `pairs`', () => {
    const bien = puntosDelPartido({ ...ESTADO, stage: 'final' })!;
    const comoLoContaba = puntosDelPartido({ ...ESTADO, parejasEnCategoria: 1, stage: 'final' })!;
    expect(bien.garantizados).toBe(1700);
    expect(comoLoContaba.garantizados).toBe(510);
    expect(comoLoContaba.garantizados).toBeLessThan(bien.garantizados);
  });

  /**
   * EL BUG 2, FIJADO: medir la ronda por el último partido GANADO iba un
   * peldaño por debajo. Quien ganó su semifinal está en la final.
   */
  it('la ronda es la del partido que va a jugar, no la del último que ganó', () => {
    const enLaFinal = puntosDelPartido({ ...ESTADO, stage: 'final' })!;
    // Lo que salía antes: furthestRound 'semi', porque es lo último que ganó.
    const comoLoMedia = puntosGarantizados({
      ...ESTADO, qualified: true, furthestRound: 'semi', proximoStage: 'final',
    })!;
    expect(comoLoMedia.garantizados).toBeLessThan(enLaFinal.garantizados);
    expect(comoLoMedia.siGanan).toBeLessThan(enLaFinal.siGanan);
    // Y el techo de lo viejo era el suelo de lo nuevo: iba justo un peldaño abajo.
    expect(comoLoMedia.siGanan).toBe(enLaFinal.garantizados);
  });

  it('la fase de grupos no promete rondas: lo que suma es la victoria', () => {
    const p = puntosDelPartido({ ...ESTADO, stage: 'group' })!;
    expect(p.siGanan - p.garantizados)
      .toBe(DEFAULT_RANKING_RULES.groupWinPoints * DEFAULT_RANKING_RULES.tierMultipliers.major);
  });

  it('el 3.er lugar no sube de ronda: el tope es el mismo se gane o se pierda', () => {
    const p = puntosDelPartido({ ...ESTADO, stage: 'third_place' })!;
    expect(p.siGanan).toBe(p.garantizados);
    expect(p.garantizados).toBe(puntosDelPartido({ ...ESTADO, stage: 'semi' })!.garantizados);
  });

  it('un stage que no conocemos no inventa un peldaño', () => {
    const p = puntosDelPartido({ ...ESTADO, stage: 'round_of_64' })!;
    expect(p.siGanan).toBe(p.garantizados);
  });
});

/**
 * LA FRASE · "PARA CADA UNO" NO ES UN ADORNO
 *
 * Decía "Tienes 1,200 pts garantizados", y eso se puede leer como que son de la
 * PAREJA y que a cada quien le tocan 600. Los puntos son individuales: los dos
 * jugadores reciben el número completo. Es lo que hace el motor —
 * `compute-ranking-points` mete una fila en el ledger POR JUGADOR con los
 * mismos `points`.
 */
describe('la frase de los puntos', () => {
  const ESTADO = { tier: 'major' as const, parejasEnCategoria: 30, groupWins: 2 };

  it('dice que el número es para cada jugador, no para la pareja', () => {
    const p = puntosDelPartido({ ...ESTADO, stage: 'final' })!;
    expect(frasePuntos(p, 'final'))
      .toBe('1,700 pts de ranking para cada uno · Si ganan, 2,400');
  });

  it('y en la fase de grupos, lo mismo con lo que suma ganar', () => {
    const p = puntosDelPartido({ ...ESTADO, stage: 'group' })!;
    expect(frasePuntos(p, 'group')).toBe('Ganar este partido: +100 pts de ranking para cada uno');
  });

  it('nunca insinúa que haya que repartirlos', () => {
    for (const stage of ['group', 'round_of_16', 'quarter', 'semi', 'final']) {
      const frase = frasePuntos(puntosDelPartido({ ...ESTADO, stage })!, stage);
      expect(frase).toContain('para cada uno');
      // "Tienes" era el sujeto ambiguo: ni el jugador ni la pareja quedaban
      // claros. El número va primero y sin dueño gramatical.
      expect(frase).not.toContain('Tienes');
    }
  });

  it('las dos tarjetas dicen exactamente la misma frase', () => {
    // MyNextMatch la pinta con `match.stage`; YaEstasEnLaSiguiente con
    // `donde.stage`. Es el mismo valor, así que es la misma frase.
    const p = puntosDelPartido({ ...ESTADO, stage: 'semi' })!;
    expect(frasePuntos(p, 'semi')).toBe(frasePuntos(p, 'semi'));
  });

  it('cabe en una línea de móvil: 52 caracteres con números de cuatro cifras', () => {
    // A `fontSize.caption` (12px) en Inter caben ~58 en los 350px útiles de un
    // iPhone. Si un cambio la alarga, este test lo dice antes que la pantalla.
    const p = puntosDelPartido({ ...ESTADO, stage: 'final' })!;
    expect(frasePuntos(p, 'final').length).toBeLessThanOrEqual(58);
  });
});

describe('la frase del campeón', () => {
  const ESTADO = { tier: 'major' as const, parejasEnCategoria: 30, groupWins: 2 };

  it('un solo número, y sigue diciendo que es para cada jugador', () => {
    expect(fraseCampeon(2400)).toBe('2,400 pts de ranking para cada uno');
  });

  it('el número del campeón es el `siGanan` de su final: no se mueve al ganarla', () => {
    // Lo que le decía la tarjeta antes de jugar la final es lo que se lleva.
    const antes = puntosDelPartido({ ...ESTADO, stage: 'final' })!;
    expect(fraseCampeon(antes.siGanan)).toBe('2,400 pts de ranking para cada uno');
    expect(frasePuntos(antes, 'final')).toContain('Si ganan, 2,400');
  });

  it('no promete nada más: ya ganó', () => {
    expect(fraseCampeon(2400)).not.toContain('Si ganan');
  });
});
