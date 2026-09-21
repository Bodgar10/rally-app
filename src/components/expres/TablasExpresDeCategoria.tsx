/**
 * src/components/expres/TablasExpresDeCategoria.tsx
 *
 * RALLY · Las dos tablas de un exprés, para quien las MIRA.
 *
 * ► EL JUGADOR VEÍA LA TABLA DEL TORNEO LARGO, Y NO SIGNIFICABA NADA
 *   La pantalla de categoría del jugador pinta `LiveStandings`, que ordena por
 *   PUNTOS. En un exprés `group_standings.points` se queda en 0 para todos a
 *   propósito —lo dice la migración 077: en un suma 6 no hay victoria que
 *   contar, así que won/lost/points no se tocan nunca— de modo que el jugador
 *   veía a las dieciséis parejas empatadas a cero después de jugar su partido.
 *
 *   Los datos estaban bien: `played`, `games_won`, `games_lost` y `balance` se
 *   actualizan a cada captura. Lo que estaba mal era la columna que se
 *   enseñaba.
 *
 * ► POR QUÉ NO SE ARREGLA `LiveStandings` CON UN `if`
 *   Porque son dos tablas distintas, no una con una columna cambiada: la larga
 *   ordena por puntos y desempata por sets y games, la del exprés ordena por
 *   saldo y su cadena de desempate es otra. Meter las dos en un componente
 *   dejaría el de siempre —el que usan 1360 tests y un torneo real de 165
 *   parejas— con dos modos. Exprés vive aparte, también aquí.
 *
 * ► LA TABLA SE CALCULA, NO SE LEE
 *   `position` existe en la base, pero el orden bueno sale de
 *   `computeTablaExpres`: es el que sabe de saldo, de enfrentamiento directo y
 *   del desempate que decidió el organizador. Leer `position` sería fiarse de
 *   una foto que puede ser de antes de la última captura.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import TablaExpresGrupo from '@/components/expres/TablaExpresGrupo';
import { fetchParejasPublicas, nombreDePareja, type ParejaPublica } from '@/lib/parejas-publicas';
import {
  computeTablaExpres, computeClinchExpres, type ResultadoSuma6,
} from '@/lib/engine/expres';
import { color, font, fontSize, space } from '@/lib/design-tokens';

interface GrupoEnPantalla {
  groupId: string;
  nombre: string;
  tabla: ReturnType<typeof computeTablaExpres>;
  clinch: ReturnType<typeof computeClinchExpres>;
}

export default function TablasExpresDeCategoria({
  categoryId, destacarPairId,
}: {
  categoryId: string;
  /** La pareja de quien mira, para resaltar su fila. */
  destacarPairId?: string;
}) {
  const [grupos, setGrupos] = useState<GrupoEnPantalla[] | null>(null);
  const [parejas, setParejas] = useState<Map<string, ParejaPublica>>(new Map());

  const nombre = useCallback(
    (pairId: string) => nombreDePareja(parejas.get(pairId)),
    [parejas],
  );

  const cargar = useCallback(async () => {
    const { data: gs } = await supabase
      .from('groups').select('id, name').eq('category_id', categoryId).order('name');
    if (!gs?.length) { setGrupos([]); return; }

    const ids = gs.map((g) => g.id);
    const [{ data: standings }, { data: partidos }] = await Promise.all([
      supabase.from('group_standings').select('group_id, pair_id, desempate_manual').in('group_id', ids),
      supabase.from('matches').select('id, group_id, pair_a_id, pair_b_id').in('group_id', ids),
    ]);

    const ms = partidos ?? [];
    const { data: sets } = ms.length
      ? await supabase.from('match_sets').select('match_id, games_a, games_b')
          .in('match_id', ms.map((m) => m.id)).eq('set_number', 1)
      : { data: [] as { match_id: string; games_a: number; games_b: number }[] };

    const games = new Map((sets ?? []).map((x) => [x.match_id, { a: x.games_a, b: x.games_b }]));

    setParejas(await fetchParejasPublicas((standings ?? []).map((x) => x.pair_id)));

    setGrupos(gs.map((g) => {
      const pairIds = (standings ?? []).filter((x) => x.group_id === g.id).map((x) => x.pair_id);
      const resultados: ResultadoSuma6[] = ms
        .filter((m) => m.group_id === g.id)
        .map((m) => ({
          matchId: m.id,
          pairAId: m.pair_a_id!,
          pairBId: m.pair_b_id!,
          gamesA: games.get(m.id)?.a ?? null,
          gamesB: games.get(m.id)?.b ?? null,
        }));

      const ordenManual: Record<string, number> = {};
      for (const x of standings ?? []) {
        if (x.group_id === g.id && x.desempate_manual != null) ordenManual[x.pair_id] = x.desempate_manual;
      }

      return {
        groupId: g.id,
        nombre: g.name,
        tabla: computeTablaExpres({
          grupo: g.name,
          pairIds,
          resultados,
          ordenManual: Object.keys(ordenManual).length ? ordenManual : undefined,
        }),
        clinch: computeClinchExpres({ pairIds, resultados }),
      };
    }));
  }, [categoryId]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (grupos === null) return <ActivityIndicator color={color.gold} />;
  if (grupos.length === 0) {
    return (
      <Text style={s.vacio}>
        Todavía no se han sorteado los grupos. En cuanto el organizador sortee,
        aquí sale tu grupo con las ocho parejas.
      </Text>
    );
  }

  return (
    <View style={s.raiz}>
      {grupos.map((g) => (
        <View key={g.groupId} style={s.grupo}>
          {/* Sin `onDecidirEmpate`: el jugador MIRA la tabla, no la resuelve.
              El aviso de empate sí lo ve —le afecta— pero el botón es del
              organizador. */}
          <TablaExpresGrupo
            tabla={g.tabla}
            clinch={g.clinch}
            nombreDePareja={nombre}
            destacarPairId={destacarPairId}
          />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: space[4] },
  grupo: { gap: space[2] },
  vacio: {
    color: color.muted, fontFamily: font.body, fontSize: fontSize.body,
    lineHeight: 21, paddingVertical: space[4],
  },
});
