-- 028_ranking_public_read_path.sql
-- Read-path del ranking VISIBLE + blindaje del Glicko oculto.
-- Ajustado a §1 del remoto: columnas reales confirmadas; cierra la fuga "leer propio"
-- y revoca el GRANT SELECT default sobre player_ratings.

-- ---------- 1) Limpieza de drift (políticas en español, sin versionar) ----------
drop policy if exists "player_ratings: leer propio" on public.player_ratings;
drop policy if exists "ranking_points: lectura pública autenticada" on public.ranking_points;

-- ---------- 2) Blindaje de player_ratings (Glicko OCULTO) ----------
alter table public.player_ratings enable row level security;
revoke select on public.player_ratings from anon, authenticated;

-- ---------- 3) ranking_points: lectura cross-tenant (ya cubierta por ranking_select_all) ----------
alter table public.ranking_points enable row level security;

-- ---------- 4) VIEW pública del leaderboard (solo columnas seguras) ----------
create or replace view public.ranking_public as
select
  rp.player_id,
  u.full_name,
  u.photo_url,
  rp.division,
  rp.points,
  rp.position
from public.ranking_points rp
join public.users u on u.id = rp.player_id;

comment on view public.ranking_public is
  'Ranking visible de la red (puntos + posicion + identidad minima). NO expone Glicko (rating/rd/volatility) ni contacto (email/phone).';

revoke all on public.ranking_public from anon, authenticated;
grant select on public.ranking_public to authenticated;
