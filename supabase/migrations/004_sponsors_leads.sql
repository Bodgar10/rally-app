-- ============================================================
-- RALLY · Migración 004 — Patrocinadores y Leads
-- Tablas: sponsors, tournament_sponsors,
--         sponsor_products, sponsor_leads
-- Doc A §4.15 — La "tienda" es generación de leads, no e-commerce.
-- ============================================================

-- Tipo de producto: hoy son leads, en fase 2+ serán productos propios
create type public.product_type as enum (
  'sponsor_lead',    -- Lead para el patrocinador (v1)
  'own_product'      -- Producto propio RALLY (fase 2+; campo ya existe para no retrofitear)
);

-- Estado del lead
create type public.lead_status as enum (
  'new',
  'sent',
  'contacted'
);

-- ────────────────────────────────────────────────────────────
-- 1. sponsors
-- ────────────────────────────────────────────────────────────

create table public.sponsors (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  name            text        not null,
  logo_url        text,
  contact_email   text        not null,
  contact_phone   text,
  active          boolean     not null default true
);

comment on table public.sponsors is
  'Patrocinadores registrados. El admin los da de alta en el panel de patrocinadores.';

-- ────────────────────────────────────────────────────────────
-- 2. tournament_sponsors — qué patrocinadores van en qué torneo
-- ────────────────────────────────────────────────────────────

create table public.tournament_sponsors (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  tournament_id uuid        not null references public.tournaments(id) on delete cascade,
  sponsor_id    uuid        not null references public.sponsors(id) on delete cascade,

  unique(tournament_id, sponsor_id)
);

-- ────────────────────────────────────────────────────────────
-- 3. sponsor_products — catálogo de productos/servicios
-- ────────────────────────────────────────────────────────────

create table public.sponsor_products (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  sponsor_id    uuid        not null references public.sponsors(id) on delete cascade,
  name          text        not null,
  description   text,
  image_url     text,
  price_display text,       -- Texto de precio (no cobro real: "desde $500 MXN")
  product_type  public.product_type not null default 'sponsor_lead',
  active        boolean     not null default true
);

comment on table public.sponsor_products is
  'Catálogo de productos de patrocinadores. price_display es solo texto; no hay cobro en la plataforma. product_type distingue leads (v1) de tienda propia (fase 2+).';

create index idx_sponsor_products_sponsor on public.sponsor_products(sponsor_id);

-- ────────────────────────────────────────────────────────────
-- 4. sponsor_leads — el usuario "aparta" y RALLY pasa el lead
-- ────────────────────────────────────────────────────────────

create table public.sponsor_leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  user_id         uuid        not null references public.users(id) on delete cascade,
  tournament_id   uuid        not null references public.tournaments(id) on delete cascade,
  sponsor_id      uuid        not null references public.sponsors(id) on delete cascade,
  product_id      uuid        not null references public.sponsor_products(id) on delete cascade,

  status          public.lead_status not null default 'new',
  note            text,

  -- Consentimiento explícito de compartir datos con el patrocinador
  -- (Doc C §5.3 — transferencia de datos a tercero requiere consentimiento)
  data_share_consented    boolean     not null default false,
  data_share_consented_at timestamptz
);

comment on table public.sponsor_leads is
  'El usuario "aparta" un producto → RALLY pasa el lead al patrocinador → ellos cierran la venta en la cancha. data_share_consented es obligatorio (Doc C §5.3).';

create index idx_leads_user        on public.sponsor_leads(user_id);
create index idx_leads_tournament  on public.sponsor_leads(tournament_id);
create index idx_leads_sponsor     on public.sponsor_leads(sponsor_id);
create index idx_leads_status      on public.sponsor_leads(status);
