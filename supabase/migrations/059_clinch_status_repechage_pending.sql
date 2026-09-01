-- 059_clinch_status_repechage_pending.sql
--
-- RALLY · El estado que faltaba en la clasificación anticipada.
--
-- QUÉ ARREGLA
--   El enum solo tenía 'clinched' | 'eliminated' | 'alive'. Sin un valor
--   intermedio, el motor tenía que elegir entre dos mentiras para la pareja que
--   ya no puede ganar su grupo pero sigue en la carrera de MEJORES SEGUNDOS de
--   la categoría. Elegía 'eliminated'.
--
--   En el torneo bb8e137e (6ª Varonil: 5 grupos, pasa 1 por grupo + 3
--   repescados) eso mandó a casa a dos parejas con 2 puntos mientras los grupos
--   C, D y E no habían jugado UN SOLO PARTIDO y las tres plazas de repesca
--   seguían abiertas.
--
-- 'repechage_pending' = ya no puede ser primera de su grupo, pero la repesca
-- sigue matemáticamente viva para ella. No es "eliminada" y no es "clasificada".
--
-- ORDEN DE APLICACIÓN — IMPORTA
--   Correr ESTA migración ANTES de desplegar la Edge Function `match-result`.
--   La función escribe el valor nuevo y la RPC `record_match_result` lo castea
--   a `clinch_status`: si el enum todavía no lo tiene, la captura de resultados
--   falla en producción.
--
--   `add value` no se puede usar dentro de la misma transacción que lo crea, y
--   `if not exists` la hace repetible sin ruido.

alter type public.clinch_status add value if not exists 'repechage_pending';

comment on type public.clinch_status is
  'Estado de clasificación anticipada (motor clinch — Doc B §3). '
  'clinched = pasa en todos los escenarios posibles. '
  'alive = todavía puede terminar dentro del corte de su grupo. '
  'repechage_pending = ya no puede ser directa, pero sigue viva en la carrera '
  'de mejores segundos de la categoría. '
  'eliminated = ni lo uno ni lo otro, contando los partidos que faltan en TODOS los grupos.';
