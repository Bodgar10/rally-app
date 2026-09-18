-- 080_prioridad_de_inscripcion.sql  ·  RALLY
--
-- LOS SUSCRIPTORES ENTRAN ANTES
--
-- POR QUÉ ESTO Y NO OTRO ANÁLISIS MÁS
--
--   Un exprés tiene 16 cupos y un club con 40 socios interesados. La ventana
--   se abre y en horas está llena. Entrar antes no es un beneficio inventado:
--   es la única cosa que el jugador YA quiere y hoy no puede comprar.
--
--   Y es lo que justifica pagar el año por adelantado en vez del mes. Un
--   análisis se disfruta cuando te acuerdas de abrirlo; una plaza en el torneo
--   del domingo la necesitas cuarenta veces al año, y si te suscribiste en
--   marzo ya entraste a todas.
--
-- CÓMO FUNCIONA
--
--   `tournaments.prioridad_hasta` marca hasta cuándo la inscripción es solo
--   para suscriptores. Mientras `now() < prioridad_hasta`, quien no tenga
--   suscripción activa no puede inscribirse. Pasada esa hora, abierto a todos.
--
--   NULL = sin prioridad. Todos los torneos que existen hoy tienen NULL, así
--   que nada cambia hasta que un organizador lo active a propósito.
--
-- SE COMPRUEBA EN DOS SITIOS, Y NO ES REDUNDANCIA
--
--   La inscripción real pasa por la Edge Function `pair-register-self`, que
--   usa service role y SALTA la RLS — por eso esa función re-verifica a mano
--   todo lo que la policy ya dice. Si la regla viviera solo en la policy, no
--   se aplicaría nunca en el camino que de verdad se usa; si viviera solo en
--   la función, un insert directo con el token del jugador la esquivaría.
--
--   Es el mismo patrón que ya sigue `registration_open`.

begin;

-- ────────────────────────────────────────────────────────────
-- 1. Hasta cuándo es solo para suscriptores
-- ────────────────────────────────────────────────────────────

alter table public.tournaments
  add column if not exists prioridad_hasta timestamptz;

comment on column public.tournaments.prioridad_hasta is
  'Hasta esta hora, solo los suscriptores pueden inscribirse. NULL = abierto '
  'para todos desde el principio, que es como se comportan todos los torneos '
  'creados antes de esta migración.';

-- ────────────────────────────────────────────────────────────
-- 2. ¿Tiene suscripción activa?
--
--    Gemelo de `src/lib/suscripcion.ts`: 'active' y 'trialing', nada más. En
--    particular NO 'past_due' — el cobro falló. Si allí cambia la regla, aquí
--    también: son la misma decisión escrita para dos motores distintos.
-- ────────────────────────────────────────────────────────────

create or replace function public.tiene_suscripcion_activa(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user
       and s.status in ('active', 'trialing')
  );
$$;

grant execute on function public.tiene_suscripcion_activa(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. ¿Puede este jugador inscribirse AHORA en este torneo?
--
--    Una sola función para que la policy y la Edge Function no puedan
--    contestar cosas distintas a la misma pregunta.
-- ────────────────────────────────────────────────────────────

create or replace function public.inscripcion_abierta_para(
  p_tournament uuid,
  p_user       uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      -- Sin ventana de prioridad, o ya pasada: abierto para todos.
      when (select t.prioridad_hasta from public.tournaments t where t.id = p_tournament) is null
        then true
      when (select t.prioridad_hasta from public.tournaments t where t.id = p_tournament) <= now()
        then true
      -- Dentro de la ventana: solo suscriptores.
      else public.tiene_suscripcion_activa(p_user)
    end;
$$;

grant execute on function public.inscripcion_abierta_para(uuid, uuid) to authenticated;

comment on function public.inscripcion_abierta_para(uuid, uuid) is
  'La respuesta ÚNICA a "¿puede inscribirse ahora?". La usan la policy '
  'pairs_insert y la Edge Function pair-register-self, para que no puedan '
  'contestar distinto a la misma pregunta.';

-- ────────────────────────────────────────────────────────────
-- 4. La policy, con la condición añadida
--
--    Se reescribe entera y no se parchea: una policy es una expresión sola, y
--    dejarla a medias entre dos migraciones es peor que repetirla.
--    Lo único que cambia respecto a la 008 es el `and inscripcion_abierta_para`.
-- ────────────────────────────────────────────────────────────

drop policy if exists pairs_insert on public.pairs;
create policy pairs_insert on public.pairs
  for insert to authenticated
  with check (
    public.is_org_owner(public.tournament_org(tournament_id))
    or (
      (player1_id = auth.uid() or player2_id = auth.uid())
      and public.tournament_status(tournament_id) = 'registration_open'
      and public.inscripcion_abierta_para(tournament_id, auth.uid())
    )
  );

comment on policy pairs_insert on public.pairs is
  'El jugador se inscribe solo con el torneo abierto Y con su ventana de '
  'inscripción ya disponible: durante la prioridad, solo suscriptores. El '
  'owner registra a mano sin esa restricción — la prioridad es para la '
  'inscripción pública, no para el que organiza.';

commit;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte)
--
--   -- ningún torneo existente cambia de comportamiento
--   select count(*) from public.tournaments where prioridad_hasta is not null;
--   -- 0
--
--   -- abierto para cualquiera cuando no hay ventana
--   select public.inscripcion_abierta_para('<torneo>', '<jugador>');
--   -- true
--
--   -- para dar 48 h de ventaja a los suscriptores al abrir inscripciones:
--   -- update public.tournaments
--   --    set prioridad_hasta = now() + interval '48 hours'
--   --  where id = '<torneo>';
-- ────────────────────────────────────────────────────────────
