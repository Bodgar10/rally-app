/**
 * RALLY · Terminar el torneo
 *
 * ► NO ES UN `UPDATE`
 *   El guard de la migración 029 bloquea la transición cruda a 'finished': el
 *   cierre pasa por una Edge Function porque además de cambiar el estado
 *   dispara el reparto de puntos de ranking y el recálculo de ratings. Un
 *   `update` a mano dejaría un torneo terminado sin puntos, que es peor que
 *   uno sin terminar.
 *
 * ► VIVE AQUÍ Y NO EN UNA PANTALLA
 *   Lo llaman dos: el panel del torneo —donde siempre estuvo, en la zona de
 *   riesgo— y el final del exprés, que es donde el organizador está de verdad
 *   cuando acaba la final. Duplicar la llamada haría que arreglar un error en
 *   una dejara la otra como estaba.
 */

import { supabase } from '@/lib/supabase/client';

/**
 * Cierra el torneo. Lanza con un mensaje que se puede enseñar tal cual.
 *
 * Irreversible: escribe los puntos de ranking de todos los jugadores y vuelve
 * a calcular sus ratings. Quien lo llame tiene que haber preguntado antes.
 */
export async function terminarTorneo(tournamentId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Tu sesión expiró. Vuelve a entrar.');

  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/finish-tournament`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ tournament_id: tournamentId }),
    },
  );

  const cuerpo = await res.json().catch(() => ({} as Record<string, string>));
  if (!res.ok) {
    throw new Error(cuerpo.message ?? cuerpo.error ?? `Error ${res.status}`);
  }
}
