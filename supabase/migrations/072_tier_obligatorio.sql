-- 072 · tier pasa a obligatorio, ahora que la pantalla de crear torneo
-- ya lo manda. La 068 lo dejó nullable para no romper la creación
-- mientras tanto. Sin default a propósito: crear un torneo sin tier
-- debe fallar, no caer a un valor plausible.
alter table public.tournaments alter column tier set not null;
