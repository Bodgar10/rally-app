-- ============================================================================
-- 054_comentar_permisos_captura.sql  ·  RALLY
--
-- Solo comentarios. No cambia una sola regla.
--
-- POR QUÉ EXISTE
--   `can_capture_tournament` deja capturar al OWNER del organizador sin que
--   esté en `tournament_judges`. Leído en frío eso parece un hueco —"¿por qué
--   el owner entra por una puerta que no es la de los jueces?"— y el reflejo
--   de quien lo audite va a ser quitarlo.
--
--   No es un hueco: es la regla. El organizador de un torneo chico ES el juez,
--   y obligarle a asignarse a sí mismo para capturar su propio torneo sería
--   ceremonia sin nadie a quien proteger. La pantalla de jueces lo dice con
--   todas las letras — "Puedes ser tú mismo" — y este comentario es para que
--   quien lea la función y no la pantalla llegue a la misma conclusión.
--
--   Verificado por el camino real (Edge Function `match-result`), no deducido
--   del código:
--     owner del organizador  -> 200 ok
--     juez asignado          -> 200 ok
--     miembro NO owner       -> 403 not_authorized
--     jugador del torneo     -> 403 not_authorized
--
-- EL ROL `judge` DE `organizer_members` NO SIRVE PARA CAPTURAR
--   El enum `organizer_member_role` tiene exactamente dos valores: 'owner' y
--   'judge'. Pero `can_capture_tournament` mira `is_org_owner` —que exige
--   'owner'— y `is_tournament_judge`, que mira OTRA tabla. Un miembro con rol
--   'judge' a nivel organizador y sin fila en `tournament_judges` NO puede
--   capturar nada, y eso es lo que devuelve el 403 de arriba.
--
--   Si algún día se quiere que ese rol sirva, el cambio es de una línea en
--   `can_capture_tournament`. Está sin hacer A PROPÓSITO: es una decisión de
--   producto —si capturar es responsabilidad nominal o compartida— y no un
--   descuido.
--
-- VARIOS JUECES POR TORNEO
--   `tournament_judges` tiene UNIQUE (tournament_id, user_id): impide duplicar
--   a la MISMA persona, no tener varias. Con ocho canchas simultáneas una sola
--   persona capturando no da abasto, así que varios es el caso normal, no la
--   excepción. Verificado: cuatro jueces asignados y tres capturando a la vez.
-- ============================================================================

comment on function public.can_capture_tournament(uuid) is
  'Quien puede capturar resultados: admin de RALLY, OWNER del organizador, o '
  'juez asignado en tournament_judges. El owner entra SIN estar en '
  'tournament_judges y eso es deliberado, no un hueco: el organizador de un '
  'torneo chico es el juez, y obligarle a asignarse a si mismo seria ceremonia '
  'sin nadie a quien proteger. OJO: el rol organizer_members.member_role = '
  'judge NO basta — is_org_owner exige owner y is_tournament_judge mira otra '
  'tabla. Ver migracion 054.';

comment on function public.is_tournament_judge(uuid) is
  'Juez asignado a ESTE torneo. Un torneo puede tener varios: el UNIQUE de '
  'tournament_judges es (tournament_id, user_id) y solo impide duplicar a la '
  'misma persona. Con ocho canchas simultaneas varios jueces es lo normal.';

comment on table public.tournament_judges is
  'Jueces asignados a un torneo. VARIOS por torneo es lo esperado, no la '
  'excepcion. El owner del organizador NO necesita estar aqui para capturar '
  '(ver can_capture_tournament).';
