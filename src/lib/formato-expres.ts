/**
 * RALLY · Cómo se juega un exprés, contado.
 *
 * ► EL PROBLEMA QUE RESUELVE
 *   La pantalla de Formato preguntaba al organizador de un exprés cosas que en
 *   un exprés no existen: si se juega el partido por el 3.er lugar, y cómo se
 *   juega el TERCER SET. Un exprés no tiene tercer set en ninguna etapa —los
 *   grupos son a 6 games sin ganador y el cuadro va a set de oro— ni tiene
 *   tercer lugar: son cuartos, semis y final.
 *
 *   Así que la pantalla ofrecía tres decisiones que no cambiaban nada, y una
 *   de ellas —guardar `tercer_lugar: true`— habría metido en el plan del día
 *   un partido que el motor del exprés no sabe crear.
 *
 * ► LO QUE SÍ NECESITA SABER
 *   Un exprés no tiene formato que ELEGIR: tiene formato que ENTENDER. Cada
 *   etapa ya está fijada al crearlo y se guarda en `expres_etapa`. Lo único
 *   útil que la pantalla puede hacer es contarlo bien, porque el organizador
 *   va a tener que explicárselo a 16 parejas esa tarde.
 *
 * Módulo puro: la pantalla pinta lo que sale de aquí y esto se prueba sin
 * pantalla ni base.
 */

import { GAMES_POR_PARTIDO } from '@/lib/engine/expres/suma6';
import { PARTIDOS_POR_PAREJA, CLASIFICAN_POR_GRUPO } from '@/lib/engine/expres/reglas';

/** `expres_etapa.stage`. */
export type EtapaExpres = 'group' | 'quarter' | 'semi' | 'final';
/** `expres_etapa.formato`. */
export type FormatoEtapa = 'suma_6' | 'set_oro' | 'dos_sets';

export interface LineaDeEtapa {
  etapa:  EtapaExpres;
  /** "Fase de grupos", "Cuartos"… */
  titulo: string;
  /** "6 games, sin ganador" — cómo se juega, en una línea. */
  comoSeJuega: string;
  /** Los minutos que tiene reservados en el plan del día. */
  minutos: number | null;
}

const TITULO: Record<EtapaExpres, string> = {
  group:   'Fase de grupos',
  quarter: 'Cuartos de final',
  semi:    'Semifinales',
  final:   'Final',
};

/**
 * Cómo se juega cada formato, dicho como se diría en la cancha.
 *
 * `suma_6` no dice "gana quien llegue a 4": en la suma 6 NO HAY GANADOR. Se
 * juegan seis games y los dos marcadores entran en la tabla — por eso un 3-3
 * es un resultado normal y no un empate que haya que resolver.
 */
const COMO: Record<FormatoEtapa, string> = {
  suma_6:   `${GAMES_POR_PARTIDO} games, sin ganador: los dos marcadores van a la tabla`,
  set_oro:  'Un set. Gana quien lo gane',
  dos_sets: 'Dos sets, y súper muerte si hace falta',
};

export function comoSeJuega(formato: FormatoEtapa): string {
  return COMO[formato];
}

/**
 * Las cuatro etapas, en el orden en que se juegan.
 *
 * Una etapa que no está en `expres_etapa` se devuelve igual, con el formato
 * que le toca por defecto y sin minutos: que falte su fila es justo lo que el
 * organizador tiene que ver, y esconderla lo dejaría creyendo que el torneo
 * está completo.
 */
export function etapasDelExpres(
  filas: readonly { stage: string; formato: string; minutos: number | null }[],
): LineaDeEtapa[] {
  const porEtapa = new Map(filas.map((f) => [f.stage, f]));
  const orden: EtapaExpres[] = ['group', 'quarter', 'semi', 'final'];
  const PORDEFECTO: Record<EtapaExpres, FormatoEtapa> = {
    group: 'suma_6', quarter: 'set_oro', semi: 'set_oro', final: 'set_oro',
  };

  return orden.map((etapa) => {
    const fila = porEtapa.get(etapa);
    const formato = (fila?.formato as FormatoEtapa | undefined) ?? PORDEFECTO[etapa];
    return {
      etapa,
      titulo: TITULO[etapa],
      comoSeJuega: COMO[formato] ?? COMO[PORDEFECTO[etapa]],
      minutos: fila?.minutos ?? null,
    };
  });
}

/**
 * El resumen de una línea que va arriba del todo.
 *
 * Es lo que el organizador repite por el micrófono: cuántos partidos juega
 * cada pareja y cuántas pasan.
 */
export const RESUMEN_EXPRES =
  `Cada pareja juega ${PARTIDOS_POR_PAREJA} partidos a ${GAMES_POR_PARTIDO} games `
  + `y pasan ${CLASIFICAN_POR_GRUPO} de cada grupo a cuartos.`;

/**
 * Por qué esta pantalla no pregunta nada en un exprés.
 *
 * Se dice explícitamente en vez de dejar la pantalla vacía: una pantalla de
 * configuración sin controles se lee como "no cargó".
 */
export const POR_QUE_NO_SE_ELIGE =
  'Un exprés no tiene tercer set en ninguna etapa ni partido por el 3.er lugar: '
  + 'son cuartos, semis y final. El formato queda fijado al crear el torneo.';

/**
 * La línea de la tarjeta "Formato" en el panel del organizador.
 *
 * ► LO QUE DECÍA ANTES ERA FALSO
 *   La tarjeta usaba `resumenDeFormato`, que lee `tercer_set_formato`, y en un
 *   exprés eso salía como "Tercer set: súper muerte a 10". En un exprés no hay
 *   tercer set en ninguna etapa: los grupos van a 6 games sin ganador y el
 *   cuadro a set de oro. El valor existe en la columna porque es NOT NULL y se
 *   escribe al crear el torneo, no porque signifique algo.
 *
 *   Un panel que afirma una regla que no se va a jugar es peor que uno que no
 *   dice nada: el organizador lo repite por el micrófono.
 */
export function resumenDeFormatoExpres(): string {
  return `Grupos a ${GAMES_POR_PARTIDO} games · cuadro a set de oro`;
}
