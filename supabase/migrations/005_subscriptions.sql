-- ============================================================
-- RALLY · Migración 005 — Suscripción del Jugador
-- Tabla: subscriptions
-- Doc A §4.16 — [REUSO PASAS schema]
-- Stripe Billing. 100% ingreso de RALLY (no se reparte).
-- PROFECO aplica aquí: renovación automática, aviso 5 días,
-- cancelación en 2 clics. Doc C §3 + Doc E §6.
-- Venta WEB-FIRST: la app solo refleja el estatus.
-- ============================================================

create type public.subscription_plan as enum (
  'pro',       -- Mensual ($149 MXN)
  'campeon'    -- Anual  ($1,899 MXN) + 5% descuento en inscripciones
);

create type public.subscription_status as enum (
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused'
);

create type public.billing_cycle as enum (
  'monthly',
  'annual'
);

create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  user_id                 uuid        not null references public.users(id) on delete cascade,

  -- Stripe Billing
  stripe_customer_id      text        not null unique,
  stripe_subscription_id  text        unique,

  plan                    public.subscription_plan not null,
  status                  public.subscription_status not null default 'incomplete',
  billing_cycle           public.billing_cycle not null,

  current_period_end      timestamptz,   -- Para cron PROFECO 5 días antes (Doc C §3)
  cancel_at_period_end    boolean        not null default false,  -- PROFECO
  canceled_at             timestamptz,

  -- CFDI — el jugador puede facturar su suscripción (Doc C §4.2)
  tax_rfc                 text,
  tax_legal_name          text,
  tax_use_cfdi            text   default 'G03',  -- Gastos en general
  tax_regime              text   default '612',  -- Persona física con actividades empresariales

  -- Cancellation flow (PROFECO — REUSO PASAS)
  cancellation_reason     text,
  cancellation_feedback   text,

  unique(user_id)  -- Un jugador = una suscripción activa
);

comment on table public.subscriptions is
  'Suscripción IA/análisis del jugador (Stripe Billing). 100% ingreso de RALLY. Venta WEB-FIRST para evitar comisión de tienda (~30% Apple). La app solo refleja el estatus. PROFECO: renovación automática, aviso 5 días, cancelación 2 clics.';

create or replace function public.set_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_subscriptions_updated_at();

create index idx_subscriptions_user         on public.subscriptions(user_id);
create index idx_subscriptions_stripe_sub   on public.subscriptions(stripe_subscription_id);
create index idx_subscriptions_period_end   on public.subscriptions(current_period_end)
  where status = 'active';   -- para el cron de PROFECO
