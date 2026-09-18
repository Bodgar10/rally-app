-- 081_lado_y_mano.sql  ·  RALLY
--
-- DE QUÉ LADO JUEGAS Y CON QUÉ MANO
--
-- POR QUÉ ESTOS DOS Y NO UN FORMULARIO
--
--   Son los dos únicos datos del jugador que cumplen las tres cosas a la vez:
--
--   1. SE CONTESTAN DE UN TOQUE. Dos o tres botones, sin escribir nada.
--   2. NADIE MIENTE. Con qué mano juegas se comprueba en el primer punto, a
--      diferencia de "¿cuál es tu nivel?", que todo el mundo contesta mal —
--      para arriba o para abajo— y que además ya mide Glicko.
--   3. DESBLOQUEAN ALGO QUE SE VE. El lado hace posible emparejar (dos de
--      drive no son pareja) y los dos juntos escriben la mejor línea de
--      scouting que se puede tener sin grabar los partidos: en pádel, un ZURDO
--      jugando el REVÉS es la configuración más temida que hay, y saberlo
--      antes cambia cómo se plantea el partido.
--
--   Lo que NO se pide, y es deliberado: edad y género. No se usan en ninguna
--   comprobación —la inscripción no valida género contra la categoría— y en
--   pádel nadie los pregunta. Un campo que no se usa solo sirve para quedarse
--   vacío y ensuciar el perfil.
--
-- ► SON PÚBLICOS, Y ESO SE LE DICE AL PREGUNTAR
--
--   El lado y la mano de los rivales salen en la ficha previa al partido. Es
--   simétrico —todos ven los de todos— y en la cancha se ve en el primer
--   juego de todas formas. Pero enterarse después de haber contestado es la
--   forma más rápida de que alguien no vuelva a contestar nada, así que la
--   pregunta lo dice antes.
--
--   `preferred_side` ya existía desde la migración 001 y estaba vacía para
--   todos: la única pantalla que la escribía no estaba conectada a nada.

begin;

-- ────────────────────────────────────────────────────────────
-- 1. La mano
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mano_de_juego') then
    create type public.mano_de_juego as enum ('diestro', 'zurdo');
  end if;
end $$;

alter table public.users
  add column if not exists mano public.mano_de_juego;

comment on column public.users.mano is
  'Con qué mano juega. Null mientras no lo haya contestado — y null significa '
  '"no lo sabemos", nunca "diestro por defecto": un zurdo dado por diestro en '
  'la ficha del rival es peor que no decir nada.';

comment on column public.users.preferred_side is
  'Drive, revés o los dos. Existe desde la 001 y estuvo vacía para todos hasta '
  'esta migración, porque la única pantalla que la escribía no estaba '
  'conectada a ninguna ruta.';

-- ────────────────────────────────────────────────────────────
-- 2. Que se vean en la ficha del rival
--
--    `bracket_pairs_public` es por donde la app resuelve los nombres de las
--    parejas de un torneo. Se le añaden los dos campos: son públicos a
--    propósito y esta vista ya filtra lo que no debe verse (torneo en borrador,
--    categoría todavía abierta).
-- ────────────────────────────────────────────────────────────

create or replace view public.bracket_pairs_public as
select
  p.id             as pair_id,
  p.tournament_id,
  p.category_id,
  p.player1_id,
  p.player2_id,
  u1.full_name     as player1_name,
  u1.photo_url     as player1_photo,
  u1.preferred_side as player1_lado,
  u1.mano          as player1_mano,
  u2.full_name     as player2_name,
  u2.photo_url     as player2_photo,
  u2.preferred_side as player2_lado,
  u2.mano          as player2_mano
from public.pairs p
join public.users       u1 on u1.id = p.player1_id
join public.users       u2 on u2.id = p.player2_id
join public.categories  c  on c.id  = p.category_id
join public.tournaments t  on t.id  = p.tournament_id
where t.status <> 'draft'
  and c.status <> 'open';

comment on view public.bracket_pairs_public is
  'Las parejas de un torneo ya publicado, con lo que es público de cada '
  'jugador: nombre, foto, lado y mano. El lado y la mano salen aquí porque la '
  'ficha previa al partido los enseña — es simétrico, y en la cancha se ven en '
  'el primer juego de todos modos.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte)
--
--   select column_name from information_schema.columns
--    where table_name = 'users' and column_name in ('mano', 'preferred_side');
--
--   -- cuántos lo han contestado (al principio, cero)
--   select count(*) filter (where preferred_side is not null) as con_lado,
--          count(*) filter (where mano is not null)           as con_mano,
--          count(*)                                           as total
--     from public.users;
--
--   select player1_lado, player1_mano from public.bracket_pairs_public limit 3;
-- ────────────────────────────────────────────────────────────
