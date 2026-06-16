-- ============================================================
-- RALLY · Migración 001 — Schema Core Multi-tenant
-- Tablas: organizers, organizer_members, users, venues,
--         tournaments, categories, pairs, groups,
--         group_standings, matches, match_sets
-- Convenciones: id uuid default gen_random_uuid(),
--               created_at timestamptz default now()
-- Sin RLS ni Realtime — eso lo maneja la migración 008
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ────────────────────────────────────────────────────────────

-- Rol de plataforma (users.role)
create type public.platform_role as enum (
  'player',
  'admin'
);

-- Rol dentro de un organizador (organizer_members.member_role)
create type public.organizer_member_role as enum (
  'owner',
  'judge'
);

-- Estado de la cuenta Connect del organizador
create type public.connect_status as enum (
  'pending',
  'onboarding',
  'active',
  'restricted'
);

-- División de categoría (Doc A §4.5 + Doc B §7)
create type public.division as enum (
  'sexta',
  'quinta',
  'cuarta',
  'tercera',
  'segunda',
  'primera'
);

-- Género de categoría
create type public.category_gender as enum (
  'male',
  'female',
  'mixed'
);

-- Formato de fase de grupos + eliminatoria
create type public.format_type as enum (
  'groups_then_knockout',
  'round_robin',
  'knockout_only'
);

-- Estado de la categoría en el torneo
create type public.category_status as enum (
  'open',
  'closed',
  'seeded',
  'in_progress',
  'finished'
);

-- Estado general del torneo
create type public.tournament_status as enum (
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'finished'
);

-- Preferencia de horario del jugador
create type public.schedule_preference as enum (
  'morning',
  'afternoon',
  'any'
);

-- Estado de pago de una inscripción (Doc A §4.6 + §7)
create type public.payment_status as enum (
  'paid_online',
  'paid_offline',
  'comp'
);

-- Estado del partido
create type public.match_status as enum (
  'scheduled',
  'in_progress',
  'finished'
);

-- Etapa del partido (fase de grupos o ronda eliminatoria)
create type public.match_stage as enum (
  'group',
  'round_of_32',
  'round_of_16',
  'quarter',
  'semi',
  'final',
  'third_place'
);

-- Estado de clasificación anticipada (motor clinch — Doc B §3)
create type public.clinch_status as enum (
  'clinched',
  'eliminated',
  'alive'
);

-- Velocidad de cancha (para análisis descriptivo — Doc B §8)
create type public.court_speed as enum (
  'slow',
  'medium',
  'fast'
);

-- Género del jugador
create type public.player_gender as enum (
  'male',
  'female'
);

-- Lado preferido (nuevo campo en users)
create type public.preferred_side as enum (
  'drive',
  'reves',
  'ambos'
);

-- ────────────────────────────────────────────────────────────
-- 2. organizers (tenants) — Doc A §4.1
-- ────────────────────────────────────────────────────────────

create table public.organizers (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz      not null default now(),

  name                      text             not null,
  slug                      text             not null unique,
  contact_email             text             not null,

  -- Stripe Connect
  stripe_connect_account_id text,
  connect_status            public.connect_status not null default 'pending',
  application_fee_percent   numeric(5,2)     not null default 5.00,

  active                    boolean          not null default true
);

comment on table public.organizers is
  'Tenants del marketplace. Cada organizador de torneos tiene una fila aquí.';

-- ────────────────────────────────────────────────────────────
-- 3. organizer_members — Decisión Sesión 3 (modelo Airbnb)
--    "Organizador" y "juez" son membresías aditivas; no hay
--    role=organizer en users. Un user puede ser owner en un
--    organizador y jugador en otro torneo al mismo tiempo.
-- ────────────────────────────────────────────────────────────

