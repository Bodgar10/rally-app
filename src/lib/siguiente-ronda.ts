/**
 * RALLY · "Ya estás en la siguiente ronda"
 *
 * EL CASO
 *   Un jugador gana su partido de cuartos y la app no le dice nada. Sale de la
 *   pista, abre el teléfono y ve su lista de resultados: el 6-3 6-4 que acaba
 *   de ganar, y nada más. Ni dónde está, ni a qué hora vuelve.
 *
 *   No es un olvido de la pantalla: su semifinal NO EXISTE todavía como fila en
 *   `matches`. El avance del cuadro exige la ronda COMPLETA (ver
 *   `@/lib/engine/bracket/avance-captura`), y los otros cuartos siguen en
 *   juego. Así que `MyNextMatch` no tiene qué mostrar, y `MiSituacion` se calla
 *   porque la carrera por clasificar ya se acabó para él.
 *
 * LO QUE SE ARREGLA AQUÍ, Y LO QUE NO
 *   El avance por ronda completa se queda como está: es lo correcto y tiene sus
 *   razones. Lo que faltaba era LEER lo que ya está escrito y decírselo.
 *
 *   Y está todo escrito:
 *     · el partido que ganó, con su etapa y su posición en el cuadro;
 *     · `match_schedule`, que reserva hora y cancha para TODAS las rondas desde
 *       que el organizador programa el día — las semis tienen hora y cancha
 *       aunque no existan como partidos;
 *     · los demás partidos de su ronda, de donde saldrá su rival.
 *
 * EL EMPAREJAMIENTO NO SE REINVENTA
 *   A qué hueco de la ronda siguiente va sale de `advanceBracket`, el mismo
 *   motor que lo decidirá de verdad cuando la ronda se complete. Si aquí se
 *   dedujera "por mi cuenta" y el motor decidiera otra cosa, la app le habría
 *   prometido una cancha y una hora que luego no son las suyas — que es peor
 *   que no decirle nada.
 *
 * NUNCA SE INVENTA UNA HORA
 *   Si el plan no tiene fila para ese hueco, se devuelve la ronda sin hora ni
 *   cancha. Saber que estás en semifinales ya vale por sí solo; una hora
 *   inventada, no.
 *
 * SE APAGA SOLO
 *   En cuanto la ronda se completa nace el partido de verdad y `MyNextMatch` lo
 *   enseña con todo (rival, marcador en vivo, cómo llegar). Por eso lo primero
 *   que se comprueba es si YA existe un partido suyo en la ronda siguiente: si
 *   existe, esto devuelve `null` y la tarjeta desaparece sin que nadie la
 *   apague a mano.
 *
 * SOLO LECTURA. No crea ni modifica ningún partido.
 */

import { supabase } from '@/lib/supabase/client';
import { advanceBracket, type RoundMatch } from '@/lib/engine/bracket';
import { stageForBracketSize, type MatchStage } from '@/lib/engine/seeding';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';

// ───────────────────────────────────────────
// Vocabulario
// ───────────────────────────────────────────

/**
 * Cómo se dice cada ronda DENTRO de "Estás …".
 *
 * Con su preposición y su artículo: "Estás en semifinales", "Estás en la
 * final". Una sola plantilla no puede concordar con las cinco, así que la
 * concordancia viaja en el propio texto.
 */
const ESTAS_EN: Record<MatchStage, string> = {
  round_of_32: 'en la ronda de 32',
  round_of_16: 'en octavos',
  quarter: 'en cuartos de final',
  semi: 'en semifinales',
  final: 'en la final',
};

/**
 * El nombre de la ronda SOLO, sin preposición: el titular de la tarjeta.
 *
 * `ESTAS_EN` mete la ronda dentro de una frase; esto la saca para poder
 * ponerla en grande y sola. En las rondas altas el titular es la palabra, no
 * la oración: "Estás en" pequeño arriba y SEMIFINALES debajo, que es lo que
 * el jugador va a enseñarle a alguien.
 */
const LA_RONDA: Record<MatchStage, string> = {
  round_of_32: 'Ronda de 32',
  round_of_16: 'Octavos',
  quarter: 'Cuartos de final',
  semi: 'Semifinales',
  final: 'La final',
};

