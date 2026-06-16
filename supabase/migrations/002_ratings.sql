-- ============================================================
-- RALLY · Migración 002 — Ratings Glicko-2 y Puntos de Ranking
-- Tablas: player_ratings, rating_history,
--         ranking_points, ranking_point_rules
-- Doc A §4.11 - §4.13 + §4.18
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. player_ratings — Doc A §4.11
--    Rating Glicko-2 OCULTO por jugador y por división.
--    Mide habilidad real. La UI de Glicko está apagada en v1
--    (feature flag EXPO_PUBLIC_ENABLE_GLICKO_UI=false).
--    Se calcula desde el torneo 1 para que el historial
--    cronológico sea reconstruible.
-- ────────────────────────────────────────────────────────────

create table public.player_ratings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  player_id      uuid        not null references public.users(id) on delete cascade,
  division       public.division not null,

  -- Valores Glicko-2 (Doc B §6.2)
  rating         numeric(10,4) not null default 1500.0,
  rd             numeric(10,4) not null default 350.0,   -- Rating Deviation (incertidumbre)
  volatility     numeric(10,6) not null default 0.06,    -- σ (volatilidad Glicko-2)

  last_played_at timestamptz,   -- Para inflar RD por inactividad

  unique(player_id, division)
);

comment on table public.player_ratings is
  'Rating Glicko-2 por jugador y división. Oculto en v1 (ENABLE_GLICKO_UI=false). Base para siembra y bloqueo de bajada de categoría. Se procesa por played_at cronológico.';

-- Actualizar updated_at automáticamente
create or replace function public.set_player_ratings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger player_ratings_updated_at
  before update on public.player_ratings
  for each row execute function public.set_player_ratings_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2. rating_history — Doc A §4.12
--    Historial partido a partido. Permite reconstruir y auditar
--    el rating desde cero (cron recompute-ratings usa esto).
-- ────────────────────────────────────────────────────────────

create table public.rating_history (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  player_id       uuid        not null references public.users(id) on delete cascade,
  division        public.division not null,
  match_id        uuid        not null references public.matches(id) on delete cascade,

  rating_before   numeric(10,4) not null,
  rating_after    numeric(10,4) not null,
  rd_before       numeric(10,4) not null,
  rd_after        numeric(10,4) not null,
  volatility_before numeric(10,6) not null,
  volatility_after  numeric(10,6) not null,

  played_at       timestamptz not null  -- copia de matches.played_at para ordenar sin JOIN
);

comment on table public.rating_history is
  'Historial de cambios de rating Glicko-2 partido a partido. Permite reconstruir ratings desde cero manteniendo el orden cronológico exacto.';

create index idx_rating_history_player_div on public.rating_history(player_id, division, played_at);
create index idx_rating_history_match      on public.rating_history(match_id);

-- ────────────────────────────────────────────────────────────
-- 3. ranking_points — Doc A §4.13
--    Los puntos VISIBLES y acumulables entre torneos (sabor
--    Premier Padel). Bien común de la red: cruzan organizadores.
--    NO es el rating Glicko; son los puntos que el jugador VE.
-- ────────────────────────────────────────────────────────────

create table public.ranking_points (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  player_id     uuid        not null references public.users(id) on delete cascade,
  division      public.division not null,

  points        int         not null default 0,
  position      int,          -- Posición en el ranking de la red ("top 50 de 4ta CDMX")

  unique(player_id, division)
);

comment on table public.ranking_points is
  'Puntos de ranking VISIBLES por jugador y división. Sabor Premier Padel. Se acumulan entre torneos y organizadores (bien común de la red).';

create or replace function public.set_ranking_points_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ranking_points_updated_at
  before update on public.ranking_points
  for each row execute function public.set_ranking_points_updated_at();

create index idx_ranking_points_division on public.ranking_points(division, points desc);

-- ────────────────────────────────────────────────────────────
-- 4. ranking_point_rules — Doc A §4.18
--    Config parametrizable. No hardcodear los valores.
--    Default global + override opcional por torneo.
-- ────────────────────────────────────────────────────────────

create type public.rule_scope as enum ('global', 'tournament');

create table public.ranking_point_rules (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),

  scope                   public.rule_scope not null default 'global',
  tournament_id           uuid references public.tournaments(id) on delete cascade,

  -- Puntos de fase de grupos (Doc B §5.1)
  group_win_points        int not null default 50,    -- por cada victoria en grupos
  qualify_bonus           int not null default 100,   -- bono por pasar de grupos

  -- Hitos por ronda alcanzada en eliminatoria (Doc B §5.1)
  -- Formato: { "r16": 150, "quarter": 250, "semi": 400, "final": 650, "champion": 1000 }
  round_points            jsonb not null default '{
    "r16": 150,
    "quarter": 250,
    "semi": 400,
    "final": 650,
    "champion": 1000
  }'::jsonb,

  -- Multiplicador por tamaño del cuadro (Doc B §5.2)
  -- Formato: { "lte8": 0.7, "9to16": 1.0, "17to32": 1.3, "33plus": 1.5 }
  drawsize_multipliers    jsonb not null default '{
    "lte8":   0.7,
    "9to16":  1.0,
    "17to32": 1.3,
    "33plus": 1.5
  }'::jsonb,

  -- Bono para formatos solo round-robin (sin eliminatoria)
  roundrobin_champion_bonus int not null default 1000
);

-- Solo una regla global puede existir a la vez.
-- Postgres no admite WHERE en un UNIQUE constraint inline; se expresa
-- como índice único parcial (misma garantía: una sola fila scope='global').
create unique index unique_global_rule
  on public.ranking_point_rules (scope)
  where (scope = 'global');

comment on table public.ranking_point_rules is
  'Configuración parametrizable de la asignación de puntos de ranking. Un registro global + overrides opcionales por torneo. Nunca hardcodear los valores en el engine.';

-- Insertar la configuración global por defecto
insert into public.ranking_point_rules (scope)
values ('global');

-- Índice para buscar la regla de un torneo específico
create index idx_point_rules_tournament on public.ranking_point_rules(tournament_id)
  where tournament_id is not null;

-- Índice general de player_ratings
create index idx_player_ratings_player   on public.player_ratings(player_id);
create index idx_player_ratings_division on public.player_ratings(division);
