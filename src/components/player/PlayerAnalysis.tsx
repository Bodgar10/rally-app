/**
 * src/components/player/PlayerAnalysis.tsx
 * Análisis descriptivo del jugador: win-rate, racha, progreso (free).
 * Análisis profundo (química de pareja, clutch rate): difuminado + CTA Pro.
 * Gating via isSubscriptionCTADirect() — web-first en MX/iOS.
 * Sprint 5 · S5-SON-03
 */
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { color, radius, space, font } from '@/lib/design-tokens';
import { supabase } from '@/lib/supabase/client';
import { isSubscriptionCTADirect } from '@/lib/feature-flags';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type BasicStats = {
  wins: number;
  losses: number;
  win_rate: number;        // 0-100
  streak: number;          // racha de victorias consecutivas
  tournaments_played: number;
  best_position: number | null; // mejor posición en un torneo
};

type ProStats = {
  partner_chemistry: string | null; // mejor pareja por win-rate
  clutch_rate: number | null;       // % de victorias en partidos cerrados (super muerte)
  avg_points_per_tournament: number | null;
  trend: 'rising' | 'stable' | 'declining' | null;
};

type AnalysisState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }   // sin partidos aún
  | { status: 'ready'; basic: BasicStats; pro: ProStats; isPro: boolean };

// ─── Componente ─────────────────────────────────────────────────────────────

export function PlayerAnalysis({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<AnalysisState>({ status: 'loading' });

  useEffect(() => {
    loadAnalysis(userId).then(setState);
  }, [userId]);

  if (state.status === 'loading') {
    return (
      <View style={{ padding: space[4], alignItems: 'center' }}>
        <ActivityIndicator color={color.gold} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={{ padding: space[4] }}>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: color.danger }}>
          {state.message}
        </Text>
      </View>
    );
  }

  if (state.status === 'empty') {
    return (
      <View
        style={{
          margin: space[4],
          backgroundColor: color.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.lineSoft,
          padding: space[4],
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 28 }}>🎾</Text>
        <Text
          style={{
            fontFamily: font.display,
            fontWeight: '500',
            fontSize: 16,
            color: color.text,
            textAlign: 'center',
          }}
        >
          Tu análisis aparece aquí
        </Text>
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 13,
            color: color.muted,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          Después de tu primer torneo terminado verás tu win-rate, racha y progreso de temporada.
        </Text>
      </View>
    );
  }

  const { basic, pro, isPro } = state;

  return (
    <View style={{ gap: space[3] }}>
      {/* Sección: Estadísticas básicas (free) */}
      <SectionLabel title="Mis estadísticas" />

      <View style={{ paddingHorizontal: space[4] }}>
        {/* Win-rate + racha + torneos */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCard
            value={`${Math.round(basic.win_rate)}%`}
            label="Win-rate"
            highlight={basic.win_rate >= 60}
          />
          <StatCard
            value={basic.streak > 0 ? `🔥 ${basic.streak}` : '—'}
            label="Racha actual"
          />
          <StatCard
            value={String(basic.tournaments_played)}
            label="Torneos"
          />
        </View>

        {/* Récord W/L */}
        <View
          style={{
            marginTop: 10,
            backgroundColor: color.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: color.lineSoft,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: font.display, fontWeight: '600', fontSize: 24, color: color.live }}>
              {basic.wins}
            </Text>
            <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted }}>Victorias</Text>
          </View>

          {/* Barra W/L */}
          <View style={{ flex: 1, marginHorizontal: 16 }}>
            <View
              style={{
                height: 8,
                borderRadius: radius.pill,
                backgroundColor: color.surface2,
                overflow: 'hidden',
              }}
            >
              {basic.wins + basic.losses > 0 && (
                <View
                  style={{
                    height: '100%',
                    width: `${(basic.wins / (basic.wins + basic.losses)) * 100}%`,
                    backgroundColor: color.live,
                    borderRadius: radius.pill,
                  }}
                />
              )}
            </View>
          </View>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: font.display, fontWeight: '600', fontSize: 24, color: color.danger }}>
              {basic.losses}
            </Text>
            <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted }}>Derrotas</Text>
          </View>
        </View>

        {basic.best_position !== null && (
          <View
            style={{
              marginTop: 10,
              backgroundColor: 'rgba(212,175,55,0.06)',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: color.line,
              paddingHorizontal: 14,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 18 }}>🏆</Text>
            <Text style={{ fontFamily: font.body, fontSize: 13, color: color.champagne }}>
              Mejor posición en un torneo:{' '}
              <Text style={{ fontFamily: font.display, fontWeight: '600', color: color.goldBright }}>
                #{basic.best_position}
              </Text>
            </Text>
          </View>
        )}
      </View>

      {/* Sección: Análisis profundo (Pro) */}
      <SectionLabel title="Análisis avanzado" />

      <View style={{ paddingHorizontal: space[4] }}>
        {isPro ? (
          <ProAnalysisContent pro={pro} />
        ) : (
          <ProLockedPreview onUnlock={() => handleProCTA(router)} />
        )}
      </View>
    </View>
  );
}

