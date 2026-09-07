/**
 * RALLY · useJudgePendientes
 *
 * Los torneos que arbitra, con los partidos que le faltan por capturar.
 *
 * POR EL CAMINO REAL — SE MONTA SOBRE `useJudgeTournaments`
 *   La lista de torneos no se vuelve a resolver aquí: se pide al mismo hook que
 *   enciende la pestaña "Juez". Ahí vive la definición de "ser juez"
 *   —`tournament_judges` o ser owner del club— y la ventana de fechas. Una
 *   segunda consulta con sus propios filtros podría discrepar de la que abre la
 *   puerta, y el dashboard prometería partidos que la pantalla no enseña.
 *
 * POR QUÉ UN HOOK APARTE Y NO CONTARLOS DENTRO DE `useJudgeTournaments`
 *   Ese hook lo consume el NAV, que está montado en todas las pantallas del
 *   jugador. Meterle una consulta a `matches` haría pagar el conteo en cada
 *   navegación a cambio de un dato que solo mira el dashboard.
 */

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import { useJudgeTournaments, type TorneoDeJuez } from '@/hooks/useJudgeTournaments';
import { ordenarArbitrados, type TorneoArbitrado } from '@/lib/torneos-juez';

// ── Caché de módulo, igual que los otros hooks de sesión ────────────────────

let cache: { clave: string; torneos: TorneoArbitrado[] } | null = null;
let inFlight: { clave: string; promise: Promise<TorneoArbitrado[]> } | null = null;

/** Tira la caché. Llamar tras capturar un resultado. */
export function invalidateJudgePendientesCache(): void {
  cache = null;
  inFlight = null;
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    invalidateJudgePendientesCache();
  }
});

async function consultar(base: TorneoDeJuez[]): Promise<TorneoArbitrado[]> {
  const ids = base.map((t) => t.id);

  // Su hora ya pasó y no tienen resultado: o se jugaron y nadie los capturó, o
  // se retrasaron. Las dos cosas son suyas. Un partido de mañana sin marcador
  // es el calendario, no un pendiente.
  const { data } = await supabase
    .from('matches')
    .select('id, tournament_id, court_label')
    .in('tournament_id', ids)
    .neq('status', 'finished')
    .lt('scheduled_at', new Date().toISOString());

  const porTorneo = new Map<string, Array<{ id: string; cancha: string | null }>>();
  for (const m of data ?? []) {
    const lista = porTorneo.get(m.tournament_id) ?? [];
    lista.push({ id: m.id, cancha: m.court_label });
    porTorneo.set(m.tournament_id, lista);
  }

  return base
    .map((t): TorneoArbitrado => ({
      id: t.id,
      nombre: t.nombre,
      inicio: t.inicio,
      fin: t.fin,
      organizador: t.organizador,
      porCapturar: porTorneo.get(t.id) ?? [],
    }))
    // `sort` es estable, así que esto sube los que tienen trabajo sin romper
    // el orden por cercanía que ya trae `useJudgeTournaments`.
    .sort(ordenarArbitrados);
}

async function resolver(base: TorneoDeJuez[]): Promise<TorneoArbitrado[]> {
  if (base.length === 0) return [];

  const clave = base.map((t) => t.id).sort().join(',');
  if (cache?.clave === clave) return cache.torneos;
  if (inFlight?.clave === clave) return inFlight.promise;

  const promise = consultar(base)
    .then((torneos) => {
      cache = { clave, torneos };
      inFlight = null;
      return torneos;
    })
    .catch((e) => {
      inFlight = null;
      throw e;
    });

  inFlight = { clave, promise };
  return promise;
}

/**
 * `undefined` mientras se resuelve; array (posiblemente vacío) una vez conocida.
 *
 * Sigue siendo `undefined` mientras `useJudgeTournaments` no ha contestado: sin
 * saber si es juez, pintar la sección le prometería a un jugador una pantalla
 * que no es suya — el mismo motivo por el que la pestaña tampoco aparece en la
 * duda.
 */
export function useJudgePendientes(): TorneoArbitrado[] | undefined {
  const base = useJudgeTournaments();
  const [torneos, setTorneos] = useState<TorneoArbitrado[] | undefined>();

  useEffect(() => {
    if (base === undefined) return;
    if (base.length === 0) { setTorneos([]); return; }

    let vivo = true;
    resolver(base)
      .then((v) => { if (vivo) setTorneos(v); })
      // Sin los contadores, la sección sigue valiendo: es el acceso a sus
      // torneos. Lo que se pierde es el aviso, no la puerta.
      .catch(() => {
        if (vivo) {
          setTorneos(base.map((t) => ({
            id: t.id, nombre: t.nombre, inicio: t.inicio, fin: t.fin,
            organizador: t.organizador, porCapturar: [],
          })));
        }
      });

    return () => { vivo = false; };
  }, [base]);

  return torneos;
}
