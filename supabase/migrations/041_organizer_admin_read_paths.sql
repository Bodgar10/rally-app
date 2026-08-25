-- ============================================================================
-- 041_organizer_admin_read_paths.sql  ·  RALLY
--
-- Últimos dos sitios con el embed roto contra `users`.
--
--   parejas.tsx  → `player1:player1_id ( full_name )`
--   jueces.tsx   → `users:user_id ( full_name, email )`
--
-- Los dos pasan por `users_select_own` (`id = auth.uid()`), así que el
-- organizador ve '—' en los jugadores de SU torneo y en los jueces que él mismo
-- asignó.
--
-- `bracket_pairs_public` (039) no los cubre: filtra categorías abiertas —
-- justo las que el organizador gestiona — y no publica correos.
--
-- POR QUÉ EL FILTRO VA DENTRO DE LA VISTA
--   Una vista sin `security_invoker` corre con los permisos de su dueño, así
--   que se salta la RLS de `users`. El `where public.is_org_owner(...)` es lo
--   único que la acota, y se evalúa POR LLAMANTE: is_org_owner resuelve contra
--   auth.uid() en tiempo de consulta. Un organizador solo ve lo suyo.
--
-- El correo de los jueces SÍ se publica al owner: los asignó él, y sin correo
-- la lista no sirve para nada operativo. El de los jugadores NO — para
-- gestionar una pareja basta el nombre.
--
-- Aplicar DESPUÉS de 008 y 013.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Parejas del torneo, con nombres. Solo para el owner.
-- ----------------------------------------------------------------------------

create or replace view public.organizer_pairs_admin as
select
  p.id            as pair_id,
  p.tournament_id,
  p.category_id,
  p.payment_status,
  p.created_at,
  p.player1_id,
  p.player2_id,
  u1.full_name    as player1_name,
  u2.full_name    as player2_name
from public.pairs p
join public.users       u1 on u1.id = p.player1_id
join public.users       u2 on u2.id = p.player2_id
join public.tournaments t  on t.id  = p.tournament_id
where public.is_org_owner(t.organizer_id);

comment on view public.organizer_pairs_admin is
  'Parejas de un torneo con los nombres de sus jugadores, SOLO para el owner '
  'del organizador. Existe porque users_select_own impide el embed. No publica '
  'correos: para gestionar una pareja basta el nombre.';

revoke all    on public.organizer_pairs_admin from anon, authenticated;
grant  select on public.organizer_pairs_admin to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Jueces del torneo, con nombre y correo. Solo para el owner.
-- ----------------------------------------------------------------------------

create or replace view public.organizer_judges_admin as
select
  tj.id,
  tj.tournament_id,
  tj.user_id,
  tj.created_at,
  u.full_name,
  u.email
from public.tournament_judges tj
join public.users       u on u.id = tj.user_id
join public.tournaments t on t.id = tj.tournament_id
where public.is_org_owner(t.organizer_id);

comment on view public.organizer_judges_admin is
  'Jueces asignados a un torneo, con nombre y correo, SOLO para el owner del '
  'organizador. El correo se publica a proposito: los asigno el, y sin correo '
  'la lista no sirve para contactarlos.';

revoke all    on public.organizer_judges_admin from anon, authenticated;
grant  select on public.organizer_judges_admin to authenticated;


-- ── Verificación (con un JWT que NO sea owner del torneo: debe dar 0 filas) ──
--   select * from public.organizer_pairs_admin;
--   select * from public.organizer_judges_admin;
