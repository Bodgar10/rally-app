// src/lib/engine/rating/category-bands.ts
// Bandas de categoría: subida, anti-sandbagger, bloqueo de bajada (Doc B §7).
// Determinista. Valores ilustrativos y configurables.

import type { Division } from '../types';

export interface Band {
  division: Division;
  min: number; // inclusive
  max: number; // inclusive
}

// Bandas ascendentes (Doc B §7). min/max ilustrativos.
export const DEFAULT_BANDS: Band[] = [
  { division: 'sexta', min: -Infinity, max: 1399 },
  { division: 'quinta', min: 1400, max: 1549 },
  { division: 'cuarta', min: 1550, max: 1699 },
  { division: 'tercera', min: 1700, max: 1849 },
  { division: 'segunda', min: 1850, max: 1999 },
  { division: 'primera', min: 2000, max: Infinity },
];

export interface BandConfig {
  bands: Band[];
  /** RD por debajo de la cual el rating se considera confiable (no cold-start). */
  rdConfidentThreshold: number;
  /** Nº de torneos por encima del techo para forzar promoción (anti-sandbagger). */
  promotionTournamentsThreshold: number;
}

export const DEFAULT_BAND_CONFIG: BandConfig = {
  bands: DEFAULT_BANDS,
  rdConfidentThreshold: 100,
  promotionTournamentsThreshold: 3,
};

function rankOf(division: Division, cfg: BandConfig): number {
  return cfg.bands.findIndex((b) => b.division === division);
}

export function divisionForRating(
  rating: number,
  cfg: BandConfig = DEFAULT_BAND_CONFIG,
): Division {
  const band = cfg.bands.find((b) => rating >= b.min && rating <= b.max);
  return band ? band.division : cfg.bands[cfg.bands.length - 1].division;
}

export interface EligibilityResult {
  allowed: boolean;
  reason:
    | 'cold_start_declared' // RD alta: declara jugador, valida organizador
    | 'within_or_above_band' // se inscribe en su nivel o uno superior
    | 'above_band_blocked'; // intenta bajar de categoría → bloqueado
  requiresOrganizerApproval: boolean;
}

/**
 * ¿Puede el jugador inscribirse en `targetDivision`? (Doc B §7.3)
 * - Rating dentro o por debajo de la banda objetivo → libre.
 * - Rating por encima (intenta bajar) → bloqueado, sujeto a aprobación del organizador.
 * - Cold-start (RD alta) → permitido; lo declara el jugador y lo valida el organizador.
 */
export function isEligibleToRegister(
  rating: number,
  rd: number,
  targetDivision: Division,
  cfg: BandConfig = DEFAULT_BAND_CONFIG,
): EligibilityResult {
  if (rd > cfg.rdConfidentThreshold) {
    return {
      allowed: true,
      reason: 'cold_start_declared',
      requiresOrganizerApproval: false,
    };
  }
  const playerDivision = divisionForRating(rating, cfg);
  const targetRank = rankOf(targetDivision, cfg);
  const playerRank = rankOf(playerDivision, cfg);

  if (targetRank < playerRank) {
    // El objetivo es una división MÁS BAJA que el nivel del jugador → bajar.
    return {
      allowed: false,
      reason: 'above_band_blocked',
      requiresOrganizerApproval: true,
    };
  }
  return {
    allowed: true,
    reason: 'within_or_above_band',
    requiresOrganizerApproval: false,
  };
}

export interface PromotionResult {
  promote: boolean;
  toDivision: Division | null;
  reason: 'rd_high' | 'within_band' | 'sustained_above_ceiling';
}

/**
 * ¿Debe promoverse al jugador? (Doc B §7.1–7.2)
 * Si su rating (con RD baja) supera el techo de su división durante N torneos → promoción forzada.
 */
export function shouldPromote(
  rating: number,
  rd: number,
  currentDivision: Division,
  tournamentsAboveCeiling: number,
  cfg: BandConfig = DEFAULT_BAND_CONFIG,
): PromotionResult {
  if (rd > cfg.rdConfidentThreshold) {
    return { promote: false, toDivision: null, reason: 'rd_high' };
  }
  const rank = rankOf(currentDivision, cfg);
  const band = cfg.bands[rank];
  const isTop = rank === cfg.bands.length - 1;

  if (
    !isTop &&
    rating > band.max &&
    tournamentsAboveCeiling >= cfg.promotionTournamentsThreshold
  ) {
    return {
      promote: true,
      toDivision: cfg.bands[rank + 1].division,
      reason: 'sustained_above_ceiling',
    };
  }
  return { promote: false, toDivision: null, reason: 'within_band' };
}
