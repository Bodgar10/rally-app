-- 022_subscription_handoff_tokens.sql
-- Token de un solo uso para abrir la web de suscripción ya autenticada (handoff app→web).
create table if not exists public.subscription_handoff_tokens (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists subscription_handoff_tokens_user_idx
  on public.subscription_handoff_tokens (user_id);

-- Solo service_role (las Edge Functions) lee/escribe estos tokens.
alter table public.subscription_handoff_tokens enable row level security;
revoke all on public.subscription_handoff_tokens from anon, authenticated;