// ─── Análisis Pro desbloqueado ───────────────────────────────────────────────

function ProAnalysisContent({ pro }: { pro: ProStats }) {
  return (
    <View style={{ gap: 10 }}>
      {pro.partner_chemistry !== null && (
        <InsightCard
          icon="🤝"
          title="Mejor pareja"
          value={pro.partner_chemistry}
          subtitle="Mayor win-rate jugando juntos"
        />
      )}
      {pro.clutch_rate !== null && (
        <InsightCard
          icon="💪"
          title="Clutch rate"
          value={`${Math.round(pro.clutch_rate)}%`}
          subtitle="Victorias en super-muerte"
        />
      )}
      {pro.avg_points_per_tournament !== null && (
        <InsightCard
          icon="📊"
          title="Puntos por torneo"
          value={`${Math.round(pro.avg_points_per_tournament)} pts`}
          subtitle="Promedio en toda la temporada"
        />
      )}
      {pro.trend !== null && (
        <InsightCard
          icon={pro.trend === 'rising' ? '📈' : pro.trend === 'declining' ? '📉' : '➡️'}
          title="Tendencia"
          value={trendLabel(pro.trend)}
          subtitle="Últimos 3 torneos vs anteriores"
        />
      )}
      {pro.partner_chemistry === null &&
        pro.clutch_rate === null &&
        pro.avg_points_per_tournament === null && (
          <Text style={{ fontFamily: font.body, fontSize: 13, color: color.muted, textAlign: 'center' }}>
            Más datos disponibles después de 3+ torneos.
          </Text>
        )}
    </View>
  );
}

function InsightCard({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: string;
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.lineSoft,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted }}>{title}</Text>
        <Text
          style={{ fontFamily: font.display, fontWeight: '600', fontSize: 18, color: color.text }}
        >
          {value}
        </Text>
        <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted, marginTop: 1 }}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

// ─── Preview difuminado (free) ───────────────────────────────────────────────

