/**
 * RALLY · Ganaste el torneo
 *
 * EL HUECO
 *   El jugador gana la final y la app se calla. `YaEstasEnLaSiguiente` devuelve
 *   `null` —y hace bien: después de la final no hay ronda siguiente— y
 *   `MyNextMatch` no tiene partido que enseñar porque ya no queda ninguno. El
 *   campeón se queda con la pantalla de alguien que no juega.
 *
 *   Es el único momento del producto que el jugador va a recordar, y era el
 *   único que no estaba escrito.
 *
 * NO SE ESPERA AL ORGANIZADOR
 *   El campeonato es un hecho en cuanto se captura la final: `matches` tiene el
 *   `winner_pair_id` de la final y con eso basta. Cerrar el torneo —que es lo
 *   que escribe `ranking_points` de verdad— puede tardar días, y hasta entonces
 *   la app le estaría negando algo que ya pasó.
 *
 * NO ES EFÍMERA
 *   `YaEstasEnLaSiguiente` se apaga en cuanto nace el partido siguiente, porque
 *   anuncia algo que va a ocurrir. Esta anuncia algo que YA ocurrió y no deja de
 *   ser verdad: se queda.
 *
 *   Hasta cuándo, exactamente: hasta que haya OTRO torneo del que hablar. Ver
 *   `SIGUE_SIENDO_NOTICIA` abajo.
 *
 * Solo lectura. No cierra torneos ni escribe puntos.
 */

import { supabase } from '@/lib/supabase/client';
import { leerConReintento } from '@/lib/lectura-reintentada';
import { fetchPuntosDelPartido } from '@/lib/puntos-de-la-ronda';

/**
 * De menor a mayor. `primera` es la división más alta, `sexta` la de entrada:
 * el mismo orden ascendente que `DEFAULT_BANDS` del motor de rating, que las
 * ordena por el rating que hace falta para estar en cada una.
 */
const DIVISION: string[] = ['sexta', 'quinta', 'cuarta', 'tercera', 'segunda', 'primera'];

/** Una final ganada, tal como está en la base. */
export interface FinalGanada {
  matchId: string;
  categoryId: string;
  tournamentId: string;
  /** 'quinta', 'primera'… */
  division: string;
  /** '5ª Varonil'. */
  categoria: string;
  miPairId: string;
}

/**
 * De todas las finales que ganó, la que se enseña.
 *
 * UN SOLO CAMPEONATO A LA VEZ. Con dos en el mismo fin de semana manda el de la
 * división MÁS ALTA: ganar la primera pesa más que ganar la sexta, y dos
 * trofeos en la misma pantalla se estorban. El otro sigue existiendo en sus
 * resultados y en su ranking.
 *
 * Determinista con divisiones empatadas o desconocidas: gana la primera que
 * llegó, así que el mismo dato pinta siempre lo mismo.
 */
export function campeonatoQueManda(finales: FinalGanada[]): FinalGanada | null {
  if (finales.length === 0) return null;
  return [...finales].sort(
    (a, b) => DIVISION.indexOf(b.division) - DIVISION.indexOf(a.division),
  )[0];
}

/**
 * ¿Sigue siendo noticia este campeonato?
 *
 * DEJA DE SERLO CUANDO HAY OTRO TORNEO DEL QUE HABLAR. El trofeo se queda en lo
 * alto del dashboard mientras sea lo último que le pasó; en cuanto se inscribe
 * a otro torneo que no ha terminado, esa pantalla tiene que mirar hacia delante
 * —cuándo juega, contra quién— y el trofeo pasa a vivir donde viven los logros:
 * sus resultados y su ranking.
 *
 * SE COMPARA POR FECHA DE INICIO, no por la de inscripción: un torneo que
 * empieza ANTES del que ganó es uno viejo que quedó a medias, y eso no jubila
 * un campeonato de ayer.
 *
 * Y es lo que evita que se pisen las tarjetas: en cuanto hay otro torneo vivo,
 * `MyNextMatch` tiene algo que decir y esta se aparta.
 */
export function SIGUE_SIENDO_NOTICIA(
  inicioDelGanado: string | null,
  otrosTorneos: Array<{ status: string; inicio: string | null }>,
): boolean {
  return !otrosTorneos.some(
    (t) => t.status !== 'finished'
      && (!inicioDelGanado || !t.inicio || t.inicio >= inicioDelGanado),
  );
}

