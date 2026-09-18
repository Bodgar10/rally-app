-- ════════════════════════════════════════════════════════════════════════════
-- SUSCRIPCION_079_A_082.sql  ·  RALLY
--
-- LAS CUATRO MIGRACIONES DE LA LÍNEA DE SUSCRIPCIÓN, EN UNA SOLA TRANSACCIÓN
--
--   Este archivo NO es una migración: es el paquete para pegar de una vez en
--   el SQL Editor. Las de verdad, una por una, están en
--   supabase/migrations/079..082 y son la fuente. Este se genera de ellas.
--
--   Pegadas seguidas serían CUATRO transacciones, cada una con su begin/commit.
--   Si la tercera falla, las dos primeras ya están aplicadas y la base queda a
--   medio camino. Aquí los begin/commit internos se han quitado y todo va
--   dentro de uno: entran las cuatro o no entra ninguna.
--
-- QUÉ HACE CADA UNA
--
--   079  "Campeón se paga solo": guarda cada peso de comisión perdonado y le
--        pone TOPE — lo que el jugador pagó por su suscripción. Sin tope, quien
--        juegue un exprés cada domingo se lleva $2,470 al año perdonados contra
--        una suscripción de $990: a partir del torneo 21 deja MENOS que si no
--        se hubiera suscrito, y es justo el jugador que el producto quiere.
--
--   080  Prioridad de inscripción para suscriptores. ENTRA INERTE: la columna
--        nace en null para todos y la interfaz está apagada tras un flag. Hoy
--        los torneos tardan en llenarse y la ventana solo molestaría; se
--        enciende el día que un exprés se llene en horas.
--
--   081  De qué lado juega y con qué mano cada jugador, y que se vean en la
--        ficha previa al partido. `preferred_side` existía desde la 001 y
--        estaba vacía para todos, porque la pantalla que la escribía no estaba
--        conectada a ninguna ruta.
--
--   082  Buscar pareja: lado contrario y nivel parecido. Necesita el enum que
--        crea la 081, así que el orden de este archivo importa.
--
-- ANTES DE EJECUTAR
--
--   NO LO CORRAS CON UN TORNEO EN JUEGO. Se añaden columnas a `subscriptions`,
--   `tournaments` y `users`, y se reemplazan la vista `bracket_pairs_public` y
--   la policy `pairs_insert`. Son cambios rápidos sobre tablas chicas, pero al
--   ir todo en UNA transacción los locks se mantienen hasta el final, y ese
--   momento un juez capturando lo ve como la app colgada. Hazlo entre torneos.
--
-- SI ALGO FALLA
--
--   No se ha aplicado nada. Copia el error entero y mándalo.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  079_ahorro_campeon.sql                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 079_ahorro_campeon.sql  ·  RALLY
--
-- "CAMPEÓN SE PAGA SOLO": EL AHORRO SE GUARDA, SE ENSEÑA Y SE TOPA
--
-- EL PROBLEMA QUE ARREGLA, CON NÚMEROS
--
--   Campeón perdona nuestra comisión del 5%. Con una inscripción real de
--   $1,900 por pareja —$950 por jugador— eso son $47.50 por torneo. Suena a
--   poco, y no lo es:
--
--     3 torneos al año  →  le perdonas    $142
--    12 torneos al año  →  le perdonas    $570
--    21 torneos al año  →  le perdonas    $998   ← ya cuesta más de lo que paga
--    52 torneos al año  →  le perdonas  $2,470
--
--   A partir del torneo 21 el suscriptor deja MENOS que si no se hubiera
--   suscrito. Y es justo el jugador que más juega: el que el exprés semanal
--   está diseñado para crear. Sin tope, cuanto mejor le va al producto, peor
--   le va al negocio.
--
-- EL TOPE, Y POR QUÉ ES EL PRECIO DE SU PROPIA SUSCRIPCIÓN
--
--   Se le perdona comisión hasta cubrir lo que pagó, y ni un peso más. Pasado
--   eso, vuelve a cobrarse el 5% normal. Con ese tope:
--
--     · Nunca ganamos menos que si no se hubiera suscrito.
--     · Con el jugador ocasional ganamos muchísimo más.
--     · Y al jugador se le puede prometer algo redondo y verdadero:
--       "juega lo suficiente y Campeón sale gratis".
--
--   El tope sale de lo que PAGÓ, no de una constante: si el precio cambia, el
--   que se suscribió al precio viejo conserva su tope viejo. Por eso
--   `subscriptions.precio_mxn`.
--
-- POR PERIODO, NO POR AÑO NATURAL
--
--   Cada fila guarda el `periodo_fin` vigente cuando se aplicó. El tope se
--   cuenta contra las filas de ESE periodo, así que al renovar el contador
--   arranca de cero solo. Nada que limpiar y ningún cron.