function ProLockedPreview({ onUnlock }: { onUnlock: () => void }) {
  return (
    <View style={{ gap: 10 }}>
      {/* Cards difuminadas de ejemplo */}
      {[
        { icon: '🤝', title: 'Mejor pareja', value: '████████', subtitle: '██████ ████' },
        { icon: '💪', title: 'Clutch rate', value: '██%', subtitle: '████████████' },
      ].map((card) => (
        <View
          key={card.title}
          style={{
            backgroundColor: color.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: color.lineSoft,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: 0.35,
          }}
        >
          <Text style={{ fontSize: 22 }}>{card.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted }}>{card.title}</Text>
            <Text
              style={{ fontFamily: font.display, fontWeight: '600', fontSize: 18, color: color.text }}
            >
              {card.value}
            </Text>
            <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted, marginTop: 1 }}>
              {card.subtitle}
            </Text>
          </View>
        </View>
      ))}

      {/* Overlay candado + CTA */}
      <LinearGradient
        colors={[color.wine, color.wineDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: 'rgba(241,217,140,0.38)',
          padding: 18,
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 24 }}>🔒</Text>
        <Text
          style={{
            fontFamily: font.display,
            fontWeight: '600',
            fontSize: 16,
            color: color.goldBright,
            textAlign: 'center',
          }}
        >
          Análisis avanzado — Pro
        </Text>
        <Text
          style={{
            fontFamily: font.body,
            fontSize: 13,
            color: color.onWine,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          Conoce tu química de pareja, clutch rate y tendencia de temporada.
          {isSubscriptionCTADirect() ? '' : ' Activa Pro desde la web.'}
        </Text>

        <Pressable
          onPress={onUnlock}
          style={{
            marginTop: 4,
            backgroundColor: color.goldBright,
            borderRadius: radius.pill,
            paddingHorizontal: 20,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              fontFamily: font.display,
              fontWeight: '600',
              fontSize: 14,
              color: color.onGold,
              letterSpacing: 0.3,
            }}
          >
            {isSubscriptionCTADirect() ? 'Ver planes Pro' : 'Más información'}
          </Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

// ─── Sub-componentes auxiliares ──────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: space[4], marginTop: space[2] }}>
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '500',
          fontSize: 13,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: color.champagne,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

function StatCard({
  value,
  label,
  highlight = false,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.lineSoft,
        paddingVertical: 13,
        paddingHorizontal: 10,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: font.display,
          fontWeight: '600',
          fontSize: 22,
          color: highlight ? color.live : color.goldBright,
        }}
      >
        {value}
      </Text>
      <Text style={{ fontFamily: font.body, fontSize: 10, color: color.muted, marginTop: 3 }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Lógica de datos ─────────────────────────────────────────────────────────

async function loadAnalysis(userId: string): Promise<AnalysisState> {
  try {
    // 1. Estado de suscripción
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, billing_cycle, plan')
      .eq('user_id', userId)
      .maybeSingle();

    const isPro =
      sub !== null &&
      (sub.status === 'active' || sub.status === 'trialing');

    // 2. Intentar RPC si existe; si no, calcular directo
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'get_player_match_stats',
      { p_player_id: userId },
    );

    let basic: BasicStats;
    let pro: ProStats = {
      partner_chemistry: null,
      clutch_rate: null,
      avg_points_per_tournament: null,
      trend: null,
    };

    if (!rpcErr && rpcData) {
      // RPC existe → usar sus datos
      const d = rpcData as any;
      basic = {
        wins: d.wins ?? 0,
        losses: d.losses ?? 0,
        win_rate: d.win_rate ?? 0,
        streak: d.streak ?? 0,
        tournaments_played: d.tournaments_played ?? 0,
        best_position: d.best_position ?? null,
      };
      if (isPro) {
        pro = {
          partner_chemistry: d.partner_chemistry ?? null,
          clutch_rate: d.clutch_rate ?? null,
          avg_points_per_tournament: d.avg_points_per_tournament ?? null,
          trend: d.trend ?? null,
        };
      }
    } else {
      // Fallback: calcular wins/losses con queries directas
      const { data: pairsData } = await supabase
        .from('pairs')
        .select('id')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .in('payment_status', ['paid_online', 'paid_offline', 'comp']);

      const pairIds = (pairsData ?? []).map((p: any) => p.id as string);

      if (pairIds.length === 0) {
        return { status: 'empty' };
      }

      const { data: matchesData } = await supabase
        .from('matches')
        .select('id, winner_pair_id, pair_a_id, pair_b_id')
        .eq('status', 'finished')
        .or(`pair_a_id.in.(${pairIds.join(',')}),pair_b_id.in.(${pairIds.join(',')})`);

      const matches = matchesData ?? [];
      if (matches.length === 0) return { status: 'empty' };

      let wins = 0;
      let losses = 0;
      for (const m of matches as any[]) {
        const myPair = pairIds.includes(m.pair_a_id)
          ? m.pair_a_id
          : m.pair_b_id;
        if (m.winner_pair_id === myPair) wins++;
        else losses++;
      }

      basic = {
        wins,
        losses,
        win_rate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
        streak: 0,
        tournaments_played: 0,
        best_position: null,
      };
    }

    if (basic.wins + basic.losses === 0) return { status: 'empty' };

    return { status: 'ready', basic, pro, isPro };
  } catch (e: any) {
    return { status: 'error', message: 'No se pudo cargar el análisis.' };
  }
}

function handleProCTA(router: ReturnType<typeof useRouter>) {
  if (isSubscriptionCTADirect()) {
    // Web: navegar directo a /planes
    router.push('/planes');
  } else {
    // MX/iOS: informativo → navegar a /planes que muestra handoff web-first
    router.push('/planes');
  }
}

function trendLabel(trend: 'rising' | 'stable' | 'declining'): string {
  if (trend === 'rising') return 'En alza 📈';
  if (trend === 'declining') return 'Bajando 📉';
  return 'Estable ➡️';
}
