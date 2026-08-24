-- 033_protect_paid_registrations.sql  ·  RALLY
-- Impide destruir el registro de un pago hecho en línea.
--
-- EL PROBLEMA
--   `registrations` guarda `stripe_payment_intent_id`, los montos del split
--   (application_fee_amount, organizer_amount) y los datos de CFDI. Todo eso
--   cuelga de cadenas ON DELETE CASCADE, y HOY no hay ningún guard:
--
--     DELETE categories   → CASCADE pairs → CASCADE registrations
--     DELETE tournaments  → CASCADE registrations  (directo, por tournament_id)
--                         → CASCADE categories → pairs → registrations
--     DELETE pairs        → CASCADE registrations
--
--   Borrar cualquiera de esos tres NO devuelve el dinero: el cargo sigue vivo
--   en Stripe y RALLY se queda sin el payment_intent, sin los montos y sin los
--   datos fiscales. Imposible conciliar, imposible facturar. Es dinero de
--   terceros.
--
-- LA TERCERA VÍA, QUE NO ES OBVIA
--   `pairs_delete` (008) deja que el PROPIO JUGADOR borre su pareja mientras
--   el torneo siga en registration_open. Es decir, quien pagó en línea puede
--   destruir el comprobante de su propio pago sin pasar por el organizador.
--
-- POR QUÉ TRES TRIGGERS Y NO UNO
--   El de `registrations` es el que de verdad cierra la puerta: se dispara
--   venga la baja de donde venga, incluidas rutas que hoy no existen. Los de
--   `categories` y `tournaments` van encima solo para dar un mensaje ÚTIL —
--   se ejecutan antes de que arranque la cascada, así que ganan la carrera y
--   la UI puede decir "esta categoría tiene parejas que pagaron" en vez de un
--   error genérico.
--
-- SECURITY DEFINER es obligatorio aquí: las tres tablas tienen RLS, y un
-- guard que solo ve las filas visibles para quien borra no es un guard.
--
-- Códigos: snake_case en el mensaje (patrón del proyecto) y SQLSTATE 23503,
-- que PostgREST traduce a HTTP 409.
--
-- Aplicar DESPUÉS de 001, 003 y 008.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Cierre real: ninguna registration pagada en línea se borra, venga de donde
--    venga. Se dispara también cuando la baja llega por ON DELETE CASCADE.
-- ----------------------------------------------------------------------------

create or replace function public.block_paid_registration_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.payment_status = 'paid_online' then
    raise exception 'registration_is_paid'
      using detail  = format(
              'La inscripción %s tiene un pago en línea (payment_intent %s). '
              'Borrarla dejaría el cargo vivo en Stripe sin registro en RALLY.',
              old.id, coalesce(old.stripe_payment_intent_id, 'desconocido')),
            hint    = 'Cancela y reembolsa el pago antes de eliminar la inscripción.',
            errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists registrations_block_paid_delete on public.registrations;
create trigger registrations_block_paid_delete
  before delete on public.registrations
  for each row
  execute function public.block_paid_registration_delete();


-- ----------------------------------------------------------------------------
-- 2. Mensaje útil al borrar una CATEGORÍA.
--    Se dispara antes de la cascada, así que las filas de pairs y registrations
--    todavía existen y se pueden contar.
-- ----------------------------------------------------------------------------

create or replace function public.block_category_delete_with_paid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pagadas int;
begin
  -- `registrations` no tiene category_id: hay que llegar por pairs.
  select count(*) into v_pagadas
  from public.registrations r
  join public.pairs p on p.id = r.pair_id
  where p.category_id = old.id
    and r.payment_status = 'paid_online';

  if v_pagadas > 0 then
    raise exception 'category_has_paid_registrations'
      using detail  = format(
              '%s inscripción(es) de la categoría "%s" se pagaron en línea.',
              v_pagadas, old.display_name),
            hint    = 'Reembolsa esas inscripciones antes de quitar la categoría.',
            errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists categories_block_delete_with_paid on public.categories;
create trigger categories_block_delete_with_paid
  before delete on public.categories
  for each row
  execute function public.block_category_delete_with_paid();


-- ----------------------------------------------------------------------------
-- 3. Mensaje útil al borrar un TORNEO.
--    Aquí sí se puede contar directo: registrations.tournament_id existe.
-- ----------------------------------------------------------------------------

create or replace function public.block_tournament_delete_with_paid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pagadas int;
begin
  select count(*) into v_pagadas
  from public.registrations r
  where r.tournament_id = old.id
    and r.payment_status = 'paid_online';

  if v_pagadas > 0 then
    raise exception 'tournament_has_paid_registrations'
      using detail  = format(
              '%s inscripción(es) del torneo "%s" se pagaron en línea.',
              v_pagadas, old.name),
            hint    = 'Cancela el torneo y reembolsa antes de eliminarlo.',
            errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists tournaments_block_delete_with_paid on public.tournaments;
create trigger tournaments_block_delete_with_paid
  before delete on public.tournaments
  for each row
  execute function public.block_tournament_delete_with_paid();


-- ----------------------------------------------------------------------------
-- Notas
--
-- · Las funciones NO se conceden a nadie: son de trigger y las invoca el motor.
--
-- · Esto bloquea el BORRADO, no la corrección. Un admin que necesite eliminar
--   de verdad puede poner payment_status en 'comp' o borrar primero la
--   registration desde el editor SQL (donde manda service_role, pero el
--   trigger igual se dispara — hay que desactivarlo a mano con
--   `alter table ... disable trigger`, que es justo la fricción deseada).
--
-- · DEUDA ANOTADA, fuera de esta migración: `categories` no tiene UNIQUE sobre
--   (tournament_id, division, gender), así que nada impide dos "Quinta Mixto"
--   en el mismo torneo. Con la UI de chips deja de ocurrir en la práctica, y
--   añadir la constraint podría fallar si alguna base ya tiene duplicados.
-- ============================================================================