-- ────────────────────────────────────────────────────────────
-- 1. Lo que paga por periodo. De ahí sale su tope.
-- ────────────────────────────────────────────────────────────

alter table public.subscriptions
  add column if not exists precio_mxn numeric(10,2);

comment on column public.subscriptions.precio_mxn is
  'Lo que paga por periodo, tomado de la factura de Stripe. Es el TOPE de '
  'comisión que se le perdona en ese periodo: "Campeón se paga solo" y no más. '
  'Null en suscripciones anteriores a esta migración; hasta que renueven, el '
  'tope cae al precio vigente — ver ahorro_campeon().';

-- ────────────────────────────────────────────────────────────
-- 2. Cada peso perdonado, con nombre y fecha
-- ────────────────────────────────────────────────────────────

create table if not exists public.campeon_ahorros (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  user_id       uuid not null references public.users(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  pair_id       uuid not null references public.pairs(id) on delete cascade,

  /** Idempotencia: el webhook de Stripe puede reintentar el mismo pago. */
  stripe_payment_intent_id text unique,

  /** Lo que habría pagado sin Campeón. */
  base          numeric(10,2) not null,
  /** Lo que se le perdonó, YA con el tope aplicado. Puede ser 0. */
  ahorro        numeric(10,2) not null,
  /** El current_period_end vigente: el tope se cuenta contra este periodo. */
  periodo_fin   timestamptz not null,

  constraint campeon_ahorros_montos check (base >= 0 and ahorro >= 0 and ahorro <= base)
);

create index if not exists idx_campeon_ahorros_user
  on public.campeon_ahorros(user_id, periodo_fin);

comment on table public.campeon_ahorros is
  'Una fila por inscripción con descuento de Campeón. Alimenta el contador del '
  'perfil —"llevas $X ahorrados"— y el tope por periodo. Se escribe desde el '
  'webhook de Stripe cuando el pago SE CONFIRMA, no al crear el checkout: un '
  'checkout abandonado no ahorró nada.';

-- ────────────────────────────────────────────────────────────
-- 3. Cuánto lleva ahorrado y cuánto le queda de tope
-- ────────────────────────────────────────────────────────────

create or replace function public.ahorro_campeon(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ciclo    public.billing_cycle;
  v_estado   public.subscription_status;
  v_fin      timestamptz;
  v_precio   numeric(10,2);
  v_ahorrado numeric(10,2);
begin
  -- Un jugador solo puede consultar lo suyo. El service_role (auth.uid() null)
  -- pasa: lo llama el checkout para calcular el tope antes de cobrar.
  if auth.uid() is not null and auth.uid() <> p_user and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select s.billing_cycle, s.status, s.current_period_end, s.precio_mxn
    into v_ciclo, v_estado, v_fin, v_precio
    from public.subscriptions s
   where s.user_id = p_user;

  -- Sin Campeón activo no hay tope ni ahorro: el descuento no aplica.
  if v_ciclo is distinct from 'annual' or v_estado not in ('active', 'trialing') then
    return jsonb_build_object(
      'es_campeon', false, 'ahorrado', 0, 'tope', 0, 'restante', 0, 'periodo_fin', null);
  end if;

  select coalesce(sum(a.ahorro), 0) into v_ahorrado
    from public.campeon_ahorros a
   where a.user_id = p_user
     and a.periodo_fin = v_fin;

  -- precio_mxn es null en las suscripciones creadas antes de la 079. Hasta que
  -- renueven se les aplica el precio vigente, que es lo más favorable para
  -- ellos: pagaron más y su tope no baja.
  v_precio := coalesce(v_precio, 1900);

  return jsonb_build_object(
    'es_campeon', true,
    'ahorrado',   v_ahorrado,
    'tope',       v_precio,
    'restante',   greatest(v_precio - v_ahorrado, 0),
    'periodo_fin', v_fin
  );
end;
$$;

revoke all     on function public.ahorro_campeon(uuid) from public, anon;
grant  execute on function public.ahorro_campeon(uuid) to authenticated;

comment on function public.ahorro_campeon(uuid) is
  'Cuánto lleva ahorrado un Campeón en su periodo actual y cuánto le queda de '
  'tope. Lo usa el checkout para no perdonar de más y el perfil para enseñar '
  'el contador. Un jugador solo puede consultar lo suyo.';

-- ────────────────────────────────────────────────────────────
-- 4. RLS
-- ────────────────────────────────────────────────────────────

alter table public.campeon_ahorros enable row level security;

drop policy if exists campeon_ahorros_admin_all on public.campeon_ahorros;
create policy campeon_ahorros_admin_all on public.campeon_ahorros
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Solo lectura, y solo lo tuyo. Las filas las escribe el webhook con service
-- role: nadie puede inventarse un ahorro desde el cliente.
drop policy if exists campeon_ahorros_select_propio on public.campeon_ahorros;
create policy campeon_ahorros_select_propio on public.campeon_ahorros
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.campeon_ahorros to authenticated;


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte)
--
--   select column_name from information_schema.columns
--    where table_name = 'subscriptions' and column_name = 'precio_mxn';
--
--   select public.ahorro_campeon(auth.uid());
--   -- sin Campeón: {"es_campeon": false, ...}
--
--   select proname from pg_proc where proname = 'ahorro_campeon';
-- ────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  080_prioridad_de_inscripcion.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  081_lado_y_mano.sql                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

-- ► LAS CUATRO COLUMNAS NUEVAS VAN AL FINAL, Y NO ES UN DESCUIDO.
--
--   Agrupadas por jugador —lado y mano de cada uno junto a su nombre— se leen
--   mucho mejor, y así estaban escritas. Postgres lo rechaza:
--
--     ERROR 42P16: cannot change name of view column "player2_name"
--                  to "player1_lado"
--
--   `create or replace view` solo permite AÑADIR columnas al final; cambiar el
--   orden o insertarlas en medio le obliga a renombrar las que vienen después.
--   La alternativa sería `drop view` + `create`, y eso tira por delante el
--   `grant select ... to anon` de la migración 040 y cualquier cosa que
--   dependa de la vista.
--
--   Así que el orden feo se queda. Si alguien las reagrupa "para que se lea
--   mejor", esta migración vuelve a fallar exactamente igual.
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
  u2.photo_url     as player2_photo,
  -- A partir de aquí, lo nuevo. Al final, obligatoriamente.
  u1.preferred_side as player1_lado,
  u1.mano           as player1_mano,
  u2.preferred_side as player2_lado,
  u2.mano           as player2_mano
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  082_buscar_pareja.sql                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- 082_buscar_pareja.sql  ·  RALLY
--
-- ENCONTRAR CON QUIÉN JUGAR
--
-- EL PROBLEMA QUE RESUELVE ES EL PRIMERO QUE TIENE UN JUGADOR
--
--   No es saber su estadística: es conseguir pareja. Hoy eso se resuelve en
--   un grupo de WhatsApp preguntando a ciegas —"¿alguien para el domingo?"— sin
--   saber de qué lado juega nadie ni si son del mismo nivel.
--
--   Con `preferred_side`, `mano` (migración 081) y el Glicko que ya se calcula,
--   RALLY puede contestar eso de verdad.
--
-- QUÉ ES SER COMPATIBLE
--
--   · DEL LADO CONTRARIO. Dos de drive no son pareja: uno jugaría fuera de su
--     sitio todo el partido. Quien juega 'ambos' encaja con cualquiera, y por
--     eso aparece para todos.
--   · DE NIVEL PARECIDO. Una pareja muy descompensada no es divertida para
--     ninguno de los dos. Se limita la diferencia de rating y se ordena por
--     cercanía: el más parecido primero.
--   · MEDIDO. Sin rating fiable no se puede afirmar que sean de nivel
--     parecido, así que no se sugiere — antes que sugerir a ciegas, no
--     sugerir.
--
-- ► NO DEVUELVE CORREOS, Y ESO ES A PROPÓSITO
--
--   Esto es una lista de gente que el jugador no buscó por nombre: convertirla
--   en un directorio con correos sería regalar una base de datos cosechable.
--   Devuelve quién es, de qué lado juega y su nivel. Para invitarlo se usa
--   `search_users`, que ya existe, pide teclear el nombre y enmascara el
--   correo — o sea que hay que saber a quién se busca.


create or replace function public.buscar_pareja(
  p_division public.division,
  p_limite   int default 10
)
returns table(
  player_id  uuid,
  full_name  text,
  photo_url  text,
  rating     numeric,
  rd         numeric,
  lado       public.preferred_side,
  mano       public.mano_de_juego,
  diferencia numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_yo     uuid := auth.uid();
  v_lado   public.preferred_side;
  v_rating numeric;
  v_rd     numeric;
begin
  if v_yo is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select u.preferred_side into v_lado from public.users u where u.id = v_yo;
  select pr.rating, pr.rd into v_rating, v_rd
    from public.player_ratings pr
   where pr.player_id = v_yo and pr.division = p_division;

  -- Sin lado propio no se puede buscar complemento, y sin rating fiable no se
  -- puede afirmar "de tu nivel". En los dos casos se devuelve vacío: la
  -- pantalla dice qué falta, que es más útil que una lista inventada.
  if v_lado is null or v_rating is null or v_rd >= 100 then
    return;
  end if;

  return query
    select
      u.id,
      u.full_name::text,
      u.photo_url::text,
      pr.rating,
      pr.rd,
      u.preferred_side,
      u.mano,
      abs(pr.rating - v_rating) as diferencia
    from public.users u
    join public.player_ratings pr
      on pr.player_id = u.id and pr.division = p_division
    where u.id <> v_yo
      and u.preferred_side is not null
      -- Medido: sin esto, "de tu nivel" sería una suposición.
      and pr.rd < 100
      -- Nivel parecido. 150 puntos es, más o menos, media división.
      and abs(pr.rating - v_rating) <= 150
      -- Del lado contrario. 'ambos' encaja con cualquiera, en los dos sentidos.
      and (
        v_lado = 'ambos'
        or u.preferred_side = 'ambos'
        or u.preferred_side <> v_lado
      )
    order by abs(pr.rating - v_rating), u.full_name
    limit greatest(least(coalesce(p_limite, 10), 25), 1);
end;
$$;

revoke all     on function public.buscar_pareja(public.division, int) from public, anon;
grant  execute on function public.buscar_pareja(public.division, int) to authenticated;

comment on function public.buscar_pareja(public.division, int) is
  'Jugadores compatibles para hacer pareja: lado contrario y nivel parecido '
  '(±150 de rating, ambos medidos con RD < 100). SECURITY DEFINER porque la '
  'RLS de users solo deja ver la propia fila. NO devuelve correos: es una '
  'lista que el jugador no buscó por nombre, y con correos sería un directorio '
  'cosechable. Para invitar a alguien se usa search_users.';


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN (ejecutar aparte, autenticado)
--
--   select * from public.buscar_pareja('cuarta');
--
--   -- vacío es correcto si: no has puesto tu lado, no tienes rating en esa
--   -- división, o tu RD todavía es alta (te estamos midiendo).
-- ────────────────────────────────────────────────────────────

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN — ejecutar DESPUÉS, en otra pestaña
--
--   -- 1. Las columnas nuevas están
--   select table_name, column_name from information_schema.columns
--    where (table_name = 'subscriptions' and column_name = 'precio_mxn')
--       or (table_name = 'tournaments'   and column_name = 'prioridad_hasta')
--       or (table_name = 'users'         and column_name = 'mano');
--   -- deben salir las tres
--
--   -- 2. Ningún torneo queda con prioridad: la 080 entra inerte
--   select count(*) from public.tournaments where prioridad_hasta is not null;
--   -- 0
--
--   -- 3. Las cuatro funciones existen
--   select proname from pg_proc
--    where proname in ('ahorro_campeon','tiene_suscripcion_activa',
--                      'inscripcion_abierta_para','buscar_pareja')
--    order by proname;
--
--   -- 4. La vista trae el lado y la mano
--   select player1_lado, player1_mano from public.bracket_pairs_public limit 3;
--
--   -- 5. Cuántos han contestado (al principio, cero)
--   select count(*) filter (where preferred_side is not null) as con_lado,
--          count(*) filter (where mano is not null)           as con_mano,
--          count(*)                                           as total
--     from public.users;
-- ════════════════════════════════════════════════════════════════════════════
