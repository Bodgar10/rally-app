-- ============================================================================
-- 056_organizer_members_admin.sql  ·  RALLY
--
-- El equipo del club, con nombre y correo, para el owner.
--
-- POR QUÉ HACE FALTA UNA VISTA Y NO BASTA CON LA TABLA
--   `orgmembers_select` (008) ya deja al owner leer `organizer_members`. Pero
--   ahí solo hay ids: para enseñar "Rodolfo Tapia · rodolfo@..." hay que llegar
--   a `users`, y `users_select_own` es `using (id = auth.uid())` — solo tu
--   propia fila. Un embed de PostgREST devolvería una lista de guiones.
--
--   Es exactamente el mismo caso que `organizer_judges_admin` (migración 041) y
--   se resuelve igual: una vista sin `security_invoker` que se salta la RLS de
--   `users` y publica SOLO identidad, acotada por dentro al owner.
--
-- PARA QUÉ
--   Para que asignar jueces sea barato. Capturar resultados es NOMINAL —hay
--   que nombrar a la persona para ESE torneo, y esa decisión se mantiene
--   porque un permiso sin fecha ni alcance es el que nadie revisa— pero el
--   coste de esa decisión es un paso manual por torneo. Con esta vista, la
--   pantalla de jueces puede ofrecer "añade a todo el equipo del club" y el
--   club con plantilla fija asigna en dos toques.
--
-- QUÉ NO PUBLICA
--   Nada que no sea identidad. Ni teléfono, ni fecha de nacimiento, ni el
--   rating. El correo SÍ, por el mismo motivo que en la vista de jueces: sin él
--   la lista no sirve para contactar a nadie, y son miembros de su propio club.
--
-- Aplicar DESPUÉS de 041.
-- ============================================================================

create or replace view public.organizer_members_admin as
select
  om.organizer_id,
  om.user_id,
  om.member_role,
  u.full_name,
  u.email
from public.organizer_members om
join public.users u on u.id = om.user_id
where public.is_org_owner(om.organizer_id);

comment on view public.organizer_members_admin is
  'Equipo del club con nombre y correo, SOLO para el owner del organizador. '
  'Existe porque users_select_own impide leer la identidad de otros y un embed '
  'devolveria guiones. Publica solo identidad. La consume la pantalla de jueces '
  'para el boton de anadir al equipo de golpe.';

revoke all    on public.organizer_members_admin from anon, authenticated;
grant  select on public.organizer_members_admin to authenticated;

-- ── Verificación (con un JWT que NO sea owner: debe dar 0 filas) ────────────
--   select * from public.organizer_members_admin;
