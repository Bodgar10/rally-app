-- ============================================================
-- RALLY · Migración 007 — Feedback y Bug Reports
-- Tablas: feedback, bug_reports
-- [REUSO PASAS — sin cambios]
-- ============================================================

create type public.feedback_type as enum (
  'general',
  'feature_request',
  'complaint',
  'praise',
  'cancellation'
);

create type public.bug_severity as enum (
  'low',
  'medium',
  'high',
  'critical'
);

-- ────────────────────────────────────────────────────────────
-- 1. feedback
-- ────────────────────────────────────────────────────────────

create table public.feedback (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  user_id       uuid        references public.users(id) on delete set null,
  feedback_type public.feedback_type not null default 'general',
  message       text        not null,
  rating        int         check (rating between 1 and 5),
  context       jsonb,      -- pantalla, versión de app, etc.
  read          boolean     not null default false
);

comment on table public.feedback is
  'Feedback general de usuarios. El admin lo revisa en el panel de notificaciones. Reúso de Pasas.';

create index idx_feedback_unread on public.feedback(created_at desc)
  where read = false;

-- ────────────────────────────────────────────────────────────
-- 2. bug_reports
-- ────────────────────────────────────────────────────────────

create table public.bug_reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  user_id       uuid        references public.users(id) on delete set null,
  severity      public.bug_severity not null default 'medium',
  title         text        not null,
  description   text        not null,
  steps         text,
  screenshot_url text,
  context       jsonb,      -- plataforma (ios/android/web), versión, pantalla
  resolved      boolean     not null default false,
  resolved_at   timestamptz
);

comment on table public.bug_reports is
  'Bugs reportados por usuarios. El admin los revisa en el panel de notificaciones. Reúso de Pasas.';

create index idx_bug_reports_unresolved on public.bug_reports(created_at desc)
  where resolved = false;
