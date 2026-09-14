/**
 * RALLY · Cuánto pesa una ronda, y cómo se ve ese peso
 *
 * EL PROBLEMA
 *   Las tarjetas del jugador se veían igual en la ronda de 32 que en la final,
 *   y eso es plano de una forma que el torneo no es. Llegar a la final es lo
 *   más grande que te pasa en el fin de semana; la pantalla tiene que saberlo.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN UN COMPONENTE
 *   Son DOS tarjetas las que lo necesitan, y nunca se ven a la vez:
 *
 *     · `YaEstasEnLaSiguiente` — efímera. Aparece en cuanto ganas y se apaga en
 *       cuanto nace el partido de verdad.
 *     · `MyNextMatch` — la que el jugador mira durante horas, y la que tiene
 *       delante mientras espera su final.
 *
 *   Una sola de las dos escalando sería peor que ninguna: el jugador vería su
 *   final tratada como algo grande durante diez minutos y como un partido
 *   cualquiera el resto del día. Tienen que ser hermanas, así que la escala se
 *   define UNA vez y las dos la leen. Si mañana cambia el trato de semifinales,
 *   cambia aquí y cambia en las dos.
 *
 * LOS CUATRO NIVELES
 *   1 · ronda de 32 y octavos → el trato de siempre. Entre esas dos no hay un
 *       salto que contarle a nadie; el salto empieza en cuartos.
 *   2 · cuartos               → el acento pasa a ORO y el titular sube.
 *   3 · semifinales           → el titular se parte y la tarjeta deja de ser
 *       plana: fondo `hero` y borde de oro pleno.
 *   4 · final                 → granate. El mismo lenguaje que `RankingBadge`
 *       reserva a campeón y finalista, más un sello que nada más tiene.
 *
 *   La fase de grupos NO escala: se queda en 1. Un partido de grupo es el
 *   principio del torneo, no un logro — y son la mayoría de los que se juegan.
 *
 * ÉPICO AQUÍ ES PESO, NO FIESTA. Ni animaciones, ni emojis, ni un color que no
 * esté en `design-tokens`: los cuatro gradientes oficiales, la escala
 * tipográfica que ya existe y los oros de siempre. Negro, oro y granate.
 *
 * Y LA INFORMACIÓN MANDA. Lo que crece es el TITULAR. La hora, la cancha y el
 * rival no escalan ni se mueven de sitio: son el dato que hace levantarse a
 * alguien de la cama, y en la final tienen que leerse igual de bien que en
 * octavos. Solo cambian de color cuando el fondo lo exige.
 */

import { color, fontSize, gradient, space } from '@/lib/design-tokens';

/** 1 la ronda más lejana, 4 la final. */
export type NivelDeRonda = 1 | 2 | 3 | 4;

/**
 * El nivel de un `matches.stage`.
 *
 * Recibe un `string` y no el enum a propósito: `MyNextMatch` pinta también
 * partidos de grupo y de 3.er lugar, y un stage que no conocemos tiene que caer
 * al trato base en vez de romper la tarjeta.
 */
const NIVEL: Record<string, NivelDeRonda> = {
  // La fase de grupos no escala. Es el principio del torneo, no un logro.
  group: 1,
  round_of_32: 1,
  round_of_16: 1,
  quarter: 2,
  // El 3.er lugar se juega el día de las finales y lo disputan dos
  // semifinalistas: pesa más que unos octavos y menos que la final. No es la
  // final de nadie, así que no llega al granate.
  third_place: 2,
  semi: 3,
  final: 4,
};

export const nivelDeRonda = (stage: string): NivelDeRonda => NIVEL[stage] ?? 1;

/**
 * Cómo se ve ese peso. Todo sale de `design-tokens`: cero valores nuevos.
 *
 * Las dos tarjetas no tienen la misma anatomía —una anuncia una ronda, la otra
 * un partido concreto con su marcador y su rival— así que cada una decide QUÉ
 * hace con estos valores. Lo que no decide ninguna es cuáles son.
 */
