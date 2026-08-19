-- 029_finish_tournament_guard.sql
-- Bloquea la transición a 'finished' por UPDATE crudo desde un cliente autenticado.
-- Deja pasar: la RPC (service_role, auth.uid() NULL) y conexiones sin JWT (SQL Editor/QA).

create or replace function public.finish_tournament_must_use_rpc()
returns trigger
language plpgsql
as $$
begin
  -- Solo nos importa la transición *hacia* finished
  if new.status = 'finished' and (old.status is distinct from 'finished') then
    -- auth.uid() es NULL bajo service_role (la RPC) y bajo conexiones sin JWT (SQL Editor).
    -- Es NOT NULL cuando un cliente autenticado intenta el UPDATE directo -> bloquear.
    if auth.uid() is not null then
      raise exception 'finish_tournament_must_use_rpc'
        using hint = 'Usa la Edge Function finish-tournament (RPC finish_tournament), no UPDATE directo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_finish_tournament_must_use_rpc on public.tournaments;

create trigger trg_finish_tournament_must_use_rpc
  before update on public.tournaments
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.finish_tournament_must_use_rpc();
