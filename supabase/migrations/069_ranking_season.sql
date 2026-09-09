-- 069 · El ranking de puntos visibles es POR TEMPORADA y se reinicia el 1 de enero.
-- Durante la temporada el número solo sube: no hay caducidad silenciosa.
--
-- La temporada de un torneo sale de tournaments.end_date (el hecho deportivo),
-- NUNCA de created_at (cuándo se escribió la fila). Re-correr el cierre de un
-- torneo de diciembre tras una corrección en enero movería los puntos de año.

begin;

alter table public.ranking_points
  add column if not exists season int;

update public.ranking_points
   set season = extract(year from now())::int
 where season is null;

alter table public.ranking_points alter column season set not null;

-- Sustituir la unicidad. Hay DOS objetos que la imponen: la constraint de la
-- 002 y el índice redundante que creó la 018. Los dos tienen que caer, o el
-- primer insert de la segunda temporada falla con violación de unicidad.
alter table public.ranking_points
  drop constraint if exists ranking_points_player_id_division_key;

drop index if exists public.ranking_points_player_division_uniq;

alter table public.ranking_points
  add constraint ranking_points_player_division_season_key
  unique (player_id, division, season);

-- Mínimo de torneos en la temporada para que una categoría tenga campeón.
-- Coronar por un solo torneo devalúa la corona de quien ganó cuatro de siete.
alter table public.ranking_point_rules
  add column if not exists min_torneos_campeon int;

update public.ranking_point_rules
   set min_torneos_campeon = 3
 where min_torneos_campeon is null;

alter table public.ranking_point_rules
  alter column min_torneos_campeon set not null;

commit;
