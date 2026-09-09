-- 073_tier_inmutable.sql
-- Bloquea el cambio de tier una vez cerradas las inscripciones. El tier fija
-- el multiplicador de puntos de ranking, y esos puntos se le anuncian al
-- jugador en la pantalla de inscripción: cambiarlo a mitad de torneo cambia
-- retroactivamente lo prometido.
-- Se puede cambiar mientras el torneo esté en 'draft' o 'registration_open'.
-- Desde 'registration_closed' en adelante, bloqueado.

create or replace function public.tournament_tier_is_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.tier is distinct from old.tier
     and old.status not in ('draft', 'registration_open') then
    raise exception 'tier_inmutable'
      using hint = 'El tier no se puede cambiar una vez cerradas las inscripciones.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tournament_tier_is_immutable on public.tournaments;

create trigger trg_tournament_tier_is_immutable
  before update on public.tournaments
  for each row
  when (new.tier is distinct from old.tier)
  execute function public.tournament_tier_is_immutable();
