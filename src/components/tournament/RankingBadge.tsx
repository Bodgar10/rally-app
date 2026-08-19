/**
 * src/components/tournament/RankingBadge.tsx
 * Badges de logro de ranking: "Eres top 2 de este torneo", progreso de posición.
 * Granate + dorado. Convive con ClinchBadge sin duplicar lógica.
 * Solo presentación — los datos vienen del padre (read-path o Realtime).
 * Sprint 5 · S5-SON-02
 */
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, radius, font } from '@/lib/design-tokens';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type RankingBadgeVariant =
  | 'top_tournament'   // "Eres top N de este torneo" → granate/dorado
  | 'top_network'      // "Top N de la red" → dorado
  | 'points_gained'    // "+X pts ganados" → verde
  | 'position_gained'  // "Subiste X posiciones" → verde
  | 'champion'         // "Campeón 🏆" → granate/dorado especial
  | 'finalist';        // "Finalista" → dorado

export type RankingBadgeProps = {
  variant: RankingBadgeVariant;
  /** Número principal del badge (posición, puntos ganados, posiciones subidas) */
  value?: number;
  /** Texto de soporte (ej. "de 24 jugadores", "5ª Mixto CDMX") */
  subtitle?: string;
  /** Tamaño compacto para listas; completo para dashboard/perfil */
  compact?: boolean;
};

// ─── Paleta interna (SOLO tokens) ───────────────────────────────────────────

const WINE_BG = color.wine;      // #7E2C3D
const WINE_DEEP = color.wineDeep; // #4A141F

// ─── Componente ─────────────────────────────────────────────────────────────

export function RankingBadge({ variant, value, subtitle, compact = false }: RankingBadgeProps) {
  const config = badgeConfig(variant, value);

  if (compact) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radius.pill,
          backgroundColor: config.bg,
          borderWidth: 1,
          borderColor: config.border,
          alignSelf: 'flex-start',
        }}
      >
        <Text style={{ fontSize: 13 }}>{config.icon}</Text>
        <Text
          style={{
            fontFamily: font.display,
            fontWeight: '600',
            fontSize: 11.5,
            color: config.textColor,
            letterSpacing: 0.3,
          }}
        >
          {config.label}
        </Text>
      </View>
    );
  }

  // Versión completa — con gradiente granate o dorado según variante
  if (variant === 'top_tournament' || variant === 'champion' || variant === 'finalist') {
    return (
      <LinearGradient
        colors={[WINE_BG, WINE_DEEP]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: 'rgba(241,217,140,0.38)',
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          alignSelf: 'flex-start',
        }}
      >
        <Text style={{ fontSize: 20 }}>{config.icon}</Text>
        <View>
          <Text
            style={{
              fontFamily: font.display,
              fontWeight: '600',
              fontSize: 14,
              color: color.goldBright,
              letterSpacing: 0.3,
            }}
          >
            {config.label}
          </Text>
          {subtitle && (
            <Text
              style={{
                fontFamily: font.body,
                fontSize: 11,
                color: color.onWine,
                marginTop: 1,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </LinearGradient>
    );
  }

  // top_network / points_gained / position_gained — dorado o verde
  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: config.border,
        backgroundColor: config.bg,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 20 }}>{config.icon}</Text>
      <View>
        <Text
          style={{
            fontFamily: font.display,
            fontWeight: '600',
            fontSize: 14,
            color: config.textColor,
          }}
        >
          {config.label}
        </Text>
        {subtitle && (
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 11,
              color: color.muted,
              marginTop: 1,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Config por variante ─────────────────────────────────────────────────────

function badgeConfig(
  variant: RankingBadgeVariant,
  value?: number,
): {
  icon: string;
  label: string;
  bg: string;
  border: string;
  textColor: string;
} {
  switch (variant) {
    case 'champion':
      return {
        icon: '🏆',
        label: 'Campeón',
        bg: 'transparent',
        border: 'rgba(241,217,140,0.38)',
        textColor: color.goldBright,
      };
    case 'finalist':
      return {
        icon: '🥈',
        label: 'Finalista',
        bg: 'transparent',
        border: 'rgba(241,217,140,0.38)',
        textColor: color.goldBright,
      };
    case 'top_tournament':
      return {
        icon: '⭐',
        label: value !== undefined ? `Top ${value} del torneo` : 'Top del torneo',
        bg: 'transparent',
        border: 'rgba(241,217,140,0.38)',
        textColor: color.goldBright,
      };
    case 'top_network':
      return {
        icon: '🌐',
        label: value !== undefined ? `#${value} en la red` : 'Top de la red',
        bg: 'rgba(212,175,55,0.08)',
        border: color.line,
        textColor: color.goldBright,
      };
    case 'points_gained':
      return {
        icon: '▲',
        label: value !== undefined ? `+${value} pts` : '+ pts',
        bg: 'rgba(66,214,164,0.08)',
        border: 'rgba(66,214,164,0.3)',
        textColor: color.live,
      };
    case 'position_gained':
      return {
        icon: '↑',
        label: value !== undefined ? `Subiste ${value} posiciones` : 'Subiste posiciones',
        bg: 'rgba(66,214,164,0.08)',
        border: 'rgba(66,214,164,0.3)',
        textColor: color.live,
      };
  }
}
