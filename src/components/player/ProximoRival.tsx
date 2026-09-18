/**
 * src/components/player/ProximoRival.tsx
 *
 * RALLY · Busca tu próximo partido y pinta la ficha del rival.
 *
 * VA APARTE DE `MiSituacion` A PROPÓSITO
 *   Aquella responde "¿estoy clasificado?" y ya carga medio torneo para
 *   contestarlo. Esta responde "¿contra quién juego ahora?", que es otra
 *   pregunta y se puede contestar con dos consultas. Meterla dentro habría
 *   añadido una rama a un componente que ya tiene bastantes.
 *
 * EL PRÓXIMO ES EL PRIMERO SIN JUGAR, NO EL DE LA HORA MÁS CERCANA
 *   En un torneo real los partidos se corren. Si se ordenara por `scheduled_at`
 *   sin filtrar, un partido de las 10:00 que se retrasó y todavía no se juega
 *   seguiría siendo "el próximo" a las 14:00 — que es justo lo que pasa. Se
 *   toma el primero pendiente en orden de calendario, que es el que de verdad
 *   viene.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { FichaDelRival } from '@/components/player/FichaDelRival';
import { fetchParejasPublicas, nombreDePareja } from '@/lib/parejas-publicas';
import type { Division } from '@/lib/engine/types';

interface Resuelto {
  nosotros: [string, string];
  ellos: [string, string];
  nombres: Map<string, string>;
  division: Division;
  tituloRival: string;
}

export function ProximoRival({
  pairIds,
  categoryId,
  userId,
}: {
  /** Todas las parejas del jugador. Se usa la que juegue en esta categoría. */
  pairIds: readonly string[];
  categoryId: string;
  /** Quién mira, para saber si la ficha va abierta o cerrada. */
  userId: string;
}) {
  const [datos, setDatos] = useState<Resuelto | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [{ data: partidos }, { data: categoria }] = await Promise.all([
          supabase
            .from('matches')
            .select('id, pair_a_id, pair_b_id, scheduled_at, status')
            .eq('category_id', categoryId)
            .neq('status', 'finished')
            .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`)
            .order('scheduled_at', { ascending: true, nullsFirst: false })
            .limit(1),
          supabase.from('categories').select('division').eq('id', categoryId).maybeSingle(),
        ]);

        const partido = (partidos ?? [])[0];
        if (!partido || !categoria?.division) return;

        const mias = new Set(pairIds);
        const miPairId = mias.has(partido.pair_a_id ?? '') ? partido.pair_a_id! : partido.pair_b_id!;
        const rivalPairId = miPairId === partido.pair_a_id ? partido.pair_b_id : partido.pair_a_id;
        if (!rivalPairId) return;

        const [{ data: parejas }, publicas] = await Promise.all([
          supabase
            .from('pairs')
            .select('id, player1_id, player2_id')
            .in('id', [miPairId, rivalPairId]),
          fetchParejasPublicas([miPairId, rivalPairId]),
        ]);

        const mia = (parejas ?? []).find((p) => p.id === miPairId);
        const suya = (parejas ?? []).find((p) => p.id === rivalPairId);
        if (!mia || !suya) return;

        const nombres = new Map<string, string>();
        for (const [id, p] of publicas) {
          const fila = (parejas ?? []).find((x) => x.id === id);
          if (!fila) continue;
          nombres.set(fila.player1_id, p.player1_name);
          nombres.set(fila.player2_id, p.player2_name);
        }

        if (!vivo) return;
        setDatos({
          nosotros: [mia.player1_id, mia.player2_id],
          ellos: [suya.player1_id, suya.player2_id],
          nombres,
          division: categoria.division as Division,
          tituloRival: nombreDePareja(publicas.get(rivalPairId)),
        });
      } catch {
        // Sin ficha, no se enseña nada. Es un extra: que falle no puede
        // estropear la pantalla desde la que el jugador mira su torneo.
      }
    })();
    return () => { vivo = false; };
  }, [pairIds.join(','), categoryId]);

  if (!datos) return null;
  return <FichaDelRival {...datos} userId={userId} />;
}

export default ProximoRival;
