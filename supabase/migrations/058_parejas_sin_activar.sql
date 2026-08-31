-- ============================================================================
-- 058_parejas_sin_activar.sql  ·  RALLY
--
-- El organizador necesita saber QUIÉN no ha entrado nunca.
--
-- POR QUÉ
--   Cuando un jugador inscribe a su pareja, `pair-register-self` le crea la
--   cuenta al compañero y le manda una invitación. Si ese correo no llega
--   —spam, dominio mal escrito, el proveedor en sandbox— esa persona no entra
--   a la app y nadie se entera hasta el día del torneo, cuando no encuentra su
--   horario.
--
--   Con esta marca el organizador lo ve en la lista de inscritas y puede
--   avisar a tiempo: al compañero si lo tiene a mano, o al jugador que lo
--   inscribió, que sí está dentro y lo conoce.
--
-- POR QUÉ MIRA `auth.users` Y NO `public.users`
--   El dato es `last_sign_in_at` y vive solo ahí. La vista no lleva
--   `security_invoker`, así que se evalúa con los privilegios de su dueño y
--   puede leerla; el filtro `is_org_owner` de abajo es lo que acota quién ve
--   qué, igual que en las otras dos vistas de la 041.
--
-- LO QUE SIGUE SIN PUBLICAR
--   El correo. La 041 decidió a propósito que para gestionar una pareja basta
--   el nombre, y esto no cambia esa decisión: se publica un booleano, no una
--   forma de contactar. Si algún día el organizador necesita escribirles
--   directamente, eso es otra conversación y otra migración.
--
-- Aplicar DESPUÉS de 041.
-- ============================================================================

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
  u2.full_name    as player2_name,
  -- «Activado» = ha entrado alguna vez. Es la misma pregunta que responde
  -- `auth_email_status` con 'needs_activation' (migración 057), vista desde el
  -- otro lado: allí para dejar entrar a la persona, aquí para avisarla.
  (a1.last_sign_in_at is not null) as player1_activado,
  (a2.last_sign_in_at is not null) as player2_activado
from public.pairs p
join public.users       u1 on u1.id = p.player1_id
join public.users       u2 on u2.id = p.player2_id
-- LEFT y no INNER: con un INNER, una pareja cuyo jugador no tuviera fila en
-- `auth.users` desaparecería de la lista del organizador sin decir nada. Es
-- preferible que salga marcada como «no ha entrado» —que es lo conservador— a
-- que se esfume del recuento de inscritas.
left join auth.users    a1 on a1.id = p.player1_id
left join auth.users    a2 on a2.id = p.player2_id
join public.tournaments t  on t.id  = p.tournament_id
where public.is_org_owner(t.organizer_id);

comment on view public.organizer_pairs_admin is
  'Parejas de un torneo con los nombres de sus jugadores y si cada uno ha '
  'entrado alguna vez, SOLO para el owner del organizador. Existe porque '
  'users_select_own impide el embed. NO publica correos: para gestionar una '
  'pareja basta el nombre, y para avisar a quien no ha entrado esta el '
  'companero que lo inscribio. Ver migraciones 041 y 058.';

revoke all    on public.organizer_pairs_admin from anon, authenticated;
grant  select on public.organizer_pairs_admin to authenticated;