export interface TratoDeRonda {
  nivel: NivelDeRonda;
  /** Fondo degradado de la tarjeta. `null` = superficie plana (`fondoPlano`). */
  fondo: { colors: readonly string[]; start: { x: number; y: number }; end: { x: number; y: number } } | null;
  fondoPlano: string;
  borde: string;
  /** La barra de acento superior: alto, y color plano o degradado. */
  acento: { alto: number; colors: readonly string[] | null; plano: string };
  /**
   * El titular va en dos líneas y en mayúsculas.
   *
   * A partir de semifinales el titular es la PALABRA, no la oración: "Estás en
   * semifinales" a 42px ocupa tres renglones en un móvil y empuja la hora fuera
   * de la pantalla; "SEMIFINALES" solo ocupa media.
   */
  titularPartido: boolean;
  tamanoTitular: number;
  colorTitular: string;
  colorEyebrow: string;
  /** Texto primario sobre ese fondo. */
  colorTexto: string;
  /** Texto secundario sobre ese fondo. */
  colorTenue: string;
  /** Las píldoras de hora y cancha. */
  ficha: { fondo: string; texto: string };
  padding: number;
  /** El sello dorado. Solo la final lo tiene. */
  sello: string | null;
}

const TRATO: Record<NivelDeRonda, TratoDeRonda> = {
  // 1 · El trato de siempre. Verde de victoria, titular de una línea.
  1: {
    nivel: 1,
    fondo: null,
    fondoPlano: color.surface,
    borde: color.line,
    acento: { alto: 3, colors: null, plano: color.live },
    titularPartido: false,
    tamanoTitular: fontSize.metric,
    colorTitular: color.goldBright,
    colorEyebrow: color.live,
    colorTexto: color.text,
    colorTenue: color.muted,
    ficha: { fondo: color.surface2, texto: color.text },
    padding: space[4.5],
    sello: null,
  },
  // 2 · Cuartos: el acento se vuelve oro y el titular sube un escalón.
  2: {
    nivel: 2,
    fondo: null,
    fondoPlano: color.surface,
    borde: color.goldMuted,
    acento: { alto: 3, colors: gradient.rule.colors, plano: color.gold },
    titularPartido: false,
    tamanoTitular: fontSize.screenH1,
    colorTitular: color.goldBright,
    colorEyebrow: color.live,
    colorTexto: color.text,
    colorTenue: color.muted,
    ficha: { fondo: color.surface2, texto: color.text },
    padding: space[5],
    sello: null,
  },
  // 3 · Semifinales: el titular se parte y la tarjeta deja de ser plana.
  3: {
    nivel: 3,
    fondo: gradient.hero,
    fondoPlano: color.surface,
    borde: color.gold,
    acento: { alto: 4, colors: gradient.rule.colors, plano: color.gold },
    titularPartido: true,
    tamanoTitular: fontSize.displayL,
    colorTitular: color.goldBright,
    colorEyebrow: color.live,
    colorTexto: color.text,
    colorTenue: color.champagne,
    ficha: { fondo: color.surface2, texto: color.text },
    padding: space[5],
    sello: null,
  },
  // 4 · La final. Granate, el trato que `RankingBadge` reserva a campeón y
  //     finalista, y un sello que ninguna otra ronda tiene.
  4: {
    nivel: 4,
    fondo: gradient.wine,
    fondoPlano: color.wine,
    borde: color.goldBright,
    acento: { alto: 5, colors: gradient.gold.colors, plano: color.goldBright },
    titularPartido: true,
    tamanoTitular: fontSize.displayL,
    colorTitular: color.goldBright,
    // Sobre granate el verde de victoria no se lee: manda el oro.
    colorEyebrow: color.goldBright,
    colorTexto: color.onWine,
    colorTenue: color.onWine,
    ficha: { fondo: color.wineDeep, texto: color.onWine },
    padding: space[5],
    sello: 'El último partido del torneo',
  },
};

/** El trato que le toca a esa ronda. */
export const tratoDeRonda = (stage: string): TratoDeRonda => TRATO[nivelDeRonda(stage)];

/** El trato de un nivel ya calculado. */
export const tratoDeNivel = (nivel: NivelDeRonda): TratoDeRonda => TRATO[nivel];
