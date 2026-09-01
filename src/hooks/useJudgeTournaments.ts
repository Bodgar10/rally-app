/**
 * RALLY · useJudgeTournaments
 *
 * Los torneos en los que el usuario actual es juez, ya filtrados y ordenados.
 * Fuente única para las TRES cosas que dependen de eso:
 *   1. si la pestaña "Juez" aparece en el menú,
 *   2. a dónde lleva esa pestaña (directo si es uno solo),
 *   3. la lista de la pantalla del juez.
 *
 * EL AGUJERO QUE CIERRA
 *   Asignar un juez funcionaba y capturar funcionaba, pero entre las dos cosas
 *   no había NADA: el juez entraba, veía el dashboard de jugador y ahí se
 *   acababa. Las pantallas de `(judge)` existían y eran inalcanzables salvo
 *   escribiendo la URL a mano. Es el rol más importante durante el torneo.
 *
 * QUÉ CUENTA COMO "SER JUEZ" — `tournament_judges`, y solo eso.
 *   NO `organizer_members.member_role = 'judge'`. El juez no tiene por qué ser
 *   del club: la pantalla de asignación lo dice desde su cabecera y
 *   `can_capture_tournament` (migración 054) opina igual — es admin, O owner
 *   del organizador, O fila en `tournament_judges`. Los guards de `(judge)`
 *   pedían la membresía y por eso rebotaban al dashboard a jueces que sí
 *   podían capturar.
 *
 *   El owner entra por su propia rama: organiza un torneo chico, es su propio
 *   juez, y obligarle a asignarse a sí mismo sería ceremonia sin nadie a quien
 *   proteger. Aquí se resuelve con la misma consulta que ya usa el panel.
 *
 * LA VENTANA DE TIEMPO
 *   Un juez de RALLY acumula torneos. Sin filtro, el menú de quien lleva dos
 *   temporadas sería una lista de archivo con el torneo de este fin de semana
 *   perdido dentro.
 *
 *     · Pasados: se ocultan 5 días después de `end_date`. La captura tardía y
 *       las correcciones caben de sobra en esa ventana; el lunes siguiente el
 *       torneo ya no es trabajo.
 *     · Futuros: se ocultan si faltan más de 30 días para `start_date`. Es el
 *       umbral que elegí porque un mes es el horizonte en el que un torneo deja
 *       de ser un plan y empieza a ser una fecha: antes de eso el juez no tiene
 *       nada que hacer ahí, y verlo en el menú solo compite con el que sí está
 *       jugándose. Se cambia en UMBRAL_FUTURO_DIAS, en un sitio, no en tres.
 *
 *   Las fechas se comparan por DÍA en la zona del club (`hoy()` de lib/fechas),
 *   no con Date.now() crudo: un torneo que termina hoy no puede desaparecer del
 *   menú a mitad de la tarde porque el reloj pasó de las 00:00 UTC.
 *
 * CACHÉ, igual que useIsOrganizerOwner
 *   Esto se consulta desde el nav, que está montado en TODAS las pantallas del
 *   jugador. Sin caché sería una consulta por navegación. Se invalida sola al
 *   cambiar la sesión, y a mano tras asignar o quitar jueces.
 */

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import { hoy, parseFechaISO } from '@/lib/fechas';

/** Días DESPUÉS del fin del torneo que sigue apareciendo en el menú. */
export const UMBRAL_PASADO_DIAS = 5;

/** Días ANTES del inicio a partir de los cuales ya aparece en el menú. */
export const UMBRAL_FUTURO_DIAS = 30;

export interface TorneoDeJuez {
  id: string;
  nombre: string;
  status: string;
  inicio: string | null;
  fin: string | null;
  organizador: string;
  /** True si el usuario llega por ser owner y no por `tournament_judges`. */
  porSerOwner: boolean;
}

/** Estados en los que un torneo tiene (o tendrá) partidos que capturar. */
const ESTADOS_VIVOS = ['registration_open', 'registration_closed', 'in_progress'];

interface FilaTorneo {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  organizers: { name: string } | null;
}

/**
 * ¿Cae dentro de la ventana? Un torneo sin fechas se deja pasar: es un dato
 * incompleto del organizador, no una razón para esconderle el torneo al juez.
 */
export function dentroDeLaVentana(
  inicio: string | null,
  fin: string | null,
  hoyDia: Date = hoy(),
): boolean {
  const dia = 24 * 60 * 60 * 1000;

  const finD = parseFechaISO(fin);
  if (finD) {
    const diasDesdeElFin = Math.floor((hoyDia.getTime() - finD.getTime()) / dia);
    if (diasDesdeElFin > UMBRAL_PASADO_DIAS) return false;
  }

  const inicioD = parseFechaISO(inicio);
  if (inicioD) {
    const diasHastaElInicio = Math.floor((inicioD.getTime() - hoyDia.getTime()) / dia);
    if (diasHastaElInicio > UMBRAL_FUTURO_DIAS) return false;
  }

  return true;
}

