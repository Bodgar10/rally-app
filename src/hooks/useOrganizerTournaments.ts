/**
 * RALLY · useOrganizerTournaments
 *
 * Los torneos vivos de los organizadores de los que el usuario es owner, con
 * lo que hay que atender en cada uno.
 *
 * POR EL CAMINO REAL, NO POR UN ROL
 *   Ser organizador aquí significa exactamente lo mismo que para el botón
 *   "Organizar": tener fila de owner en `organizer_members`. Es lo que
 *   comprueba `isOrganizerOwner`, es lo que decide el destino del botón y es lo
 *   que exige el guard de `(organizer)`. Deducirlo de otra parte —un campo de
 *   perfil, un rol en la sesión— crearía una segunda definición que puede
 *   discrepar de la que abre la puerta, y entonces el dashboard prometería un
 *   panel que el guard rebota.
 *
 *   La lista vacía es una respuesta legítima y distinta de "no es organizador":
 *   un owner sin torneos vivos no ve la sección, y eso está bien — no hay nada
 *   que atender.
 *
 * CACHÉ, igual que useIsOrganizerOwner y useJudgeTournaments
 *   Aquí es MENOS crítico —esto se consume solo desde el dashboard, no desde el
 *   nav— pero se mantiene el mismo patrón por dos razones: el dashboard se
 *   visita muchas veces al día durante un torneo, y tener tres hooks de sesión
 *   con tres formas distintas de cachear es cómo se desincronizan.
 */

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import {
  estaVivo,
  ordenarTorneos,
  type TorneoOrganizado,
} from '@/lib/torneos-organizador';

// ── Caché de módulo ─────────────────────────────────────────────────────────

let cache: { userId: string; torneos: TorneoOrganizado[] } | null = null;
let inFlight: { userId: string; promise: Promise<TorneoOrganizado[]> } | null = null;

/** Tira la caché. Llamar tras crear un torneo o darse de alta como organizador. */
export function invalidateOrganizerTournamentsCache(): void {
  cache = null;
  inFlight = null;
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    invalidateOrganizerTournamentsCache();
  }
});

async function consultar(userId: string): Promise<TorneoOrganizado[]> {
  const { data: membresias } = await supabase
    .from('organizer_members')
    .select('organizer_id')
    .eq('user_id', userId)
    .eq('member_role', 'owner');

  const orgIds = (membresias ?? []).map((m) => m.organizer_id);
  if (orgIds.length === 0) return [];

  const { data: filas } = await supabase
    .from('tournaments')
    .select('id, name, status, start_date, end_date')
    .in('organizer_id', orgIds);

  const vivos = (filas ?? []).filter((t) => estaVivo(t.status));
  if (vivos.length === 0) return [];

  const ids = vivos.map((t) => t.id);

  // LOS DOS CONTADORES, ACOTADOS A ESOS TORNEOS Y EN PARALELO. Se traen filas,
  // no agregados: PostgREST no agrupa, y montar una vista o un RPC para dos
  // números que ya se pueden contar aquí sería una migración a cambio de nada.
  // El volumen está atado a los torneos VIVOS de UN organizador, que son uno o
  // dos: no es una consulta que crezca con el catálogo.
  const ahora = new Date().toISOString();
  const [{ data: cats }, { data: partidos }] = await Promise.all([
    supabase
      .from('categories')
      .select('tournament_id')
      .in('tournament_id', ids)
      .eq('status', 'open'),
    supabase
      .from('matches')
      .select('tournament_id')
      .in('tournament_id', ids)
      .neq('status', 'finished')
      // Su hora ya pasó: se jugó (o se debió jugar) y nadie capturó el
      // marcador. Un partido de mañana sin resultado no es un pendiente.
      .lt('scheduled_at', ahora),
  ]);

  const contar = (rows: Array<{ tournament_id: string }> | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.tournament_id, (m.get(r.tournament_id) ?? 0) + 1);
    return m;
  };
  const abiertas = contar(cats);
  const sinCapturar = contar(partidos);

  return vivos
    .map((t): TorneoOrganizado => ({
      id: t.id,
      nombre: t.name,
      status: t.status,
      inicio: t.start_date,
      fin: t.end_date,
      categoriasAbiertas: abiertas.get(t.id) ?? 0,
      partidosSinCapturar: sinCapturar.get(t.id) ?? 0,
    }))
    .sort(ordenarTorneos);
}

async function resolver(): Promise<TorneoOrganizado[]> {
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

/**
 * `undefined` mientras se resuelve; array (posiblemente vacío) una vez conocida.
 *
 * `undefined` NO pinta la sección: enseñar un hueco que a la mitad de los
 * usuarios se le queda vacío es peor que tardar medio segundo.
 */
export function useOrganizerTournaments(): TorneoOrganizado[] | undefined {
  const [torneos, setTorneos] = useState<TorneoOrganizado[] | undefined>(
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
