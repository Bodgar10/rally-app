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
}

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
  };
}

/** De dónde sale su rival, ya en nombres. */
export interface DeDondeSaleElRival {
  /** Las dos parejas de ese partido. Solo se llena cuando se conocen LAS DOS. */
  parejaA: string;
  parejaB: string;
}

/** Lo que se le puede decir hoy al jugador que acaba de ganar. */
export interface SiguienteRonda {
  categoryId: string;
  stage: MatchStage;
  /** 'en semifinales' — ya con su preposición y su artículo. */
  ronda: string;
  slotIndex: number;
  /** ISO, o `null` si el plan no reserva nada para ese hueco. Nunca inventado. */
  scheduledAt: string | null;
  courtLabel: string | null;
  /** `null` mientras no se conozcan las dos parejas del partido del que sale. */
  rivalSaleDe: DeDondeSaleElRival | null;
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
  const partidoDelRival = (data ?? []).find((m) => m.id === ubicacion.rivalDesdeMatchId);
  const nombres = await fetchParejasPublicas([
    partidoDelRival?.pair_a_id, partidoDelRival?.pair_b_id,
  ]);
  const parejaA = partidoDelRival?.pair_a_id ? nombres.get(partidoDelRival.pair_a_id) : undefined;
  const parejaB = partidoDelRival?.pair_b_id ? nombres.get(partidoDelRival.pair_b_id) : undefined;

  return {
    categoryId: categoria,
    stage: ubicacion.stage,
    ronda: ESTAS_EN[ubicacion.stage],
    slotIndex: ubicacion.slotIndex,
    scheduledAt: hueco?.scheduled_at ?? null,
    courtLabel: hueco?.court_label ?? null,
    // Las DOS o ninguna: "contra el ganador de Fulano / Mengano y alguien" no
    // dice nada que "rival por definir" no diga mejor.
    rivalSaleDe: parejaA && parejaB
      ? { parejaA: nombreDePareja(parejaA), parejaB: nombreDePareja(parejaB) }
      : null,
  };
}
