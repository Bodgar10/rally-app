/**
 * RALLY · El formato del set decisivo, de la fila del torneo al motor
 *
 * NO HAY DEFAULT SILENCIOSO, Y ESA ES LA REGLA.
 *
 *   Un `?? 10` escondido aquí convierte una columna que no se leyó en un
 *   torneo mal validado, y el fallo aparece semanas después en la cancha,
 *   cuando el juez no puede guardar un 15-13 porque el motor creía que se
 *   jugaba a 10. Es la misma trampa que ya costó cuatro veces con
 *   `tercer_lugar`, `advance_per_group` y `best_extra_qualifiers`.
 *
 *   Los DEFAULTS DE LA BASE sí existen —súper muerte a 10, en la migración
 *   063— y son los correctos para un torneo que se creó antes. Pero se aplican
 *   en la base, donde se ven; no en un `??` de camino.
 */

import { DEFAULT_SCORE_CONFIG, type ScoreConfig } from '@/lib/engine/score';

/** Lo que trae la fila de `tournaments`. */
export interface FormatoTercerSet {
  tercer_set_formato: 'super_muerte' | 'set_completo' | null | undefined;
  tercer_set_puntos: number | null | undefined;
}

/**
 * Fila de torneo -> ScoreConfig. Lanza si el dato no llega.
 *
 * `contexto` sale en el mensaje: sin saber QUIÉN preguntaba, un
 * 'tercer_set_formato no definido' en los logs no dice dónde mirar.
 */
export function scoreConfigDelTorneo(
  t: FormatoTercerSet | null | undefined,
  contexto: string,
): ScoreConfig {
  if (!t || t.tercer_set_formato == null) {
    throw new Error(
      `${contexto}: tercer_set_formato no llegó. Es una decisión del torneo y no ` +
      `se asume: sin ella el motor no sabe si el tercer set se juega a 6 o a 10.`,
    );
  }
  if (t.tercer_set_formato === 'super_muerte'
      && (typeof t.tercer_set_puntos !== 'number' || !Number.isFinite(t.tercer_set_puntos))) {
    throw new Error(
      `${contexto}: el torneo juega súper muerte y tercer_set_puntos no llegó. ` +
      `A cuántos puntos se juega no es un default.`,
    );
  }
  return {
    ...DEFAULT_SCORE_CONFIG,
    deciderFormat: t.tercer_set_formato === 'super_muerte' ? 'super' : 'full',
    superTiebreakTarget: t.tercer_set_puntos ?? DEFAULT_SCORE_CONFIG.superTiebreakTarget,
  };
}

/** 'Súper muerte a 10' · 'Set completo'. Para pantallas. */
export function nombreDelFormato(t: FormatoTercerSet | null | undefined): string {
  if (!t || t.tercer_set_formato == null) return '—';
  return t.tercer_set_formato === 'super_muerte'
    ? `Súper muerte a ${t.tercer_set_puntos ?? 10}`
    : 'Set completo';
}
