-- 086_reparar_expres_sorteado_abierto.sql  ·  RALLY
--
-- CERRAR LOS EXPRÉS QUE SE SORTEARON ANTES DE LA 085
--
-- ► POR QUÉ HACE FALTA UNA REPARACIÓN Y NO BASTA CON LA 085
--   La 085 arregla `sembrar_expres` para que el sorteo cierre la categoría y
--   arranque el torneo. Pero el sorteo ya pasó: `expres_config.sorteado_at`
--   es un candado de una sola vez y volver a sortear está —con razón—
--   prohibido, porque daría otro reparto y borraría lo capturado.
--
--   Así que los torneos sorteados con la versión vieja se quedan para siempre
--   en un estado que no existe: grupos y calendario creados, pero la
--   categoría en 'open' y el torneo en 'registration_open'.
--
-- ► QUÉ SE VEÍA CON ESE ESTADO
--   · La tabla del exprés salía SIN NOMBRES, con un "—" en las 16 parejas.
--     `bracket_pairs_public` (039) filtra por `c.status <> 'open'`, así que
--     con la categoría abierta devuelve cero filas y no hay nombre que pintar.
--   · Seguía abierta la inscripción a un torneo ya sorteado.
--   · Y `finish_tournament` (026) habría cortado con
--     `invalid_status_transition` al terminarlo, o sea sin puntos de ranking
--     ni recálculo de ratings.
--
-- ► SOLO TOCA LO QUE ESTÁ EXACTAMENTE EN ESE ESTADO
--   Exprés + ya sorteado + con grupos creados de verdad. Un exprés sin
--   sortear no se toca: ahí la inscripción TIENE que seguir abierta.
--
--   Es idempotente: correrlo dos veces no hace nada la segunda.

begin;

-- ── 1. Las categorías ─────────────────────────────────────────────────────
update public.categories c
   set status = 'in_progress'
  from public.tournaments t
  join public.expres_config ec on ec.tournament_id = t.id
 where c.tournament_id = t.id
   and t.modo = 'expres'
   and c.status = 'open'
   and ec.sorteado_at is not null
   -- Con grupos de verdad. Un `sorteado_at` sin grupos sería un sorteo a
   -- medias, y eso no se cierra: se investiga.
   and exists (select 1 from public.groups g where g.category_id = c.id);

-- ── 2. Los torneos ────────────────────────────────────────────────────────
--    Mismo criterio que la 035: solo si ya no queda ninguna categoría abierta.
update public.tournaments t
   set status = 'in_progress'
  from public.expres_config ec
 where ec.tournament_id = t.id
   and t.modo = 'expres'
   and t.status = 'registration_open'
   and ec.sorteado_at is not null
   and not exists (
     select 1 from public.categories c
      where c.tournament_id = t.id and c.status = 'open'
   );

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN
--
--   select t.name, t.status as torneo, c.status as categoria, ec.sorteado_at
--     from public.tournaments t
--     join public.categories c    on c.tournament_id = t.id
--     join public.expres_config ec on ec.tournament_id = t.id
--    where t.modo = 'expres';
--
--   -- Sorteado: in_progress / in_progress
--   -- Sin sortear: registration_open / open   ← correcto, no se toca
-- ────────────────────────────────────────────────────────────
