-- ============================================================================
-- 046_matches_schedule_index.sql  ·  RALLY
--
-- Aplicada a mano en el SQL Editor. Se versiona aquí para que el repo pueda
-- reconstruir la base desde cero. Idempotente: correrla de nuevo no hace nada.
--
-- `scheduled_at` se llenaba a mano o se quedaba NULL. Desde que existe
-- schedule-knockout la escribe el scheduler, y el índice sirve a la consulta
-- que ordena la agenda de un torneo por hora.
-- ============================================================================

comment on column public.matches.scheduled_at is
  'Hora planificada por el scheduler. No es cuando se jugo.';

create index if not exists matches_tournament_scheduled_idx
  on public.matches (tournament_id, scheduled_at);
