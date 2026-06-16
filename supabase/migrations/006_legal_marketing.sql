-- ============================================================
-- RALLY · Migración 006 — Legal y Marketing
-- Trigger de creación de usuario en public.users,
-- tabla acquisition_source.
-- [REUSO PASAS — adaptado a Expo]
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Trigger: crear fila en public.users tras signup en Auth
--    El trigger lee full_name y preferred_side del metadata
--    del signup (pasados desde app/(auth)/registro.tsx).
-- ────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (
    id,
    email,
    full_name,
    role,
    tos_accepted_version,
    tos_accepted_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'player',
    new.raw_user_meta_data->>'tos_version',
    case
      when new.raw_user_meta_data->>'tos_version' is not null
      then now()
      else null
    end
  )
  on conflict (id) do nothing;  -- idempotente si se llama dos veces
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is
  'Crea la fila en public.users cuando un nuevo usuario se registra en Supabase Auth. Lee full_name y tos_version del metadata enviado desde el formulario de registro.';

-- ────────────────────────────────────────────────────────────
-- 2. acquisition_source — tracking UTM / referrer
--    [REUSO PASAS]
-- ────────────────────────────────────────────────────────────

create table public.acquisition_source (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  user_id       uuid        not null references public.users(id) on delete cascade,

  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  referrer      text,
  landing_page  text,

  unique(user_id)
);

comment on table public.acquisition_source is
  'Fuente de adquisición del usuario (UTM + referrer). Un registro por user, capturado al registrarse. Reúso de Pasas.';

create index idx_acquisition_source_user on public.acquisition_source(user_id);

-- ────────────────────────────────────────────────────────────
-- 3. Versión TOS — tabla de referencia de versiones
-- ────────────────────────────────────────────────────────────

create table public.tos_versions (
  version       text primary key,
  published_at  timestamptz not null default now(),
  description   text
);

-- Versión inicial
insert into public.tos_versions (version, description)
values ('1.0.0', 'Versión inicial de lanzamiento');
