-- ============================================================================
-- 047_match_schedule.sql  ·  RALLY
--
-- El calendario de eliminatorias que produce `schedule-knockout`.
--
-- POR QUÉ UNA TABLA APARTE Y NO FILAS EN `matches`
--   `generate-bracket` materializa el cuadro por rondas: `seed` crea solo la
--   primera y `advance` crea la siguiente cuando la anterior termina. Cuando el
--   organizador programa el día, las semis y la final TODAVÍA NO EXISTEN como
--   filas. Crearlas vacías chocaría con el unique de (category_id, stage,
--   round_label) y con la lógica de avance, así que el plan vive aquí y
--   `matches.scheduled_at` recibe solo lo que ya existe.
--
--   El plan se identifica por (category_id, stage, slot_index) — la posición
--   dentro de la ronda —, no por match_id, precisamente porque el partido
--   puede no tener id todavía.
--
-- PLAN vs. REALIDAD
--   Aquí está lo PLANIFICADO; en `matches.scheduled_at` lo VIGENTE. Si al unir
--   los dos difieren, el partido se movió. No se duplica el dato original en
--   `matches`: un JOIN da la misma respuesta.
--
-- Aplicada a mano en el SQL Editor. Idempotente.
-- Aplicar DESPUÉS de 001 (matches, match_stage) y 044.
-- ============================================================================

create table if not exists public.match_schedule (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id   uuid not null references public.categories(id)  on delete cascade,

  stage         public.match_stage not null,

  -- Posición dentro de la ronda (0-based), tal como la emite el motor en
  -- `indiceEnRonda`. Es lo único que identifica un partido que aún no existe.
  slot_index    int not null check (slot_index >= 0),

  scheduled_at  timestamptz not null,
  court_label   text        not null,

  -- Un plan por hueco de cuadro. Reprogramar borra e reinserta.
  unique (category_id, stage, slot_index),

  -- La fase de grupos la reparte el planificador, no este scheduler.
  constraint match_schedule_no_group check (stage <> 'group')
);

create index if not exists match_schedule_tournament_idx
  on public.match_schedule (tournament_id, scheduled_at);

comment on table public.match_schedule is
  'Calendario planificado de eliminatorias. Existe porque las rondas se '
  'materializan en `matches` una a una y el plan cubre rondas que aun no '
  'tienen fila. Se identifica por (category_id, stage, slot_index).';

alter table public.match_schedule enable row level security;

-- El horario de un torneo no es secreto: el jugador quiere saber a qué hora
-- juega sin iniciar sesión. Escritura solo por service_role (la Edge Function),
-- que bypassea RLS y por tanto no necesita política.
drop policy if exists match_schedule_select on public.match_schedule;
create policy match_schedule_select on public.match_schedule
for select to anon, authenticated
using (true);


-- ── Verificación ────────────────────────────────────────────────────────────
-- select stage, slot_index, scheduled_at, court_label
--   from public.match_schedule
--  where tournament_id = '<id>'
--  order by scheduled_at, court_label;
--
-- Plan vs. realidad (partidos movidos tras programar):
-- select m.round_label, s.scheduled_at as plan, m.scheduled_at as vigente
--   from public.match_schedule s
--   join public.matches m
--     on m.category_id = s.category_id and m.stage = s.stage
--  where m.scheduled_at is distinct from s.scheduled_at;