create table public.organizer_members (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  organizer_id  uuid        not null references public.organizers(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  member_role   public.organizer_member_role not null default 'owner',

  unique(organizer_id, user_id)
);

comment on table public.organizer_members is
  'Membresías aditivas: un user puede ser owner/judge en un organizador sin perder su rol de jugador.';

-- ────────────────────────────────────────────────────────────
-- 4. users — Doc A §4.2 (ADAPTAR de Pasas)
--    id = auth.uid() — la fila la crea un trigger tras signup
--    (el trigger se agrega en la migración 006 junto con los
--    campos legales/marketing — REUSO PASAS).
-- ────────────────────────────────────────────────────────────

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),

  email         text        not null unique,
  full_name     text        not null,
  phone         text,

  -- Rol de plataforma: player (default) o admin
  role          public.platform_role not null default 'player',

  -- Perfil progresivo (puede completarse después del signup)
  gender        public.player_gender,
  birthdate     date,
  photo_url     text,
  preferred_side public.preferred_side,
  default_schedule_pref public.schedule_preference not null default 'any',

  -- Campos legales / PROFECO (se completan en migración 006)
  tos_accepted_version  text,
  tos_accepted_at       timestamptz,
  acquisition_source    jsonb,
  parent_name           text,
  parent_email          text,
  parental_consent_at   timestamptz,
  parental_consent_ip   inet
);

comment on table public.users is
  'Perfil extendido de cada usuario. id = auth.uid(). Rol de plataforma: player o admin. Las membresías de organizador/juez viven en organizer_members.';

-- ────────────────────────────────────────────────────────────
-- 5. venues (sedes) — Doc A §4.3
-- ────────────────────────────────────────────────────────────

create table public.venues (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  name           text        not null,
  address        text        not null,
  lat            numeric(10,7),
  lng            numeric(10,7),
  city           text        not null default 'CDMX',
  court_speed    public.court_speed,
  altitude_note  text
);

comment on table public.venues is
  'Sedes de torneos. court_speed es una etiqueta manual del admin; base para el análisis descriptivo del jugador.';

-- ────────────────────────────────────────────────────────────
-- 6. tournaments — Doc A §4.4
-- ────────────────────────────────────────────────────────────

create table public.tournaments (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  organizer_id     uuid        not null references public.organizers(id) on delete restrict,
  venue_id         uuid        references public.venues(id) on delete set null,

  name             text        not null,
  start_date       date        not null,
  end_date         date        not null,
  status           public.tournament_status not null default 'draft',
  registration_fee numeric(10,2) not null default 0.00
);

comment on table public.tournaments is
  'Un torneo pertenece a un organizador (tenant). Puede tener varias categorías en paralelo.';

-- ────────────────────────────────────────────────────────────
-- 7. categories — Doc A §4.5
--    El formato se decide al CERRAR inscripciones, no al crear.
-- ────────────────────────────────────────────────────────────

create table public.categories (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  tournament_id       uuid        not null references public.tournaments(id) on delete cascade,
  division            public.division not null,
  gender              public.category_gender not null,
  display_name        text        not null,  -- ej. "Quinta Mixto"

  -- Se rellena por el motor de formato al cerrar inscripciones
  format_type         public.format_type,
  num_groups          int,
  advance_per_group   int,
  best_extra_qualifiers int not null default 0,

  fee_override        numeric(10,2),         -- null = usa el fee del torneo
  status              public.category_status not null default 'open'
);

comment on table public.categories is
  'División dentro de un torneo. El formato (grupos, avances, eliminatoria) lo fija el motor al cerrar inscripciones.';

-- ────────────────────────────────────────────────────────────
-- 8. pairs (parejas) — Doc A §4.6
--    La unidad de inscripción y de partido. Padel es de PAREJAS.
-- ────────────────────────────────────────────────────────────

create table public.pairs (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  tournament_id       uuid        not null references public.tournaments(id) on delete cascade,
  category_id         uuid        not null references public.categories(id) on delete cascade,
  player1_id          uuid        not null references public.users(id) on delete restrict,
  player2_id          uuid        not null references public.users(id) on delete restrict,

  group_id            uuid,                  -- FK a groups, se añade después (evita FK circular)
  seed                int,
  schedule_preference public.schedule_preference not null default 'any',
  payment_status      public.payment_status not null default 'paid_offline',
  tournament_rank     int
);

comment on table public.pairs is
  'Pareja inscrita. player1 es quien inscribió; player2 fue buscado por correo o asignado manual. El grupo y la siembra se asignan al cerrar inscripciones.';

-- ────────────────────────────────────────────────────────────
-- 9. groups — Doc A §4.7
-- ────────────────────────────────────────────────────────────

create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  category_id   uuid        not null references public.categories(id) on delete cascade,
  name          text        not null  -- "A", "B", "C"...
);

comment on table public.groups is
  'Grupos de la fase de grupos de una categoría.';