/** Lo que se le puede decir al campeón. */
export interface Campeonato {
  matchId: string;
  tournamentId: string;
  categoryId: string;
  /** '5ª Varonil'. */
  categoria: string;
  /** Puntos de ranking del campeonato, POR JUGADOR. `null` si no se pudieron calcular. */
  puntos: number | null;
}

/** Una fila de la consulta de finales. */
interface FilaFinal {
  id: string;
  category_id: string;
  tournament_id: string;
  pair_a_id: string | null;
  pair_b_id: string | null;
  winner_pair_id: string | null;
  categories: { display_name: string; division: string } | null;
  tournaments: { start_date: string | null; status: string } | null;
}

/**
 * ¿Es campeón de algo ahora mismo?
 *
 * `null` cuando no lo es o cuando el campeonato ya dejó de ser noticia. Los
 * errores de lectura también devuelven `null`, pero quedan registrados por
 * `leerConReintento`: esta tarjeta no es la respuesta que el jugador vino a
 * buscar, así que un fallo se calla en pantalla y se cuenta en el log.
 */
export async function fetchCampeonato(pairIds: string[]): Promise<Campeonato | null> {
  if (pairIds.length === 0) return null;

  const finales = await leerConReintento('campeon/finales', () =>
    supabase
      .from('matches')
      .select(`id, category_id, tournament_id, pair_a_id, pair_b_id, winner_pair_id,
               categories:category_id ( display_name, division ),
               tournaments:tournament_id ( start_date, status )`)
      .eq('stage', 'final')
      .eq('status', 'finished')
      .in('winner_pair_id', pairIds));

  if (!finales.ok) return null;

  const filas = (finales.data ?? []) as unknown as FilaFinal[];
  const ganadas: FinalGanada[] = filas
    .filter((f) => f.winner_pair_id !== null)
    .map((f) => ({
      matchId: f.id,
      categoryId: f.category_id,
      tournamentId: f.tournament_id,
      division: f.categories?.division ?? '',
      categoria: f.categories?.display_name ?? '',
      miPairId: f.winner_pair_id as string,
    }));

  const campeonato = campeonatoQueManda(ganadas);
  if (!campeonato) return null;

  // ── ¿Ya hay otro torneo del que hablar? ────────────────────────────────
  const mias = await leerConReintento('campeon/mis-torneos', () =>
    supabase.from('my_pairs').select('tournament_id'));
  if (!mias.ok) return null;

  const otros = [...new Set(
    (mias.data ?? [])
      .map((m) => (m as { tournament_id: string | null }).tournament_id)
      .filter((id): id is string => !!id && id !== campeonato.tournamentId),
  )];

  if (otros.length > 0) {
    const torneos = await leerConReintento('campeon/otros-torneos', () =>
      supabase.from('tournaments').select('status, start_date').in('id', otros));
    if (!torneos.ok) return null;

    const inicioDelGanado = filas.find((f) => f.id === campeonato.matchId)?.tournaments?.start_date ?? null;
    const sigue = SIGUE_SIENDO_NOTICIA(
      inicioDelGanado,
      (torneos.data ?? []).map((t) => {
        const fila = t as { status: string; start_date: string | null };
        return { status: fila.status, inicio: fila.start_date };
      }),
    );
    if (!sigue) return null;
  }

  // ── Los puntos ─────────────────────────────────────────────────────────
  // Son los de GANAR la final, que es justo el `siGanan` de ese partido: la
  // misma cuenta que le enseñaba la tarjeta antes de jugarla, para que el
  // número no se mueva al ganar. `null` si no se pudo calcular — la tarjeta
  // sale sin esa línea antes que con un número inventado.
  const puntos = await fetchPuntosDelPartido({
    categoryId: campeonato.categoryId,
    miPairId: campeonato.miPairId,
    stage: 'final',
  });

  return {
    matchId: campeonato.matchId,
    tournamentId: campeonato.tournamentId,
    categoryId: campeonato.categoryId,
    categoria: campeonato.categoria,
    puntos: puntos?.siGanan ?? null,
  };
}
