-- ============================================================
-- RALLY · Migración 003 — Registrations y Pagos
-- Tablas: registrations
-- Doc A §4.14 — inscripción y pago vía Stripe Connect
-- ============================================================

create table public.registrations (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),

  pair_id                 uuid        not null references public.pairs(id) on delete cascade,
  tournament_id           uuid        not null references public.tournaments(id) on delete cascade,

  amount                  numeric(10,2) not null default 0.00,
  payment_status          public.payment_status not null default 'paid_offline',

  -- Stripe Connect — solo para paid_online
  stripe_payment_intent_id text,
  application_fee_amount   numeric(10,2),   -- Comisión de RALLY (3-5%)
  organizer_amount         numeric(10,2),   -- Lo que recibe el organizador

  -- Facturación CFDI (el organizador factura la inscripción al jugador;
  -- RALLY solo factura su comisión al organizador — Doc C §4.1)
  cfdi_requested          boolean    not null default false,
  player_rfc              text,
  player_legal_name       text,

  unique(pair_id, tournament_id)
);

comment on table public.registrations is
  'Registro de pago de una pareja a un torneo. paid_offline = pago fuera de la plataforma (el organizador lo mete a mano). RALLY NUNCA administra ni transfiere a mano el dinero del organizador — eso lo hace Stripe Connect automáticamente.';

create index idx_registrations_pair       on public.registrations(pair_id);
create index idx_registrations_tournament on public.registrations(tournament_id);
create index idx_registrations_status     on public.registrations(payment_status);
