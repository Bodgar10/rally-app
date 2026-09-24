/**
 * src/components/expres/MiSituacionExpres.tsx
 *
 * RALLY · "¿Voy a cuartos?" en un exprés.
 *
 * ► POR QUÉ NO ES `MiSituacion` CON UN `if`
 *   Aquella cuelga del motor de `futuro`, que razona sobre victorias y
 *   puntos: enumera escenarios con una máscara de DOS salidas por partido
 *   —ganas o pierdes— y decide si has empezado mirando `winnerPairId`. En un
 *   suma 6 no hay ganador y hay SIETE salidas, así que ese motor no da
 *   respuestas malas: da respuestas imposibles. Por eso el exprés tiene
 *   `computeClinchExpres` desde el principio.
 *
 *   El síntoma era esta tarjeta diciendo "Todavía no has jugado" y, dos
 *   líneas más abajo y en la misma tarjeta, "Vas 1.º de tu grupo con 1
 *   partido jugado".
 *
 * ► LA TABLA Y EL CLINCH SALEN DEL MISMO SITIO QUE LAS DEL ORGANIZADOR
 *   `computeTablaExpres` y `computeClinchExpres` sobre los mismos datos. Si
 *   esta pantalla calculara su propia versión, el jugador y el organizador
 *   acabarían discrepando sobre quién va cuarto, que es exactamente la
 *   discusión que esta app existe para evitar.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import {
  computeTablaExpres, computeClinchExpres, CLASIFICAN_POR_GRUPO, type ResultadoSuma6,
} from '@/lib/engine/expres';
import { situacionExpres, type SituacionExpres } from '@/lib/situacion-expres';
import { subscribeToTable, categoryChannel } from '@/lib/realtime/channels';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

const TINTE: Record<SituacionExpres['tono'], string> = {
  dentro: color.live,
  vivo: color.champagne,
  espera: color.alive,
  // Gris, no rojo: quedarse fuera no es un error del sistema.
  fuera: color.muted,
};

interface Contexto {
  situacion: SituacionExpres;
  categoria: string;
  torneo: string;
  tournamentId: string;
  categoryId: string;
}

export default function MiSituacionExpres({ pairIds }: { pairIds: string[] }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [cargando, setCargando] = useState(true);

  // `setCargando(true)` NO va aquí: con la suscripción de abajo esto se
  // vuelve a llamar en cada evento del cuadro, y volver al spinner cada vez
  // haría parpadear la tarjeta mientras el jugador la está leyendo. El estado
  // arranca en `true` y se apaga tras la primera carga, que es lo único que
  // hay que contarle.
  const cargar = useCallback(async () => {
    try {
      if (pairIds.length === 0) { setCtx(null); return; }

      const { data: mias } = await supabase
        .from('group_standings')
        .select('pair_id, group_id, groups:group_id ( id, category_id )')
        .in('pair_id', pairIds);

      const mia = (mias ?? [])[0] as unknown as {
        pair_id: string; group_id: string;
        groups: { id: string; category_id: string } | null;
      } | undefined;
      if (!mia?.groups) { setCtx(null); return; }

      const categoryId = mia.groups.category_id;
      const [{ data: cat }, { data: standings }, { data: ms }] = await Promise.all([
        supabase.from('categories')
          .select('display_name, advance_per_group, tournament_id, tournaments:tournament_id ( name, modo )')
          .eq('id', categoryId).maybeSingle(),
        supabase.from('group_standings').select('pair_id').eq('group_id', mia.group_id),
        supabase.from('matches').select('id, pair_a_id, pair_b_id').eq('group_id', mia.group_id),
      ]);

      const c = cat as unknown as {
        display_name: string; advance_per_group: number | null; tournament_id: string;
        tournaments: { name: string; modo: string | null } | null;
      } | null;
      // No es un exprés: esta tarjeta no es la suya.
      if (c?.tournaments?.modo !== 'expres') { setCtx(null); return; }

      // ► LA FASE DE GRUPOS DEJA DE SER LA PREGUNTA EN CUANTO ARRANCA EL CUADRO.
      //
      //   EL BUG: ganó su cuarto, y el teléfono decía "Ya estás en cuartos ·
      //   Terminaste la fase de grupos dentro" con la tarjeta de abajo
      //   anunciándole las SEMIFINALES. Las dos ciertas por separado y
      //   contradiciéndose juntas: "estás en cuartos" en presente, cuando los
      //   cuartos ya los jugó.
      //
      //   Esta tarjeta contesta "¿paso de grupos?", y esa pregunta la contesta
      //   mejor el propio cuadro desde que él está dentro de él: su partido de
      //   cuartos, su semifinal, o la tarjeta de "ya estás en la siguiente".
      //
      //   Si NO clasificó no tiene partidos de cuadro y la tarjeta sigue: ahí
      //   "Fuera de cuartos" es la única respuesta que hay, y es la suya.
      const { data: suCuadro } = await supabase
        .from('matches')
        .select('id')
        .eq('category_id', categoryId)
        .neq('stage', 'group')
        .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`)
        .limit(1);
      if ((suCuadro ?? []).length > 0) { setCtx(null); return; }

      const partidos = ms ?? [];
      const { data: sets } = partidos.length
        ? await supabase.from('match_sets').select('match_id, games_a, games_b')
            .in('match_id', partidos.map((m) => m.id)).eq('set_number', 1)
        : { data: [] as { match_id: string; games_a: number; games_b: number }[] };
      const games = new Map((sets ?? []).map((x) => [x.match_id, { a: x.games_a, b: x.games_b }]));

      const pairIdsGrupo = (standings ?? []).map((x) => x.pair_id);
      const resultados: ResultadoSuma6[] = partidos.map((m) => ({
        matchId: m.id,
        pairAId: m.pair_a_id!,
        pairBId: m.pair_b_id!,
        gamesA: games.get(m.id)?.a ?? null,
        gamesB: games.get(m.id)?.b ?? null,
      }));

      const clasifican = c?.advance_per_group ?? CLASIFICAN_POR_GRUPO;
      const tabla = computeTablaExpres({ pairIds: pairIdsGrupo, resultados, clasifican });
      const clinch = computeClinchExpres({ pairIds: pairIdsGrupo, resultados, clasifican });

      const fila = tabla.filas.find((f) => f.pairId === mia.pair_id);
      const suClinch = clinch.find((x) => x.pairId === mia.pair_id);
      if (!fila || !suClinch) { setCtx(null); return; }

      setCtx({
        situacion: situacionExpres({
          estado: suClinch.estado,
          balance: fila.balance,
          posicion: fila.posicion,
          jugados: fila.jugados,
          pendientes: suClinch.pendientes,
          clasifican,
          aproximado: suClinch.aproximado,
        }),
        categoria: c?.display_name ?? '',
        torneo: c?.tournaments?.name ?? '',
        tournamentId: c?.tournament_id ?? '',
        categoryId,
      });
    } finally {
      setCargando(false);
    }
  }, [pairIds]);

  useEffect(() => { void cargar(); }, [cargar]);

  // EL RELEVO, SIN RECARGAR. En cuanto se arma el cuadro y él aparece dentro,
  // esta tarjeta se apaga y la del cuadro toma el sitio — igual que hace
  // `YaEstasEnLaSiguiente` cuando nace el partido de verdad. Sin esto, el
  // jugador que está mirando la pantalla cuando el organizador arma el cuadro
  // se queda con la tarjeta vieja hasta que recargue.
  const categoryIdActual = ctx?.categoryId ?? null;
  useEffect(() => {
    if (!categoryIdActual) return;
    return subscribeToTable<Record<string, unknown>>({
      channelName: `${categoryChannel(categoryIdActual)}:situacion-expres`,
      table: 'matches',
      filter: `category_id=eq.${categoryIdActual}`,
      onData: () => void cargar(),
    });
  }, [categoryIdActual, cargar]);

  if (cargando) return <ActivityIndicator color={color.gold} />;
  if (!ctx) return null;

  const { situacion: s } = ctx;
  const tinte = TINTE[s.tono];

  return (
    <Pressable
      onPress={() => router.push(`/(protected)/torneos/${ctx.tournamentId}/${ctx.categoryId}`)}
      style={({ pressed }) => [e.caja, { borderColor: tinte }, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`${s.titular}. ${s.detalle}`}
    >
      <Text style={e.eyebrow}>
        {ctx.categoria.toUpperCase()} · {ctx.torneo.toUpperCase()}
      </Text>
      <Text style={[e.titular, { color: tinte }]}>{s.titular}</Text>
      <Text style={e.detalle}>{s.detalle}</Text>
      {s.numeros && <Text style={e.numeros}>{s.numeros}</Text>}
    </Pressable>
  );
}

const e = StyleSheet.create({
  caja: {
    gap: space[1.5], padding: space[4], borderRadius: radius.lg,
    borderWidth: 1, backgroundColor: color.surface,
  },
  eyebrow: {
    color: color.muted, fontFamily: font.display, fontSize: fontSize.eyebrow,
    letterSpacing: 1.6,
  },
  titular: { fontFamily: font.display, fontSize: fontSize.metric },
  detalle: { color: color.text, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 21 },
  numeros: { color: color.muted, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
});
