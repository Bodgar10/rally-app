/**
 * src/components/player/BandaDeRanking.tsx
 *
 * RALLY · Dónde estás en la red, en una línea.
 *
 * ► POR QUÉ NO VA ARRIBA DEL TODO
 *   Arriba va lo que pasa HOY: tu cancha, tu próximo partido. El ranking no
 *   cambia en las próximas dos horas y no hace mover a nadie del sillón.
 *
 *   PERO CUANDO NO HAY TORNEO VIVO sí sube, y ahí es lo contrario: el dashboard
 *   se queda sin nada que decir —ni cancha, ni partido, ni situación— y tu
 *   posición en la red es exactamente lo que le da sentido a volver a abrir la
 *   app. Lo decide el que la pinta, no ella.
 *
 * ► UNA SOLA DIVISIÓN, LA DE MÁS PUNTOS
 *   Quien juega mixto y varonil tiene dos, y dos bandas seguidas dejan de ser
 *   una banda. La de más puntos es la que el jugador considera la suya; las
 *   demás están a un toque, en Ranking.
 *
 * ► SE CALLA SI NO TIENE RANKING
 *   "Todavía no tienes puntos" ya lo dice la pantalla de Ranking, con su sitio
 *   y su explicación. Aquí sería un recordatorio de lo que no has hecho, justo
 *   encima de lo que sí.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { ETIQUETA_DIVISION } from '@/lib/divisiones';
import { color, font, fontSize, radius, space } from '@/lib/design-tokens';

interface MiRanking {
  division: string;
  position: number;
  points: number;
  total: number;
  season: number;
}

async function fetchMiRanking(): Promise<MiRanking | null> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return null;

  const season = new Date().getFullYear();

  const { data: mias } = await supabase
    .from('ranking_public')
    .select('division, position, points')
    .eq('player_id', uid)
    .eq('season', season)
    .order('points', { ascending: false })
    .limit(1);

  const mia = (mias ?? [])[0];
  if (!mia?.division || mia.position == null) return null;

  // Cuánta gente hay en esa división: sin el total, "1.º" no dice si es de
  // dieciséis o de cuatrocientos, que es justo lo que le da tamaño.
  const { count } = await supabase
    .from('ranking_public')
    .select('*', { count: 'exact', head: true })
    .eq('division', mia.division)
    .eq('season', season);

  return {
    division: mia.division,
    position: mia.position,
    points: mia.points ?? 0,
    total: count ?? 0,
    season,
  };
}

export default function BandaDeRanking() {
  const router = useRouter();
  const [r, setR] = useState<MiRanking | null>(null);

  const cargar = useCallback(async () => { setR(await fetchMiRanking()); }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  if (!r) return null;

  return (
    <Pressable
      onPress={() => router.push('/(protected)/ranking')}
      style={({ pressed }) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.goldMuted,
        paddingHorizontal: space[4],
        paddingVertical: space[3],
      }, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={
        `Vas ${r.position} de ${r.total} en ${ETIQUETA_DIVISION[r.division as never] ?? r.division}`
        + ` con ${r.points} puntos. Ver el ranking.`
      }
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={{
            fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne,
            textTransform: 'uppercase', letterSpacing: 1.4,
          }}
          numberOfLines={1}
        >
          {ETIQUETA_DIVISION[r.division as never] ?? r.division} · Temporada {r.season}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
          <Text style={{ fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright }}>
            {r.position}.º
          </Text>
          {/* El total le da tamaño al puesto: 1.º de 16 y 1.º de 400 no son lo
              mismo, y sin el segundo número no se distinguen. */}
          <Text style={{ fontFamily: font.body, fontSize: fontSize.caption, color: color.muted }}>
            de {r.total} · {r.points.toLocaleString('es-MX')} pts
          </Text>
        </View>
      </View>
      <Text style={{ fontFamily: font.body, fontSize: 18, color: color.gold }}>›</Text>
    </Pressable>
  );
}
