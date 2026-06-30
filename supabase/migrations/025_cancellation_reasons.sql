-- 025_cancellation_reasons.sql
-- Sprint 4 · PROFECO · tabla de razones de cancelación de suscripción.
-- [REUSO PASAS — migración 016_cancellation_reasons.sql]

create table if not exists public.cancellation_reasons (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  reason       text not null,
  feedback     text,
  created_at   timestamptz not null default now()
);

-- Solo el propio usuario puede leer sus razones; escritura vía service role (Edge Function).
alter table public.cancellation_reasons enable row level security;

create policy "cancellation_reasons_select_own"
  on public.cancellation_reasons
  for select
  using (auth.uid() = user_id);

-- Insert solo desde service role (la Edge Function subscription-cancel).
-- No se expone insert directo al cliente.
