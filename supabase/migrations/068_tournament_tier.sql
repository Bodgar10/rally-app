-- 068 · Tier del torneo: contrato que el organizador declara al crear.
-- major | p1 | p2. Determina el multiplicador de puntos de ranking.
-- El mínimo de parejas es POR CATEGORÍA: si no lo alcanza, cae al tier
-- inferior (el "piso"), y eso se anuncia desde la inscripción.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tournament_tier') then
    create type public.tournament_tier as enum ('major','p1','p2');
  end if;
end $$;

-- Nullable a propósito, en este paso: poner NOT NULL ahora rompería la
-- pantalla de crear torneo, que todavía no manda el campo. El motor truena
-- si llega sin tier, así que no hay default silencioso. La 070 lo cierra.
alter table public.tournaments
  add column if not exists tier public.tournament_tier;

-- El único torneo existente: 3 días, 8 categorías, 165 parejas.
update public.tournaments set tier = 'major' where tier is null;

alter table public.ranking_point_rules
  add column if not exists tier_multipliers jsonb,
  add column if not exists tier_minimos     jsonb;

-- Proporción del circuito real: Major 2000 / P1 1000 / P2 600.
-- Mínimos: Major 24 parejas (8 grupos de 3, pasan solo los primeros → cuartos
-- exactos). P1 12 parejas (4 grupos de 3, pasan primeros y segundos → cuartos).
update public.ranking_point_rules
   set tier_multipliers = '{"major":2.0,"p1":1.0,"p2":0.6}'::jsonb,
       tier_minimos     = '{"major":24,"p1":12}'::jsonb
 where tier_multipliers is null or tier_minimos is null;

alter table public.ranking_point_rules
  alter column tier_multipliers set not null,
  alter column tier_minimos     set not null;

commit;