/**
 * CUÁNTO PESA VISUALMENTE ESTA RONDA. 1 la más lejana, 4 la final.
 *
 * La tarjeta se veía igual en la ronda de 32 que en la final, y eso es plano
 * de una forma que el torneo no es: llegar a la final es lo más grande que te
 * pasa en el fin de semana y la pantalla no se enteraba.
 *
 * Vive aquí y no en el componente porque es una decisión sobre el CUADRO
 * —qué tan lejos has llegado—, no sobre píxeles. El componente decide qué
 * hacer con el número; cuál es el número lo decide el torneo.
 */
export type NivelDeRonda = 1 | 2 | 3 | 4;

const NIVEL: Record<MatchStage, NivelDeRonda> = {
  // Las dos primeras comparten nivel a propósito: entre la ronda de 32 y los
  // octavos no hay un salto que contarle a nadie. El salto empieza en cuartos.
  round_of_32: 1,
  round_of_16: 1,
  quarter: 2,
  semi: 3,
  final: 4,
};

/** Las etapas del cuadro, de la más lejana a la más cercana al título. */
const ORDEN: MatchStage[] = ['round_of_32', 'round_of_16', 'quarter', 'semi', 'final'];

// ───────────────────────────────────────────
// El núcleo puro
// ───────────────────────────────────────────

/** Un partido de eliminatorias, tal como está hoy en la base. */
export interface PartidoDeCuadro {
  id: string;
  stage: string;
  roundLabel: string | null;
  pairAId: string | null;
  pairBId: string | null;
  winnerPairId: string | null;
}

/** Dónde queda el jugador tras ganar, según el cuadro que ya existe. */
export interface Ubicacion {
  /** Su pareja, la que ganó. */
  miPairId: string;
  /** El partido que ganó. */
  desdeMatchId: string;
  /** Etapa a la que entra. */
  stage: MatchStage;
  /**
   * Su hueco en esa etapa, 0-based. Es la clave del plan: `match_schedule`
   * identifica cada reserva por (categoría, etapa, `slot_index`).
   */
  slotIndex: number;
  /** El partido de su misma ronda del que saldrá su rival. */
  rivalDesdeMatchId: string;
  /**
   * Lo que lo colocó ahí fue un BYE: nadie jugó.
   *
   * Un bye nace ya terminado y con ganador (migración 045), así que por dentro
   * se trata igual que una victoria — avanza igual y ocupa el mismo hueco. Pero
   * NO SE DICE IGUAL: felicitar por ganar a quien no jugó es la clase de
   * detalle que le quita credibilidad a todo lo demás que dice la tarjeta.
   */
  fueBye: boolean;
}

/** Nadie al otro lado: es un pase directo, no un partido. */
const esBye = (m: { pairAId: string | null; pairBId: string | null }): boolean =>
  !m.pairAId || !m.pairBId;

/** El ganador efectivo: el marcado, o la pareja presente si el rival no existe. */
function ganadorDe(m: { pairAId: string | null; pairBId: string | null; winnerPairId: string | null }): string | null {
  if (m.winnerPairId) return m.winnerPairId;
  if (m.pairAId && !m.pairBId) return m.pairAId;
  if (m.pairBId && !m.pairAId) return m.pairBId;
  return null;
}

/**
 * Dónde está el jugador si ya ganó su partido de cuadro y la ronda siguiente
 * todavía no se ha materializado.
 *
 * `partidos` son TODOS los partidos de eliminatorias de la categoría. No se
 * muta nada. `null` en cuanto falte cualquier dato o el caso no aplique:
 *
 *   · no ganó ningún partido de cuadro;
 *   · lo que ganó fue la final o el 3.er lugar, que no alimentan nada;
 *   · YA existe un partido suyo en la ronda siguiente (de eso se encarga
 *     `MyNextMatch`, y las dos tarjetas a la vez serían la misma cosa dicha
 *     dos veces);
 *   · la ronda no tiene la forma que el motor de cuadro sabe avanzar.
 */
