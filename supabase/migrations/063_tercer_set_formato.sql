-- 063_tercer_set_formato.sql  ·  RALLY
--
-- EL FORMATO DEL TERCER SET LO DICE EL ORGANIZADOR, NO LO ADIVINA EL MOTOR
--
--   En el set decisivo un 5-4 es legal de dos formas distintas: va camino de
--   un set completo (6-4, 7-5, 7-6) o de una super muerte a 10. El motor no
--   puede saber cual, y por eso rechazaba los marcadores EN CURSO del tercer
--   set — "Set 3: 2-1 no es un marcador valido"— cuando un 2-1 en super muerte
--   es tan legitimo como un 3-1 en un set normal.
--
--   No es un dato que se pueda deducir: es una decision del torneo. Se
--   pregunta una vez, al crearlo.
--
-- LOS DEFAULTS SON LO NORMAL EN PADEL
--   Super muerte a 10. Un torneo que ya existe y no tiene el dato se comporta
--   asi, que es como se venia jugando.
--
-- SE PUEDE CAMBIAR EN CUALQUIER MOMENTO, INCLUSO A MITAD DE TORNEO
--   No hay candado. Lo que NO se hace es reinterpretar lo ya capturado: un
--   10-8 guardado como super muerte sigue siendo un 10-8 con su ganador aunque
--   el torneo pase a set completo. Revalidar el pasado con una regla nueva
--   cambiaria resultados de partidos que ya se jugaron. El aviso de la pantalla
--   dice cuantos hay; esta migracion no toca ninguno.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tercer_set_formato') then
    create type public.tercer_set_formato as enum ('super_muerte', 'set_completo');
  end if;
end $$;

alter table public.tournaments
  add column if not exists tercer_set_formato public.tercer_set_formato
    not null default 'super_muerte';

alter table public.tournaments
  add column if not exists tercer_set_puntos int not null default 10;

-- A cuantos puntos se juega la super muerte. Editable porque hay clubes que la
-- juegan a 11 o a 15; por debajo de 7 deja de ser un desempate y por encima de
-- 21 es otro set completo con otro nombre.
alter table public.tournaments
  drop constraint if exists tournaments_tercer_set_puntos_ck;
alter table public.tournaments
  add constraint tournaments_tercer_set_puntos_ck
  check (tercer_set_puntos between 7 and 21);

comment on column public.tournaments.tercer_set_formato is
  'Como se juega el set decisivo: super muerte (default, lo normal en padel) o set completo. '
  'Lo consume el motor de score para saber si un marcador del tercer set esta terminado, '
  'en curso o es imposible. No reinterpreta sets ya capturados.';

comment on column public.tournaments.tercer_set_puntos is
  'Puntos de la super muerte. Solo aplica con tercer_set_formato = super_muerte.';