/** Más cercano primero. Sin fecha, al final: no se puede afirmar cuándo es. */
export function ordenarPorCercania(a: TorneoDeJuez, b: TorneoDeJuez): number {
  const ia = parseFechaISO(a.inicio)?.getTime() ?? Number.POSITIVE_INFINITY;
  const ib = parseFechaISO(b.inicio)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ia !== ib) return ia - ib;
  return a.nombre.localeCompare(b.nombre, 'es');
}

// ── Caché de módulo ─────────────────────────────────────────────────────────

let cache: { userId: string; torneos: TorneoDeJuez[] } | null = null;
let inFlight: { userId: string; promise: Promise<TorneoDeJuez[]> } | null = null;

/** Tira la caché. Llamar tras asignar o quitar un juez. */
export function invalidateJudgeTournamentsCache(): void {
  cache = null;
  inFlight = null;
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    invalidateJudgeTournamentsCache();
  }
});

const SELECT_TORNEO =
  'id, name, status, start_date, end_date, organizers:organizer_id ( name )';

async function consultar(userId: string): Promise<TorneoDeJuez[]> {
  // Las dos vías, en paralelo: asignación explícita y ser owner del club.
  //
  // La de owner va en DOS consultas y no en un embed. `organizer_members` y
  // `tournaments` no se tocan: las dos apuntan a `organizers`, así que
  // PostgREST no tiene FK que seguir entre ellas y el embed sería un 400.
  const [asignados, membresias] = await Promise.all([
    supabase
      .from('tournament_judges')
      .select(`tournament_id, tournaments:tournament_id ( ${SELECT_TORNEO} )`)
      .eq('user_id', userId),
    supabase
      .from('organizer_members')
      .select('organizer_id')
      .eq('user_id', userId)
      .eq('member_role', 'owner'),
  ]);

  const orgIds = (membresias.data ?? []).map((m) => m.organizer_id);
  const propios = orgIds.length
    ? await supabase.from('tournaments').select(SELECT_TORNEO).in('organizer_id', orgIds)
    : { data: [] as FilaTorneo[] };

  const porId = new Map<string, TorneoDeJuez>();

  const meter = (t: FilaTorneo | null | undefined, porSerOwner: boolean) => {
    if (!t?.id) return;
    if (!ESTADOS_VIVOS.includes(t.status)) return;
    if (!dentroDeLaVentana(t.start_date, t.end_date)) return;
    // La asignación explícita gana sobre la vía de owner: si tiene las dos,
    // no es "su" torneo lo que le da acceso, es que lo nombraron juez.
    const ya = porId.get(t.id);
    if (ya && !ya.porSerOwner) return;
    porId.set(t.id, {
      id: t.id,
      nombre: t.name,
      status: t.status,
      inicio: t.start_date,
      fin: t.end_date,
      organizador: t.organizers?.name ?? '—',
      porSerOwner,
    });
  };

  for (const fila of (asignados.data ?? []) as unknown as Array<{ tournaments: FilaTorneo | null }>) {
    meter(fila.tournaments, false);
  }
  for (const t of (propios.data ?? []) as unknown as FilaTorneo[]) {
    meter(t, true);
  }

  return [...porId.values()].sort(ordenarPorCercania);
}

async function resolver(): Promise<TorneoDeJuez[]> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return [];

  if (cache?.userId === userId) return cache.torneos;
  if (inFlight?.userId === userId) return inFlight.promise;

  const promise = consultar(userId)
    .then((torneos) => {
      cache = { userId, torneos };
      inFlight = null;
      return torneos;
    })
    .catch((e) => {
      // Sin cachear el fallo: el siguiente consumidor reintenta.
      inFlight = null;
      throw e;
    });

  inFlight = { userId, promise };
  return promise;
}

/** Resuelve la lista una vez, fuera de React (para redirecciones). */
export async function torneosDeJuez(): Promise<TorneoDeJuez[]> {
  try {
    return await resolver();
  } catch {
    return [];
  }
}

/**
 * `undefined` mientras se resuelve; array (posiblemente vacío) una vez conocida.
 *
 * En el nav, `undefined` significa NO pintar todavía la pestaña: al revés que
 * con "Organizar" —que existe para todos y solo cambia de destino—, aquí
 * enseñarla en la duda le prometería una pantalla a quien no es juez.
 */
export function useJudgeTournaments(): TorneoDeJuez[] | undefined {
  const [torneos, setTorneos] = useState<TorneoDeJuez[] | undefined>(
    () => cache?.torneos,
  );

  useEffect(() => {
    let vivo = true;
    const pedir = () => {
      resolver()
        .then((v) => { if (vivo) setTorneos(v); })
        .catch(() => { if (vivo) setTorneos([]); });
    };

    pedir();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        pedir();
      }
    });

    return () => {
      vivo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return torneos;
}