export function ubicacionTrasGanar(
  partidos: PartidoDeCuadro[],
  misPairIds: readonly string[],
): Ubicacion | null {
  const mios = new Set(misPairIds);

  // El partido de cuadro más LEJANO que ganó. Con varios ganados —cuartos y
  // antes octavos— manda el de la ronda más avanzada, que es donde está hoy.
  // El 3.er lugar queda fuera de `ORDEN` a propósito: no alimenta nada.
  const ganados = partidos
    .filter((p) => ORDEN.includes(p.stage as MatchStage))
    .map((p) => ({ partido: p, ganador: ganadorDe(p) }))
    .filter((x): x is { partido: PartidoDeCuadro; ganador: string } =>
      x.ganador !== null && mios.has(x.ganador))
    .sort((a, b) =>
      ORDEN.indexOf(b.partido.stage as MatchStage) - ORDEN.indexOf(a.partido.stage as MatchStage));

  if (ganados.length === 0) return null;
  const { partido: ganado, ganador: miPairId } = ganados[0];

  // Ganar la final es ganar el torneo: no hay ronda siguiente que anunciar.
  if (ganado.stage === 'final') return null;

  // ── Su ronda, EN ORDEN DE CUADRO ──────────────────────────────────────
  // Mismo criterio que `planAvance`: `advanceBracket` empareja los partidos i
  // e i+1, así que el orden es semántico. La etiqueta de ronda lleva ceros a
  // la izquierda justo para que el orden lexicográfico sea el del cuadro.
  const ronda = partidos
    .filter((p) => p.stage === ganado.stage)
    .sort((a, b) => (a.roundLabel ?? '').localeCompare(b.roundLabel ?? '') || (a.id < b.id ? -1 : 1));

  if (ronda.length < 2 || ronda.length % 2 !== 0) return null;

  const comoMotor: RoundMatch[] = ronda.map((p) => ({
    matchId: p.id,
    pairAId: p.pairAId,
    pairBId: p.pairBId,
    winnerPairId: p.winnerPairId,
  }));

  // El emparejamiento SALE DEL MOTOR. Aquí solo se busca en qué cruce de los
  // que produjo aparece su partido como origen.
  const { next } = advanceBracket(comoMotor);
  const stage = stageForBracketSize(next.length * 2);

  // ¿Ya existe un partido suyo ahí? Entonces esto sobra: lo enseña MyNextMatch.
  const yaExiste = partidos.some(
    (p) => p.stage === stage
      && ((p.pairAId !== null && mios.has(p.pairAId)) || (p.pairBId !== null && mios.has(p.pairBId))),
  );
  if (yaExiste) return null;

  const slotIndex = next.findIndex((n) => n.sourceMatchIds.includes(ganado.id));
  if (slotIndex < 0) return null;

  const rivalDesdeMatchId = next[slotIndex].sourceMatchIds.find((id) => id !== ganado.id);
  if (!rivalDesdeMatchId) return null;

  return {
    miPairId,
    desdeMatchId: ganado.id,
    stage,
    slotIndex,
    rivalDesdeMatchId,
    fueBye: esBye(ganado),
  };
}

/**
 * De dónde sale su rival, ya en nombres. Dos niveles, y el de arriba manda.
 *
 * EL CASO QUE LO PARTIÓ EN DOS
 *   El partido del que sale su rival puede ser un BYE — alguien que también
 *   pasó sin jugar— o estar ya terminado. En los dos casos el rival NO ES UNA
 *   INCÓGNITA: se sabe con certeza quién es. Exigir las dos parejas para decir
 *   algo tiraba ese dato cierto a "Rival por definir", que es justo lo que esta
 *   tarjeta existe para no hacer.
 */
export type DeDondeSaleElRival =
  /** Ya se sabe quién es: su hermano de cuadro tiene ganador. */
  | { tipo: 'decidido'; pareja: string }
  /** Se juega todavía: se nombran las dos parejas que se lo disputan. */
  | { tipo: 'pendiente'; parejaA: string; parejaB: string };

/**
 * Quién es su rival, dados el partido del que sale y un buscador de nombres.
 *
 * `nombre` devuelve `null` cuando la pareja no se puede resolver — pasa
 * legítimamente si la categoría sigue abierta—, y entonces no se afirma nada:
 * "Contra —" es peor que "Rival por definir".
 *
 * Puro y aparte para poder probar los tres niveles sin base de datos.
 */
