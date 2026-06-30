-- 023_subscription_invoices_cfdi.sql
-- Registro de facturas de suscripción + estado del CFDI (gigstack). Dedup por stripe_invoice_id.
create table if not exists public.subscription_invoices (
  stripe_invoice_id text primary key,
  user_id uuid references public.users(id) on delete set null,
  stripe_customer_id text,
  amount_total numeric,
  currency text default 'mxn',
  cfdi_status text not null default 'pending' check (cfdi_status in ('pending','emitted','failed','skipped')),
  cfdi_provider_id text,
  cfdi_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_invoices_user_idx on public.subscription_invoices (user_id);

alter table public.subscription_invoices enable row level security;
-- El jugador puede ver SUS propias facturas; escritura solo service_role.
drop policy if exists subscription_invoices_select_own on public.subscription_invoices;
create policy subscription_invoices_select_own on public.subscription_invoices
for select to authenticated using (user_id = auth.uid());
