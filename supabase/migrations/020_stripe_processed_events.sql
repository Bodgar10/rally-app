-- 020_stripe_processed_events.sql
-- Idempotencia de webhooks Stripe: deduplica por event.id. Compartida por Billing y Connect.
create table if not exists public.stripe_processed_events (
  event_id text primary key,
  type text,
  source text check (source in ('billing','connect')),
  processed_at timestamptz not null default now()
);

-- Solo service_role escribe/lee (los webhooks). Sin acceso a roles cliente.
alter table public.stripe_processed_events enable row level security;
revoke all on public.stripe_processed_events from anon, authenticated;
