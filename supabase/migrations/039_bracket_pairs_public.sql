-- ============================================================================
-- 039_bracket_pairs_public.sql  ·  RALLY
--
-- EL BUG QUE ARREGLA (real hoy, invisible porque nadie lo renderiza)
--   LiveStandings, LiveBracket y MyNextMatch resuelven los nombres de los
--   jugadores con un embed de PostgREST:
--
--       pairs:pair_id ( player1:player1_id ( full_name ),
--                       player2:player2_id ( full_name ) )
--
--   Ese embed pasa por `users_select_own` (migración 008), que es
--   `using (id = auth.uid())` — SOLO tu propia fila. Verificado contra la base
--   real en la 034: con un JWT de usuario, `select count(*) from users`
--   devuelve 1 de 2 filas.
--
--   Consecuencia: un jugador INSCRITO vería '—' en el nombre de todos sus
--   rivales. No es un problema de "cuadro público": está roto también para
--   quien participa. No se ha notado porque los tres componentes están
--   huérfanos — ninguna ruta los monta todavía.
--
-- POR QUÉ UNA VISTA Y NO RELAJAR users_select_own
--   Abrir `users` publicaría email, phone, birthdate, parent_email,
--   parental_consent_* y tos_accepted_* a cualquier autenticado. Un cuadro
--   necesita nombres, no expedientes.
--
--   Mismo patrón que `ranking_public` (migración 028), que existe exactamente
--   por este motivo: una vista SIN `security_invoker` corre con los permisos de
--   su dueño, así que se salta la RLS de las tablas que consulta, y lo que
--   publica es solo lo que su SELECT enumera.
--
-- POR QUÉ ESTO NO ES EL CAMINO DE REALTIME
--   Realtime Postgres Changes solo funciona sobre TABLAS de la publicación,
--   nunca sobre vistas. Pero no hace falta: lo que cambia en vivo son los
--   números (marcadores, posiciones), que viven en matches/group_standings y
--   no contienen dato personal alguno. El nombre de un jugador no cambia a
--   media noche del partido, así que se resuelve UNA vez contra esta vista y
--   se cachea. Los números por Realtime, los nombres por read-path.
--
-- Aplicar DESPUÉS de 001, 008 y 011.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- QUÉ PUBLICA Y QUÉ NO
--
--   Publica:  pair_id, category_id, tournament_id, los dos player_id, los dos
--             nombres y las dos fotos.
--   NO publica: nada de `pairs` que no sea identidad — ni payment_status, ni
--             seed, ni schedule_preference, ni tournament_rank. Quién pagó y
--             cómo no es asunto del cuadro.
--   NO publica: ninguna columna de contacto de `users`.
--
--   `photo_url` sí entra: la 012 ya lo clasificó como "campo de display no
--   sensible" y `ranking_public` lo publica igual.
--
--   Los player_id entran porque los componentes resaltan TU fila comparando
--   contra auth.uid(). Sin ellos habría que comparar por nombre, que es
--   frágil y falla con homónimos.
--
-- LOS DOS FILTROS SON EL BLINDAJE
--   La vista ignora la RLS, así que el WHERE es lo único que la acota:
--
--   · t.status <> 'draft'  — espejo de `tournaments_select`. Un torneo sin
--     publicar no filtra ni sus parejas.
--
--   · c.status <> 'open'   — mientras la categoría admite inscripciones NO hay
--     cuadro, así que nadie necesita esos nombres. Y evita convertir esto en
--     una lista de "quién se ha apuntado" consultable antes de que el torneo
--     cierre. Los standings y los partidos solo existen tras el cierre, así
--     que el filtro no le quita nada a los tres componentes.
--
-- INNER JOIN A PROPÓSITO
--   users.full_name es NOT NULL y pairs.player1_id/player2_id también, así que
--   un INNER JOIN no puede perder filas. Si alguna vez desaparece, es que hay
--   una FK rota — y prefiero que la pareja no salga a que salga a medias.
-- ----------------------------------------------------------------------------

create or replace view public.bracket_pairs_public as
select
  p.id             as pair_id,
  p.tournament_id,
  p.category_id,
  p.player1_id,
  p.player2_id,
  u1.full_name     as player1_name,
  u1.photo_url     as player1_photo,
  u2.full_name     as player2_name,
  u2.photo_url     as player2_photo
from public.pairs p
join public.users       u1 on u1.id = p.player1_id
join public.users       u2 on u2.id = p.player2_id
join public.categories  c  on c.id  = p.category_id
join public.tournaments t  on t.id  = p.tournament_id
where t.status <> 'draft'
  and c.status <> 'open';

comment on view public.bracket_pairs_public is
  'Read-path de identidad para el cuadro: pair_id -> nombres y fotos de sus dos '
  'jugadores. Existe porque users_select_own solo deja leer la propia fila, y '
  'sin esto el cuadro mostraria "-" en todos los rivales. NO expone contacto '
  '(email/phone) ni el estado de pago de la pareja. Acotada a torneos '
  'publicados y categorias ya cerradas.';

revoke all    on public.bracket_pairs_public from anon, authenticated;
grant  select on public.bracket_pairs_public to authenticated;

-- PASO 3 (cuadro público sin login) añadirá aquí:
--     grant select on public.bracket_pairs_public to anon;
-- junto con el cambio de `to authenticated` a `to anon, authenticated` en las
-- políticas de lectura de matches, group_standings, groups y match_sets.
-- No se hace ahora para que este lote sea reversible por sí solo.


-- ── Verificación ────────────────────────────────────────────────────────────
-- Con un JWT de jugador (NO service_role, que ignora la RLS):
--
--   -- 1. El embed viejo sigue devolviendo null para los rivales. Esto es el bug.
--   select p.id,
--          (select full_name from public.users where id = p.player1_id) as n1
--     from public.pairs p limit 5;
--
--   -- 2. La vista sí devuelve los nombres.
--   select pair_id, player1_name, player2_name
--     from public.bracket_pairs_public limit 5;
--
--   -- 3. No debe existir la columna: si esto NO da error, la vista está mal.
--   select payment_status from public.bracket_pairs_public limit 1;
--
-- OJO: hoy pairs/matches/groups/group_standings están VACÍAS (0 filas,
-- verificado con service_role). Las tres consultas devolverán vacío sin que
-- eso pruebe nada. La prueba real es con un torneo cerrado de verdad.