-- Agregar FK de pairs a groups ahora que groups existe
alter table public.pairs
  add constraint pairs_group_id_fkey
  foreign key (group_id) references public.groups(id) on delete set null;

-- ────────────────────────────────────────────────────────────
-- 10. group_standings — Doc A §4.8
--     Tabla MATERIALIZADA (no vista) — Realtime la emite en vivo.
--     Se recalcula en cada captura de resultado.
-- ────────────────────────────────────────────────────────────

create table public.group_standings (
  id            uuid primary key default gen_random_uuid(),
  updated_at    timestamptz not null default now(),

  group_id      uuid        not null references public.groups(id) on delete cascade,
  pair_id       uuid        not null references public.pairs(id) on delete cascade,

  played        int         not null default 0,
  won           int         not null default 0,
  lost          int         not null default 0,
  sets_won      int         not null default 0,
  sets_lost     int         not null default 0,
  games_won     int         not null default 0,
  games_lost    int         not null default 0,
  points        int         not null default 0,
  position      int         not null default 0,

  clinch_status public.clinch_status not null default 'alive',

  unique(group_id, pair_id)
);

comment on table public.group_standings is
  'Standings materializados por grupo. Se recalcula al capturar un resultado. Realtime lo emite en tiempo real a los clientes suscritos.';

-- ────────────────────────────────────────────────────────────
-- 11. matches — Doc A §4.9
-- ────────────────────────────────────────────────────────────

create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  tournament_id   uuid        not null references public.tournaments(id) on delete cascade,
  category_id     uuid        not null references public.categories(id) on delete cascade,
  stage           public.match_stage not null,
  group_id        uuid        references public.groups(id) on delete set null,
  round_label     text,

  pair_a_id       uuid        references public.pairs(id) on delete set null,
  pair_b_id       uuid        references public.pairs(id) on delete set null,

  -- court_id: FK a una tabla courts futura; por ahora texto libre
  court_label     text,
  scheduled_at    timestamptz,
  played_at       timestamptz,  -- CRÍTICO: orden cronológico para Glicko (Doc B §6.2)

  winner_pair_id  uuid        references public.pairs(id) on delete set null,
  status          public.match_status not null default 'scheduled'
);

comment on table public.matches is
  'Cada partido, de fase de grupos o eliminatoria. played_at es crítico: el rating Glicko se procesa en orden cronológico estricto.';

-- ────────────────────────────────────────────────────────────
-- 12. match_sets — Doc A §4.10
--     Marcador detallado por set. El juez captura el marcador
--     completo, incluido el super muerte.
-- ────────────────────────────────────────────────────────────

create table public.match_sets (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  match_id         uuid        not null references public.matches(id) on delete cascade,
  set_number       int         not null,  -- 1, 2, 3...
  games_a          int         not null default 0,
  games_b          int         not null default 0,
  is_super_tiebreak boolean    not null default false,
  tiebreak_a       int,
  tiebreak_b       int,

  unique(match_id, set_number)
);

comment on table public.match_sets is
  'Marcador detallado por set. is_super_tiebreak distingue el tercer set (a 10) del set normal. Los puntos del super muerte se guardan en tiebreak_a/b.';

-- ────────────────────────────────────────────────────────────
-- 13. Índices de consulta frecuente
-- ────────────────────────────────────────────────────────────

-- Torneos del organizador
create index idx_tournaments_organizer on public.tournaments(organizer_id);

-- Categorías de un torneo
create index idx_categories_tournament on public.categories(tournament_id);

-- Parejas de un torneo / categoría
create index idx_pairs_tournament  on public.pairs(tournament_id);
create index idx_pairs_category    on public.pairs(category_id);
create index idx_pairs_player1     on public.pairs(player1_id);
create index idx_pairs_player2     on public.pairs(player2_id);

-- Grupos de una categoría
create index idx_groups_category   on public.groups(category_id);

-- Standings por grupo
create index idx_standings_group   on public.group_standings(group_id);

-- Partidos
create index idx_matches_tournament on public.matches(tournament_id);
create index idx_matches_category   on public.matches(category_id);
create index idx_matches_played_at  on public.matches(played_at);  -- para Glicko cronológico

-- Membresías de organizador
create index idx_org_members_user   on public.organizer_members(user_id);
create index idx_org_members_org    on public.organizer_members(organizer_id);
