/**
 * src/components/tournament/ClinchBadge.tsx
 *
 * RALLY · Badge de estado de clasificación anticipada.
 *
 * REGLAS:
 * - Solo MUESTRA el clinch_status que viene de group_standings.
 * - NUNCA calcula clinch. Eso lo hace el motor 13 en match-result (Opus).
 * - Props: status (required) + dependsOnMatchLabel (opcional, para alive).
 * - Colores y tipografía solo desde design-tokens.ts.
 * - Solo primitivos React Native. Sin div/span/button.
 *
 * USO:
 *   <ClinchBadge status="clinched" />
 *   <ClinchBadge status="alive" dependsOnMatchLabel="Grupo B: Pareja X vs Y" />
 *   <ClinchBadge status="eliminated" />
 *
 * Para un badge compacto (dentro de una tabla):
 *   <ClinchBadge status="clinched" compact />
 */

import React from 'react';
import { View, Text } from 'react-native';
import { color, radius, font } from '@/lib/design-tokens';

// ───────────────────────────────────────────
// Tipos
// ───────────────────────────────────────────

export type ClinchStatus = 'clinched' | 'alive' | 'eliminated';

export interface ClinchBadgeProps {
  status: ClinchStatus;
  /**
   * Solo relevante cuando status = 'alive'.
   * Describe el partido del que depende, ej:
   * "Grupo B: Equipo X vs Equipo Y"
   */
  dependsOnMatchLabel?: string;
  /**
   * Modo compacto: solo ícono + texto corto, sin subtexto.
   * Usar dentro de tablas o listas.
   */
  compact?: boolean;
}

// ───────────────────────────────────────────
// Configuración visual por estado
// ───────────────────────────────────────────

const CONFIG: Record<
  ClinchStatus,
  {
    icon: string;
    label: string;
    labelCompact: string;
    subtext: string;
    textColor: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  clinched: {
    icon: '🏆',
    label: 'Ya clasificaste',
    labelCompact: 'Clasificado',
    subtext: 'Descansa y juega tranquilo. Estás adentro.',
    textColor: color.gold,
    bgColor: 'rgba(212,175,55,0.12)',
    borderColor: 'rgba(212,175,55,0.30)',
  },
  alive: {
    icon: '⏳',
    label: 'En juego',
    labelCompact: 'En juego',
    subtext: 'Depende de resultados pendientes.',
    textColor: color.alive,
    bgColor: 'rgba(230,180,80,0.10)',
    borderColor: 'rgba(230,180,80,0.25)',
  },
  eliminated: {
    icon: '❌',
    label: 'Quedaste fuera',
    labelCompact: 'Eliminado',
    subtext: 'No es posible clasificar en esta categoría.',
    textColor: color.danger,
    bgColor: 'rgba(224,114,111,0.10)',
    borderColor: 'rgba(224,114,111,0.25)',
  },
};

// ───────────────────────────────────────────
// Componente
// ───────────────────────────────────────────

export default function ClinchBadge({
  status,
  dependsOnMatchLabel,
  compact = false,
}: ClinchBadgeProps) {
  const cfg = CONFIG[status];

  if (compact) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          backgroundColor: cfg.bgColor,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: cfg.borderColor,
          paddingHorizontal: 8,
          paddingVertical: 3,
          gap: 4,
        }}
        accessibilityLabel={`Estado: ${cfg.label}`}
        accessibilityRole="text"
      >
        <Text style={{ fontSize: 10 }}>{cfg.icon}</Text>
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 10,
            fontWeight: '500',
            color: cfg.textColor,
            textTransform: 'uppercase',
            letterSpacing: 0.7,
          }}
        >
          {cfg.labelCompact}
        </Text>
      </View>
    );
  }

  // Modo completo (tarjeta hero, dashboard)
  return (
    <View
      style={{
        backgroundColor: cfg.bgColor,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: cfg.borderColor,
        padding: 16,
        gap: 6,
      }}
      accessibilityLabel={`Estado de clasificación: ${cfg.label}`}
      accessibilityRole="text"
    >
      {/* Encabezado */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 18 }}>{cfg.icon}</Text>
        <Text
          style={{
            fontFamily: font.display,
            fontSize: 16,
            fontWeight: '600',
            color: cfg.textColor,
          }}
        >
          {cfg.label}
        </Text>
      </View>

      {/* Subtexto */}
      <Text
        style={{
          fontFamily: font.body,
          fontSize: 12,
          color: color.muted,
          lineHeight: 18,
        }}
      >
        {cfg.subtext}
      </Text>

      {/* Partido del que depende (solo cuando alive + dato disponible) */}
      {status === 'alive' && dependsOnMatchLabel ? (
        <View
          style={{
            backgroundColor: 'rgba(230,180,80,0.08)',
            borderRadius: radius.sm,
            paddingHorizontal: 10,
            paddingVertical: 6,
            marginTop: 2,
          }}
        >
          <Text
            style={{
              fontFamily: font.body,
              fontSize: 11,
              color: color.alive,
              fontWeight: '500',
            }}
          >
            Depende de: {dependsOnMatchLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