export function deDondeSaleElRival(
  partido: PartidoDeCuadro | null,
  nombre: (pairId: string) => string | null,
): DeDondeSaleElRival | null {
  if (!partido) return null;

  // PRIMERO SE PREGUNTA SI YA SE SABE. Un bye —o un partido ya terminado— da
  // un rival CIERTO, y tratarlo como incógnita tiraba un dato que existe.
  const decidido = ganadorDe(partido);
  if (decidido) {
    const suyo = nombre(decidido);
    return suyo ? { tipo: 'decidido', pareja: suyo } : null;
  }

  // Sigue en juego: las DOS parejas o ninguna. "El ganador de Fulano / Mengano
  // y alguien" no dice nada que "rival por definir" no diga mejor.
  const a = partido.pairAId ? nombre(partido.pairAId) : null;
  const b = partido.pairBId ? nombre(partido.pairBId) : null;
  return a && b ? { tipo: 'pendiente', parejaA: a, parejaB: b } : null;
}

/** "Contra quién", en los tres niveles de certeza que hay. */
export function textoDelRival(rival: DeDondeSaleElRival | null): string {
  if (!rival) return 'Rival por definir';
  return rival.tipo === 'decidido'
    ? `Contra ${rival.pareja}`
    : `Contra el ganador de ${rival.parejaA} vs ${rival.parejaB}`;
}

/**
 * Cómo llegó hasta ahí.
 *
 * GANAR Y PASAR NO SON LO MISMO. Un bye nace ya terminado y con ganador, así
 * que por dentro avanza igual que una victoria — pero felicitar por ganar a
 * quien no jugó le quita credibilidad a todo lo demás que dice la tarjeta.
 */
export function comoLlegaste(fueBye: boolean): string {
  return fueBye ? 'Pasas sin jugar' : 'Ganaste';
}

/** Cuánto pesa la ronda a la que ACABA de entrar. No la que ganó. */
export const nivelDeRonda = (stage: MatchStage): NivelDeRonda => NIVEL[stage];

/** La ronda sola, para el titular. */
export const nombreDeLaRonda = (stage: MatchStage): string => LA_RONDA[stage];

/** Lo que se le puede decir hoy al jugador que acaba de ganar. */
export interface SiguienteRonda {
  categoryId: string;
  stage: MatchStage;
  /** 'en semifinales' — ya con su preposición y su artículo. */
  ronda: string;
  /** 'Semifinales' — la ronda sola, para ponerla en grande. */
  rondaSola: string;
  /** Cuánto pesa esta ronda: 1 la más lejana, 4 la final. */
  nivel: NivelDeRonda;
  slotIndex: number;
  /** ISO, o `null` si el plan no reserva nada para ese hueco. Nunca inventado. */
  scheduledAt: string | null;
  courtLabel: string | null;
  /** `null` solo cuando ni siquiera se conocen las parejas que se lo disputan. */
  rivalSaleDe: DeDondeSaleElRival | null;
  /** Llegó por un bye: nadie jugó. Cambia cómo se le anuncia, no dónde está. */
  fueBye: boolean;
}

// ───────────────────────────────────────────
// Lectura
// ───────────────────────────────────────────

/** Una fila de `matches` traída para esto. */
interface FilaDeCuadro {
  id: string;
  stage: string;
  round_label: string | null;
  pair_a_id: string | null;
  pair_b_id: string | null;
  winner_pair_id: string | null;
}

const aPartido = (r: FilaDeCuadro): PartidoDeCuadro => ({
  id: r.id,
  stage: r.stage,
  roundLabel: r.round_label,
  pairAId: r.pair_a_id,
  pairBId: r.pair_b_id,
  winnerPairId: r.winner_pair_id,
});

/**
 * En qué categoría acaba de ganar un partido de cuadro.
 *
 * La más avanzada si hay varias —dos categorías el mismo fin de semana—, que es
 * donde está la noticia. `null` si no ganó ninguno.
 */
