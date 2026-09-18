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

begin;

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

commit;

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