async function categoriaDondeGano(pairIds: string[]): Promise<string | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('category_id, stage, pair_a_id, pair_b_id, winner_pair_id')
    .neq('stage', 'group')
    .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`);

  if (error) {
    console.warn('[siguiente-ronda] victorias de cuadro:', error.message);
    return null;
  }

  const mios = new Set(pairIds);
  const filas = (data ?? [])
    .filter((m) => ORDEN.includes(m.stage as MatchStage))
    .filter((m) => {
      const g = ganadorDe({ pairAId: m.pair_a_id, pairBId: m.pair_b_id, winnerPairId: m.winner_pair_id });
      return g !== null && mios.has(g);
    });
  if (filas.length === 0) return null;

  return [...filas]
    .sort((a, b) => ORDEN.indexOf(b.stage as MatchStage) - ORDEN.indexOf(a.stage as MatchStage))[0]
    .category_id;
}

/**
 * Dónde está el jugador, si acaba de ganar y su siguiente partido todavía no
 * existe.
 *
 * `categoryId` se puede omitir: entonces se busca la categoría donde ganó. El
 * dashboard no la sabe —`MiSituacion` devuelve `null` en cuanto el jugador
 * entra al cuadro, que es precisamente este caso.
 *
 * `null` si falta cualquier dato. Solo lectura.
 */
export async function fetchSiguienteRonda(
  pairIds: string[],
  categoryId?: string,
): Promise<SiguienteRonda | null> {
  if (pairIds.length === 0) return null;

  const categoria = categoryId ?? (await categoriaDondeGano(pairIds));
  if (!categoria) return null;

  // TODO el cuadro de la categoría: el motor empareja la ronda entera, no un
  // partido suelto.
  const { data, error } = await supabase
    .from('matches')
    .select('id, stage, round_label, pair_a_id, pair_b_id, winner_pair_id')
    .eq('category_id', categoria)
    .neq('stage', 'group');

  if (error) {
    console.warn('[siguiente-ronda] cuadro:', error.message);
    return null;
  }

  const ubicacion = ubicacionTrasGanar((data ?? []).map((r) => aPartido(r as FilaDeCuadro)), pairIds);
  if (!ubicacion) return null;

  // ── La hora y la cancha, del PLAN ──────────────────────────────────────
  // `match_schedule` las reserva por (categoría, etapa, hueco) desde que se
  // programa el día. Sin fila no hay hora: se dice la ronda y punto.
  const { data: plan } = await supabase
    .from('match_schedule')
    .select('scheduled_at, court_label')
    .eq('category_id', categoria)
    .eq('stage', ubicacion.stage)
    .eq('slot_index', ubicacion.slotIndex)
    .limit(1);

  const hueco = (plan ?? [])[0] ?? null;

  // ── De dónde sale su rival ─────────────────────────────────────────────
  // El hermano de cuadro puede ser un bye —alguien que también pasó sin jugar—
  // o estar ya terminado: en los dos casos el rival es un hecho. Quién decide
  // eso es `deDondeSaleElRival`; aquí solo se le dan las filas y los nombres.
  const filaDelRival = (data ?? []).find((m) => m.id === ubicacion.rivalDesdeMatchId);
  const partidoDelRival = filaDelRival ? aPartido(filaDelRival as FilaDeCuadro) : null;

  const nombres = await fetchParejasPublicas([
    partidoDelRival?.pairAId, partidoDelRival?.pairBId,
  ]);

  const rivalSaleDe = deDondeSaleElRival(
    partidoDelRival,
    // `nombreDePareja` cae a '—' cuando la vista no resuelve la pareja, y
    // "Contra —" es peor que no decir nada: aquí eso es un `null`.
    (pairId) => { const p = nombres.get(pairId); return p ? nombreDePareja(p) : null; },
  );

  return {
    categoryId: categoria,
    stage: ubicacion.stage,
    ronda: ESTAS_EN[ubicacion.stage],
    rondaSola: LA_RONDA[ubicacion.stage],
    nivel: NIVEL[ubicacion.stage],
    slotIndex: ubicacion.slotIndex,
    scheduledAt: hueco?.scheduled_at ?? null,
    courtLabel: hueco?.court_label ?? null,
    rivalSaleDe,
    fueBye: ubicacion.fueBye,
  };
}
